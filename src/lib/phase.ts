import type { ActivityStatus } from './types'

/** Tahap kegiatan yang tampil: Draft, Mendatang (aktif tetapi belum hari H), Berjalan (hari H dan seterusnya sampai ditandai selesai), Selesai. */
export type Phase = 'draft' | 'mendatang' | 'berjalan' | 'selesai'

export const PHASE_LABEL: Record<Phase, string> = { draft: 'Draft', mendatang: 'Mendatang', berjalan: 'Berjalan', selesai: 'Selesai' }
export const PHASE_TONE: Record<Phase, string> = { draft: '', mendatang: 'warn', berjalan: 'success', selesai: 'info' }

/** Tanggal hari ini (zona perangkat) sebagai yyyy-mm-dd, sama bentuknya dengan kolom tanggal kegiatan. */
export function todayStr(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

/**
 * Tahap kegiatan menurut status dan tanggal mulai. Status Aktif sebelum tanggal mulai = Mendatang; sejak hari H = Berjalan.
 * Kegiatan tanpa tanggal mulai dianggap berjalan. Setelah tanggal selesai, kegiatan tetap Berjalan sampai panitia menandainya Selesai
 * (peserta masih perlu membuka halaman pribadi, mis. mengunduh sertifikat).
 */
export function activityPhase(a: { status: ActivityStatus; start_date: string | null }, today = todayStr()): Phase {
  if (a.status !== 'aktif') return a.status
  return a.start_date && a.start_date > today ? 'mendatang' : 'berjalan'
}
