-- =============================================================================
-- LAKSANA : skema database Supabase (PostgreSQL)
--
-- Cara pakai: buka Supabase Dashboard -> SQL Editor -> New query -> tempel seluruh
-- isi file ini -> Run. Aman dijalankan ulang (idempotent) untuk pembaruan fungsi.
--
-- Model keamanan:
--   * Panitia (admin)  : login Supabase Auth, mengakses tabel langsung dengan RLS
--                        (hanya bisa melihat/mengubah data kegiatan miliknya).
--   * Peserta          : TANPA login. Cukup membuka link unik berisi token. Semua
--                        aksi peserta lewat fungsi RPC `security definer` di bawah
--                        yang memvalidasi token. Peserta tidak punya akses SELECT
--                        ke tabel manapun, sehingga kunci jawaban tidak pernah bocor.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABEL
-- ---------------------------------------------------------------------------

create table if not exists public.activities (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name               text not null check (length(trim(name)) > 0),
  description        text,
  location           text,
  start_date         date,
  end_date           date,
  status             text not null default 'aktif' check (status in ('draft', 'aktif', 'selesai')),
  -- bobot kehadiran (0-100) pada nilai akhir; sisanya dari rata-rata kuis
  weight_attendance  int  not null default 30 check (weight_attendance between 0 and 100),
  -- tampilkan papan peringkat kepada peserta di halaman mereka
  show_leaderboard   boolean not null default true,
  -- urutan tampil satuan kerja (daftar kunci satker huruf kecil); null = abjad
  satker_order       jsonb,
  -- peserta/narasumber/panitia baru bisa mengunduh sertifikat setelah panitia membuka unduhan
  certificates_open  boolean not null default false,
  created_at         timestamptz not null default now()
);
alter table public.activities add column if not exists satker_order jsonb;
alter table public.activities add column if not exists certificates_open boolean not null default false;
-- menu yang diaktifkan untuk kegiatan ini (menu nonaktif tidak tampil bagi panitia maupun peserta, dan ditolak di server)
alter table public.activities add column if not exists enable_attendance    boolean not null default true;
alter table public.activities add column if not exists enable_notes         boolean not null default true;
alter table public.activities add column if not exists enable_quiz          boolean not null default true;
alter table public.activities add column if not exists enable_certificate   boolean not null default true;
alter table public.activities add column if not exists enable_documentation boolean not null default true;
-- tampil di halaman depan (kegiatan berjalan) sehingga peserta bisa masuk dengan NIP
alter table public.activities add column if not exists public_access boolean not null default true;
create index if not exists activities_owner_idx on public.activities (owner_id, created_at desc);

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

create table if not exists public.participants (
  id           uuid primary key default gen_random_uuid(),
  activity_id  uuid not null references public.activities (id) on delete cascade,
  name         text not null check (length(trim(name)) > 0),   -- nama lengkap beserta gelar
  identifier   text,                -- NIP (atau NIK / NIM / nomor peserta)
  grade        text,                -- pangkat / golongan ruang, mis. "Penata Muda (III/a)"
  job_title    text,                -- jabatan
  institution  text,                -- satuan kerja
  email        text,                -- tidak lagi diisi dari aplikasi (dipertahankan untuk data lama)
  phone        text,                -- nomor WhatsApp
  -- peran: peserta mengerjakan kuis & masuk peringkat; narasumber dan panitia hanya absen
  role         text not null default 'peserta' check (role in ('peserta', 'narasumber', 'panitia')),
  -- urutan tampil di dalam satuan kerja (kecil = lebih atas); null = setelah yang berurutan, lalu abjad
  sort_order   int,
  -- token rahasia untuk link unik peserta (122 bit acak)
  token        text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_at   timestamptz not null default now(),
  unique (id, activity_id)
);
create index if not exists participants_activity_idx on public.participants (activity_id, name);

-- Migrasi untuk database yang sudah dibuat sebelum kolom ini ada (aman dijalankan ulang)
alter table public.participants add column if not exists grade     text;
alter table public.participants add column if not exists job_title text;
alter table public.participants add column if not exists role text not null default 'peserta';
alter table public.participants add column if not exists sort_order int;
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
-- satu pegawai hanya sekali per kegiatan
create unique index if not exists participants_employee_uq on public.participants (activity_id, employee_id) where employee_id is not null;
-- batas diganti agar ikut memperbarui database yang sebelumnya hanya mengenal peserta/narasumber
alter table public.participants drop constraint if exists participants_role_check;
alter table public.participants add constraint participants_role_check check (role in ('peserta', 'narasumber', 'panitia'));

