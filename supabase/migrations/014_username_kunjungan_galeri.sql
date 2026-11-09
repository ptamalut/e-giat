-- =============================================================================
-- Migrasi 014 — nama pengguna (login), statistik kunjungan, dan galeri kegiatan
--
-- Jalankan sekali di Supabase SQL Editor (setelah 013). Aman dijalankan ulang (idempotent).
--
--  * profiles: nama pengguna unik per akun; akun lama otomatis dibuatkan dari emailnya
--  * site_visits / site_stats: kunjungan website hari ini dan total
--  * activities.gallery_public + fungsi public_gallery*: galeri foto dokumentasi per kegiatan (opt-in per kegiatan)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- NAMA PENGGUNA (login dengan username, bukan email)
--   * profiles: satu nama pengguna unik (huruf kecil, angka, titik, garis bawah, strip; 3-30 karakter) per akun
--   * akun lama otomatis mendapat nama pengguna dari bagian depan emailnya (dibuat unik)
--   * halaman login mengubah nama pengguna menjadi email lewat login_email(), lalu masuk seperti biasa
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  username   text not null,
  created_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9._-]{3,30}$')
);
create unique index if not exists profiles_username_uq on public.profiles (username);
alter table public.profiles enable row level security;   -- tanpa kebijakan: akses hanya lewat fungsi
revoke all on public.profiles from anon, authenticated;

create or replace function public._clean_username(p text)
returns text language sql immutable as $$
  select left(regexp_replace(lower(coalesce(p, '')), '[^a-z0-9._-]', '', 'g'), 30)
$$;

-- nama pengguna yang belum dipakai, dibuat dari p_base (ditambah angka bila bentrok)
create or replace function public._free_username(p_base text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  base text := public._clean_username(p_base);
  cand text;
  n    int := 1;
begin
  if char_length(base) < 3 then base := left('user' || base, 30); end if;
  cand := base;
  while exists (select 1 from public.profiles where username = cand) loop
    n := n + 1;
    cand := left(base, 30 - char_length(n::text)) || n::text;
  end loop;
  return cand;
end $$;

-- akun yang sudah ada
insert into public.profiles (user_id, username)
select u.id, public._free_username(split_part(coalesce(u.email, ''), '@', 1))
  from auth.users u
 where not exists (select 1 from public.profiles p where p.user_id = u.id)
 order by u.created_at;

-- akun baru: nama pengguna dari data pendaftaran (raw_user_meta_data.username), atau dari emailnya
create or replace function public._handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  want text := public._clean_username(new.raw_user_meta_data ->> 'username');
begin
  insert into public.profiles (user_id, username)
  values (new.id, public._free_username(case when char_length(want) >= 3 then want else split_part(coalesce(new.email, ''), '@', 1) end))
  on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile after insert on auth.users
  for each row execute function public._handle_new_user();

-- apakah nama pengguna valid dan masih bebas (untuk formulir daftar)
create or replace function public.username_available(p_username text)
returns boolean
language sql stable security definer set search_path = public as $$
  select lower(btrim(coalesce(p_username, ''))) ~ '^[a-z0-9._-]{3,30}$'
     and not exists (select 1 from public.profiles where username = lower(btrim(p_username)));
$$;

-- email akun untuk sebuah nama pengguna (dipakai halaman login); null bila tidak ada
create or replace function public.login_email(p_login text)
returns text
language sql stable security definer set search_path = public as $$
  select u.email::text
    from public.profiles pr join auth.users u on u.id = pr.user_id
   where pr.username = lower(btrim(coalesce(p_login, '')));
$$;

create or replace function public.my_profile()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('username', pr.username, 'email', u.email)
    from public.profiles pr join auth.users u on u.id = pr.user_id
   where pr.user_id = auth.uid();
$$;

create or replace function public.set_my_username(p_username text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v text := lower(btrim(coalesce(p_username, '')));
begin
  if auth.uid() is null then raise exception 'Masuk terlebih dahulu.' using errcode = '42501'; end if;
  if v !~ '^[a-z0-9._-]{3,30}$' then
    raise exception 'Nama pengguna 3-30 karakter: huruf kecil, angka, titik, garis bawah, atau strip.' using errcode = '22023';
  end if;
  insert into public.profiles (user_id, username) values (auth.uid(), v)
    on conflict (user_id) do update set username = excluded.username;
exception when unique_violation then
  raise exception 'Nama pengguna sudah dipakai.' using errcode = '23505';
end $$;

-- ---------------------------------------------------------------------------
-- STATISTIK KUNJUNGAN WEBSITE
--   * satu kunjungan = satu browser (id acak di perangkat) membuka website pada satu hari (WIT); muat ulang tidak dihitung
-- ---------------------------------------------------------------------------

create table if not exists public.site_visits (
  day     date not null,
  visitor uuid not null,
  primary key (day, visitor)
);
create table if not exists public.site_stats (
  id    int primary key default 1 check (id = 1),
  total bigint not null default 0
);
insert into public.site_stats (id, total) values (1, 0) on conflict (id) do nothing;
alter table public.site_visits enable row level security;
alter table public.site_stats enable row level security;
revoke all on public.site_visits, public.site_stats from anon, authenticated;

create or replace function public.public_site_stats()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'today', (select count(*) from public.site_visits where day = (now() at time zone 'Asia/Jayapura')::date),
    'total', coalesce((select total from public.site_stats where id = 1), 0));
$$;

-- catat kunjungan (sekali per pengunjung per hari) lalu kembalikan statistik terbaru
create or replace function public.record_visit(p_visitor uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if p_visitor is not null then
    insert into public.site_visits (day, visitor) values ((now() at time zone 'Asia/Jayapura')::date, p_visitor)
      on conflict do nothing;
    get diagnostics n = row_count;
    if n > 0 then
      insert into public.site_stats (id, total) values (1, 1)
        on conflict (id) do update set total = public.site_stats.total + 1;
    end if;
  end if;
  return public.public_site_stats();
end $$;

-- ---------------------------------------------------------------------------
-- GALERI KEGIATAN (publik): foto dokumentasi kegiatan yang diizinkan panitia (gallery_public)
-- ---------------------------------------------------------------------------

alter table public.activities add column if not exists gallery_public boolean not null default false;

create or replace function public.public_gallery()
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x ->> 'start_date') desc nulls last, x ->> 'name'), '[]'::jsonb)
    from (
      select jsonb_build_object(
               'id', a.id, 'name', a.name, 'location', a.location, 'start_date', a.start_date, 'end_date', a.end_date,
               'photo_count', c.n, 'cover', c.cover,
               'previews', (select coalesce(jsonb_agg(d.storage_path order by d.taken_on desc nulls last, d.uploaded_at desc), '[]'::jsonb)
                              from (select * from public.documentation d2
                                     where d2.activity_id = a.id and d2.kind = 'foto'
                                     order by d2.taken_on desc nulls last, d2.uploaded_at desc limit 4) d)) as x
        from public.activities a
        cross join lateral (
          select count(*)::int as n,
                 (array_agg(d.storage_path order by d.taken_on desc nulls last, d.uploaded_at desc))[1] as cover
            from public.documentation d where d.activity_id = a.id and d.kind = 'foto') c
       where a.gallery_public and a.enable_documentation and a.status <> 'draft' and c.n > 0
    ) t;
