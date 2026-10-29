-- =============================================================================
-- Migrasi: foto selfie dan lokasi pada absensi
-- Peserta/narasumber/panitia dapat melampirkan foto selfie dan lokasi saat absen; panitia
-- melihatnya di daftar absensi. Per sesi bisa diatur WAJIB atau tidak (ditegakkan di server).
-- Aman dijalankan ulang. Syarat: migrasi 002-005 sudah dijalankan.
-- Jalankan di Supabase -> SQL Editor.
-- =============================================================================

-- 1. Pengaturan sesi: wajib selfie / wajib lokasi (sesi lama tetap tidak wajib)
alter table public.attendance_sessions add column if not exists require_selfie   boolean not null default false;
alter table public.attendance_sessions add column if not exists require_location boolean not null default false;

-- 2. Data di catatan absensi
alter table public.attendances add column if not exists selfie_path text;
alter table public.attendances add column if not exists lat double precision;
alter table public.attendances add column if not exists lng double precision;
alter table public.attendances add column if not exists accuracy_m real;

-- 3. Slot unggah foto (dikelola server; tidak bisa diakses klien)
-- Slot unggah foto selfie: path acak yang dicadangkan server untuk satu orang & satu sesi (berlaku 20 menit, sekali pakai).
-- Hanya path yang dicadangkan yang boleh diunggah peserta (lihat kebijakan storage di bawah).
create table if not exists public.selfie_slots (
  path            text primary key,
  activity_id     uuid not null,
  session_id      uuid not null,
  participant_id  uuid not null references public.participants (id) on delete cascade,
  used            boolean not null default false,
  created_at      timestamptz not null default now()
);
create index if not exists selfie_slots_lookup_idx on public.selfie_slots (participant_id, session_id);
alter table public.selfie_slots enable row level security; -- tanpa kebijakan: hanya fungsi security definer yang boleh mengakses
revoke all on public.selfie_slots from anon, authenticated;

-- 4. Storage: bucket privat foto selfie + kebijakan
-- ---------------------------------------------------------------------------
-- STORAGE: bucket foto selfie absensi (PRIVAT)
--   * peserta (anon) hanya boleh mengunggah ke path yang dicadangkan server lewat portal_selfie_slot
--     (sekali pakai, 20 menit) -> tidak bisa mengunggah sembarang berkas
--   * hanya pemilik kegiatan yang boleh melihat/menghapus; tampilan memakai signed URL berumur pendek
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('selfies', 'selfies', false, 524288, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.selfie_slot_ok(p_name text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.selfie_slots
     where path = p_name and not used and created_at > now() - interval '20 minutes'
  );
$$;

create or replace function public.owns_selfie_object(p_name text)
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

grant execute on function public.selfie_slot_ok(text), public.owns_selfie_object(text) to anon, authenticated;

drop policy if exists selfies_obj_insert on storage.objects;
create policy selfies_obj_insert on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'selfies' and public.selfie_slot_ok(name));
drop policy if exists selfies_obj_select on storage.objects;
create policy selfies_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'selfies' and public.owns_selfie_object(name));
drop policy if exists selfies_obj_delete on storage.objects;
create policy selfies_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'selfies' and public.owns_selfie_object(name));

-- 5. Fungsi absen (versi baru menggantikan portal_check_in(text, uuid)) dan slot foto

