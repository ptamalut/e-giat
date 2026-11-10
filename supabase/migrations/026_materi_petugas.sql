-- ===========================================================================
-- 026 — Petugas/panitia mengelola materi lewat link pribadi (seperti notula dan dokumentasi)
--  * materials.added_by: penanda materi buatan petugas/panitia (null = dibuat admin)
--  * _portal_staff menerima menu 'materials' (menu Materi aktif + hak akses Materi + jenis petugas/panitia)
--  * portal_material_slot: cadangkan path unggah berkas (sekali pakai, 30 menit; memakai doc_slots)
--  * portal_material_add / _update / _delete: menambah materi (berkas atau tautan); mengubah dan menghapus hanya milik sendiri
--  * portal_materials: memberi tahu apakah orang ini boleh mengelola ('manage'); petugas juga melihat draf buatannya sendiri
--  Berkas lama tidak terpengaruh. Idempotent: aman dijalankan ulang.
-- ===========================================================================

alter table public.materials add column if not exists added_by uuid references public.participants (id) on delete set null;

-- petugas/panitia boleh mengunggah ke tempat yang dicadangkan server di bucket "materi"
drop policy if exists materi_obj_insert_slot on storage.objects;
create policy materi_obj_insert_slot on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'materi' and public.doc_slot_ok(name));

create or replace function public._portal_staff(p_token text, p_menu text)
returns public.participants
language plpgsql stable security definer set search_path = public as $$
declare
  p public.participants;
  a public.activities;
begin
  p := public._participant_by_token(p_token);
  select * into a from public.activities where id = p.activity_id;
  if not (p.roles && array['petugas', 'panitia']) then
    raise exception 'Hanya petugas atau panitia yang dapat mengisi ini.' using errcode = '42501';
  end if;
  if p_menu = 'notes' and not (a.enable_notes and p.access_notes) then
    raise exception 'Notula tidak tersedia untuk Anda pada kegiatan ini.' using errcode = 'P0001';
  end if;
  if p_menu = 'docs' and not (a.enable_documentation and p.access_documentation) then
    raise exception 'Dokumentasi tidak tersedia untuk Anda pada kegiatan ini.' using errcode = 'P0001';
  end if;
  if p_menu = 'materials' and not (a.enable_materials and p.access_materials) then
    raise exception 'Materi tidak tersedia untuk Anda pada kegiatan ini.' using errcode = 'P0001';
  end if;
  return p;
end $$;

