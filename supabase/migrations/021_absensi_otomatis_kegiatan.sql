-- ===========================================================================
-- 021 — Jenis Kegiatan: absensi otomatis (tanpa menambah sesi)
--  * attendance_sessions.auto: sesi yang dibuat otomatis untuk kegiatan berjenis "Kegiatan" (satu per kegiatan)
--  * pemicu pada activities: kegiatan berjenis Kegiatan otomatis punya satu sesi absensi yang berlaku untuk semua orang
--    di kegiatan itu (custom_members = false), sehingga peserta yang ditambahkan langsung muncul di absensi.
--    Waktu sesi mengikuti tanggal kegiatan (zona Asia/Jayapura) dan ikut berubah bila tanggal kegiatan diubah;
--    tanpa tanggal, sesi berlaku setahun sejak kegiatan dibuat. Tidak ada "terlambat" (batas terlambat = lama sesi);
--    panitia bisa mengubah jam/selfie/lokasi lewat tombol Ubah di tab Absensi.
--  * kegiatan Kegiatan yang sudah ada dan belum punya sesi diberi sesi otomatis
--  Kegiatan yang jenisnya diubah menjadi Diklat: sesi otomatisnya menjadi sesi biasa (bisa diubah/dihapus).
--  Idempotent: aman dijalankan ulang.
-- ===========================================================================

alter table public.attendance_sessions add column if not exists auto boolean not null default false;
create unique index if not exists attendance_sessions_one_auto on public.attendance_sessions (activity_id) where auto;

-- zona waktu yang dipakai untuk mengubah tanggal kegiatan menjadi jam sesi (ubah di sini bila instansi di zona lain)
create or replace function public._app_tz() returns text language sql immutable as $$ select 'Asia/Jayapura'::text $$;

-- jendela waktu sesi otomatis dari tanggal kegiatan
create or replace function public._auto_window(p_start date, p_end date, p_created timestamptz, out s timestamptz, out e timestamptz)
language plpgsql stable as $$
declare tz text := public._app_tz();
begin
  s := (coalesce(p_start, (p_created at time zone tz)::date)::timestamp) at time zone tz;
  if p_start is not null or p_end is not null then
    e := ((coalesce(p_end, p_start) + 1)::timestamp) at time zone tz;      -- sampai akhir hari terakhir
  else
    e := s + interval '1 year';
  end if;
  if e <= s then e := s + interval '1 day'; end if;
end $$;

create or replace function public._sync_auto_session()
returns trigger
language plpgsql security definer set search_path = public as $$
declare w record; mins int;
begin
  if new.jenis <> 'kegiatan' then
    if tg_op = 'UPDATE' and old.jenis = 'kegiatan' then
      update public.attendance_sessions set auto = false where activity_id = new.id and auto;
    end if;
    return new;
  end if;

  select * into w from public._auto_window(new.start_date, new.end_date, new.created_at);
  mins := least(greatest(floor(extract(epoch from (w.e - w.s)) / 60)::int, 0), 2000000000);

  if exists (select 1 from public.attendance_sessions where activity_id = new.id and auto) then
    if tg_op = 'UPDATE' and (old.start_date is distinct from new.start_date or old.end_date is distinct from new.end_date) then
      update public.attendance_sessions set start_at = w.s, end_at = w.e, late_minutes = mins where activity_id = new.id and auto;
    end if;
  elsif not exists (select 1 from public.attendance_sessions where activity_id = new.id) then
    insert into public.attendance_sessions (activity_id, title, start_at, end_at, late_minutes, require_selfie, require_location, custom_members, auto)
    values (new.id, 'Absensi', w.s, w.e, mins, true, true, false, true);
  end if;
  return new;
end $$;

drop trigger if exists activities_sync_auto_session on public.activities;
create trigger activities_sync_auto_session after insert or update of jenis, start_date, end_date on public.activities
  for each row execute function public._sync_auto_session();

revoke all on function public._sync_auto_session(), public._auto_window(date, date, timestamptz), public._app_tz() from public, anon, authenticated;

-- kegiatan berjenis Kegiatan yang sudah ada dan belum punya sesi
insert into public.attendance_sessions (activity_id, title, start_at, end_at, late_minutes, require_selfie, require_location, custom_members, auto)
select a.id, 'Absensi', w.s, w.e, least(greatest(floor(extract(epoch from (w.e - w.s)) / 60)::int, 0), 2000000000), true, true, false, true
  from public.activities a
 cross join lateral public._auto_window(a.start_date, a.end_date, a.created_at) w
 where a.jenis = 'kegiatan' and not exists (select 1 from public.attendance_sessions s where s.activity_id = a.id);
