-- ===========================================================================
-- 024 — Modul Materi: unggah materi kegiatan (berkas atau tautan) dan unduh lewat halaman pribadi
--  * activities.enable_materials: menu Materi aktif/nonaktif per kegiatan (bawaan aktif)
--  * participants.access_materials: hak akses Materi per orang (bawaan aktif untuk semua jenis)
--  * materials: judul, pemateri, deskripsi, berkas (bucket publik "materi", path acak) atau tautan, status terbit
--  * portal_materials(token): daftar materi terbit untuk orang yang berhak (alamat berkas baru diberikan di sini)
--  Idempotent: aman dijalankan ulang.
-- ===========================================================================

alter table public.activities   add column if not exists enable_materials boolean not null default true;
alter table public.participants add column if not exists access_materials boolean not null default true;

create table if not exists public.materials (
  id           uuid primary key default gen_random_uuid(),
  activity_id  uuid not null references public.activities (id) on delete cascade,
  title        text not null check (char_length(btrim(title)) between 1 and 200),
  speaker      text check (char_length(speaker) <= 200),         -- pemateri / narasumber
  description  text check (char_length(description) <= 2000),
  kind         text not null default 'berkas' check (kind in ('berkas', 'tautan')),
  storage_path text,                                             -- path acak di bucket "materi"
  file_name    text check (char_length(file_name) <= 255),
  mime_type    text,
  size_bytes   bigint check (size_bytes >= 0),
  url          text check (url is null or (char_length(url) <= 1000 and url ~* '^https?://')),
  published    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check ((kind = 'berkas' and storage_path is not null) or (kind = 'tautan' and url is not null))
);
create index if not exists materials_activity_idx on public.materials (activity_id, created_at desc);

alter table public.materials enable row level security;
drop policy if exists materials_owner on public.materials;
create policy materials_owner on public.materials
  for all to authenticated using (public.is_activity_owner(activity_id)) with check (public.is_activity_owner(activity_id));
revoke all on public.materials from anon;
grant select, insert, update, delete on public.materials to authenticated;

-- bucket publik dengan nama berkas acak (alamat hanya diberikan lewat portal_materials); hanya pemilik kegiatan yang boleh mengubah
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('materi', 'materi', true, 52428800, array[
  'application/pdf', 'application/zip', 'application/x-zip-compressed', 'text/plain',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'audio/mpeg'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists materi_obj_select on storage.objects;
create policy materi_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'materi' and public.owns_certificate_object(name));
drop policy if exists materi_obj_insert on storage.objects;
create policy materi_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'materi' and public.owns_certificate_object(name));
drop policy if exists materi_obj_update on storage.objects;
create policy materi_obj_update on storage.objects for update to authenticated
  using (bucket_id = 'materi' and public.owns_certificate_object(name))
  with check (bucket_id = 'materi' and public.owns_certificate_object(name));
drop policy if exists materi_obj_delete on storage.objects;
create policy materi_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'materi' and public.owns_certificate_object(name));

-- materi terbit untuk pemilik token; {"enabled": false} bila menu nonaktif atau orang ini tidak punya hak akses
create or replace function public.portal_materials(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p public.participants;
  a public.activities;
begin
  p := public._participant_by_token(p_token);
  select * into a from public.activities where id = p.activity_id;
  if not a.enable_materials or not p.access_materials or a.status = 'draft' then
    return jsonb_build_object('enabled', false, 'items', '[]'::jsonb);
  end if;
  return jsonb_build_object('enabled', true, 'items', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', m.id, 'title', m.title, 'speaker', m.speaker, 'description', m.description, 'kind', m.kind,
             'path', m.storage_path, 'file_name', m.file_name, 'mime_type', m.mime_type, 'size_bytes', m.size_bytes,
             'url', m.url, 'created_at', m.created_at)
           order by m.created_at desc)
      from public.materials m where m.activity_id = a.id and m.published), '[]'::jsonb));
end $$;

revoke all on function public.portal_materials(text) from public;
grant execute on function public.portal_materials(text) to anon, authenticated;
