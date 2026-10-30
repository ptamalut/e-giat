-- =============================================================================
-- Migrasi 012 — jenis yang dirangkap (satu orang boleh beberapa jenis)
--
-- Jalankan sekali di Supabase SQL Editor (setelah 011). Aman dijalankan ulang (idempotent).
--
--  * participants.roles : daftar jenis (minimal satu); participants.role tetap sebagai jenis utama (= roles[1])
--  * Pemicu menjaga keduanya sinkron; kedudukan pada tiap sesi dipilih di sesi absensi (session_members.role)
--  * Peringkat dan papan peringkat memakai "memegang jenis peserta" (roles), bukan hanya jenis utama
-- =============================================================================

-- Jenis yang dirangkap: satu orang boleh memegang beberapa jenis (mis. narasumber + moderator).
-- `roles` adalah daftar jenis (minimal satu); `role` tetap ada sebagai jenis utama (= roles[1]) dan dijaga sinkron oleh pemicu.
-- Kedudukan sebenarnya pada tiap sesi dipilih di sesi absensi (session_members.role).
alter table public.participants add column if not exists roles text[];
update public.participants set roles = array[role] where roles is null;
alter table public.participants alter column roles set default '{}';
alter table public.participants alter column roles set not null;
alter table public.participants drop constraint if exists participants_roles_check;
alter table public.participants add constraint participants_roles_check
  check (cardinality(roles) >= 1 and roles <@ array['peserta', 'narasumber', 'moderator', 'panitia']);

create or replace function public._sync_roles()
returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(cardinality(new.roles), 0) = 0 then new.roles := array[new.role]; end if;
  elsif new.roles is not distinct from old.roles and new.role is distinct from old.role then
    new.roles := array[new.role];  -- hanya `role` yang diubah (klien lama): jenisnya diganti
  end if;
  -- buang duplikat dengan urutan dipertahankan; jenis utama = yang pertama
  new.roles := (select array_agg(r order by ord) from (select r, min(ord) as ord from unnest(new.roles) with ordinality as u(r, ord) group by r) x);
  new.role := new.roles[1];
  return new;
end $$;
drop trigger if exists participants_sync_roles on public.participants;
create trigger participants_sync_roles before insert or update on public.participants
  for each row execute function public._sync_roles();

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
     where p.activity_id = p_activity and 'peserta' = any(p.roles) and (select enable_attendance from w)
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
     where p.activity_id = p_activity and 'peserta' = any(p.roles)
     group by p.id
  ),
  best as (
    -- hanya orang yang punya hak akses kuis; yang tidak punya dinilai dari kehadiran saja
    select p.id as pid, qz.id as qid, coalesce(max(t.score), 0) as s
      from public.participants p
     cross join qz
      left join public.quiz_attempts t
             on t.participant_id = p.id and t.quiz_id = qz.id and t.submitted_at is not null
     where p.activity_id = p_activity and 'peserta' = any(p.roles) and p.access_quiz
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
     where p.activity_id = p_activity and 'peserta' = any(p.roles)
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

create or replace function public.portal_leaderboard(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.participants;
  a public.activities;
begin
  p := public._participant_by_token(p_token);
  select * into a from public.activities where id = p.activity_id;
  if not a.show_leaderboard or not ('peserta' = any(p.roles)) or not (a.enable_attendance or a.enable_quiz) then
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

revoke all on function public._sync_roles() from public, anon, authenticated;
revoke all on function public._ranking(uuid) from public, anon, authenticated;
revoke all on function public.portal_get(text), public.portal_leaderboard(text) from public;
grant execute on function public.portal_get(text), public.portal_leaderboard(text) to anon, authenticated;
