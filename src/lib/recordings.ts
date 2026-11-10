/** Rekaman suara pada notula: pemilihan format perekam, penamaan, dan pembersihan daftar. Bagian murni. */
import type { NoteRecording } from './types'

export const REC_BUCKET = 'rekaman'
export const REC_MAX_BYTES = 50 * 1024 * 1024
/** Bitrate rendah (suara bicara): ±14 MB per jam. */
export const REC_BITRATE = 32000

/** Format perekam yang dicoba berurutan (diterima bucket "rekaman"). */
export const REC_MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'] as const

/** Format pertama yang didukung perekam browser; null bila tidak ada (biarkan browser memilih). */
export const pickRecorderMime = (isSupported: (mime: string) => boolean): string | null => REC_MIMES.find((m) => isSupported(m)) ?? null

/** Tipe MIME tanpa parameter ("audio/webm;codecs=opus" -> "audio/webm"). */
export const baseMime = (mime: string) => mime.split(';')[0].trim().toLowerCase() || 'audio/webm'

export function extOfMime(mime: string): string {
  const m = baseMime(mime)
  if (m.includes('ogg')) return 'ogg'
  if (m === 'audio/mp4' || m === 'audio/x-m4a') return 'm4a'
  if (m === 'audio/mpeg') return 'mp3'
  if (m.includes('wav')) return 'wav'
  return 'webm'
}

const p2 = (n: number) => String(n).padStart(2, '0')

/** Nama berkas rekaman: "Rekaman 2 - 10-11-2026 14.05.webm". */
export function recordingFileName(n: number, at: Date, ext: string): string {
  return `Rekaman ${n} - ${p2(at.getDate())}-${p2(at.getMonth() + 1)}-${at.getFullYear()} ${p2(at.getHours())}.${p2(at.getMinutes())}.${ext}`
}

/** Nomor rekaman berikutnya (urut dari 1, mengisi nomor setelah rekaman terbanyak). */
export const nextRecordingNumber = (list: readonly Pick<NoteRecording, 'file_name'>[]) =>
  list.reduce((mx, r) => Math.max(mx, Number(r.file_name.match(/^Rekaman (\d+)/)?.[1] ?? 0)), 0) + 1

/** Rapikan daftar rekaman sebelum disimpan: wajib ada path, angka dibulatkan, teks dipangkas. */
export function cleanRecordings(list: readonly NoteRecording[]): NoteRecording[] {
  return list
    .filter((r) => r.path)
    .map((r) => ({ ...r, file_name: r.file_name.slice(0, 200), size: Math.max(0, Math.round(r.size)), duration: Math.max(0, Math.round(r.duration)), transcript: r.transcript.trim().slice(0, 100000) }))
}

/** Pesan untuk kegagalan membuka mikrofon (error dari getUserMedia). */
export function micErrorText(e: unknown): string {
  const name = (e as { name?: string } | null)?.name ?? ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Izin mikrofon ditolak. Klik ikon gembok di address bar → izinkan Mikrofon, lalu coba lagi.'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'Mikrofon tidak ditemukan. Sambungkan mikrofon lalu coba lagi.'
  if (name === 'NotReadableError' || name === 'AbortError') return 'Mikrofon sedang dipakai aplikasi lain atau tidak bisa dibuka.'
  return 'Perekaman tidak bisa dimulai. Pastikan halaman dibuka lewat https dan mikrofon tersedia.'
}

/** Nama acak 32 heksadesimal untuk path berkas rekaman: "<id kegiatan>/<acak>.webm". */
export function randomRecordingPath(activityId: string, ext: string): string {
  const b = crypto.getRandomValues(new Uint8Array(16))
  return `${activityId}/${Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')}.${ext}`
}

/** Path berkas yang ada di `before` tetapi tidak di `after` (rekaman yang dibuang). */
export const droppedPaths = (before: ReadonlySet<string>, after: readonly Pick<NoteRecording, 'path'>[]): string[] => {
  const keep = new Set(after.map((r) => r.path))
  return [...before].filter((p) => !keep.has(p))
}
