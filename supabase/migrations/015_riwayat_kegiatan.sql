-- =============================================================================
-- Migrasi 015 — riwayat kegiatan di halaman depan
--
-- Jalankan sekali di Supabase SQL Editor (setelah 014). Aman dijalankan ulang (idempotent).
--
--  * public_history(): semua kegiatan yang tampil di halaman depan (bukan draf), terbaru dulu, dengan foto sampul bila galerinya dibuka
-- =============================================================================

-- ---------------------------------------------------------------------------
-- RIWAYAT KEGIATAN (publik): semua kegiatan yang tampil di halaman depan (public_access) dan bukan draf,
-- dari yang terbaru. `cover`/`photo_count` hanya terisi bila galeri kegiatan itu dibuka (gallery_public).
-- ---------------------------------------------------------------------------

create or replace function public.public_history()
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x ->> 'sort_date') desc, x ->> 'name'), '[]'::jsonb)
    from (
      select jsonb_build_object(
               'id', a.id, 'name', a.name, 'description', a.description, 'location', a.location,
               'start_date', a.start_date, 'end_date', a.end_date, 'status', a.status,
               'sort_date', coalesce(a.start_date, a.created_at::date),
               'photo_count', coalesce(g.n, 0), 'cover', g.cover) as x
        from public.activities a
        left join lateral (
          select count(*)::int as n,
                 (array_agg(d.storage_path order by d.taken_on desc nulls last, d.uploaded_at desc))[1] as cover
            from public.documentation d
           where d.activity_id = a.id and d.kind = 'foto' and a.gallery_public and a.enable_documentation) g on true
       where a.public_access and a.status <> 'draft'
       order by coalesce(a.start_date, a.created_at::date) desc, a.created_at desc
       limit 60
    ) t;
$$;

revoke all on function public.public_history() from public, anon;
grant execute on function public.public_history() to anon, authenticated;
