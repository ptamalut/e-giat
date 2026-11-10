import { baseMime, REC_BUCKET } from './recordings'
import { errMsg, supabase } from './supabase'

const bucket = () => supabase.storage.from(REC_BUCKET)

/** Alamat berkas rekaman (path acak, bucket publik). `downloadName` membuat browser mengunduh dengan nama itu. */
export const recordingUrl = (path: string, downloadName?: string) =>
  bucket().getPublicUrl(path, downloadName ? { download: downloadName } : undefined).data.publicUrl

export async function uploadRecordingBlob(path: string, blob: Blob, mime: string): Promise<void> {
  const up = await bucket().upload(path, blob, { contentType: baseMime(mime), upsert: false, cacheControl: '3600' })
  if (up.error) throw new Error(errMsg(up.error))
}

/** Hapus berkas rekaman; kegagalan diabaikan (hanya meninggalkan berkas yatim). */
export async function removeRecordingFiles(paths: readonly string[]): Promise<void> {
  if (paths.length) await bucket().remove([...paths]).catch(() => undefined)
}

/** Bersihkan seluruh rekaman notula sebuah kegiatan (sebelum kegiatan dihapus). */
export async function removeActivityRecordingFiles(activityId: string): Promise<void> {
  const { data } = await supabase.from('meeting_notes').select('recordings').eq('activity_id', activityId)
  const paths = (data ?? []).flatMap((n) => ((n.recordings as { path?: string }[] | null) ?? []).map((r) => r.path).filter((p): p is string => !!p))
  await removeRecordingFiles(paths)
}
