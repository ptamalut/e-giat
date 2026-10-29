-- =============================================================================
-- Migrasi 008 — hak akses notula & dokumentasi per orang; peserta dapat melihatnya di halamannya
--
-- Jalankan sekali di Supabase SQL Editor (setelah 007). Aman dijalankan ulang (idempotent).
--
--  * participants.access_notes / access_documentation (isi awal: hanya panitia = aktif)
--  * portal_get melaporkan menu notula & dokumentasi; portal_notes (hanya notula Final) dan portal_docs
--  * bucket "dokumentasi" menjadi publik (path acak; alamat hanya diberikan portal_docs) agar peserta
--    yang berhak bisa melihat foto tanpa login — sama seperti sertifikat
-- =============================================================================

-- Hak akses notula & dokumentasi (menu yang dilihat peserta lewat link pribadinya); hanya diisi awal sekali.
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'participants' and column_name = 'access_notes') then
    alter table public.participants add column access_notes         boolean not null default false;
    alter table public.participants add column access_documentation boolean not null default false;
    update public.participants set access_notes = true, access_documentation = true where role = 'panitia';
  end if;
end $$;
alter table public.participants add column if not exists access_notes         boolean not null default false;
alter table public.participants add column if not exists access_documentation boolean not null default false;

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
   where s.activity_id = a.id and a.enable_attendance and p.access_attendance;

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

create or replace function public.portal_notes(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p public.participants;
  a public.activities;
begin
  p := public._participant_by_token(p_token);
  select * into a from public.activities where id = p.activity_id;
  if not a.enable_notes or not p.access_notes then
    raise exception 'Notula tidak tersedia untuk Anda pada kegiatan ini.' using errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', n.id, 'title', n.title, 'held_at', n.held_at, 'location', n.location, 'leader', n.leader,
             'notetaker', n.notetaker, 'attendees', n.attendees, 'agenda', n.agenda, 'discussion', n.discussion,
             'decisions', n.decisions, 'follow_ups', n.follow_ups)
           order by n.held_at desc nulls last, n.created_at desc)
      from public.meeting_notes n
     where n.activity_id = a.id and n.status = 'final'), '[]'::jsonb);
end $$;

create or replace function public.portal_docs(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p public.participants;
  a public.activities;
begin
  p := public._participant_by_token(p_token);
  select * into a from public.activities where id = p.activity_id;
  if not a.enable_documentation or not p.access_documentation then
    raise exception 'Dokumentasi tidak tersedia untuk Anda pada kegiatan ini.' using errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', d.id, 'kind', d.kind, 'path', d.storage_path, 'url', d.url, 'title', d.title,
             'caption', d.caption, 'album', d.album, 'taken_on', d.taken_on)
           order by d.taken_on desc nulls last, d.uploaded_at desc)
      from public.documentation d where d.activity_id = a.id), '[]'::jsonb);
end $$;


insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dokumentasi', 'dokumentasi', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

revoke all on function public.portal_get(text), public.portal_notes(text), public.portal_docs(text) from public;
grant execute on function public.portal_get(text), public.portal_notes(text), public.portal_docs(text) to anon, authenticated;
