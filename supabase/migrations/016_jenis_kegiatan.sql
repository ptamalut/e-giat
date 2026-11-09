-- =============================================================================
-- Migrasi 016 — jenis kegiatan: Diklat atau Kegiatan
--
-- Jalankan sekali di Supabase SQL Editor (setelah 015). Aman dijalankan ulang (idempotent).
--
--  * activities.jenis: 'diklat' (bawaan, perilaku lama) atau 'kegiatan' (tanpa peringkat; hanya peserta dan petugas)
--  * peran baru 'petugas' (untuk jenis Kegiatan) + pemicu yang menjaga peran sesuai jenis
--  * papan peringkat peserta dimatikan untuk jenis Kegiatan; halaman peserta dan halaman depan membawa 'jenis'
-- =============================================================================

alter table public.activities add column if not exists jenis text not null default 'diklat';
alter table public.activities drop constraint if exists activities_jenis_check;
alter table public.activities add constraint activities_jenis_check check (jenis in ('kegiatan', 'diklat'));

-- ---------------------------------------------------------------------------
-- JENIS KEGIATAN: "diklat" (perilaku lama: nilai akhir, peringkat, kuis; peserta/narasumber/moderator/panitia)
-- atau "kegiatan" (tanpa peringkat; hanya peserta dan petugas). Peran baru: petugas.
-- ---------------------------------------------------------------------------

-- batasan peran: tambah 'petugas' (dibuang berdasarkan isi, agar tidak bergantung pada nama batasan)
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.participants'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%role%' loop
    execute format('alter table public.participants drop constraint %I', c.conname);
  end loop;
  for c in select conname from pg_constraint
            where conrelid = 'public.session_members'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%role%' loop
    execute format('alter table public.session_members drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.participants add constraint participants_role_check
  check (role in ('peserta', 'narasumber', 'moderator', 'panitia', 'petugas'));
alter table public.participants add constraint participants_roles_check
  check (cardinality(roles) >= 1 and roles <@ array['peserta', 'narasumber', 'moderator', 'panitia', 'petugas']);
alter table public.session_members add constraint session_members_role_check
  check (role in ('peserta', 'narasumber', 'moderator', 'panitia', 'petugas'));

-- jenis harus cocok dengan peran: kegiatan = peserta/petugas; diklat = tanpa petugas
create or replace function public._check_participant_jenis()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  j text;
begin
  select jenis into j from public.activities where id = new.activity_id;
  if j = 'kegiatan' and not (new.roles <@ array['peserta', 'petugas']) then
    raise exception 'Pada jenis Kegiatan hanya ada peserta dan petugas.' using errcode = '23514';
  end if;
  if j = 'diklat' and 'petugas' = any(new.roles) then
    raise exception 'Petugas hanya untuk jenis Kegiatan; pada Diklat gunakan narasumber, moderator, atau panitia.' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists participants_z_check_jenis on public.participants;
create trigger participants_z_check_jenis before insert or update of role, roles, activity_id on public.participants
  for each row execute function public._check_participant_jenis();

create or replace function public._check_member_jenis()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  j text;
begin
  select jenis into j from public.activities where id = new.activity_id;
  if j = 'kegiatan' and new.role not in ('peserta', 'petugas') then
    raise exception 'Pada jenis Kegiatan hanya ada peserta dan petugas.' using errcode = '23514';
  end if;
  if j = 'diklat' and new.role = 'petugas' then
    raise exception 'Petugas hanya untuk jenis Kegiatan.' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists session_members_check_jenis on public.session_members;
create trigger session_members_check_jenis before insert or update of role, activity_id on public.session_members
  for each row execute function public._check_member_jenis();

-- mengubah jenis kegiatan hanya boleh bila orang-orangnya (dan kedudukan di sesi) sudah cocok dengan jenis baru
create or replace function public._check_activity_jenis_change()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.jenis is distinct from old.jenis then
    if new.jenis = 'kegiatan' and (
         exists (select 1 from public.participants where activity_id = new.id and not (roles <@ array['peserta', 'petugas']))
      or exists (select 1 from public.session_members where activity_id = new.id and role not in ('peserta', 'petugas'))) then
      raise exception 'Tidak bisa diubah ke jenis Kegiatan: masih ada narasumber, moderator, atau panitia. Ubah atau keluarkan mereka dulu.' using errcode = '23514';
    end if;
    if new.jenis = 'diklat' and (
         exists (select 1 from public.participants where activity_id = new.id and 'petugas' = any(roles))
      or exists (select 1 from public.session_members where activity_id = new.id and role = 'petugas')) then
      raise exception 'Tidak bisa diubah ke jenis Diklat: masih ada petugas. Ubah jenis mereka dulu (mis. menjadi panitia).' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists activities_check_jenis_change on public.activities;
create trigger activities_check_jenis_change before update of jenis on public.activities
  for each row execute function public._check_activity_jenis_change();

revoke all on function public._check_participant_jenis(), public._check_member_jenis(), public._check_activity_jenis_change() from public, anon, authenticated;

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
           'role', public._session_role(s.id, p.id),
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
   where s.activity_id = a.id and a.enable_attendance and p.access_attendance
     and public._session_role(s.id, p.id) is not null;  -- hanya sesi yang diikuti orang ini

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
   where q.activity_id = a.id and q.is_published and a.enable_quiz and p.access_quiz;  -- menu kuis & hak akses orang ini

  return jsonb_build_object(
    'now', v_now,
    'participant', jsonb_build_object(
      'id', p.id, 'name', p.name, 'identifier', p.identifier, 'grade', p.grade,
      'job_title', p.job_title, 'institution', p.institution, 'role', p.role, 'roles', p.roles),
    -- menu yang boleh dipakai orang ini = menu aktif di kegiatan DAN hak akses orang ini
    'features', jsonb_build_object(
      'attendance', a.enable_attendance and p.access_attendance,
      'quiz', a.enable_quiz and p.access_quiz,
      'certificate', a.enable_certificate and p.access_certificate,
      'notes', a.enable_notes and p.access_notes,
      'documentation', a.enable_documentation and p.access_documentation),
    'activity', jsonb_build_object(
      'id', a.id, 'name', a.name, 'description', a.description, 'location', a.location,
      'start_date', a.start_date, 'end_date', a.end_date, 'status', a.status,
      'show_leaderboard', a.show_leaderboard and a.jenis = 'diklat', 'jenis', a.jenis),
    -- ringkasan sertifikat (tanpa alamat berkas; alamat baru dibuka oleh portal_certificate)
    'certificate', case when a.enable_certificate and p.access_certificate and (a.certificates_open or c.id is not null) then jsonb_build_object(
      'open', a.certificates_open,
      'available', c.id is not null,
      'file_name', case when a.certificates_open then c.file_name end,
      'mime_type', case when a.certificates_open then c.mime_type end) end,
    'sessions', v_sess,
    'quizzes', v_quiz
  );
end $$;

create or replace function public.portal_leaderboard(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.participants;
  a public.activities;
begin
  p := public._participant_by_token(p_token);
  select * into a from public.activities where id = p.activity_id;
  if a.jenis <> 'diklat' or not a.show_leaderboard or not ('peserta' = any(p.roles)) or not (a.enable_attendance or a.enable_quiz) then
    return jsonb_build_object('enabled', false, 'rows', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'enabled', true,
    'total', (select count(*) from public.participants where activity_id = a.id and 'peserta' = any(roles)),
    'rows', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'rank', r.rank, 'name', r.name, 'institution', r.institution,
               'attendance_pct', r.attendance_pct, 'quiz_avg', r.quiz_avg,
               'final_score', r.final_score, 'is_me', r.participant_id = p.id
             ) order by r.rank, r.name), '[]'::jsonb)
        from (select *, row_number() over (order by rank, name) as rn from public._ranking(a.id)) r
       where r.rn <= 10 or r.participant_id = p.id
    )
  );