-- Sesi absensi (mis. Hari 1, Hari 2, Sesi Pagi, ...)
create table if not exists public.attendance_sessions (
  id            uuid primary key default gen_random_uuid(),
  activity_id   uuid not null references public.activities (id) on delete cascade,
  title         text not null check (length(trim(title)) > 0),
  start_at      timestamptz not null,
  end_at        timestamptz not null,
  -- check-in setelah start_at + late_minutes dianggap "terlambat"
  late_minutes  int not null default 15 check (late_minutes >= 0),
  -- wajib foto selfie / lokasi saat absen mandiri (ditegakkan di server)
  require_selfie   boolean not null default false,
  require_location boolean not null default false,
  created_at    timestamptz not null default now(),
  check (end_at > start_at),
  unique (id, activity_id)
);
alter table public.attendance_sessions add column if not exists require_selfie   boolean not null default false;
alter table public.attendance_sessions add column if not exists require_location boolean not null default false;
create index if not exists sessions_activity_idx on public.attendance_sessions (activity_id, start_at);

create table if not exists public.attendances (
  id             uuid primary key default gen_random_uuid(),
  activity_id    uuid not null,
  session_id     uuid not null,
  participant_id uuid not null,
  status         text not null check (status in ('hadir', 'terlambat', 'izin', 'sakit', 'alpa')),
  checked_in_at  timestamptz not null default now(),
  note           text,
  manual         boolean not null default false,   -- diisi manual oleh panitia
  selfie_path    text,                             -- path foto selfie di bucket privat "selfies"
  lat            double precision,                 -- lokasi saat absen (derajat)
  lng            double precision,
  accuracy_m     real,                             -- akurasi lokasi dalam meter
  unique (session_id, participant_id),
  foreign key (session_id, activity_id) references public.attendance_sessions (id, activity_id) on delete cascade,
  foreign key (participant_id, activity_id) references public.participants (id, activity_id) on delete cascade
);
alter table public.attendances add column if not exists selfie_path text;
alter table public.attendances add column if not exists lat double precision;
alter table public.attendances add column if not exists lng double precision;
alter table public.attendances add column if not exists accuracy_m real;
create index if not exists attendances_activity_idx on public.attendances (activity_id);

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

-- Catatan percobaan NIP yang gagal di halaman depan (pembatas laju). Hanya diakses fungsi security definer.
create table if not exists public.nip_attempts (
  id           bigint generated always as identity primary key,
  activity_id  uuid not null references public.activities (id) on delete cascade,
  nip_key      text not null,
  created_at   timestamptz not null default now()
);
create index if not exists nip_attempts_lookup_idx on public.nip_attempts (activity_id, nip_key, created_at);
alter table public.nip_attempts enable row level security;

create table if not exists public.quizzes (
  id                  uuid primary key default gen_random_uuid(),
  activity_id         uuid not null references public.activities (id) on delete cascade,
  title               text not null check (length(trim(title)) > 0),
  type                text not null default 'pre' check (type in ('pre', 'post', 'lainnya')),
  description         text,
  duration_minutes    int check (duration_minutes is null or duration_minutes > 0),  -- null = tanpa batas
  open_at             timestamptz,                -- null = langsung dibuka
  close_at            timestamptz,                -- null = tanpa batas akhir
  passing_score       numeric(5, 2) check (passing_score is null or passing_score between 0 and 100),
  max_attempts        int not null default 1 check (max_attempts >= 1),
  shuffle_questions   boolean not null default false,
  shuffle_options     boolean not null default false,
  show_result         boolean not null default true,    -- tampilkan skor ke peserta setelah selesai
  show_answers        boolean not null default false,   -- tampilkan pembahasan/kunci setelah selesai
  require_checkin     boolean not null default false,   -- wajib sudah absen (min. 1 sesi)
  counts_toward_final boolean not null default true,    -- ikut dihitung di nilai akhir/peringkat
  is_published        boolean not null default false,
  created_at          timestamptz not null default now(),
  check (open_at is null or close_at is null or close_at > open_at),
  unique (id, activity_id)
);
create index if not exists quizzes_activity_idx on public.quizzes (activity_id, created_at);

