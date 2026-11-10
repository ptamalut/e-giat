-- ===========================================================================
-- 019 — Notula sesuai format resmi (Dasar, Hari/Tanggal, Pukul, Acara, Pimpinan, Notulis,
--        Jalannya Rapat A–I, tabel tindak lanjut, tanda tangan) + kop surat di Pengaturan aplikasi
--
--  * meeting_notes: basis (Dasar), held_until (Pukul s.d.), leader_role/leader_nip/notetaker_nip, sections (jsonb)
--  * app_settings: kop_title (baris judul kop, tebal) dan kop_address (alamat/kontak di bawah judul kop)
--  * portal_note_save / portal_notes membawa kolom baru; save_app_settings menyimpan kop
--  Idempotent: aman dijalankan ulang. Notula lama tetap tampil (dikonversi di aplikasi).
-- ===========================================================================

alter table public.meeting_notes add column if not exists basis        text check (char_length(basis) <= 2000);
alter table public.meeting_notes add column if not exists held_until   text check (char_length(held_until) <= 40);
alter table public.meeting_notes add column if not exists leader_role  text check (char_length(leader_role) <= 200);
alter table public.meeting_notes add column if not exists leader_nip   text check (char_length(leader_nip) <= 40);
alter table public.meeting_notes add column if not exists notetaker_nip text check (char_length(notetaker_nip) <= 40);
alter table public.meeting_notes add column if not exists sections     jsonb not null default '[]'::jsonb check (jsonb_typeof(sections) = 'array');

alter table public.app_settings add column if not exists kop_title   text check (char_length(kop_title) <= 400);
alter table public.app_settings add column if not exists kop_address text check (char_length(kop_address) <= 400);

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
    kop_title    = nullif(btrim(coalesce(p->>'kop_title', '')), ''),
    kop_address  = nullif(btrim(coalesce(p->>'kop_address', '')), ''),
    logo_path    = nullif(p->>'logo_path', ''),
    favicon_path = nullif(p->>'favicon_path', ''),
    updated_at   = now()
  where id = 1;
end $$;