-- cadangkan path unggah berkas materi (sekali pakai)
create or replace function public.portal_material_slot(p_token text, p_ext text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me     public.participants := public._portal_staff(p_token, 'materials');
  v_ext  text := lower(btrim(coalesce(p_ext, '')));
  v_path text;
begin
  if v_ext !~ '^(pdf|doc|docx|ppt|pptx|xls|xlsx|zip|txt|jpg|jpeg|png|webp|mp4|mp3)$' then
    raise exception 'Jenis berkas tidak didukung.' using errcode = '22023';
  end if;
  delete from public.doc_slots where created_at < now() - interval '1 day';
  if (select count(*) from public.doc_slots where participant_id = me.id and not used and created_at > now() - interval '20 minutes') >= 40 then
    raise exception 'Terlalu banyak unggahan. Tunggu beberapa menit lalu coba lagi.' using errcode = 'P0001';
  end if;
  v_path := me.activity_id::text || '/' || replace(gen_random_uuid()::text, '-', '') || '.' || v_ext;
  insert into public.doc_slots (path, activity_id, participant_id) values (v_path, me.activity_id, me.id);
  return jsonb_build_object('path', v_path);
end $$;

-- tambah materi: p = {kind, title, speaker, description, published, path, file_name, mime_type, size_bytes | url}
create or replace function public.portal_material_add(p_token text, p jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me      public.participants := public._portal_staff(p_token, 'materials');
  v_kind  text := coalesce(p ->> 'kind', '');
  v_title text := btrim(coalesce(p ->> 'title', ''));
  v_path  text := nullif(btrim(coalesce(p ->> 'path', '')), '');
  v_url   text := nullif(btrim(coalesce(p ->> 'url', '')), '');
  v_mime  text := nullif(btrim(coalesce(p ->> 'mime_type', '')), '');
  v_size  bigint := nullif(p ->> 'size_bytes', '')::bigint;
  v_id    uuid;
begin
  if v_title = '' or char_length(v_title) > 200 then raise exception 'Judul materi wajib diisi (maksimal 200 huruf).' using errcode = '22023'; end if;
  if char_length(coalesce(p ->> 'speaker', '')) > 200 or char_length(coalesce(p ->> 'description', '')) > 2000 then
    raise exception 'Pemateri atau deskripsi terlalu panjang.' using errcode = '22023';
  end if;
  if v_kind = 'tautan' then
    if v_url is null or char_length(v_url) > 1000 or v_url !~* '^https?://' then raise exception 'Alamat tautan tidak sah.' using errcode = '22023'; end if;
    v_path := null; v_mime := null; v_size := null;
  elsif v_kind = 'berkas' then
    if v_path is null or v_path !~ ('^' || me.activity_id::text || '/[0-9a-f]{32}\.[a-z0-9]{2,4}$') then
      raise exception 'Berkas materi tidak valid.' using errcode = '22023';
    end if;
    if not exists (select 1 from public.doc_slots where path = v_path and participant_id = me.id and not used) then
      raise exception 'Berkas materi tidak valid atau sudah dipakai.' using errcode = '22023';
    end if;
    if v_mime is null or v_mime not in (
         'application/pdf', 'application/zip', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'audio/mpeg') then
      raise exception 'Jenis berkas tidak didukung.' using errcode = '22023';
    end if;
    v_url := null;
  else
    raise exception 'Jenis materi tidak valid.' using errcode = '22023';
  end if;

  insert into public.materials (activity_id, title, speaker, description, kind, storage_path, file_name, mime_type, size_bytes, url, published, added_by)
  values (me.activity_id, v_title, nullif(btrim(p ->> 'speaker'), ''), nullif(btrim(p ->> 'description'), ''), v_kind, v_path,
          left(nullif(btrim(p ->> 'file_name'), ''), 255), v_mime, v_size, v_url, coalesce((p ->> 'published')::boolean, true), me.id)
  returning id into v_id;
  if v_path is not null then update public.doc_slots set used = true where path = v_path; end if;
  return v_id;
end $$;

-- ubah keterangan materi buatan sendiri (judul, pemateri, deskripsi, terbit; tautan juga alamatnya)
create or replace function public.portal_material_update(p_token text, p_id uuid, p jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  me      public.participants := public._portal_staff(p_token, 'materials');
  v_title text := btrim(coalesce(p ->> 'title', ''));
  v_url   text := nullif(btrim(coalesce(p ->> 'url', '')), '');
  n       int;
begin
  if v_title = '' or char_length(v_title) > 200 then raise exception 'Judul materi wajib diisi (maksimal 200 huruf).' using errcode = '22023'; end if;
  if char_length(coalesce(p ->> 'speaker', '')) > 200 or char_length(coalesce(p ->> 'description', '')) > 2000 then
    raise exception 'Pemateri atau deskripsi terlalu panjang.' using errcode = '22023';
  end if;
  if v_url is not null and (char_length(v_url) > 1000 or v_url !~* '^https?://') then raise exception 'Alamat tautan tidak sah.' using errcode = '22023'; end if;
  update public.materials set
         title = v_title, speaker = nullif(btrim(p ->> 'speaker'), ''), description = nullif(btrim(p ->> 'description'), ''),
         published = coalesce((p ->> 'published')::boolean, published),
         url = case when kind = 'tautan' then coalesce(v_url, url) else url end, updated_at = now()
   where id = p_id and activity_id = me.activity_id and added_by = me.id;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Materi tidak ditemukan atau bukan buatan Anda.' using errcode = '42501'; end if;
end $$;

create or replace function public.portal_material_delete(p_token text, p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.participants := public._portal_staff(p_token, 'materials');
  n  int;
begin
  delete from public.materials where id = p_id and activity_id = me.activity_id and added_by = me.id;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Materi tidak ditemukan atau bukan buatan Anda.' using errcode = '42501'; end if;
end $$;

-- materi terbit untuk pemilik token (+ draf buatan sendiri bagi petugas/panitia); 'manage' = boleh mengelola
create or replace function public.portal_materials(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p public.participants;
  a public.activities;
  v_manage boolean;
begin
  p := public._participant_by_token(p_token);
  select * into a from public.activities where id = p.activity_id;
  if not a.enable_materials or not p.access_materials or a.status = 'draft' then
    return jsonb_build_object('enabled', false, 'manage', false, 'items', '[]'::jsonb);
  end if;
  v_manage := (p.roles && array['petugas', 'panitia']);
  return jsonb_build_object('enabled', true, 'manage', v_manage, 'items', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', m.id, 'title', m.title, 'speaker', m.speaker, 'description', m.description, 'kind', m.kind,
             'path', m.storage_path, 'file_name', m.file_name, 'mime_type', m.mime_type, 'size_bytes', m.size_bytes,
             'url', m.url, 'created_at', m.created_at, 'published', m.published, 'mine', coalesce(m.added_by = p.id, false))
           order by m.created_at desc)
      from public.materials m
     where m.activity_id = a.id
       and (m.published or (v_manage and m.added_by = p.id))), '[]'::jsonb));
end $$;

revoke all on function public._portal_staff(text, text) from public, anon, authenticated;
revoke all on function public.portal_material_slot(text, text), public.portal_material_add(text, jsonb), public.portal_material_update(text, uuid, jsonb),
  public.portal_material_delete(text, uuid), public.portal_materials(text) from public;
grant execute on function public.portal_material_slot(text, text), public.portal_material_add(text, jsonb), public.portal_material_update(text, uuid, jsonb),
  public.portal_material_delete(text, uuid), public.portal_materials(text) to anon, authenticated;