create table if not exists public.questions (
  id             uuid primary key default gen_random_uuid(),
  activity_id    uuid not null,
  quiz_id        uuid not null,
  position       int not null default 0,
  text           text not null check (length(trim(text)) > 0),
  options        jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 8),
  correct_index  int not null check (correct_index >= 0),
  points         numeric(6, 2) not null default 1 check (points > 0),
  explanation    text,
  created_at     timestamptz not null default now(),
  check (correct_index < jsonb_array_length(options)),
  foreign key (quiz_id, activity_id) references public.quizzes (id, activity_id) on delete cascade
);
create index if not exists questions_quiz_idx on public.questions (quiz_id, position);

create table if not exists public.quiz_attempts (
  id              uuid primary key default gen_random_uuid(),
  activity_id     uuid not null,
  quiz_id         uuid not null,
  participant_id  uuid not null,
  attempt_no      int not null,
  started_at      timestamptz not null default now(),
  deadline_at     timestamptz,              -- batas waktu server (null = tanpa batas)
  submitted_at    timestamptz,
  question_order  jsonb not null,           -- urutan id soal untuk percobaan ini
  answers         jsonb not null default '{}'::jsonb,   -- { "<question_id>": <index opsi> }
  score           numeric(6, 2),
  correct_count   int,
  total_questions int,
  auto_submitted  boolean not null default false,       -- true jika waktu habis
  unique (quiz_id, participant_id, attempt_no),
  foreign key (quiz_id, activity_id) references public.quizzes (id, activity_id) on delete cascade,
  foreign key (participant_id, activity_id) references public.participants (id, activity_id) on delete cascade
);
create index if not exists attempts_quiz_idx on public.quiz_attempts (quiz_id);
create index if not exists attempts_participant_idx on public.quiz_attempts (participant_id);

-- Sertifikat: satu berkas per orang. Berkasnya di Supabase Storage (bucket "certificates"),
-- path acak `<activity_id>/<32 hex>.<ext>` sehingga alamatnya tidak bisa ditebak.
create table if not exists public.certificates (
  id              uuid primary key default gen_random_uuid(),
  activity_id     uuid not null,
  participant_id  uuid not null,
  storage_path    text not null unique,
  file_name       text not null,            -- nama berkas asli (dipakai sebagai nama unduhan)
  mime_type       text,
  size_bytes      bigint,
  uploaded_at     timestamptz not null default now(),
  unique (participant_id),
  foreign key (participant_id, activity_id) references public.participants (id, activity_id) on delete cascade
);
create index if not exists certificates_activity_idx on public.certificates (activity_id);

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

-- ---------------------------------------------------------------------------
-- RLS (akses panitia)
-- ---------------------------------------------------------------------------

create or replace function public.is_activity_owner(p_activity uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.activities a
    where a.id = p_activity and a.owner_id = auth.uid()
  );
$$;

alter table public.activities          enable row level security;
alter table public.participants        enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.attendances         enable row level security;
alter table public.quizzes             enable row level security;
alter table public.questions           enable row level security;
alter table public.quiz_attempts       enable row level security;
alter table public.certificates        enable row level security;
alter table public.employees           enable row level security;
alter table public.meeting_notes       enable row level security;
alter table public.documentation       enable row level security;

drop policy if exists activities_owner on public.activities;
create policy activities_owner on public.activities
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

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

drop policy if exists sessions_owner on public.attendance_sessions;
create policy sessions_owner on public.attendance_sessions
  for all to authenticated
  using (public.is_activity_owner(activity_id)) with check (public.is_activity_owner(activity_id));

drop policy if exists attendances_owner on public.attendances;
create policy attendances_owner on public.attendances
  for all to authenticated
  using (public.is_activity_owner(activity_id)) with check (public.is_activity_owner(activity_id));

drop policy if exists quizzes_owner on public.quizzes;
create policy quizzes_owner on public.quizzes
  for all to authenticated
  using (public.is_activity_owner(activity_id)) with check (public.is_activity_owner(activity_id));

