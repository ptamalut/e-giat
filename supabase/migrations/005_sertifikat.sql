-- =============================================================================
-- Migrasi: Sertifikat
-- Admin mengunggah sertifikat per orang; peserta, narasumber, dan panitia mengunduh
-- lewat link pribadi masing-masing setelah panitia membuka unduhan. Aman dijalankan ulang.
-- Syarat: migrasi 002-004 sudah dijalankan. Jalankan di Supabase -> SQL Editor.
-- =============================================================================

-- 1. Kolom pembuka unduhan pada kegiatan
alter table public.activities add column if not exists certificates_open boolean not null default false;

-- 2. Tabel sertifikat (satu berkas per orang; berkas di Storage dengan path acak)
create table if not exists public.certificates (
  id              uuid primary key default gen_random_uuid(),
  activity_id     uuid not null,
  participant_id  uuid not null,
  storage_path    text not null unique,
  file_name       text not null,
  mime_type       text,
  size_bytes      bigint,
  uploaded_at     timestamptz not null default now(),
  unique (participant_id),
  foreign key (participant_id, activity_id) references public.participants (id, activity_id) on delete cascade
);
create index if not exists certificates_activity_idx on public.certificates (activity_id);

alter table public.certificates enable row level security;
drop policy if exists certificates_owner on public.certificates;
create policy certificates_owner on public.certificates
  for all to authenticated
  using (public.is_activity_owner(activity_id)) with check (public.is_activity_owner(activity_id));
revoke all on public.certificates from anon;
grant select, insert, update, delete on public.certificates to authenticated;

-- 3. Storage: bucket sertifikat + kebijakan akses (hanya pemilik kegiatan, per folder id kegiatan)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('certificates', 'certificates', true, 10485760, array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Apakah folder pertama path berupa id kegiatan milik pengguna ini? Tahan terhadap path yang bukan uuid.
create or replace function public.owns_certificate_object(p_name text)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v uuid;
begin
  begin
    v := (string_to_array(p_name, '/'))[1]::uuid;
  exception when others then
    return false;
  end;
  return public.is_activity_owner(v);
end $$;

drop policy if exists certificates_obj_select on storage.objects;
create policy certificates_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'certificates' and public.owns_certificate_object(name));
drop policy if exists certificates_obj_insert on storage.objects;
create policy certificates_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'certificates' and public.owns_certificate_object(name));
drop policy if exists certificates_obj_update on storage.objects;
create policy certificates_obj_update on storage.objects for update to authenticated
  using (bucket_id = 'certificates' and public.owns_certificate_object(name))
  with check (bucket_id = 'certificates' and public.owns_certificate_object(name));
drop policy if exists certificates_obj_delete on storage.objects;
create policy certificates_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'certificates' and public.owns_certificate_object(name));

-- 4. Fungsi untuk halaman peserta

-- Alamat berkas sertifikat milik pemilik token (hanya bila unduhan dibuka panitia)
create or replace function public.portal_certificate(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p public.participants;
  a public.activities;
  c public.certificates;
begin
  p := public._participant_by_token(p_token);
  select * into a from public.activities where id = p.activity_id;
  if not a.certificates_open then
    raise exception 'Unduhan sertifikat belum dibuka oleh panitia.' using errcode = 'P0001';
  end if;
  select * into c from public.certificates where participant_id = p.id;
  if not found then
    raise exception 'Sertifikat Anda belum tersedia. Silakan hubungi panitia.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('path', c.storage_path, 'file_name', c.file_name, 'mime_type', c.mime_type);
end $$;

-- Halaman peserta: sertakan ringkasan sertifikat
create or replace function public.portal_get(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p        public.participants;
  a        public.activities;
  v_now    timestamptz := now();
  v_sess   jsonb;
  v_quiz   jsonb;
  c        public.certificates;
begin
  p := public._participant_by_token(p_token);
  perform public._close_expired(p.id);
  select * into a from public.activities where id = p.activity_id;
  select * into c from public.certificates where participant_id = p.id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id,
           'title', s.title,
           'start_at', s.start_at,
           'end_at', s.end_at,
           'late_minutes', s.late_minutes,
           'state', case when v_now < s.start_at then 'upcoming'
                         when v_now > s.end_at then 'closed'
                         else 'open' end,
           'attendance', case when at.id is null then null
                              else jsonb_build_object('status', at.status, 'checked_in_at', at.checked_in_at) end
         ) order by s.start_at), '[]'::jsonb)
    into v_sess
    from public.attendance_sessions s
    left join public.attendances at on at.session_id = s.id and at.participant_id = p.id
   where s.activity_id = a.id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id,
           'title', q.title,
           'type', q.type,
           'description', q.description,
           'duration_minutes', q.duration_minutes,
           'open_at', q.open_at,
           'close_at', q.close_at,
           'max_attempts', q.max_attempts,
           'passing_score', q.passing_score,
           'show_result', q.show_result,
           'show_answers', q.show_answers,
           'require_checkin', q.require_checkin,
           'question_count', (select count(*) from public.questions x where x.quiz_id = q.id),
           'state', case when q.open_at is not null and v_now < q.open_at then 'upcoming'
                         when q.close_at is not null and v_now > q.close_at then 'closed'
                         else 'open' end,
           'attempts', (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'id', t.id,
                      'attempt_no', t.attempt_no,
                      'started_at', t.started_at,
                      'deadline_at', t.deadline_at,
                      'submitted_at', t.submitted_at,
                      'score', case when q.show_result then t.score end,
                      'correct_count', case when q.show_result then t.correct_count end,
                      'total_questions', t.total_questions,
                      'passed', case when q.show_result and q.passing_score is not null and t.submitted_at is not null
                                     then t.score >= q.passing_score end
                    ) order by t.attempt_no), '[]'::jsonb)
               from public.quiz_attempts t
              where t.quiz_id = q.id and t.participant_id = p.id)
         ) order by q.created_at), '[]'::jsonb)
    into v_quiz
    from public.quizzes q
   where q.activity_id = a.id and q.is_published and p.role = 'peserta';  -- narasumber & panitia tidak melihat kuis

  return jsonb_build_object(
    'now', v_now,
    'participant', jsonb_build_object(
      'id', p.id, 'name', p.name, 'identifier', p.identifier, 'grade', p.grade,
      'job_title', p.job_title, 'institution', p.institution, 'role', p.role),
    'activity', jsonb_build_object(
      'id', a.id, 'name', a.name, 'description', a.description, 'location', a.location,
      'start_date', a.start_date, 'end_date', a.end_date, 'status', a.status,
      'show_leaderboard', a.show_leaderboard),
    -- ringkasan sertifikat (tanpa alamat berkas; alamat baru dibuka oleh portal_certificate)
    'certificate', case when a.certificates_open or c.id is not null then jsonb_build_object(
      'open', a.certificates_open,
      'available', c.id is not null,
      'file_name', case when a.certificates_open then c.file_name end,
      'mime_type', case when a.certificates_open then c.mime_type end) end,
    'sessions', v_sess,
    'quizzes', v_quiz
  );
end $$;

-- 5. Hak akses fungsi baru
revoke all on function public.portal_certificate(text) from public;
grant execute on function public.portal_certificate(text) to anon, authenticated;
