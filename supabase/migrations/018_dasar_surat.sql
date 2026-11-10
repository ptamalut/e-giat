-- =============================================================================
-- Migrasi 018 — dasar surat kegiatan
--
-- Jalankan sekali di Supabase SQL Editor (setelah 017). Aman dijalankan ulang (idempotent).
--
--  * activity_letters: surat dasar kegiatan (asal, nomor, tanggal, perihal) + berkas surat
--  * bucket privat "surat" (PDF/gambar, maks. 10 MB); hanya pemilik kegiatan yang bisa mengelola
-- =============================================================================

-- ---------------------------------------------------------------------------
-- DASAR SURAT KEGIATAN: surat yang menjadi dasar pelaksanaan (nomor, tanggal, perihal, asal) + berkas surat (PDF/gambar)
--   * berkas disimpan di bucket PRIVAT "surat"; hanya pemilik kegiatan yang boleh mengunggah/melihat/menghapus (signed URL)
-- ---------------------------------------------------------------------------

create table if not exists public.activity_letters (
  id           uuid primary key default gen_random_uuid(),
  activity_id  uuid not null references public.activities (id) on delete cascade,
  issuer       text check (char_length(issuer) <= 200),      -- asal/penerbit surat
  number       text check (char_length(number) <= 120),      -- nomor surat
  letter_date  date,                                         -- tanggal surat
  subject      text check (char_length(subject) <= 500),     -- perihal
  storage_path text unique,
  file_name    text,
  mime_type    text,
  size_bytes   bigint,
  created_at   timestamptz not null default now(),
  check (coalesce(btrim(number), '') <> '' or coalesce(btrim(subject), '') <> '' or coalesce(btrim(issuer), '') <> '' or storage_path is not null)
);
create index if not exists activity_letters_activity_idx on public.activity_letters (activity_id, letter_date);

alter table public.activity_letters enable row level security;
drop policy if exists activity_letters_owner on public.activity_letters;
create policy activity_letters_owner on public.activity_letters
  for all to authenticated using (public.is_activity_owner(activity_id)) with check (public.is_activity_owner(activity_id));
revoke all on public.activity_letters from anon;
grant select, insert, update, delete on public.activity_letters to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('surat', 'surat', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists surat_obj_select on storage.objects;
create policy surat_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'surat' and public.owns_certificate_object(name));
drop policy if exists surat_obj_insert on storage.objects;
create policy surat_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'surat' and public.owns_certificate_object(name));
drop policy if exists surat_obj_update on storage.objects;
create policy surat_obj_update on storage.objects for update to authenticated
  using (bucket_id = 'surat' and public.owns_certificate_object(name))
  with check (bucket_id = 'surat' and public.owns_certificate_object(name));
drop policy if exists surat_obj_delete on storage.objects;
create policy surat_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'surat' and public.owns_certificate_object(name));
