-- ===========================================================================
-- 025 — Rekaman suara pada notula (disimpan), terpisah dari pengubahan rekaman ke teks
--  * meeting_notes.recordings: daftar rekaman [{id, path, file_name, mime, size, duration, created_at, transcript}]
--  * bucket publik "rekaman" (nama berkas acak 128 bit; alamat hanya tercatat di notula): pemilik kegiatan mengelola,
--    petugas/panitia mengunggah ke tempat yang dicadangkan server (portal_rec_slot, sekali pakai, 30 menit)
--  * portal_note_save menerima recordings (path divalidasi milik kegiatan itu); portal_notes hanya memberi rekaman
--    kepada pembuat notula (peserta lain tidak melihat rekaman)
--  Idempotent: aman dijalankan ulang.
-- ===========================================================================

alter table public.meeting_notes add column if not exists recordings jsonb not null default '[]'::jsonb;
alter table public.meeting_notes drop constraint if exists meeting_notes_recordings_check;
alter table public.meeting_notes add constraint meeting_notes_recordings_check check (jsonb_typeof(recordings) = 'array');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rekaman', 'rekaman', true, 52428800, array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'video/webm', 'video/mp4'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists rekaman_obj_select on storage.objects;
create policy rekaman_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'rekaman' and public.owns_certificate_object(name));
drop policy if exists rekaman_obj_insert on storage.objects;
create policy rekaman_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'rekaman' and public.owns_certificate_object(name));
drop policy if exists rekaman_obj_update on storage.objects;
create policy rekaman_obj_update on storage.objects for update to authenticated
  using (bucket_id = 'rekaman' and public.owns_certificate_object(name))
  with check (bucket_id = 'rekaman' and public.owns_certificate_object(name));
drop policy if exists rekaman_obj_delete on storage.objects;
create policy rekaman_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'rekaman' and public.owns_certificate_object(name));
drop policy if exists rekaman_obj_insert_slot on storage.objects;
create policy rekaman_obj_insert_slot on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'rekaman' and public.doc_slot_ok(name));

-- cadangkan path unggah rekaman untuk petugas/panitia (sekali pakai)
create or replace function public.portal_rec_slot(p_token text, p_ext text default 'webm')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me     public.participants := public._portal_staff(p_token, 'notes');
  v_ext  text := lower(coalesce(nullif(btrim(p_ext), ''), 'webm'));
  v_path text;
begin
  if v_ext !~ '^(webm|ogg|m4a|mp4|mp3|wav)$' then raise exception 'Jenis rekaman tidak didukung.' using errcode = '22023'; end if;
  delete from public.doc_slots where created_at < now() - interval '1 day';
  if (select count(*) from public.doc_slots where participant_id = me.id and not used and created_at > now() - interval '20 minutes') >= 40 then
    raise exception 'Terlalu banyak unggahan. Tunggu beberapa menit lalu coba lagi.' using errcode = 'P0001';
  end if;
  v_path := me.activity_id::text || '/' || replace(gen_random_uuid()::text, '-', '') || '.' || v_ext;
  insert into public.doc_slots (path, activity_id, participant_id) values (v_path, me.activity_id, me.id);
  return jsonb_build_object('path', v_path);
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
  v_att   jsonb := coalesce(p -> 'attendee_list', '[]'::jsonb);
  v_rec   jsonb := coalesce(p -> 'recordings', '[]'::jsonb);
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
  if jsonb_typeof(v_att) <> 'array' or jsonb_array_length(v_att) > 500 or char_length(v_att::text) > 200000 then
    raise exception 'Daftar peserta rapat tidak valid (maksimal 500 orang).' using errcode = '22023';
  end if;
  -- rekaman: berkas hanya boleh milik kegiatan ini (path <id kegiatan>/<32 heksadesimal>.<ekstensi>)
  if jsonb_typeof(v_rec) <> 'array' or jsonb_array_length(v_rec) > 30 or char_length(v_rec::text) > 300000 then
    raise exception 'Daftar rekaman tidak valid (maksimal 30 rekaman).' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(v_rec) r where coalesce(r ->> 'path', '') !~ ('^' || me.activity_id::text || '/[0-9a-f]{32}\.[a-z0-9]{2,4}$')) then
    raise exception 'Rekaman tidak valid.' using errcode = '22023';
  end if;
  if char_length(coalesce(p ->> 'discussion', '')) > 50000 or char_length(coalesce(p ->> 'agenda', '')) > 20000
     or char_length(coalesce(p ->> 'decisions', '')) > 20000 or char_length(coalesce(p ->> 'attendees', '')) > 20000
     or char_length(coalesce(p ->> 'basis', '')) > 2000 then
    raise exception 'Isi notula terlalu panjang.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.meeting_notes (activity_id, title, held_at, location, leader, notetaker, attendees, agenda, discussion, decisions, follow_ups, status, added_by,
                                      basis, held_until, leader_role, leader_nip, notetaker_nip, sections, attendee_list, recordings)
    values (me.activity_id, v_title, nullif(p ->> 'held_at', '')::timestamptz, nullif(btrim(p ->> 'location'), ''), nullif(btrim(p ->> 'leader'), ''),
            nullif(btrim(p ->> 'notetaker'), ''), nullif(btrim(p ->> 'attendees'), ''), nullif(btrim(p ->> 'agenda'), ''),
            nullif(btrim(p ->> 'discussion'), ''), nullif(btrim(p ->> 'decisions'), ''), v_fu, v_stat, me.id,
            nullif(btrim(p ->> 'basis'), ''), nullif(btrim(p ->> 'held_until'), ''), nullif(btrim(p ->> 'leader_role'), ''),
            nullif(btrim(p ->> 'leader_nip'), ''), nullif(btrim(p ->> 'notetaker_nip'), ''), v_sec, v_att, v_rec)
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
           notetaker_nip = nullif(btrim(p ->> 'notetaker_nip'), ''), sections = v_sec, attendee_list = v_att, recordings = v_rec
     where id = p_id and activity_id = me.activity_id and added_by = me.id
     returning id into v_id;
    if v_id is null then
      raise exception 'Notula tidak ditemukan atau bukan buatan Anda.' using errcode = '42501';
    end if;
  end if;
  -- tempat unggah rekaman yang sudah dipakai ditandai agar tidak bisa dipakai lagi
  update public.doc_slots set used = true
   where participant_id = me.id and path in (select r ->> 'path' from jsonb_array_elements(v_rec) r);
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
             'notetaker_nip', n.notetaker_nip, 'sections', n.sections, 'attendee_list', n.attendee_list,
             'recordings', case when n.added_by = p.id then n.recordings else '[]'::jsonb end,
             'mine', coalesce(n.added_by = p.id, false))
           order by n.held_at desc nulls last, n.created_at desc)
      from public.meeting_notes n
     where n.activity_id = a.id
       and (n.status = 'final' or (n.added_by = p.id and p.roles && array['petugas', 'panitia']))), '[]'::jsonb);
end $$;

revoke all on function public.portal_rec_slot(text, text), public.portal_note_save(text, uuid, jsonb), public.portal_notes(text) from public;
grant execute on function public.portal_rec_slot(text, text), public.portal_note_save(text, uuid, jsonb), public.portal_notes(text) to anon, authenticated;