drop policy if exists questions_owner on public.questions;
create policy questions_owner on public.questions
  for all to authenticated
  using (public.is_activity_owner(activity_id)) with check (public.is_activity_owner(activity_id));

-- percobaan kuis: panitia hanya boleh melihat & menghapus (reset), tidak mengubah skor
drop policy if exists attempts_owner_select on public.quiz_attempts;
create policy attempts_owner_select on public.quiz_attempts
  for select to authenticated using (public.is_activity_owner(activity_id));
drop policy if exists certificates_owner on public.certificates;
create policy certificates_owner on public.certificates
  for all to authenticated
  using (public.is_activity_owner(activity_id)) with check (public.is_activity_owner(activity_id));

drop policy if exists attempts_owner_delete on public.quiz_attempts;
create policy attempts_owner_delete on public.quiz_attempts
  for delete to authenticated using (public.is_activity_owner(activity_id));

-- peserta (anon) tidak punya akses langsung ke tabel
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update on public.quiz_attempts from authenticated;
revoke all on public.selfie_slots from anon, authenticated;
revoke all on public.nip_attempts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- FUNGSI INTERNAL (tidak bisa dipanggil klien)
-- ---------------------------------------------------------------------------

-- toleransi jaringan saat submit mendekati batas waktu
create or replace function public._grace() returns interval
language sql immutable as $$ select interval '20 seconds' $$;

create or replace function public._participant_by_token(p_token text)
returns public.participants
language plpgsql stable security definer set search_path = public as $$
declare v public.participants;
begin
  select * into v from public.participants where token = p_token;
  if not found then
    raise exception 'Link tidak valid atau peserta tidak ditemukan.' using errcode = 'P0002';
  end if;
  return v;
end $$;

-- Menilai & menutup satu percobaan. Idempotent.
create or replace function public._finalize_attempt(p_attempt uuid, p_answers jsonb, p_auto boolean)
returns public.quiz_attempts
language plpgsql security definer set search_path = public as $$
declare
  t       public.quiz_attempts;
  v_ans   jsonb;
  v_total numeric;
  v_got   numeric;
  v_ok    int;
  v_n     int;
begin
  select * into t from public.quiz_attempts where id = p_attempt for update;
  if not found then
    raise exception 'Percobaan kuis tidak ditemukan.' using errcode = 'P0002';
  end if;
  if t.submitted_at is not null then
    return t;
  end if;

  -- hanya terima jawaban berupa angka untuk soal yang memang ada di percobaan ini
  select coalesce(jsonb_object_agg(q.id::text, p_answers -> q.id::text), '{}'::jsonb)
    into v_ans
    from public.questions q
   where q.quiz_id = t.quiz_id
     and q.id::text in (select jsonb_array_elements_text(t.question_order))
     and jsonb_typeof(p_answers -> q.id::text) = 'number';

  select coalesce(sum(q.points), 0),
         coalesce(sum(q.points) filter (where v_ans -> q.id::text = to_jsonb(q.correct_index)), 0),
         count(*) filter (where v_ans -> q.id::text = to_jsonb(q.correct_index)),
         count(*)
    into v_total, v_got, v_ok, v_n
    from public.questions q
   where q.quiz_id = t.quiz_id
     and q.id::text in (select jsonb_array_elements_text(t.question_order));

  update public.quiz_attempts
     set answers         = v_ans,
         score           = case when v_total > 0 then round(v_got / v_total * 100, 2) else 0 end,
         correct_count   = v_ok,
         total_questions = v_n,
         submitted_at    = case when deadline_at is not null then least(now(), deadline_at) else now() end,
         auto_submitted  = p_auto
   where id = p_attempt
   returning * into t;
  return t;
end $$;

