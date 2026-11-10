-- ===========================================================================
-- 020 — Logo kop surat sendiri (terpisah dari logo aplikasi)
--  * app_settings.kop_logo_path: PNG di bucket publik "branding" (nama acak, sama seperti logo/favicon)
--  * save_app_settings menyimpan kop_logo_path
--  Idempotent: aman dijalankan ulang.
-- ===========================================================================

alter table public.app_settings add column if not exists kop_logo_path text;
alter table public.app_settings drop constraint if exists app_settings_kop_logo_path_check;
alter table public.app_settings add constraint app_settings_kop_logo_path_check check (kop_logo_path ~ '^[0-9a-f]{32}\.png$');

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
    app_name      = nm,
    tagline       = tg,
    org_name      = nullif(btrim(coalesce(p->>'org_name', '')), ''),
    hero_title    = nullif(btrim(coalesce(p->>'hero_title', '')), ''),
    hero_text     = nullif(btrim(coalesce(p->>'hero_text', '')), ''),
    address       = nullif(btrim(coalesce(p->>'address', '')), ''),
    phone         = nullif(btrim(coalesce(p->>'phone', '')), ''),
    email         = nullif(btrim(coalesce(p->>'email', '')), ''),
    website       = nullif(btrim(coalesce(p->>'website', '')), ''),
    footer_text   = nullif(btrim(coalesce(p->>'footer_text', '')), ''),
    kop_title     = nullif(btrim(coalesce(p->>'kop_title', '')), ''),
    kop_address   = nullif(btrim(coalesce(p->>'kop_address', '')), ''),
    kop_logo_path = nullif(p->>'kop_logo_path', ''),
    logo_path     = nullif(p->>'logo_path', ''),
    favicon_path  = nullif(p->>'favicon_path', ''),
    updated_at    = now()
  where id = 1;
end $$;

revoke all on function public.save_app_settings(jsonb) from public, anon;
grant execute on function public.save_app_settings(jsonb) to authenticated;
