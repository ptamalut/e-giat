import { activityPhase } from './phase'
import { rpc } from './supabase'

export interface HistoryItem {
  id: string; name: string; description: string | null; location: string | null
  start_date: string | null; end_date: string | null
  status: 'aktif' | 'selesai' | 'draft'
  jenis?: 'kegiatan' | 'diklat'
  /** foto sampul dan jumlah foto; hanya terisi bila galeri kegiatan itu dibuka panitia */
  cover: string | null; photo_count: number
}

export const fetchHistory = () => rpc<HistoryItem[]>('public_history', {})

/** Label riwayat: aktif sebelum tanggal mulai = Mendatang, sejak hari H = Sedang berjalan. */
export const historyStatusLabel = (h: Pick<HistoryItem, 'status' | 'start_date'>) => {
  const ph = activityPhase(h)
  return ph === 'berjalan' ? 'Sedang berjalan' : ph === 'mendatang' ? 'Mendatang' : ph === 'selesai' ? 'Selesai' : 'Draf'
}