-- Menutup otomatis percobaan peserta yang waktunya sudah habis
create or replace function public._close_expired(p_participant uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select id, answers from public.quiz_attempts
     where participant_id = p_participant
       and submitted_at is null
       and deadline_at is not null
       and now() > deadline_at + public._grace()
  loop
    perform public._finalize_attempt(r.id, r.answers, true);
  end loop;
end $$;

-- Perhitungan nilai akhir & peringkat (satu sumber kebenaran untuk panitia & peserta)
--   kehadiran% = sesi berstatus hadir/terlambat / total sesi
--   rata-rata kuis = rata-rata skor terbaik tiap kuis (published & counts_toward_final);
--                    kuis yang belum dikerjakan dihitung 0
--   nilai akhir = bobot_kehadiran * kehadiran% + (100 - bobot) * rata-rata kuis
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

-- ---------------------------------------------------------------------------
-- RPC UNTUK PESERTA (anon, divalidasi dengan token)
-- ---------------------------------------------------------------------------

-- Data halaman peserta: profil, kegiatan, sesi absensi, dan daftar kuis
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

-- Mulai (atau lanjutkan) pengerjaan kuis. Kunci jawaban TIDAK dikirim.
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

-- Simpan jawaban sementara (autosave). Mengembalikan waktu server.
create or replace function public.portal_save_answers(p_token text, p_attempt uuid, p_answers jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.participants;
  t public.quiz_attempts;
begin
  p := public._participant_by_token(p_token);
  select * into t from public.quiz_attempts where id = p_attempt and participant_id = p.id;
  if not found then
    raise exception 'Percobaan kuis tidak ditemukan.' using errcode = 'P0002';
  end if;
  if t.submitted_at is null and (t.deadline_at is null or now() <= t.deadline_at + public._grace()) then
    update public.quiz_attempts
       set answers = coalesce((
             select jsonb_object_agg(k, p_answers -> k)
               from jsonb_object_keys(p_answers) as k
              where jsonb_typeof(p_answers -> k) = 'number'
           ), '{}'::jsonb)
     where id = t.id;
  end if;
  return jsonb_build_object('now', now(), 'submitted', t.submitted_at is not null);
end $$;

create or replace function public._attempt_result(t public.quiz_attempts)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare z public.quizzes;
begin
  select * into z from public.quizzes where id = t.quiz_id;
  return jsonb_build_object(
    'attempt_id', t.id,
    'quiz_id', z.id,
    'quiz_title', z.title,
    'quiz_type', z.type,
    'attempt_no', t.attempt_no,
    'submitted_at', t.submitted_at,
    'auto_submitted', t.auto_submitted,
    'show_result', z.show_result,
    'show_answers', z.show_answers,
    'total_questions', t.total_questions,
    'score', case when z.show_result then t.score end,
    'correct_count', case when z.show_result then t.correct_count end,
    'passing_score', z.passing_score,
    'passed', case when z.show_result and z.passing_score is not null then t.score >= z.passing_score end
  );
end $$;

-- Kumpulkan jawaban & nilai
create or replace function public.portal_submit_attempt(p_token text, p_attempt uuid, p_answers jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p      public.participants;
  t      public.quiz_attempts;
  v_late boolean;
begin
  p := public._participant_by_token(p_token);
  select * into t from public.quiz_attempts where id = p_attempt and participant_id = p.id for update;
  if not found then
    raise exception 'Percobaan kuis tidak ditemukan.' using errcode = 'P0002';
  end if;

  if t.submitted_at is null then
    v_late := t.deadline_at is not null and now() > t.deadline_at + public._grace();
    -- terlambat kirim -> pakai jawaban terakhir yang tersimpan di server
    t := public._finalize_attempt(t.id, case when v_late then t.answers else coalesce(p_answers, '{}'::jsonb) end,
                                  t.deadline_at is not null and now() >= t.deadline_at);
  end if;
  return public._attempt_result(t);
end $$;

-- Hasil + pembahasan (hanya jika diizinkan panitia)
create or replace function public.portal_get_result(p_token text, p_attempt uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.participants;
  t public.quiz_attempts;
  z public.quizzes;
  r jsonb;
begin
  p := public._participant_by_token(p_token);
  perform public._close_expired(p.id);
  select * into t from public.quiz_attempts where id = p_attempt and participant_id = p.id;
  if not found then
    raise exception 'Hasil kuis tidak ditemukan.' using errcode = 'P0002';
  end if;
  if t.submitted_at is null then
    raise exception 'Kuis belum diselesaikan.' using errcode = 'P0001';
  end if;
  select * into z from public.quizzes where id = t.quiz_id;
  r := public._attempt_result(t);

  if z.show_answers then
    r := r || jsonb_build_object('review', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', q.id,
               'text', q.text,
               'options', q.options,
               'selected', t.answers -> q.id::text,
               'correct_index', q.correct_index,
               'explanation', q.explanation,
               'is_correct', (t.answers -> q.id::text) = to_jsonb(q.correct_index)
             ) order by ord.n), '[]'::jsonb)
        from jsonb_array_elements_text(t.question_order) with ordinality as ord(qid, n)
        join public.questions q on q.id = ord.qid::uuid));
  end if;
  return r;
