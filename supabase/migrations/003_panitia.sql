-- =============================================================================
-- Migrasi: peran Panitia
-- Panitia (seperti Narasumber) bisa absen, tetapi tidak melihat/mengerjakan kuis
-- dan tidak ikut peringkat. Aman dijalankan ulang.
-- Syarat: 002_narasumber.sql sudah dijalankan.
-- =============================================================================

-- 1. Perluas batas peran: peserta | narasumber | panitia
alter table public.participants drop constraint if exists participants_role_check;
alter table public.participants add constraint participants_role_check check (role in ('peserta', 'narasumber', 'panitia'));

-- 2. Pesan penolakan kuis berlaku untuk semua peran selain peserta
--    (fungsi lain sudah memakai aturan "role <> 'peserta'" sehingga panitia otomatis tercakup)
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
    raise exception 'Kuis hanya untuk peserta. Narasumber dan panitia cukup melakukan absensi.' using errcode = 'P0001';
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
