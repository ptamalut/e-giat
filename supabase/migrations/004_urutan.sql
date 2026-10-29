-- =============================================================================
-- Migrasi: urutan satuan kerja dan urutan orang (untuk tampilan dan ekspor Word/PDF)
-- Aman dijalankan ulang. Jalankan di Supabase -> SQL Editor.
-- =============================================================================

-- 1. Kolom urutan
alter table public.activities   add column if not exists satker_order jsonb; -- kunci satker (huruf kecil) berurutan; null = abjad
alter table public.participants add column if not exists sort_order   int;   -- urutan di dalam satker; null = setelah yang berurutan

-- 2. Simpan urutan satuan kerja dan urutan orang dalam satu panggilan
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

revoke all on function public.save_activity_order(uuid, jsonb, uuid[]) from public, anon;
grant execute on function public.save_activity_order(uuid, jsonb, uuid[]) to authenticated;
