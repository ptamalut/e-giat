-- =============================================================================
-- Migrasi 010 — urutan satuan kerja dan pegawai pada Data pegawai
--
-- Jalankan sekali di Supabase SQL Editor (setelah 009). Aman dijalankan ulang (idempotent).
--
--  * employees.sort_order           : urutan pegawai di dalam satuan kerja
--  * employee_settings.satker_order : urutan satuan kerja (satu baris per akun)
--  * save_employee_order            : simpan kedua urutan sekaligus
-- =============================================================================

alter table public.employees add column if not exists sort_order int;

-- Urutan tampil satuan kerja untuk data pegawai (satu baris per akun): daftar kunci satker huruf kecil; null = abjad
create table if not exists public.employee_settings (
  owner_id      uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  satker_order  jsonb
);
alter table public.employee_settings enable row level security;

drop policy if exists employee_settings_owner on public.employee_settings;
create policy employee_settings_owner on public.employee_settings
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

grant select, insert, update, delete on public.employee_settings to authenticated;
revoke all on public.employee_settings from anon;

create or replace function public.save_employee_order(p_satker_order jsonb, p_employees uuid[])
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Anda harus masuk terlebih dahulu.' using errcode = '42501';
  end if;
  if p_satker_order is not null and jsonb_typeof(p_satker_order) <> 'array' then
    raise exception 'Urutan satuan kerja harus berupa daftar.' using errcode = '22023';
  end if;

  insert into public.employee_settings (owner_id, satker_order) values (auth.uid(), p_satker_order)
  on conflict (owner_id) do update set satker_order = excluded.satker_order;

  update public.employees e
     set sort_order = o.ord::int
    from unnest(p_employees) with ordinality as o(id, ord)
   where e.id = o.id and e.owner_id = auth.uid();
end $$;
revoke all on function public.save_employee_order(jsonb, uuid[]) from public, anon;
grant execute on function public.save_employee_order(jsonb, uuid[]) to authenticated;