$$;

create or replace function public.public_gallery_activity(p_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
           'activity', jsonb_build_object('id', a.id, 'name', a.name, 'description', a.description, 'location', a.location,
                                          'start_date', a.start_date, 'end_date', a.end_date),
           'photos', coalesce((
             select jsonb_agg(jsonb_build_object('id', d.id, 'path', d.storage_path, 'caption', d.caption, 'album', d.album, 'taken_on', d.taken_on)
                              order by d.taken_on desc nulls last, d.uploaded_at desc)
               from (select * from public.documentation x
                      where x.activity_id = a.id and x.kind = 'foto'
                      order by x.taken_on desc nulls last, x.uploaded_at desc limit 500) d), '[]'::jsonb))
    from public.activities a
   where a.id = p_id and a.gallery_public and a.enable_documentation and a.status <> 'draft';
$$;

-- foto terbaru dari semua kegiatan yang galerinya dibuka (untuk halaman depan)
create or replace function public.public_gallery_recent(p_limit int default 8)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('path', r.storage_path, 'caption', r.caption, 'activity_id', r.activity_id, 'activity_name', r.name)
                            order by r.ord), '[]'::jsonb)
    from (
      select d.storage_path, d.caption, d.activity_id, a.name,
             row_number() over (order by d.taken_on desc nulls last, d.uploaded_at desc) as ord
        from public.documentation d join public.activities a on a.id = d.activity_id
       where d.kind = 'foto' and a.gallery_public and a.enable_documentation and a.status <> 'draft'
       order by d.taken_on desc nulls last, d.uploaded_at desc
       limit greatest(1, least(coalesce(p_limit, 8), 24))
    ) r;
$$;

revoke all on function public.username_available(text), public.login_email(text), public.my_profile(), public.set_my_username(text),
  public.public_site_stats(), public.record_visit(uuid), public.public_gallery(), public.public_gallery_activity(uuid),
  public.public_gallery_recent(int), public._free_username(text), public._handle_new_user() from public, anon;
revoke all on function public._clean_username(text) from public;
grant execute on function public.username_available(text), public.login_email(text), public.public_site_stats(), public.record_visit(uuid),
  public.public_gallery(), public.public_gallery_activity(uuid), public.public_gallery_recent(int) to anon, authenticated;
grant execute on function public.my_profile(), public.set_my_username(text) to authenticated;