-- Cadangkan path unggah foto selfie (hanya bila sesi sedang dibuka dan orang ini belum absen)
create or replace function public.portal_selfie_slot(p_token text, p_session uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p      public.participants;
  a      public.activities;
  s      public.attendance_sessions;
  v_now  timestamptz := now();
  v_path text;
begin
  p := public._participant_by_token(p_token);
  select * into a from public.activities where id = p.activity_id;
  if a.status = 'draft' then
    raise exception 'Kegiatan belum dibuka.' using errcode = 'P0001';
  end if;
  select * into s from public.attendance_sessions where id = p_session and activity_id = p.activity_id;
  if not found then
    raise exception 'Sesi absensi tidak ditemukan.' using errcode = 'P0002';
  end if;
  if v_now < s.start_at then raise exception 'Absensi belum dibuka.' using errcode = 'P0001'; end if;
  if v_now > s.end_at   then raise exception 'Absensi sudah ditutup.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.attendances where session_id = s.id and participant_id = p.id) then
    raise exception 'Anda sudah tercatat hadir pada sesi ini.' using errcode = 'P0001';
  end if;

  delete from public.selfie_slots where created_at < now() - interval '1 day';
  if (select count(*) from public.selfie_slots
       where participant_id = p.id and session_id = s.id and not used
         and created_at > now() - interval '20 minutes') >= 5 then
    raise exception 'Terlalu banyak percobaan foto. Tunggu beberapa menit lalu coba lagi.' using errcode = 'P0001';
  end if;

  v_path := p.activity_id::text || '/' || s.id::text || '/' || replace(gen_random_uuid()::text, '-', '') || '.jpg';
  insert into public.selfie_slots (path, activity_id, session_id, participant_id) values (v_path, p.activity_id, s.id, p.id);
  return jsonb_build_object('path', v_path);
end $$;

-- Absen mandiri, opsional dengan lokasi dan foto selfie (wajib bila diatur pada sesi)
drop function if exists public.portal_check_in(text, uuid);
create or replace function public.portal_check_in(
  p_token text, p_session uuid,
  p_lat double precision default null, p_lng double precision default null,
  p_accuracy double precision default null, p_selfie_path text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p      public.participants;
  s      public.attendance_sessions;
  a      public.activities;
  v_now  timestamptz := now();
  v_stat text;
  v_row  public.attendances;
  v_lat  double precision;
  v_lng  double precision;
  v_acc  real;
begin
  p := public._participant_by_token(p_token);
  select * into a from public.activities where id = p.activity_id;
  if a.status = 'draft' then
    raise exception 'Kegiatan belum dibuka.' using errcode = 'P0001';
  end if;

  select * into s from public.attendance_sessions where id = p_session and activity_id = p.activity_id;
  if not found then
    raise exception 'Sesi absensi tidak ditemukan.' using errcode = 'P0002';
  end if;
  if v_now < s.start_at then
    raise exception 'Absensi belum dibuka.' using errcode = 'P0001';
  end if;
  if v_now > s.end_at then
    raise exception 'Absensi sudah ditutup.' using errcode = 'P0001';
  end if;

  select * into v_row from public.attendances where session_id = s.id and participant_id = p.id;
  if found then
    return jsonb_build_object('already', true, 'status', v_row.status, 'checked_in_at', v_row.checked_in_at);
  end if;

  -- lokasi: hanya nilai yang masuk akal yang disimpan
  if p_lat is not null and p_lng is not null and p_lat between -90 and 90 and p_lng between -180 and 180 then
    v_lat := p_lat;
    v_lng := p_lng;
    v_acc := case when p_accuracy is not null and p_accuracy >= 0 then least(p_accuracy, 100000)::real end;
  end if;
  if s.require_location and v_lat is null then
    raise exception 'Lokasi wajib diaktifkan untuk absen pada sesi ini.' using errcode = 'P0001';
  end if;

  -- foto: harus slot milik orang ini untuk sesi ini, belum dipakai, dan berkasnya sudah ada di Storage
  if p_selfie_path is not null then
    update public.selfie_slots set used = true
     where path = p_selfie_path and participant_id = p.id and session_id = s.id and not used
       and created_at > now() - interval '20 minutes';
    if not found then
      raise exception 'Foto selfie tidak valid atau kedaluwarsa. Silakan ambil foto lagi.' using errcode = 'P0001';
    end if;
    if not exists (select 1 from storage.objects where bucket_id = 'selfies' and name = p_selfie_path) then
      raise exception 'Foto belum berhasil terunggah. Silakan coba lagi.' using errcode = 'P0001';
    end if;
  elsif s.require_selfie then
    raise exception 'Foto selfie wajib untuk absen pada sesi ini.' using errcode = 'P0001';
  end if;

  v_stat := case when v_now > s.start_at + make_interval(mins => s.late_minutes) then 'terlambat' else 'hadir' end;
  insert into public.attendances (activity_id, session_id, participant_id, status, checked_in_at, selfie_path, lat, lng, accuracy_m)
  values (p.activity_id, s.id, p.id, v_stat, v_now, p_selfie_path, v_lat, v_lng, v_acc)
  on conflict (session_id, participant_id) do nothing
  returning * into v_row;

  return jsonb_build_object('already', false, 'status', v_stat, 'checked_in_at', v_now,
                            'has_selfie', p_selfie_path is not null, 'has_location', v_lat is not null);
end $$;

-- 6. Halaman peserta: sertakan pengaturan sesi dan status foto/lokasi
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
           'require_selfie', s.require_selfie,
           'require_location', s.require_location,
           'state', case when v_now < s.start_at then 'upcoming'
                         when v_now > s.end_at then 'closed'
                         else 'open' end,
           'attendance', case when at.id is null then null
                              else jsonb_build_object('status', at.status, 'checked_in_at', at.checked_in_at,
                                                      'has_selfie', at.selfie_path is not null,
                                                      'has_location', at.lat is not null) end
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

-- 7. Hak akses fungsi
revoke all on function public.portal_check_in(text, uuid, double precision, double precision, double precision, text) from public;
revoke all on function public.portal_selfie_slot(text, uuid) from public;
grant execute on function public.portal_check_in(text, uuid, double precision, double precision, double precision, text) to anon, authenticated;
grant execute on function public.portal_selfie_slot(text, uuid) to anon, authenticated;
