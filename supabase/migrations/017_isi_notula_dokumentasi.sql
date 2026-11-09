-- =============================================================================
-- Migrasi 017 — petugas/panitia mengisi notula dan dokumentasi lewat link pribadi
--
-- Jalankan sekali di Supabase SQL Editor (setelah 016). Aman dijalankan ulang (idempotent).
--
--  * petugas (jenis Kegiatan) dan panitia (jenis Diklat) dengan hak akses Notula/Dokumentasi bisa menambah notula
--    (dan mengubah/menghapus buatannya sendiri) serta foto/tautan dokumentasi dari halaman pribadinya
--  * foto diunggah ke path yang dicadangkan server (doc_slots); added_by menandai catatan buatan mereka
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PETUGAS / PANITIA MENGISI NOTULA DAN DOKUMENTASI LEWAT LINK PRIBADI
--   * petugas (jenis Kegiatan) dan panitia (jenis Diklat) yang punya hak akses Notula/Dokumentasi boleh
--     menambah notula (dan mengubah/menghapus notula buatannya sendiri) serta menambah foto/tautan dokumentasi
--   * foto diunggah ke path yang dicadangkan server (doc_slots), seperti selfie; admin tetap bisa mengelola semuanya
--   * added_by menandai catatan yang dibuat lewat link pribadi (null = dibuat admin)
-- ---------------------------------------------------------------------------

alter table public.meeting_notes add column if not exists added_by uuid references public.participants (id) on delete set null;
alter table public.documentation add column if not exists added_by uuid references public.participants (id) on delete set null;

