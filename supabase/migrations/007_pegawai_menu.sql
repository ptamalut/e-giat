-- =============================================================================
-- Migrasi 007 — menu per kegiatan, data pegawai, hak akses per orang, notula, dokumentasi
--
-- Jalankan sekali di Supabase SQL Editor. Aman dijalankan ulang (idempotent).
--
--  1. Kegiatan: pengaktifan menu (absensi, notula, kuis, sertifikat, dokumentasi)
--  2. Data pegawai (employees) — peserta kegiatan dipilih dari sini; data peserta lama otomatis
--     dijadikan data pegawai dan ditautkan (hanya pada eksekusi pertama)
--  3. Peserta: hak akses menu per orang (absensi, kuis, sertifikat); isi awal mengikuti peran lama
--  4. Notula (meeting_notes) dan dokumentasi (documentation + bucket privat "dokumentasi")
--  5. Server (RPC peserta & peringkat) menghormati menu kegiatan dan hak akses per orang
-- =============================================================================

-- menu yang diaktifkan untuk kegiatan ini (menu nonaktif tidak tampil bagi panitia maupun peserta, dan ditolak di server)
alter table public.activities add column if not exists enable_attendance    boolean not null default true;
alter table public.activities add column if not exists enable_notes         boolean not null default true;
alter table public.activities add column if not exists enable_quiz          boolean not null default true;
alter table public.activities add column if not exists enable_certificate   boolean not null default true;
alter table public.activities add column if not exists enable_documentation boolean not null default true;

-- Data pegawai (induk data orang, milik satu akun panitia). Peserta kegiatan dipilih dari sini.
-- Satuan kerja diketik bebas lalu dikelompokkan di aplikasi (huruf besar/kecil & spasi dinormalkan).
create table if not exists public.employees (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null check (length(trim(name)) > 0),   -- nama lengkap beserta gelar
  identifier   text,                -- NIP
  grade        text,                -- pangkat / golongan ruang
  job_title    text,                -- jabatan
  institution  text,                -- satuan kerja
  phone        text,                -- nomor WhatsApp
  created_at   timestamptz not null default now()
);
create index if not exists employees_owner_idx on public.employees (owner_id, institution, name);
-- satu NIP hanya boleh sekali per akun
create unique index if not exists employees_owner_nip_uq on public.employees (owner_id, identifier)
  where identifier is not null and length(trim(identifier)) > 0;

-- Hubungan ke data pegawai dan hak akses menu per orang (absensi, kuis, sertifikat)
alter table public.participants add column if not exists employee_id uuid references public.employees (id) on delete set null;
do $$
declare
  r     record;
  v_emp uuid;
begin
  -- Hanya saat kolom hak akses baru dibuat: isi awal mengikuti peran lama (narasumber/panitia tidak mengerjakan kuis),
  -- lalu bentuk data pegawai dari peserta yang sudah ada agar kegiatan lama tetap utuh. Tidak diulang pada eksekusi berikutnya.
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'participants' and column_name = 'access_quiz') then
    alter table public.participants add column access_attendance  boolean not null default true;
    alter table public.participants add column access_quiz        boolean not null default true;
    alter table public.participants add column access_certificate boolean not null default true;
    update public.participants set access_quiz = false where role <> 'peserta';

    -- satu pegawai per NIP (per pemilik); tanpa NIP: satu pegawai per orang
    for r in
      select p.id as pid, p.activity_id, a.owner_id, p.name, nullif(trim(p.identifier), '') as nip,
             p.grade, p.job_title, p.institution, p.phone, p.created_at
        from public.participants p join public.activities a on a.id = p.activity_id
       order by p.created_at desc, p.id   -- data terbaru dipakai sebagai data pegawai
    loop
      v_emp := null;
      if r.nip is not null then
        select id into v_emp from public.employees where owner_id = r.owner_id and identifier = r.nip;
        -- NIP yang sama dua kali dalam satu kegiatan: orang kedua dibuat sebagai pegawai terpisah tanpa NIP
        if v_emp is not null and exists (select 1 from public.participants where activity_id = r.activity_id and employee_id = v_emp) then
          v_emp := null; r.nip := null;
        end if;
      end if;
      if v_emp is null then
        insert into public.employees (owner_id, name, identifier, grade, job_title, institution, phone, created_at)
        values (r.owner_id, r.name, r.nip, r.grade, r.job_title, r.institution, r.phone, r.created_at)
        returning id into v_emp;
      end if;
      update public.participants set employee_id = v_emp where id = r.pid;
    end loop;
  end if;
