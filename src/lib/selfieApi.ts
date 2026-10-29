import { errMsg, supabase } from './supabase'

export const SELFIE_BUCKET = 'selfies'
const bucket = () => supabase.storage.from(SELFIE_BUCKET)

/** Signed URL berumur pendek untuk foto-foto (bucket privat). Path yang gagal dilewati. */
export async function signedSelfieUrls(paths: string[], seconds = 3600): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  if (!paths.length) return out
  const { data, error } = await bucket().createSignedUrls(paths, seconds)
  if (error) throw new Error(errMsg(error))
  for (const r of data ?? []) if (r.path && r.signedUrl && !r.error) out[r.path] = r.signedUrl
  return out
}

/** Hapus berkas foto; kegagalan diabaikan (hanya meninggalkan berkas yatim). */
export async function removeSelfieFiles(paths: string[]): Promise<void> {
  if (!paths.length) return
  try { await bucket().remove(paths) } catch { /* berkas yatim tidak berbahaya */ }
}

type Scope = { participantIds?: string[]; sessionId?: string; activityId?: string }

/** Path foto dari catatan absensi sesuai cakupan (untuk dibersihkan sebelum data dihapus). */
export async function selfiePathsOf(scope: Scope): Promise<string[]> {
  let q = supabase.from('attendances').select('selfie_path').not('selfie_path', 'is', null)
  if (scope.participantIds) q = q.in('participant_id', scope.participantIds)
  if (scope.sessionId) q = q.eq('session_id', scope.sessionId)
  if (scope.activityId) q = q.eq('activity_id', scope.activityId)
  const { data } = await q
  return (data ?? []).map((r) => r.selfie_path as string)
}

export async function removeSelfiesOf(scope: Scope): Promise<void> {
  await removeSelfieFiles(await selfiePathsOf(scope))
}

/** Hapus foto sebuah sesi: berkas dihapus dan jejaknya dikosongkan (lokasi dibiarkan). */
export async function deleteSessionPhotos(sessionId: string): Promise<number> {
  const paths = await selfiePathsOf({ sessionId })
  if (!paths.length) return 0
  await removeSelfieFiles(paths)
  const { error } = await supabase.from('attendances').update({ selfie_path: null }).eq('session_id', sessionId).not('selfie_path', 'is', null)
  if (error) throw new Error(errMsg(error))
  return paths.length
}