create table if not exists public.doc_slots (
  path           text primary key,
  activity_id    uuid not null references public.activities (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  used           boolean not null default false,
  created_at     timestamptz not null default now()
);
create index if not exists doc_slots_participant_idx on public.doc_slots (participant_id, created_at);
alter table public.doc_slots enable row level security;   -- tanpa kebijakan: hanya lewat fungsi
revoke all on public.doc_slots from anon, authenticated;

-- orang di balik token, dipastikan petugas/panitia dan punya hak akses menu yang diminta ('notes' atau 'docs')
create or replace function public._portal_staff(p_token text, p_menu text)
returns public.participants
language plpgsql stable security definer set search_path = public as $$
declare
  p public.participants;
  a public.activities;
begin
  p := public._participant_by_token(p_token);
  select * into a from public.activities where id = p.activity_id;
  if not (p.roles && array['petugas', 'panitia']) then
    raise exception 'Hanya petugas atau panitia yang dapat mengisi ini.' using errcode = '42501';
  end if;
  if p_menu = 'notes' and not (a.enable_notes and p.access_notes) then
    raise exception 'Notula tidak tersedia untuk Anda pada kegiatan ini.' using errcode = 'P0001';
  end if;
  if p_menu = 'docs' and not (a.enable_documentation and p.access_documentation) then
    raise exception 'Dokumentasi tidak tersedia untuk Anda pada kegiatan ini.' using errcode = 'P0001';
  end if;
  return p;
end $$;

-- simpan notula (id kosong = baru); mengubah hanya notula buatan sendiri
create or replace function public.portal_note_save(p_token text, p_id uuid, p jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me      public.participants := public._portal_staff(p_token, 'notes');
  v_title text := btrim(coalesce(p ->> 'title', ''));
  v_stat  text := coalesce(nullif(p ->> 'status', ''), 'draft');
  v_fu    jsonb := coalesce(p -> 'follow_ups', '[]'::jsonb);
  v_id    uuid;
begin
  if v_title = '' then raise exception 'Judul notula wajib diisi.' using errcode = '22023'; end if;
  if char_length(v_title) > 300 then raise exception 'Judul terlalu panjang.' using errcode = '22023'; end if;
  if v_stat not in ('draft', 'final') then raise exception 'Status notula tidak valid.' using errcode = '22023'; end if;
  if jsonb_typeof(v_fu) <> 'array' or jsonb_array_length(v_fu) > 100 then
    raise exception 'Tindak lanjut tidak valid (maksimal 100 butir).' using errcode = '22023';
  end if;
  if char_length(coalesce(p ->> 'discussion', '')) > 50000 or char_length(coalesce(p ->> 'agenda', '')) > 20000
     or char_length(coalesce(p ->> 'decisions', '')) > 20000 or char_length(coalesce(p ->> 'attendees', '')) > 20000 then
    raise exception 'Isi notula terlalu panjang.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.meeting_notes (activity_id, title, held_at, location, leader, notetaker, attendees, agenda, discussion, decisions, follow_ups, status, added_by)
    values (me.activity_id, v_title, nullif(p ->> 'held_at', '')::timestamptz, nullif(btrim(p ->> 'location'), ''), nullif(btrim(p ->> 'leader'), ''),
            nullif(btrim(p ->> 'notetaker'), ''), nullif(btrim(p ->> 'attendees'), ''), nullif(btrim(p ->> 'agenda'), ''),
            nullif(btrim(p ->> 'discussion'), ''), nullif(btrim(p ->> 'decisions'), ''), v_fu, v_stat, me.id)
    returning id into v_id;
  else
    update public.meeting_notes set
           title = v_title, held_at = nullif(p ->> 'held_at', '')::timestamptz, location = nullif(btrim(p ->> 'location'), ''),
           leader = nullif(btrim(p ->> 'leader'), ''), notetaker = nullif(btrim(p ->> 'notetaker'), ''),
           attendees = nullif(btrim(p ->> 'attendees'), ''), agenda = nullif(btrim(p ->> 'agenda'), ''),
           discussion = nullif(btrim(p ->> 'discussion'), ''), decisions = nullif(btrim(p ->> 'decisions'), ''),
           follow_ups = v_fu, status = v_stat, updated_at = now()
     where id = p_id and activity_id = me.activity_id and added_by = me.id
     returning id into v_id;
    if v_id is null then
      raise exception 'Notula tidak ditemukan atau bukan buatan Anda.' using errcode = '42501';
    end if;
  end if;
  return v_id;
end $$;

create or replace function public.portal_note_delete(p_token text, p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.participants := public._portal_staff(p_token, 'notes');
  n  int;
begin
  delete from public.meeting_notes where id = p_id and activity_id = me.activity_id and added_by = me.id;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Notula tidak ditemukan atau bukan buatan Anda.' using errcode = '42501'; end if;
end $$;

-- nama untuk mengisi daftar peserta rapat: semua orang di kegiatan, atau yang hadir pada satu sesi
create or replace function public.portal_note_people(p_token text, p_session uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me public.participants := public._portal_staff(p_token, 'notes');
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('name', x.name, 'institution', x.institution) order by x.name)
      from public.participants x
     where x.activity_id = me.activity_id
       and (p_session is null or exists (
             select 1 from public.attendances t
              where t.session_id = p_session and t.participant_id = x.id and t.status in ('hadir', 'terlambat')))), '[]'::jsonb);
end $$;

-- cadangkan path unggah foto dokumentasi (sekali pakai, 30 menit)
create or replace function public.portal_doc_slot(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me     public.participants := public._portal_staff(p_token, 'docs');
  v_path text;
begin
  delete from public.doc_slots where created_at < now() - interval '1 day';
  if (select count(*) from public.doc_slots where participant_id = me.id and not used and created_at > now() - interval '20 minutes') >= 40 then
    raise exception 'Terlalu banyak unggahan. Tunggu beberapa menit lalu coba lagi.' using errcode = 'P0001';
  end if;
  v_path := me.activity_id::text || '/' || replace(gen_random_uuid()::text, '-', '') || '.jpg';
  insert into public.doc_slots (path, activity_id, participant_id) values (v_path, me.activity_id, me.id);
  return jsonb_build_object('path', v_path);
end $$;

create or replace function public.doc_slot_ok(p_name text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.doc_slots where path = p_name and not used and created_at > now() - interval '30 minutes');
$$;

-- catat foto yang sudah diunggah ke path cadangan
create or replace function public.portal_doc_add(p_token text, p_path text, p_file_name text, p_size bigint, p_album text, p_taken_on date, p_caption text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me   public.participants := public._portal_staff(p_token, 'docs');
  v_id uuid;
begin
  perform 1 from public.doc_slots where path = p_path and participant_id = me.id and not used for update;
  if not found then raise exception 'Unggahan tidak valid atau sudah dicatat.' using errcode = 'P0001'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'dokumentasi' and name = p_path) then
    raise exception 'Berkas foto belum terunggah.' using errcode = 'P0001';
  end if;
  update public.doc_slots set used = true where path = p_path;
  insert into public.documentation (activity_id, kind, storage_path, file_name, mime_type, size_bytes, album, taken_on, caption, added_by)
  values (me.activity_id, 'foto', p_path, left(p_file_name, 200), 'image/jpeg', p_size, nullif(left(btrim(coalesce(p_album, '')), 100), ''), p_taken_on,
          nullif(left(btrim(coalesce(p_caption, '')), 500), ''), me.id)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.portal_doc_add_link(p_token text, p_url text, p_title text, p_caption text, p_album text, p_taken_on date)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me   public.participants := public._portal_staff(p_token, 'docs');
  v_id uuid;
begin
  if p_url !~* '^https?://[^\s]+$' or char_length(p_url) > 500 then
    raise exception 'Tautan harus berupa alamat http(s) yang valid.' using errcode = '22023';
  end if;
  insert into public.documentation (activity_id, kind, url, title, caption, album, taken_on, added_by)
  values (me.activity_id, 'tautan', p_url, nullif(left(btrim(coalesce(p_title, '')), 200), ''), nullif(left(btrim(coalesce(p_caption, '')), 500), ''),
          nullif(left(btrim(coalesce(p_album, '')), 100), ''), p_taken_on, me.id)
  returning id into v_id;
  return v_id;
end $$;

drop policy if exists dokumentasi_obj_insert_slot on storage.objects;
create policy dokumentasi_obj_insert_slot on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'dokumentasi' and public.doc_slot_ok(name));

revoke all on function public._portal_staff(text, text), public.portal_note_save(text, uuid, jsonb), public.portal_note_delete(text, uuid),
  public.portal_note_people(text, uuid), public.portal_doc_slot(text), public.doc_slot_ok(text),
  public.portal_doc_add(text, text, text, bigint, text, date, text), public.portal_doc_add_link(text, text, text, text, text, date) from public;
revoke all on function public._portal_staff(text, text) from anon, authenticated;
grant execute on function public.portal_note_save(text, uuid, jsonb), public.portal_note_delete(text, uuid), public.portal_note_people(text, uuid),
  public.portal_doc_slot(text), public.doc_slot_ok(text), public.portal_doc_add(text, text, text, bigint, text, date, text),
  public.portal_doc_add_link(text, text, text, text, text, date) to anon, authenticated;

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
      'documentation', a.enable_documentation and p.access_documentation,
      -- petugas (jenis Kegiatan) dan panitia (Diklat) boleh mengisi notula dan dokumentasi lewat link pribadinya
      'notes_manage', a.enable_notes and p.access_notes and p.roles && array['petugas', 'panitia'],
      'documentation_manage', a.enable_documentation and p.access_documentation and p.roles && array['petugas', 'panitia']),
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
  -- semua orang melihat notula Final; petugas/panitia juga melihat draf yang mereka buat sendiri (dan bisa mengubahnya)
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', n.id, 'title', n.title, 'held_at', n.held_at, 'location', n.location, 'leader', n.leader,
             'notetaker', n.notetaker, 'attendees', n.attendees, 'agenda', n.agenda, 'discussion', n.discussion,
             'decisions', n.decisions, 'follow_ups', n.follow_ups, 'status', n.status,
             'mine', coalesce(n.added_by = p.id, false))
           order by n.held_at desc nulls last, n.created_at desc)
      from public.meeting_notes n
     where n.activity_id = a.id
       and (n.status = 'final' or (n.added_by = p.id and p.roles && array['petugas', 'panitia']))), '[]'::jsonb);
end $$;

revoke all on function public.portal_get(text), public.portal_notes(text) from public;
grant execute on function public.portal_get(text), public.portal_notes(text) to anon, authenticated;
