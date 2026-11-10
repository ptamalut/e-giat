-- ===========================================================================
-- 023 — Notula: daftar peserta rapat terpilih, dan data kegiatan untuk isian otomatis di halaman pribadi
--  * meeting_notes.attendee_list: peserta rapat sebagai daftar orang [{name, nip, job_title, institution}];
--    pimpinan rapat dan notulis dipilih dari daftar ini
--  * portal_note_people: ikut mengembalikan NIP dan jabatan
--  * portal_note_letters: dasar surat kegiatan (untuk mengisi "Dasar" notula) bagi petugas/panitia
--  * portal_note_save / portal_notes membawa attendee_list
--  Idempotent: aman dijalankan ulang.
-- ===========================================================================

alter table public.meeting_notes add column if not exists attendee_list jsonb not null default '[]'::jsonb;
alter table public.meeting_notes drop constraint if exists meeting_notes_attendee_list_check;
alter table public.meeting_notes add constraint meeting_notes_attendee_list_check check (jsonb_typeof(attendee_list) = 'array');

-- nama (beserta NIP dan jabatan) untuk daftar peserta rapat: semua orang di kegiatan, atau yang hadir pada satu sesi
create or replace function public.portal_note_people(p_token text, p_session uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me public.participants := public._portal_staff(p_token, 'notes');
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('name', x.name, 'nip', x.identifier, 'job_title', x.job_title, 'institution', x.institution)
                     order by x.sort_order nulls last, x.name)
      from public.participants x
     where x.activity_id = me.activity_id
       and (p_session is null or exists (
             select 1 from public.attendances t
              where t.session_id = p_session and t.participant_id = x.id and t.status in ('hadir', 'terlambat')))), '[]'::jsonb);
end $$;

-- dasar surat kegiatan, dari yang paling lama
create or replace function public.portal_note_letters(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me public.participants := public._portal_staff(p_token, 'notes');
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('issuer', l.issuer, 'number', l.number, 'letter_date', l.letter_date, 'subject', l.subject)
                     order by l.letter_date nulls last, l.created_at)
      from public.activity_letters l where l.activity_id = me.activity_id), '[]'::jsonb);
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
  if char_length(coalesce(p ->> 'discussion', '')) > 50000 or char_length(coalesce(p ->> 'agenda', '')) > 20000
     or char_length(coalesce(p ->> 'decisions', '')) > 20000 or char_length(coalesce(p ->> 'attendees', '')) > 20000
     or char_length(coalesce(p ->> 'basis', '')) > 2000 then
    raise exception 'Isi notula terlalu panjang.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.meeting_notes (activity_id, title, held_at, location, leader, notetaker, attendees, agenda, discussion, decisions, follow_ups, status, added_by,
                                      basis, held_until, leader_role, leader_nip, notetaker_nip, sections, attendee_list)
    values (me.activity_id, v_title, nullif(p ->> 'held_at', '')::timestamptz, nullif(btrim(p ->> 'location'), ''), nullif(btrim(p ->> 'leader'), ''),
            nullif(btrim(p ->> 'notetaker'), ''), nullif(btrim(p ->> 'attendees'), ''), nullif(btrim(p ->> 'agenda'), ''),
            nullif(btrim(p ->> 'discussion'), ''), nullif(btrim(p ->> 'decisions'), ''), v_fu, v_stat, me.id,
            nullif(btrim(p ->> 'basis'), ''), nullif(btrim(p ->> 'held_until'), ''), nullif(btrim(p ->> 'leader_role'), ''),
            nullif(btrim(p ->> 'leader_nip'), ''), nullif(btrim(p ->> 'notetaker_nip'), ''), v_sec, v_att)
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
           notetaker_nip = nullif(btrim(p ->> 'notetaker_nip'), ''), sections = v_sec, attendee_list = v_att
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
             'notetaker_nip', n.notetaker_nip, 'sections', n.sections, 'attendee_list', n.attendee_list,
             'mine', coalesce(n.added_by = p.id, false))
           order by n.held_at desc nulls last, n.created_at desc)
      from public.meeting_notes n
     where n.activity_id = a.id
       and (n.status = 'final' or (n.added_by = p.id and p.roles && array['petugas', 'panitia']))), '[]'::jsonb);
end $$;

revoke all on function public.portal_note_people(text, uuid), public.portal_note_letters(text), public.portal_note_save(text, uuid, jsonb), public.portal_notes(text) from public;
grant execute on function public.portal_note_people(text, uuid), public.portal_note_letters(text), public.portal_note_save(text, uuid, jsonb), public.portal_notes(text) to anon, authenticated;
