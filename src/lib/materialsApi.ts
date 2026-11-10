import { errMsg, supabase } from './supabase'
import { MATERIAL_BUCKET, mimeOf, randomMaterialPath, checkMaterialFile } from './materials'
import type { Material } from './types'

const bucket = () => supabase.storage.from(MATERIAL_BUCKET)

/** Alamat berkas (path acak). `downloadName` membuat browser mengunduh dengan nama itu. */
export const materialUrl = (path: string, downloadName?: string) =>
  bucket().getPublicUrl(path, downloadName ? { download: downloadName } : undefined).data.publicUrl

export async function fetchMaterials(activityId: string): Promise<Material[]> {
  const { data, error } = await supabase.from('materials').select('*').eq('activity_id', activityId).order('created_at', { ascending: false }).order('id')
  if (error) throw new Error(errMsg(error))
  return (data ?? []) as Material[]
}

/** Hapus berkas di Storage; kegagalan diabaikan (hanya meninggalkan berkas yatim). */
export async function removeMaterialFiles(paths: readonly (string | null)[]): Promise<void> {
  const list = paths.filter((p): p is string => !!p)
  if (list.length) await bucket().remove(list).catch(() => undefined)
}

export interface MaterialMeta { title: string; speaker: string; description: string; published: boolean }
const metaRow = (m: MaterialMeta) => ({
  title: m.title.trim(), speaker: m.speaker.trim() || null, description: m.description.trim() || null, published: m.published, updated_at: new Date().toISOString(),
})

/** Unggah satu berkas lalu catat; bila pencatatan gagal, berkas yang terunggah dibuang lagi. */
export async function uploadMaterialFile(activityId: string, file: File, meta: MaterialMeta, onProgress?: () => void): Promise<void> {
  const bad = checkMaterialFile(file)
  if (bad) throw new Error(bad)
  const mime = mimeOf(file)!
  const path = randomMaterialPath(activityId, file.name)
  const up = await bucket().upload(path, file, { contentType: mime, upsert: false, cacheControl: '3600' })
  if (up.error) throw new Error(errMsg(up.error))
  const { error } = await supabase.from('materials').insert({
    ...metaRow(meta), activity_id: activityId, kind: 'berkas', storage_path: path, file_name: file.name.slice(0, 255), mime_type: mime, size_bytes: file.size,
  })
  if (error) { await removeMaterialFiles([path]); throw new Error(errMsg(error)) }
  onProgress?.()
}

export async function addMaterialLink(activityId: string, url: string, meta: MaterialMeta): Promise<void> {
  const { error } = await supabase.from('materials').insert({ ...metaRow(meta), activity_id: activityId, kind: 'tautan', url })
  if (error) throw new Error(errMsg(error))
}

/** Ubah keterangan materi; berkas pengganti (opsional) menggantikan berkas lama setelah berhasil tercatat. */
export async function updateMaterial(m: Material, meta: MaterialMeta, opts: { file?: File | null; url?: string } = {}): Promise<void> {
  let patch: Record<string, unknown> = metaRow(meta)
  let newPath: string | null = null
  if (m.kind === 'berkas' && opts.file) {
    const bad = checkMaterialFile(opts.file)
    if (bad) throw new Error(bad)
    const mime = mimeOf(opts.file)!
    newPath = randomMaterialPath(m.activity_id, opts.file.name)
    const up = await bucket().upload(newPath, opts.file, { contentType: mime, upsert: false, cacheControl: '3600' })
    if (up.error) throw new Error(errMsg(up.error))
    patch = { ...patch, storage_path: newPath, file_name: opts.file.name.slice(0, 255), mime_type: mime, size_bytes: opts.file.size }
  }
  if (m.kind === 'tautan' && opts.url) patch = { ...patch, url: opts.url }
  const { error } = await supabase.from('materials').update(patch).eq('id', m.id)
  if (error) { if (newPath) await removeMaterialFiles([newPath]); throw new Error(errMsg(error)) }
  if (newPath) await removeMaterialFiles([m.storage_path])
}

export async function setMaterialPublished(id: string, published: boolean): Promise<void> {
  const { error } = await supabase.from('materials').update({ published, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(errMsg(error))
}

export async function deleteMaterial(m: Pick<Material, 'id' | 'storage_path'>): Promise<void> {
  const { error } = await supabase.from('materials').delete().eq('id', m.id)
  if (error) throw new Error(errMsg(error))
  await removeMaterialFiles([m.storage_path])
}

/** Bersihkan seluruh berkas materi sebuah kegiatan (sebelum kegiatan dihapus). */
export async function removeActivityMaterialFiles(activityId: string): Promise<void> {
  const { data } = await supabase.from('materials').select('storage_path').eq('activity_id', activityId)
  await removeMaterialFiles((data ?? []).map((r) => r.storage_path as string | null))
}
