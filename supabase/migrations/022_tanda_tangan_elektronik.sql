-- ===========================================================================
-- 022 — Tanda tangan elektronik (QR) pada daftar hadir
--  * attendances.sign_code: kode acak (128 bit) per catatan kehadiran; QR di daftar hadir cetak berisi alamat /v/<kode>
--  * verify_signature(kode): fungsi publik (tanpa login) yang mengembalikan siapa, kegiatan, sesi, dan waktu absen
--    bila kode cocok dan statusnya hadir/terlambat; NIP disamarkan. Kode tidak bisa ditebak dan tidak bisa dipakai
--    mengubah apa pun. Catatan yang dihapus atau diubah menjadi izin/sakit/alpa tidak lagi sah.
--  Idempotent: aman dijalankan ulang.
-- ===========================================================================

alter table public.attendances add column if not exists sign_code text;
update public.attendances set sign_code = replace(gen_random_uuid()::text, '-', '') where sign_code is null;
alter table public.attendances alter column sign_code set default replace(gen_random_uuid()::text, '-', '');
alter table public.attendances alter column sign_code set not null;
create unique index if not exists attendances_sign_code_key on public.attendances (sign_code);

create or replace function public.verify_signature(p_code text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r record; nip text;
begin
  if p_code is null or p_code !~ '^[0-9a-f]{32}$' then return null; end if;
  select a.status, a.checked_in_at, a.manual, p.name, p.identifier, p.job_title, p.institution,
         act.name as activity, s.title as session, s.start_at
    into r
    from public.attendances a
    join public.participants p on p.id = a.participant_id and p.activity_id = a.activity_id
    join public.attendance_sessions s on s.id = a.session_id and s.activity_id = a.activity_id
    join public.activities act on act.id = a.activity_id
   where a.sign_code = p_code;
  if not found then return null; end if;
  -- NIP disamarkan: 8 angka pertama dan 2 terakhir
  nip := case when char_length(coalesce(r.identifier, '')) >= 12
              then left(r.identifier, 8) || repeat('•', char_length(r.identifier) - 10) || right(r.identifier, 2)
              else null end;
  return jsonb_build_object(
    'valid', r.status in ('hadir', 'terlambat'), 'status', r.status, 'name', r.name, 'nip', nip,
    'job_title', r.job_title, 'institution', r.institution, 'activity', r.activity, 'session', r.session,
    'session_start', r.start_at, 'checked_in_at', r.checked_in_at, 'manual', r.manual);
end $$;

revoke all on function public.verify_signature(text) from public;
grant execute on function public.verify_signature(text) to anon, authenticated;
