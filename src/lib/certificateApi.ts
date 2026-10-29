import { CERT_BUCKET, randomCertPath, type CertMime } from './certificates'
import { errMsg, supabase } from './supabase'
import type { Certificate } from './types'

const bucket = () => supabase.storage.from(CERT_BUCKET)

/** Alamat publik berkas (path acak). `downloadName` membuat browser mengunduh dengan nama itu. */
export const certPublicUrl = (path: string, downloadName?: string) =>
  bucket().getPublicUrl(path, downloadName ? { download: downloadName } : undefined).data.publicUrl

/** Hapus berkas di Storage; kegagalan diabaikan (hanya meninggalkan berkas yatim, tidak mengganggu data). */
export async function removeCertificateFiles(paths: string[]): Promise<void> {
  if (!paths.length) return
  try { await bucket().remove(paths) } catch { /* berkas yatim tidak berbahaya */ }
}

/** Unggah atau ganti sertifikat satu orang. Berkas lama dihapus setelah yang baru berhasil tercatat. */
export async function uploadCertificate(args: {
  activityId: string; participantId: string; file: File; mime: CertMime; previous?: Pick<Certificate, 'storage_path'> | null
}): Promise<void> {
  const { activityId, participantId, file, mime, previous } = args
  const path = randomCertPath(activityId, mime)

  const up = await bucket().upload(path, file, { contentType: mime, upsert: false, cacheControl: '3600' })
  if (up.error) throw new Error(errMsg(up.error))

  const { error } = await supabase.from('certificates').upsert({
    activity_id: activityId, participant_id: participantId, storage_path: path,
    file_name: file.name, mime_type: mime, size_bytes: file.size, uploaded_at: new Date().toISOString(),
  }, { onConflict: 'participant_id' })
  if (error) {
    await removeCertificateFiles([path]) // jangan tinggalkan berkas tanpa catatan
    throw new Error(errMsg(error))
  }
  if (previous) await removeCertificateFiles([previous.storage_path])
}

export async function deleteCertificate(cert: Pick<Certificate, 'id' | 'storage_path'>): Promise<void> {
  const { error } = await supabase.from('certificates').delete().eq('id', cert.id)
  if (error) throw new Error(errMsg(error))
  await removeCertificateFiles([cert.storage_path])
}

/** Bersihkan berkas milik orang-orang yang akan dihapus (baris tabelnya terhapus otomatis oleh cascade). */
export async function removeParticipantCertificateFiles(participantIds: string[]): Promise<void> {
  if (!participantIds.length) return
  const { data } = await supabase.from('certificates').select('storage_path').in('participant_id', participantIds)
  await removeCertificateFiles((data ?? []).map((r) => r.storage_path as string))
}

/** Bersihkan seluruh berkas sertifikat sebuah kegiatan (sebelum kegiatan dihapus). */
export async function removeActivityCertificateFiles(activityId: string): Promise<void> {
  const { data } = await supabase.from('certificates').select('storage_path').eq('activity_id', activityId)
  await removeCertificateFiles((data ?? []).map((r) => r.storage_path as string))
}
