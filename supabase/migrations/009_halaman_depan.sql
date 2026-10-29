-- =============================================================================
-- Migrasi 009 — halaman depan (landing): kegiatan berjalan dan masuk dengan NIP
--
-- Jalankan sekali di Supabase SQL Editor (setelah 008). Aman dijalankan ulang (idempotent).
--
--  * activities.public_access : kegiatan berjalan tampil di halaman depan (bawaan: ya; bisa dimatikan per kegiatan)
--  * public_activities / public_activity : data kegiatan untuk halaman depan (tanpa login)
--  * public_find_token : NIP -> link pribadi, dengan pembatas laju (nip_attempts)
-- =============================================================================

-- tampil di halaman depan (kegiatan berjalan) sehingga peserta bisa masuk dengan NIP
alter table public.activities add column if not exists public_access boolean not null default true;

-- Catatan percobaan NIP yang gagal di halaman depan (pembatas laju). Hanya diakses fungsi security definer.
create table if not exists public.nip_attempts (
  id           bigint generated always as identity primary key,
  activity_id  uuid not null references public.activities (id) on delete cascade,
  nip_key      text not null,
  created_at   timestamptz not null default now()
);
create index if not exists nip_attempts_lookup_idx on public.nip_attempts (activity_id, nip_key, created_at);
alter table public.nip_attempts enable row level security;

revoke all on public.nip_attempts from anon, authenticated;

create or replace function public.public_activities()
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'name', a.name, 'description', a.description, 'location', a.location,
           'start_date', a.start_date, 'end_date', a.end_date)
         order by a.start_date nulls last, a.created_at desc), '[]'::jsonb)
    from public.activities a
   where a.status = 'aktif' and a.public_access;
$$;

create or replace function public.public_activity(p_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', a.id, 'name', a.name, 'description', a.description, 'location', a.location,
                            'start_date', a.start_date, 'end_date', a.end_date)
    from public.activities a
   where a.id = p_id and a.status = 'aktif' and a.public_access;
$$;

create or replace function public.public_find_token(p_activity uuid, p_nip text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_key   text := lower(regexp_replace(coalesce(p_nip, ''), '\s', '', 'g'));
  v_token text;
begin
  if not exists (select 1 from public.activities where id = p_activity and status = 'aktif' and public_access) then
    return jsonb_build_object('found', false);
  end if;
  if length(v_key) < 5 or length(v_key) > 40 then
    return jsonb_build_object('found', false);
  end if;

  delete from public.nip_attempts where created_at < now() - interval '1 day';
  if (select count(*) from public.nip_attempts where activity_id = p_activity and nip_key = v_key and created_at > now() - interval '10 minutes') >= 5
     or (select count(*) from public.nip_attempts where activity_id = p_activity and created_at > now() - interval '10 minutes') >= 40 then
    return jsonb_build_object('blocked', true);
  end if;

  select p.token into v_token
    from public.participants p
   where p.activity_id = p_activity
     and lower(regexp_replace(coalesce(p.identifier, ''), '\s', '', 'g')) = v_key
   order by p.created_at, p.id
   limit 1;

  if v_token is null then
    insert into public.nip_attempts (activity_id, nip_key) values (p_activity, v_key);
    return jsonb_build_object('found', false);
  end if;
  return jsonb_build_object('token', v_token);
end $$;

revoke all on function public.public_activities(), public.public_activity(uuid), public.public_find_token(uuid, text) from public;
grant execute on function public.public_activities(), public.public_activity(uuid), public.public_find_token(uuid, text) to anon, authenticated;
