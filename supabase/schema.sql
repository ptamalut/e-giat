-- =============================================================================
-- e-Giat : skema database Supabase (PostgreSQL)
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
  created_at         timestamptz not null default now()
);
alter table public.activities add column if not exists satker_order jsonb;
create index if not exists activities_owner_idx on public.activities (owner_id, created_at desc);

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
  created_at    timestamptz not null default now(),
  check (end_at > start_at),
  unique (id, activity_id)
);
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
  unique (session_id, participant_id),
  foreign key (session_id, activity_id) references public.attendance_sessions (id, activity_id) on delete cascade,
  foreign key (participant_id, activity_id) references public.participants (id, activity_id) on delete cascade
);
create index if not exists attendances_activity_idx on public.attendances (activity_id);

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

drop policy if exists activities_owner on public.activities;
create policy activities_owner on public.activities
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists participants_owner on public.participants;
create policy participants_owner on public.participants
  for all to authenticated
  using (public.is_activity_owner(activity_id)) with check (public.is_activity_owner(activity_id));

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
drop policy if exists attempts_owner_delete on public.quiz_attempts;
create policy attempts_owner_delete on public.quiz_attempts
  for delete to authenticated using (public.is_activity_owner(activity_id));

-- peserta (anon) tidak punya akses langsung ke tabel
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update on public.quiz_attempts from authenticated;

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
    'sessions', v_sess,
    'quizzes', v_quiz
  );
end $$;

-- Absen mandiri
create or replace function public.portal_check_in(p_token text, p_session uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p      public.participants;
  s      public.attendance_sessions;
  a      public.activities;
  v_now  timestamptz := now();
  v_stat text;
  v_row  public.attendances;
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

  v_stat := case when v_now > s.start_at + make_interval(mins => s.late_minutes) then 'terlambat' else 'hadir' end;
  insert into public.attendances (activity_id, session_id, participant_id, status, checked_in_at)
  values (p.activity_id, s.id, p.id, v_stat, v_now)
  on conflict (session_id, participant_id) do nothing
  returning * into v_row;

  return jsonb_build_object('already', false, 'status', v_stat, 'checked_in_at', v_now);
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
  public.portal_check_in(text, uuid),
  public.portal_start_attempt(text, uuid),
  public.portal_save_answers(text, uuid, jsonb),
  public.portal_submit_attempt(text, uuid, jsonb),
  public.portal_get_result(text, uuid),
  public.portal_leaderboard(text),
  public.activity_ranking(uuid),
  public.is_activity_owner(uuid)
from public;

grant execute on function
  public.portal_get(text),
  public.portal_check_in(text, uuid),
  public.portal_start_attempt(text, uuid),
  public.portal_save_answers(text, uuid, jsonb),
  public.portal_submit_attempt(text, uuid, jsonb),
  public.portal_get_result(text, uuid),
  public.portal_leaderboard(text)
to anon, authenticated;

revoke all on function public.save_activity_order(uuid, jsonb, uuid[]) from public, anon;
grant execute on function public.save_activity_order(uuid, jsonb, uuid[]) to authenticated;

grant execute on function public.activity_ranking(uuid), public.is_activity_owner(uuid) to authenticated;
revoke execute on function public.activity_ranking(uuid), public.is_activity_owner(uuid) from anon;