-- simpan notula (id kosong = baru); mengubah hanya notula buatan sendiri
create or replace function public.portal_note_save(p_token text, p_id uuid, p jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me      public.participants := public._portal_staff(p_token, 'notes');
  v_title text := btrim(coalesce(p ->> 'title', ''));
  v_stat  text := coalesce(nullif(p ->> 'status', ''), 'draft');
  v_fu    jsonb := coalesce(p -> 'follow_ups', '[]'::jsonb);
  v_sec   jsonb := coalesce(p -> 'sections', '[]'::jsonb);
  v_id    uuid;
begin
  if v_title = '' then raise exception 'Judul notula wajib diisi.' using errcode = '22023'; end if;
  if char_length(v_title) > 300 then raise exception 'Judul terlalu panjang.' using errcode = '22023'; end if;
  if v_stat not in ('draft', 'final') then raise exception 'Status notula tidak valid.' using errcode = '22023'; end if;
  if jsonb_typeof(v_fu) <> 'array' or jsonb_array_length(v_fu) > 100 then
    raise exception 'Tindak lanjut tidak valid (maksimal 100 butir).' using errcode = '22023';
  end if;
  if jsonb_typeof(v_sec) <> 'array' or jsonb_array_length(v_sec) > 40 or char_length(v_sec::text) > 200000 then
    raise exception 'Isi jalannya rapat tidak valid atau terlalu panjang.' using errcode = '22023';
  end if;
  if char_length(coalesce(p ->> 'discussion', '')) > 50000 or char_length(coalesce(p ->> 'agenda', '')) > 20000
     or char_length(coalesce(p ->> 'decisions', '')) > 20000 or char_length(coalesce(p ->> 'attendees', '')) > 20000
     or char_length(coalesce(p ->> 'basis', '')) > 2000 then
    raise exception 'Isi notula terlalu panjang.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.meeting_notes (activity_id, title, held_at, location, leader, notetaker, attendees, agenda, discussion, decisions, follow_ups, status, added_by,
                                      basis, held_until, leader_role, leader_nip, notetaker_nip, sections)
    values (me.activity_id, v_title, nullif(p ->> 'held_at', '')::timestamptz, nullif(btrim(p ->> 'location'), ''), nullif(btrim(p ->> 'leader'), ''),
            nullif(btrim(p ->> 'notetaker'), ''), nullif(btrim(p ->> 'attendees'), ''), nullif(btrim(p ->> 'agenda'), ''),
            nullif(btrim(p ->> 'discussion'), ''), nullif(btrim(p ->> 'decisions'), ''), v_fu, v_stat, me.id,
            nullif(btrim(p ->> 'basis'), ''), nullif(btrim(p ->> 'held_until'), ''), nullif(btrim(p ->> 'leader_role'), ''),
            nullif(btrim(p ->> 'leader_nip'), ''), nullif(btrim(p ->> 'notetaker_nip'), ''), v_sec)
    returning id into v_id;
  else
    update public.meeting_notes set
           title = v_title, held_at = nullif(p ->> 'held_at', '')::timestamptz, location = nullif(btrim(p ->> 'location'), ''),
           leader = nullif(btrim(p ->> 'leader'), ''), notetaker = nullif(btrim(p ->> 'notetaker'), ''),
           attendees = nullif(btrim(p ->> 'attendees'), ''), agenda = nullif(btrim(p ->> 'agenda'), ''),
           discussion = nullif(btrim(p ->> 'discussion'), ''), decisions = nullif(btrim(p ->> 'decisions'), ''),
           follow_ups = v_fu, status = v_stat, updated_at = now(),
           basis = nullif(btrim(p ->> 'basis'), ''), held_until = nullif(btrim(p ->> 'held_until'), ''),
           leader_role = nullif(btrim(p ->> 'leader_role'), ''), leader_nip = nullif(btrim(p ->> 'leader_nip'), ''),
           notetaker_nip = nullif(btrim(p ->> 'notetaker_nip'), ''), sections = v_sec
     where id = p_id and activity_id = me.activity_id and added_by = me.id
     returning id into v_id;
    if v_id is null then
      raise exception 'Notula tidak ditemukan atau bukan buatan Anda.' using errcode = '42501';
    end if;
  end if;
  return v_id;
end $$;

create or replace function public.portal_notes(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p public.participants;
  a public.activities;
begin
  p := public._participant_by_token(p_token);
  select * into a from public.activities where id = p.activity_id;
  if not a.enable_notes or not p.access_notes then
    raise exception 'Notula tidak tersedia untuk Anda pada kegiatan ini.' using errcode = 'P0001';
  end if;
  -- semua orang melihat notula Final; petugas/panitia juga melihat draf yang mereka buat sendiri (dan bisa mengubahnya)
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', n.id, 'title', n.title, 'held_at', n.held_at, 'location', n.location, 'leader', n.leader,
             'notetaker', n.notetaker, 'attendees', n.attendees, 'agenda', n.agenda, 'discussion', n.discussion,
             'decisions', n.decisions, 'follow_ups', n.follow_ups, 'status', n.status,
             'basis', n.basis, 'held_until', n.held_until, 'leader_role', n.leader_role, 'leader_nip', n.leader_nip,
             'notetaker_nip', n.notetaker_nip, 'sections', n.sections,
             'mine', coalesce(n.added_by = p.id, false))
           order by n.held_at desc nulls last, n.created_at desc)
      from public.meeting_notes n
     where n.activity_id = a.id
       and (n.status = 'final' or (n.added_by = p.id and p.roles && array['petugas', 'panitia']))), '[]'::jsonb);
end $$;

revoke all on function public.portal_note_save(text, uuid, jsonb), public.portal_notes(text) from public;
grant execute on function public.portal_note_save(text, uuid, jsonb), public.portal_notes(text) to anon, authenticated;
revoke all on function public.save_app_settings(jsonb) from public, anon;
grant execute on function public.save_app_settings(jsonb) to authenticated;