end $$;

create or replace function public.public_activities()
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'name', a.name, 'description', a.description, 'location', a.location,
           'start_date', a.start_date, 'end_date', a.end_date, 'jenis', a.jenis)
         order by a.start_date nulls last, a.created_at desc), '[]'::jsonb)
    from public.activities a
   where a.status = 'aktif' and a.public_access;
$$;

create or replace function public.public_activity(p_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', a.id, 'name', a.name, 'description', a.description, 'location', a.location,
                            'start_date', a.start_date, 'end_date', a.end_date, 'jenis', a.jenis)
    from public.activities a
   where a.id = p_id and a.status = 'aktif' and a.public_access;
$$;

create or replace function public.public_history()
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x ->> 'sort_date') desc, x ->> 'name'), '[]'::jsonb)
    from (
      select jsonb_build_object(
               'id', a.id, 'name', a.name, 'description', a.description, 'location', a.location,
               'start_date', a.start_date, 'end_date', a.end_date, 'status', a.status, 'jenis', a.jenis,
               'sort_date', coalesce(a.start_date, a.created_at::date),
               'photo_count', coalesce(g.n, 0), 'cover', g.cover) as x
        from public.activities a
        left join lateral (
          select count(*)::int as n,
                 (array_agg(d.storage_path order by d.taken_on desc nulls last, d.uploaded_at desc))[1] as cover
            from public.documentation d
           where d.activity_id = a.id and d.kind = 'foto' and a.gallery_public and a.enable_documentation) g on true
       where a.public_access and a.status <> 'draft'
       order by coalesce(a.start_date, a.created_at::date) desc, a.created_at desc
       limit 60
    ) t;
$$;

revoke all on function public.portal_get(text), public.portal_leaderboard(text), public.public_activities(),
  public.public_activity(uuid), public.public_history() from public;
grant execute on function public.portal_get(text), public.portal_leaderboard(text), public.public_activities(),
  public.public_activity(uuid), public.public_history() to anon, authenticated;
