import { rpc } from './supabase'
import type { PublicActivity } from './types'

export const fetchPublicActivities = () => rpc<PublicActivity[]>('public_activities', {})
export const fetchPublicActivity = (id: string) => rpc<PublicActivity | null>('public_activity', { p_id: id })

export type FindResult = { token: string } | { found: false } | { blocked: true }

/** Cari link pribadi dari NIP. Server membatasi percobaan gagal beruntun. */
export const findToken = (activityId: string, nip: string) => rpc<FindResult>('public_find_token', { p_activity: activityId, p_nip: nip })

/** Pesan untuk hasil pencarian yang tidak berhasil. */
export function findMessage(r: FindResult): string | null {
  if ('token' in r) return null
  if ('blocked' in r) return 'Terlalu banyak percobaan dengan NIP ini. Coba lagi dalam beberapa menit atau hubungi panitia.'
  return 'NIP tidak ditemukan pada kegiatan ini. Periksa kembali penulisannya atau hubungi panitia.'
}

/** NIP pada formulir: hanya spasi/pemisah yang dirapikan; panjang wajar 5-40 karakter. */
export const cleanNip = (v: string) => v.replace(/[\s.\-]/g, '')
