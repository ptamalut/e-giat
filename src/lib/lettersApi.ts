import { errMsg, supabase } from './supabase'
import type { ActivityLetter } from './types'

export const LETTER_BUCKET = 'surat'
export const LETTER_MAX_BYTES = 10 * 1024 * 1024
export const LETTER_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

export interface LetterInput { issuer: string; number: string; letter_date: string; subject: string }
export const emptyLetter = (): LetterInput => ({ issuer: '', number: '', letter_date: '', subject: '' })
export const hasLetterText = (l: LetterInput) => !!(l.issuer.trim() || l.number.trim() || l.letter_date || l.subject.trim())

/** Periksa berkas surat: PDF atau gambar, maksimal 10 MB. Mengembalikan pesan galat atau null. */
export function checkLetterFile(f: { type: string; size: number }): string | null {
  if (!LETTER_TYPES.includes(f.type)) return 'Berkas surat harus PDF atau gambar (JPG, PNG, WEBP).'
  if (f.size > LETTER_MAX_BYTES) return 'Ukuran berkas surat maksimal 10 MB.'
  return null
}

const extOf = (f: { type: string; name: string }) => (f.type === 'application/pdf' ? 'pdf' : f.type === 'image/png' ? 'png' : f.type === 'image/webp' ? 'webp' : 'jpg')
/** Path acak: <id kegiatan>/<32 hex>.<ekstensi> */
export const randomLetterPath = (activityId: string, f: { type: string; name: string }) => `${activityId}/${crypto.randomUUID().replace(/-/g, '')}.${extOf(f)}`

export async function fetchLetters(activityId: string): Promise<ActivityLetter[]> {
  const { data, error } = await supabase.from('activity_letters').select('*').eq('activity_id', activityId).order('letter_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })
  if (error) throw new Error(errMsg(error))
  return (data ?? []) as ActivityLetter[]
}

/** Unggah berkas surat; mengembalikan metadata untuk disimpan di baris surat. */
export async function uploadLetterFile(activityId: string, file: File) {
  const bad = checkLetterFile(file)
  if (bad) throw new Error(bad)
  const path = randomLetterPath(activityId, file)
  const { error } = await supabase.storage.from(LETTER_BUCKET).upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw new Error(errMsg(error))
  return { storage_path: path, file_name: file.name.slice(0, 200), mime_type: file.type, size_bytes: file.size }
}

export async function removeLetterFiles(paths: readonly (string | null)[]): Promise<void> {
  const list = paths.filter((p): p is string => !!p)
  if (list.length) await supabase.storage.from(LETTER_BUCKET).remove(list).catch(() => undefined)
}

/** Tambah (id kosong) atau ubah sebuah surat; berkas baru menggantikan berkas lama. */
export async function saveLetter(activityId: string, input: LetterInput, file: File | null, existing?: ActivityLetter): Promise<void> {
  const meta = file ? await uploadLetterFile(activityId, file) : null
  const row = {
    issuer: input.issuer.trim() || null, number: input.number.trim() || null, letter_date: input.letter_date || null, subject: input.subject.trim() || null,
    ...(meta ?? {}),
  }
  const res = existing
    ? await supabase.from('activity_letters').update(row).eq('id', existing.id)
    : await supabase.from('activity_letters').insert({ ...row, activity_id: activityId })
  if (res.error) { if (meta) await removeLetterFiles([meta.storage_path]); throw new Error(errMsg(res.error)) }
  if (meta && existing?.storage_path) await removeLetterFiles([existing.storage_path])
}

export async function deleteLetter(l: ActivityLetter): Promise<void> {
  const { error } = await supabase.from('activity_letters').delete().eq('id', l.id)
  if (error) throw new Error(errMsg(error))
  await removeLetterFiles([l.storage_path])
}

/** Alamat bertanda tangan (berumur pendek) untuk melihat/mengunduh berkas surat. */
export async function signedLetterUrl(path: string, seconds = 300): Promise<string> {
  const { data, error } = await supabase.storage.from(LETTER_BUCKET).createSignedUrl(path, seconds)
  if (error || !data) throw new Error(errMsg(error ?? 'Gagal membuka berkas.'))
  return data.signedUrl
}

/** Bersihkan seluruh berkas surat sebuah kegiatan (sebelum kegiatan dihapus). */
export async function removeActivityLetterFiles(activityId: string): Promise<void> {
  const { data } = await supabase.from('activity_letters').select('storage_path').eq('activity_id', activityId).not('storage_path', 'is', null)
  await removeLetterFiles((data ?? []).map((r) => r.storage_path as string))
}

/** "Nomor W29-A/123 tanggal 1 November 2026 perihal Undangan" untuk ringkasan satu baris. */
export function letterSummary(l: Pick<ActivityLetter, 'issuer' | 'number' | 'letter_date' | 'subject'>, fmt: (d: string) => string): string {
  return [l.issuer, l.number && `Nomor ${l.number}`, l.letter_date && `tanggal ${fmt(l.letter_date)}`, l.subject && `perihal ${l.subject}`].filter(Boolean).join(', ')
}
