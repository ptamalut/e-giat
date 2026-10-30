-- =============================================================================
-- Migrasi 011 — jenis Moderator dan anggota per sesi absensi
--
-- Jalankan sekali di Supabase SQL Editor (setelah 010). Aman dijalankan ulang (idempotent).
--
--  * participants.role : tambah 'moderator' (peserta, narasumber, moderator, panitia)
--  * attendance_sessions.custom_members + session_members : tiap sesi bisa menentukan siapa ikut dan sebagai apa
--    (bawaan: semua orang di kegiatan ikut dengan jenis masing-masing, seperti sebelumnya)
--  * Server: portal hanya menampilkan/menerima absen untuk sesi yang diikuti; peringkat menghitung kehadiran
--    terhadap sesi yang diikuti saja
-- =============================================================================

alter table public.participants drop constraint if exists participants_role_check;
alter table public.participants add constraint participants_role_check check (role in ('peserta', 'narasumber', 'moderator', 'panitia'));

-- false: semua orang di kegiatan ikut sesi ini dengan jenis masing-masing; true: hanya yang terdaftar di session_members, dengan jenis per sesi
alter table public.attendance_sessions add column if not exists custom_members boolean not null default false;

-- Anggota sesi absensi (dipakai bila custom_members = true): siapa ikut sesi ini dan sebagai apa
create table if not exists public.session_members (
  session_id      uuid not null,
  activity_id     uuid not null,
  participant_id  uuid not null,
  role            text not null check (role in ('peserta', 'narasumber', 'moderator', 'panitia')),
  primary key (session_id, participant_id),
  foreign key (session_id, activity_id) references public.attendance_sessions (id, activity_id) on delete cascade,
  foreign key (participant_id, activity_id) references public.participants (id, activity_id) on delete cascade
);
create index if not exists session_members_participant_idx on public.session_members (participant_id);
alter table public.session_members enable row level security;

drop policy if exists session_members_owner on public.session_members;
create policy session_members_owner on public.session_members
  for all to authenticated
  using (public.is_activity_owner(activity_id)) with check (public.is_activity_owner(activity_id));

grant select, insert, update, delete on public.session_members to authenticated;
revoke all on public.session_members from anon;

create or replace function public._session_role(p_session uuid, p_participant uuid)
returns text
language sql stable security definer set search_path = public as $$
  select case when s.custom_members
              then (select m.role from public.session_members m where m.session_id = s.id and m.participant_id = p_participant)
              else (select p.role from public.participants p where p.id = p_participant and p.activity_id = s.activity_id)
         end
    from public.attendance_sessions s
   where s.id = p_session;
$$;

create or replace function public._ranking(p_activity uuid)
returns table (
  participant_id    uuid,
  name              text,
  institution       text,
  sessions_attended int,
  sessions_total    int,
  attendance_pct    numeric,
  quiz_avg          numeric,
  final_score       numeric,
  rank              int
)
language sql stable security definer set search_path = public as $$
  with w as (
    select weight_attendance, enable_attendance, enable_quiz from public.activities where id = p_activity
  ),
  qz as (
    select id from public.quizzes
     where activity_id = p_activity and is_published and counts_toward_final and (select enable_quiz from w)
  ),
  -- sesi yang diikuti tiap orang (semua sesi, atau hanya yang mencantumkannya bila sesi diatur per orang)
  mine as (
    select p.id as pid, s.id as sid
      from public.participants p
      join public.attendance_sessions s on s.activity_id = p.activity_id
     where p.activity_id = p_activity and p.role = 'peserta' and (select enable_attendance from w)
       and (not s.custom_members
            or exists (select 1 from public.session_members m where m.session_id = s.id and m.participant_id = p.id))
  ),
  att as (
    select p.id as pid,
           count(m.sid)::int as n,
           count(a.id) filter (where a.status in ('hadir', 'terlambat'))::int as c
      from public.participants p
      left join mine m on m.pid = p.id
      left join public.attendances a on a.session_id = m.sid and a.participant_id = p.id
     where p.activity_id = p_activity and p.role = 'peserta'
     group by p.id
  ),
  best as (
    -- hanya orang yang punya hak akses kuis; yang tidak punya dinilai dari kehadiran saja
    select p.id as pid, qz.id as qid, coalesce(max(t.score), 0) as s
      from public.participants p
     cross join qz
      left join public.quiz_attempts t
             on t.participant_id = p.id and t.quiz_id = qz.id and t.submitted_at is not null
     where p.activity_id = p_activity and p.role = 'peserta' and p.access_quiz
     group by p.id, qz.id
  ),
  qavg as (
    select pid, round(avg(s), 2) as v from best group by pid
  ),
  base as (
    select p.id as pid, p.name, p.institution, att.c, att.n,
           case when att.n > 0 and p.access_attendance then round(att.c::numeric * 100 / att.n, 2) end as ap,
           qavg.v as qa,
           w.weight_attendance as wt
      from public.participants p
      join att on att.pid = p.id
     cross join w
      left join qavg on qavg.pid = p.id
     where p.activity_id = p_activity and p.role = 'peserta'
  ),
  scored as (
    select *,
           case
             when ap is null and qa is null then 0
             when ap is null then qa
             when qa is null then ap
             else round((ap * wt + qa * (100 - wt)) / 100, 2)
           end as fs
      from base
  )
  select pid, name, institution, c, n, ap, qa, fs,
         (rank() over (order by fs desc))::int
    from scored
   order by fs desc, name;
$$;

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
      'job_title', p.job_title, 'institution', p.institution, 'role', p.role),
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
      'show_leaderboard', a.show_leaderboard),
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
  if not a.enable_attendance or not p.access_attendance then
    raise exception 'Absensi tidak tersedia untuk Anda pada kegiatan ini.' using errcode = 'P0001';
  end if;
  select * into s from public.attendance_sessions where id = p_session and activity_id = p.activity_id;
  if not found then
    raise exception 'Sesi absensi tidak ditemukan.' using errcode = 'P0002';
  end if;
  if public._session_role(s.id, p.id) is null then
    raise exception 'Anda tidak terdaftar pada sesi absensi ini.' using errcode = 'P0001';
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
  if not a.enable_attendance or not p.access_attendance then
    raise exception 'Absensi tidak tersedia untuk Anda pada kegiatan ini.' using errcode = 'P0001';
  end if;

  select * into s from public.attendance_sessions where id = p_session and activity_id = p.activity_id;
  if not found then
    raise exception 'Sesi absensi tidak ditemukan.' using errcode = 'P0002';
  end if;
  if public._session_role(s.id, p.id) is null then
    raise exception 'Anda tidak terdaftar pada sesi absensi ini.' using errcode = 'P0001';
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

revoke all on function public._session_role(uuid, uuid), public._ranking(uuid) from public, anon, authenticated;
revoke all on function public.portal_get(text), public.portal_selfie_slot(text, uuid),
  public.portal_check_in(text, uuid, double precision, double precision, double precision, text) from public;
grant execute on function public.portal_get(text), public.portal_selfie_slot(text, uuid),
  public.portal_check_in(text, uuid, double precision, double precision, double precision, text) to anon, authenticated;