end $$;

-- Papan peringkat (top 10 + posisi peserta sendiri), jika diaktifkan panitia
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

-- ---------------------------------------------------------------------------
-- HALAMAN DEPAN (publik, tanpa token): daftar kegiatan berjalan dan masuk dengan NIP
-- ---------------------------------------------------------------------------

-- Kegiatan berjalan yang ditampilkan di halaman depan
create or replace function public.public_activities()
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'name', a.name, 'description', a.description, 'location', a.location,
           'start_date', a.start_date, 'end_date', a.end_date)
         order by a.start_date nulls last, a.created_at desc), '[]'::jsonb)
    from public.activities a
   where a.status = 'aktif' and a.public_access;
$$;

-- Satu kegiatan berjalan (untuk halaman masuk dengan NIP); null bila tidak tersedia
create or replace function public.public_activity(p_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', a.id, 'name', a.name, 'description', a.description, 'location', a.location,
                            'start_date', a.start_date, 'end_date', a.end_date)
    from public.activities a
   where a.id = p_id and a.status = 'aktif' and a.public_access;
$$;

-- Cari link pribadi dari NIP pada sebuah kegiatan berjalan.
--   hasil: {"token": "..."} bila cocok, {"found": false} bila tidak, {"blocked": true} bila terlalu banyak percobaan gagal.
-- Pembatas laju: >= 5 kegagalan untuk NIP yang sama atau >= 40 kegagalan pada kegiatan yang sama dalam 10 menit memblokir
-- pencarian (termasuk yang benar) sampai jendela waktunya lewat, supaya NIP tidak bisa ditebak beruntun.
create or replace function public.public_find_token(p_activity uuid, p_nip text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_key   text := lower(regexp_replace(coalesce(p_nip, ''), '\s', '', 'g'));
  v_token text;
begin
  if not exists (select 1 from public.activities where id = p_activity and status = 'aktif' and public_access) then
    return jsonb_build_object('found', false);
  end if;
  if length(v_key) < 5 or length(v_key) > 40 then
    return jsonb_build_object('found', false);
  end if;

  delete from public.nip_attempts where created_at < now() - interval '1 day';
  if (select count(*) from public.nip_attempts where activity_id = p_activity and nip_key = v_key and created_at > now() - interval '10 minutes') >= 5
     or (select count(*) from public.nip_attempts where activity_id = p_activity and created_at > now() - interval '10 minutes') >= 40 then
    return jsonb_build_object('blocked', true);
  end if;

  select p.token into v_token
    from public.participants p
   where p.activity_id = p_activity
     and lower(regexp_replace(coalesce(p.identifier, ''), '\s', '', 'g')) = v_key
   order by p.created_at, p.id
   limit 1;

  if v_token is null then
    insert into public.nip_attempts (activity_id, nip_key) values (p_activity, v_key);
    return jsonb_build_object('found', false);
  end if;
  return jsonb_build_object('token', v_token);
end $$;

-- Notula yang sudah Final (hanya bila menu notula aktif dan orang ini punya hak akses notula)
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

-- Dokumentasi kegiatan (hanya bila menu dokumentasi aktif dan orang ini punya hak akses dokumentasi).
-- Alamat berkas foto (path acak) baru diberikan di sini, seperti sertifikat.
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
-- STORAGE: bucket sertifikat
--   * bucket publik, tetapi path acak (122 bit) dan hanya diberikan oleh portal_certificate
--     setelah token pribadi divalidasi -> seperti "link rahasia"
--   * hanya pemilik kegiatan yang boleh mengunggah/mengganti/menghapus/melihat daftar,
--     dibatasi pada folder `<activity_id>/`
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- STORAGE: bucket dokumentasi kegiatan
--   * bucket publik, tetapi path acak (122 bit) dan alamatnya hanya diberikan portal_docs setelah token pribadi
--     divalidasi dan orang itu punya hak akses dokumentasi -> seperti "link rahasia" (sama dengan sertifikat)
--   * hanya pemilik kegiatan yang boleh mengunggah/mengganti/menghapus/melihat daftar, dibatasi pada folder `<activity_id>/`
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dokumentasi', 'dokumentasi', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
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

-- ---------------------------------------------------------------------------
-- RPC UNTUK PANITIA
-- ---------------------------------------------------------------------------

create or replace function public.activity_ranking(p_activity uuid)
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
  select * from public._ranking(p_activity) where public.is_activity_owner(p_activity);
$$;

-- Simpan urutan satuan kerja dan urutan orang dalam satu panggilan.
--   p_satker_order : array kunci satker (huruf kecil) sesuai urutan tampil, atau null untuk kembali ke abjad
--   p_participants : id orang sesuai urutan tampil (posisi menjadi sort_order)
create or replace function public.save_activity_order(p_activity uuid, p_satker_order jsonb, p_participants uuid[])
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_activity_owner(p_activity) then
    raise exception 'Anda tidak berhak mengubah kegiatan ini.' using errcode = '42501';
  end if;
  if p_satker_order is not null and jsonb_typeof(p_satker_order) <> 'array' then
    raise exception 'Urutan satuan kerja harus berupa daftar.' using errcode = '22023';
  end if;

  update public.activities set satker_order = p_satker_order where id = p_activity;

  update public.participants p
     set sort_order = o.ord::int
    from unnest(p_participants) with ordinality as o(id, ord)
   where p.id = o.id and p.activity_id = p_activity;
end $$;

-- ---------------------------------------------------------------------------
-- HAK AKSES FUNGSI
-- (Supabase memberi EXECUTE ke anon/authenticated secara default; cabut dulu)
-- ---------------------------------------------------------------------------

revoke all on function
  public._grace(),
  public._participant_by_token(text),
  public._finalize_attempt(uuid, jsonb, boolean),
  public._close_expired(uuid),
  public._ranking(uuid),
  public._attempt_result(public.quiz_attempts)
from public, anon, authenticated;

revoke all on function
  public.portal_get(text),
  public.portal_check_in(text, uuid, double precision, double precision, double precision, text),
  public.portal_selfie_slot(text, uuid),
  public.portal_start_attempt(text, uuid),
  public.portal_save_answers(text, uuid, jsonb),
  public.portal_submit_attempt(text, uuid, jsonb),
  public.portal_get_result(text, uuid),
  public.portal_leaderboard(text),
  public.portal_certificate(text),
  public.portal_notes(text),
  public.portal_docs(text),
  public.public_activities(),
  public.public_activity(uuid),
  public.public_find_token(uuid, text),
  public.activity_ranking(uuid),
  public.is_activity_owner(uuid)
from public;

grant execute on function
  public.portal_get(text),
  public.portal_check_in(text, uuid, double precision, double precision, double precision, text),
  public.portal_selfie_slot(text, uuid),
  public.portal_start_attempt(text, uuid),
  public.portal_save_answers(text, uuid, jsonb),
  public.portal_submit_attempt(text, uuid, jsonb),
  public.portal_get_result(text, uuid),
  public.portal_leaderboard(text),
  public.portal_certificate(text),
  public.portal_notes(text),
  public.portal_docs(text),
  public.public_activities(),
  public.public_activity(uuid),
  public.public_find_token(uuid, text)
to anon, authenticated;

revoke all on function public.save_activity_order(uuid, jsonb, uuid[]) from public, anon;
grant execute on function public.save_activity_order(uuid, jsonb, uuid[]) to authenticated;

grant execute on function public.activity_ranking(uuid), public.is_activity_owner(uuid) to authenticated;
revoke execute on function public.activity_ranking(uuid), public.is_activity_owner(uuid) from anon;

revoke all on function public.is_employee_owner(uuid) from public, anon;
grant execute on function public.is_employee_owner(uuid) to authenticated;
revoke all on function public._sync_employee() from public, anon, authenticated;
