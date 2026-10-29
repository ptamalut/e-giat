-- =============================================================================
-- Migrasi: peran Narasumber
-- Narasumber punya link pribadi dan bisa absen, tetapi tidak mengerjakan kuis,
-- tidak melihat kuis, dan tidak ikut peringkat. Aman dijalankan ulang.
-- Jalankan di Supabase -> SQL Editor.
-- =============================================================================

-- 1. Kolom peran pada tabel participants ('peserta' = bawaan, atau 'narasumber')
alter table public.participants add column if not exists role text not null default 'peserta';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'participants_role_check') then
    alter table public.participants add constraint participants_role_check check (role in ('peserta', 'narasumber'));
  end if;
end $$;

-- 2. Fungsi yang berubah (izin akses fungsi tetap karena memakai create or replace)

-- Peringkat hanya menghitung peserta
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
    select weight_attendance from public.activities where id = p_activity
  ),
  sess as (
    select count(*)::int as n from public.attendance_sessions where activity_id = p_activity
  ),
  qz as (
    select id from public.quizzes
     where activity_id = p_activity and is_published and counts_toward_final
  ),
  att as (
    select p.id as pid,
           count(a.id) filter (where a.status in ('hadir', 'terlambat'))::int as c
      from public.participants p
      left join public.attendances a on a.participant_id = p.id
     where p.activity_id = p_activity and p.role = 'peserta'
     group by p.id
  ),
  best as (
    select p.id as pid, qz.id as qid, coalesce(max(t.score), 0) as s
      from public.participants p
     cross join qz
      left join public.quiz_attempts t
             on t.participant_id = p.id and t.quiz_id = qz.id and t.submitted_at is not null
     where p.activity_id = p_activity and p.role = 'peserta'
     group by p.id, qz.id
  ),
  qavg as (
    select pid, round(avg(s), 2) as v from best group by pid
  ),
  base as (
    select p.id as pid, p.name, p.institution, att.c, sess.n,
           case when sess.n > 0 then round(att.c::numeric * 100 / sess.n, 2) end as ap,
           qavg.v as qa,
           w.weight_attendance as wt
      from public.participants p
      join att on att.pid = p.id
     cross join sess
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

-- Halaman peserta: sertakan peran; narasumber tidak menerima daftar kuis
create or replace function public.portal_get(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p        public.participants;
  a        public.activities;
  v_now    timestamptz := now();
  v_sess   jsonb;
  v_quiz   jsonb;
begin
  p := public._participant_by_token(p_token);
  perform public._close_expired(p.id);
  select * into a from public.activities where id = p.activity_id;

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
   where q.activity_id = a.id and q.is_published and p.role = 'peserta';  -- narasumber tidak melihat kuis

  return jsonb_build_object(
    'now', v_now,
    'participant', jsonb_build_object(
      'id', p.id, 'name', p.name, 'identifier', p.identifier, 'grade', p.grade,
      'job_title', p.job_title, 'institution', p.institution, 'role', p.role),
    'activity', jsonb_build_object(
      'id', a.id, 'name', a.name, 'description', a.description, 'location', a.location,
      'start_date', a.start_date, 'end_date', a.end_date, 'status', a.status,
      'show_leaderboard', a.show_leaderboard),
    'sessions', v_sess,
    'quizzes', v_quiz
  );
end $$;

-- Narasumber ditolak saat mencoba memulai kuis (ditegakkan di server)
create or replace function public.portal_start_attempt(p_token text, p_quiz uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p       public.participants;
  a       public.activities;
  z       public.quizzes;
  t       public.quiz_attempts;
  v_now   timestamptz := now();
  v_used  int;
  v_order jsonb;
  v_dead  timestamptz;
begin
  p := public._participant_by_token(p_token);
  if p.role <> 'peserta' then
    raise exception 'Narasumber tidak mengerjakan kuis.' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p.id::text || p_quiz::text, 0));
  perform public._close_expired(p.id);

  select * into a from public.activities where id = p.activity_id;
  if a.status = 'draft' then
    raise exception 'Kegiatan belum dibuka.' using errcode = 'P0001';
  end if;
  select * into z from public.quizzes where id = p_quiz and activity_id = p.activity_id and is_published;
  if not found then
    raise exception 'Kuis tidak ditemukan.' using errcode = 'P0002';
  end if;

  -- lanjutkan percobaan yang masih berjalan
  select * into t from public.quiz_attempts
   where quiz_id = z.id and participant_id = p.id and submitted_at is null
   order by attempt_no desc limit 1;

  if not found then
    if z.open_at is not null and v_now < z.open_at then
      raise exception 'Kuis belum dibuka.' using errcode = 'P0001';
    end if;
    if z.close_at is not null and v_now > z.close_at then
      raise exception 'Kuis sudah ditutup.' using errcode = 'P0001';
    end if;
    if z.require_checkin and not exists (
         select 1 from public.attendances at
          where at.participant_id = p.id and at.status in ('hadir', 'terlambat')) then
      raise exception 'Anda harus melakukan absensi terlebih dahulu sebelum mengerjakan kuis ini.' using errcode = 'P0001';
    end if;
    select count(*) into v_used from public.quiz_attempts where quiz_id = z.id and participant_id = p.id;
    if v_used >= z.max_attempts then
      raise exception 'Kesempatan mengerjakan kuis ini sudah habis.' using errcode = 'P0001';
    end if;

    select coalesce(jsonb_agg(q.id order by case when z.shuffle_questions then random() end, q.position, q.created_at), '[]'::jsonb)
      into v_order from public.questions q where q.quiz_id = z.id;
    if jsonb_array_length(v_order) = 0 then
      raise exception 'Kuis ini belum memiliki soal.' using errcode = 'P0001';
    end if;

    v_dead := case when z.duration_minutes is not null then v_now + make_interval(mins => z.duration_minutes) end;
    if z.close_at is not null and (v_dead is null or z.close_at < v_dead) then
      v_dead := z.close_at;
    end if;

    insert into public.quiz_attempts (activity_id, quiz_id, participant_id, attempt_no, started_at, deadline_at, question_order)
    values (p.activity_id, z.id, p.id, v_used + 1, v_now, v_dead, v_order)
    returning * into t;
  end if;

  return jsonb_build_object(
    'now', v_now,
    'attempt', jsonb_build_object(
      'id', t.id, 'attempt_no', t.attempt_no, 'started_at', t.started_at,
      'deadline_at', t.deadline_at, 'answers', t.answers),
    'quiz', jsonb_build_object(
      'id', z.id, 'title', z.title, 'type', z.type, 'description', z.description,
      'duration_minutes', z.duration_minutes, 'shuffle_options', z.shuffle_options),
    'questions', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', q.id,
               'text', q.text,
               'points', q.points,
               'options', (select jsonb_agg(jsonb_build_object('i', o.i - 1, 't', o.t) order by o.i)
                             from jsonb_array_elements_text(q.options) with ordinality as o(t, i))
             ) order by ord.n), '[]'::jsonb)
        from jsonb_array_elements_text(t.question_order) with ordinality as ord(qid, n)
        join public.questions q on q.id = ord.qid::uuid
    )
  );
end $$;

-- Papan peringkat: tidak ditampilkan untuk narasumber; total hanya peserta
create or replace function public.portal_leaderboard(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.participants;
  a public.activities;
begin
  p := public._participant_by_token(p_token);
  select * into a from public.activities where id = p.activity_id;
  if not a.show_leaderboard or p.role <> 'peserta' then
    return jsonb_build_object('enabled', false, 'rows', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'enabled', true,
    'total', (select count(*) from public.participants where activity_id = a.id and role = 'peserta'),
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