end $$;
alter table public.participants add column if not exists access_attendance  boolean not null default true;
alter table public.participants add column if not exists access_quiz        boolean not null default true;
alter table public.participants add column if not exists access_certificate boolean not null default true;
-- satu pegawai hanya sekali per kegiatan
create unique index if not exists participants_employee_uq on public.participants (activity_id, employee_id) where employee_id is not null;

-- Notula: catatan hasil rapat/sesi kegiatan (hanya untuk panitia)
create table if not exists public.meeting_notes (
  id           uuid primary key default gen_random_uuid(),
  activity_id  uuid not null references public.activities (id) on delete cascade,
  title        text not null check (length(trim(title)) > 0),
  held_at      timestamptz,                 -- waktu pelaksanaan
  location     text,
  leader       text,                        -- pimpinan rapat
  notetaker    text,                        -- pencatat
  attendees    text,                        -- daftar/ringkasan peserta rapat
  agenda       text,
  discussion   text,                        -- pembahasan
  decisions    text,                        -- keputusan / kesimpulan
  -- tindak lanjut: [{ "id": "...", "task": "...", "pic": "...", "due": "2026-01-31", "done": false }]
  follow_ups   jsonb not null default '[]'::jsonb check (jsonb_typeof(follow_ups) = 'array'),
  status       text not null default 'draft' check (status in ('draft', 'final')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists meeting_notes_activity_idx on public.meeting_notes (activity_id, held_at desc);

-- Dokumentasi: foto kegiatan (berkas di bucket privat "dokumentasi") atau tautan (video/Drive/dll.)
create table if not exists public.documentation (
  id            uuid primary key default gen_random_uuid(),
  activity_id   uuid not null references public.activities (id) on delete cascade,
  kind          text not null default 'foto' check (kind in ('foto', 'tautan')),
  storage_path  text unique,                -- untuk kind = foto
  file_name     text,
  mime_type     text,
  size_bytes    bigint,
  url           text,                       -- untuk kind = tautan
  title         text,
  caption       text,
  album         text,                       -- pengelompokan, mis. "Hari 1" atau "Pembukaan"
  taken_on      date,
  uploaded_at   timestamptz not null default now(),
  check ((kind = 'foto' and storage_path is not null) or (kind = 'tautan' and url is not null))
);
create index if not exists documentation_activity_idx on public.documentation (activity_id, album, taken_on);

alter table public.employees     enable row level security;
alter table public.meeting_notes enable row level security;
alter table public.documentation enable row level security;

-- Apakah pegawai ini milik akun yang sedang login?
create or replace function public.is_employee_owner(p_employee uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.employees e where e.id = p_employee and e.owner_id = auth.uid());
$$;

drop policy if exists employees_owner on public.employees;
create policy employees_owner on public.employees
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists participants_owner on public.participants;
create policy participants_owner on public.participants
  for all to authenticated
  using (public.is_activity_owner(activity_id))
  with check (public.is_activity_owner(activity_id) and (employee_id is null or public.is_employee_owner(employee_id)));

drop policy if exists meeting_notes_owner on public.meeting_notes;
create policy meeting_notes_owner on public.meeting_notes
  for all to authenticated
  using (public.is_activity_owner(activity_id)) with check (public.is_activity_owner(activity_id));

drop policy if exists documentation_owner on public.documentation;
create policy documentation_owner on public.documentation
  for all to authenticated
  using (public.is_activity_owner(activity_id)) with check (public.is_activity_owner(activity_id));

-- Mengubah data pegawai ikut memperbarui salinannya pada kegiatan-kegiatan yang memakainya
create or replace function public._sync_employee()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.participants
     set name = new.name, identifier = new.identifier, grade = new.grade,
         job_title = new.job_title, institution = new.institution, phone = new.phone
   where employee_id = new.id;
  return new;
end $$;
drop trigger if exists employees_sync on public.employees;
create trigger employees_sync after update on public.employees
  for each row when (old.name is distinct from new.name or old.identifier is distinct from new.identifier
                  or old.grade is distinct from new.grade or old.job_title is distinct from new.job_title
                  or old.institution is distinct from new.institution or old.phone is distinct from new.phone)
  execute function public._sync_employee();


grant select, insert, update, delete on public.employees, public.meeting_notes, public.documentation to authenticated;
revoke all on public.employees, public.meeting_notes, public.documentation from anon;

-- ---------------------------------------------------------------------------
-- Fungsi yang diperbarui
-- ---------------------------------------------------------------------------

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
  sess as (
    -- menu absensi dimatikan: kehadiran tidak ikut dihitung
    select case when (select enable_attendance from w) then count(*)::int else 0 end as n
      from public.attendance_sessions where activity_id = p_activity
  ),
  qz as (
    select id from public.quizzes
     where activity_id = p_activity and is_published and counts_toward_final and (select enable_quiz from w)
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
    select p.id as pid, p.name, p.institution, att.c, sess.n,
           case when sess.n > 0 and p.access_attendance then round(att.c::numeric * 100 / sess.n, 2) end as ap,
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
      'certificate', a.enable_certificate and p.access_certificate),
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
  perform pg_advisory_xact_lock(hashtextextended(p.id::text || p_quiz::text, 0));
  perform public._close_expired(p.id);

  select * into a from public.activities where id = p.activity_id;
  if a.status = 'draft' then
    raise exception 'Kegiatan belum dibuka.' using errcode = 'P0001';
  end if;
  if not a.enable_quiz or not p.access_quiz then
    raise exception 'Kuis tidak tersedia untuk Anda pada kegiatan ini.' using errcode = 'P0001';
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
    if z.require_checkin and a.enable_attendance and p.access_attendance and not exists (
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


create or replace function public.portal_leaderboard(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.participants;
  a public.activities;
begin
  p := public._participant_by_token(p_token);
  select * into a from public.activities where id = p.activity_id;
  if not a.show_leaderboard or p.role <> 'peserta' or not (a.enable_attendance or a.enable_quiz) then
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
  if not a.enable_certificate or not p.access_certificate then
    raise exception 'Sertifikat tidak tersedia untuk Anda pada kegiatan ini.' using errcode = 'P0001';
  end if;
  if not a.certificates_open then
    raise exception 'Unduhan sertifikat belum dibuka oleh panitia.' using errcode = 'P0001';
  end if;
  select * into c from public.certificates where participant_id = p.id;
  if not found then
    raise exception 'Sertifikat Anda belum tersedia. Silakan hubungi panitia.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('path', c.storage_path, 'file_name', c.file_name, 'mime_type', c.mime_type);
end $$;


-- ---------------------------------------------------------------------------
-- STORAGE: bucket dokumentasi kegiatan (PRIVAT)
--   * hanya pemilik kegiatan yang boleh mengunggah/melihat/mengganti/menghapus, dibatasi pada folder `<activity_id>/`
--   * tampilan memakai signed URL berumur pendek
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dokumentasi', 'dokumentasi', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists dokumentasi_obj_select on storage.objects;
create policy dokumentasi_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'dokumentasi' and public.owns_certificate_object(name));
drop policy if exists dokumentasi_obj_insert on storage.objects;
create policy dokumentasi_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'dokumentasi' and public.owns_certificate_object(name));
drop policy if exists dokumentasi_obj_update on storage.objects;
create policy dokumentasi_obj_update on storage.objects for update to authenticated
  using (bucket_id = 'dokumentasi' and public.owns_certificate_object(name))
  with check (bucket_id = 'dokumentasi' and public.owns_certificate_object(name));
drop policy if exists dokumentasi_obj_delete on storage.objects;
create policy dokumentasi_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'dokumentasi' and public.owns_certificate_object(name));


revoke all on function public._ranking(uuid) from public, anon, authenticated;
revoke all on function public.portal_get(text), public.portal_selfie_slot(text, uuid),
  public.portal_check_in(text, uuid, double precision, double precision, double precision, text),
  public.portal_start_attempt(text, uuid), public.portal_leaderboard(text), public.portal_certificate(text) from public;
grant execute on function public.portal_get(text), public.portal_selfie_slot(text, uuid),
  public.portal_check_in(text, uuid, double precision, double precision, double precision, text),
  public.portal_start_attempt(text, uuid), public.portal_leaderboard(text), public.portal_certificate(text) to anon, authenticated;
revoke all on function public.is_employee_owner(uuid) from public, anon;
grant execute on function public.is_employee_owner(uuid) to authenticated;
revoke all on function public._sync_employee() from public, anon, authenticated;
