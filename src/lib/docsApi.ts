import { DOC_BUCKET } from './docs'
import { errMsg, supabase } from './supabase'

const bucket = () => supabase.storage.from(DOC_BUCKET)

/** Signed URL berumur pendek untuk foto dokumentasi (bucket privat). Path yang gagal dilewati. */
export async function signedDocUrls(paths: string[], seconds = 3600): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  if (!paths.length) return out
  const { data, error } = await bucket().createSignedUrls(paths, seconds)
  if (error) throw new Error(errMsg(error))
  for (const r of data ?? []) if (r.path && r.signedUrl && !r.error) out[r.path] = r.signedUrl
  return out
}

/** Hapus berkas; kegagalan diabaikan (hanya meninggalkan berkas yatim). */
export async function removeDocFiles(paths: string[]): Promise<void> {
  if (!paths.length) return
  try { await bucket().remove(paths) } catch { /* berkas yatim tidak berbahaya */ }
}

/** Unggah satu foto dan catat di tabel; berkas dibersihkan bila pencatatan gagal. */
export async function uploadDoc(args: { activityId: string; path: string; blob: Blob; fileName: string; album: string | null; takenOn: string | null }) {
  const { activityId, path, blob, fileName, album, takenOn } = args
  const up = await bucket().upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  if (up.error) throw new Error(errMsg(up.error))
  const { error } = await supabase.from('documentation').insert({
    activity_id: activityId, kind: 'foto', storage_path: path, file_name: fileName, mime_type: 'image/jpeg',
    size_bytes: blob.size, album, taken_on: takenOn,
  })
  if (error) { await removeDocFiles([path]); throw new Error(errMsg(error)) }
}

/** Bersihkan seluruh berkas dokumentasi sebuah kegiatan (sebelum kegiatan dihapus). */
export async function removeActivityDocFiles(activityId: string): Promise<void> {
  const { data } = await supabase.from('documentation').select('storage_path').eq('activity_id', activityId).not('storage_path', 'is', null)
  await removeDocFiles((data ?? []).map((r) => r.storage_path as string))
}
