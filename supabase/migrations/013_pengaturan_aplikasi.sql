-- =============================================================================
-- Migrasi 013 — pengaturan aplikasi (nama, slogan, kontak, logo, favicon)
--
-- Jalankan sekali di Supabase SQL Editor (setelah 012). Aman dijalankan ulang (idempotent).
--
--  * tabel app_settings (satu baris) + fungsi public_app_settings / save_app_settings / claim_app_settings
--  * bucket publik "branding" untuk logo dan favicon (PNG)
--  * pemilik awal = akun pertama yang terdaftar; hanya pemilik yang bisa mengubah pengaturan
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PENGATURAN APLIKASI (nama, slogan, kontak, logo, favicon)
--   * satu baris (id = 1) yang dibaca siapa saja lewat public_app_settings() (halaman depan, login, halaman peserta)
--   * hanya "pemilik aplikasi" (owner_id) yang boleh mengubah; bawaannya akun pertama yang terdaftar,
--     dan bila belum ada pemilik, akun mana pun yang masuk dapat mengklaimnya lewat claim_app_settings()
--   * logo/favicon disimpan di bucket publik "branding" dengan nama acak (selalu PNG)
-- ---------------------------------------------------------------------------

create table if not exists public.app_settings (
  id           int primary key default 1 check (id = 1),
  owner_id     uuid references auth.users (id) on delete set null,
  app_name     text not null default 'LAKSANA' check (char_length(app_name) between 1 and 40),
  tagline      text not null default 'Pelaksanaan Kegiatan PTA Malut' check (char_length(tagline) <= 120),
  org_name     text check (char_length(org_name) <= 160),
  hero_title   text check (char_length(hero_title) <= 160),
  hero_text    text check (char_length(hero_text) <= 400),
  address      text check (char_length(address) <= 300),
  phone        text check (char_length(phone) <= 60),
  email        text check (char_length(email) <= 120),
  website      text check (char_length(website) <= 160),
  footer_text  text check (char_length(footer_text) <= 200),
  logo_path    text check (logo_path ~ '^([0-9a-f]{32}\.png|builtin:[a-z0-9-]{1,30})$'),
  favicon_path text check (favicon_path ~ '^([0-9a-f]{32}\.png|builtin:[a-z0-9-]{1,30})$'),
  updated_at   timestamptz not null default now()
);

alter table public.app_settings enable row level security;   -- tanpa kebijakan: akses hanya lewat fungsi di bawah
revoke all on public.app_settings from anon, authenticated;

-- pemilik awal = akun yang pertama terdaftar (bila belum ada akun, kosong dan bisa diklaim)
insert into public.app_settings (id, owner_id)
select 1, (select id from auth.users order by created_at limit 1)
on conflict (id) do nothing;

create or replace function public.public_app_settings()
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select to_jsonb(s) - 'owner_id' - 'id' from public.app_settings s where s.id = 1),
    jsonb_build_object('app_name', 'LAKSANA', 'tagline', 'Pelaksanaan Kegiatan PTA Malut'));
$$;

create or replace function public.is_app_owner()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_settings where id = 1 and owner_id is not null and owner_id = auth.uid());
$$;

-- status untuk halaman pengaturan: apakah akun ini pemilik, dan apakah pengaturan masih bisa diklaim
create or replace function public.app_settings_state()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'owner',     coalesce((select owner_id = auth.uid() from public.app_settings where id = 1), false),
    'claimable', coalesce((select owner_id is null from public.app_settings where id = 1), true));
$$;

create or replace function public.claim_app_settings()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Masuk terlebih dahulu.' using errcode = '42501'; end if;
  insert into public.app_settings (id, owner_id) values (1, auth.uid())
    on conflict (id) do update set owner_id = excluded.owner_id where public.app_settings.owner_id is null;
  if not public.is_app_owner() then
    raise exception 'Pengaturan aplikasi sudah dimiliki akun lain.' using errcode = '42501';
  end if;
end $$;

-- simpan seluruh isian (nilai kosong = dikosongkan); hanya pemilik
create or replace function public.save_app_settings(p jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  nm text := nullif(btrim(coalesce(p->>'app_name', '')), '');
  tg text := btrim(coalesce(p->>'tagline', ''));
begin
  if not public.is_app_owner() then
    raise exception 'Hanya pemilik aplikasi yang boleh mengubah pengaturan.' using errcode = '42501';
  end if;
  if nm is null then raise exception 'Nama aplikasi wajib diisi.' using errcode = '22023'; end if;

  update public.app_settings set
    app_name     = nm,
    tagline      = tg,
    org_name     = nullif(btrim(coalesce(p->>'org_name', '')), ''),
    hero_title   = nullif(btrim(coalesce(p->>'hero_title', '')), ''),
    hero_text    = nullif(btrim(coalesce(p->>'hero_text', '')), ''),
    address      = nullif(btrim(coalesce(p->>'address', '')), ''),
    phone        = nullif(btrim(coalesce(p->>'phone', '')), ''),
    email        = nullif(btrim(coalesce(p->>'email', '')), ''),
    website      = nullif(btrim(coalesce(p->>'website', '')), ''),
    footer_text  = nullif(btrim(coalesce(p->>'footer_text', '')), ''),
    logo_path    = nullif(p->>'logo_path', ''),
    favicon_path = nullif(p->>'favicon_path', ''),
    updated_at   = now()
  where id = 1;
end $$;

-- STORAGE: bucket logo & favicon (publik; hanya pemilik aplikasi yang boleh mengubah)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 1048576, array['image/png'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists branding_obj_select on storage.objects;
create policy branding_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'branding' and public.is_app_owner());
drop policy if exists branding_obj_insert on storage.objects;
create policy branding_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and public.is_app_owner());
drop policy if exists branding_obj_update on storage.objects;
create policy branding_obj_update on storage.objects for update to authenticated
  using (bucket_id = 'branding' and public.is_app_owner())
  with check (bucket_id = 'branding' and public.is_app_owner());
drop policy if exists branding_obj_delete on storage.objects;
create policy branding_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'branding' and public.is_app_owner());

revoke all on function public.public_app_settings(), public.is_app_owner(), public.app_settings_state(),
  public.claim_app_settings(), public.save_app_settings(jsonb) from public, anon;
grant execute on function public.public_app_settings() to anon, authenticated;
grant execute on function public.is_app_owner(), public.app_settings_state(), public.claim_app_settings(), public.save_app_settings(jsonb) to authenticated;
