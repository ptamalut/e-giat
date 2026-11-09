import { rpc } from './supabase'

export interface SiteStats { today: number; total: number }

const KEY = 'laksana-vid'
let memoryId: string | null = null

/** Id acak browser ini (disimpan di perangkat); dipakai agar satu browser dihitung satu kunjungan per hari. */
export function visitorId(): string {
  try {
    let v = localStorage.getItem(KEY)
    if (!v || !/^[0-9a-f-]{36}$/.test(v)) { v = crypto.randomUUID(); localStorage.setItem(KEY, v) }
    return v
  } catch {
    return (memoryId ??= crypto.randomUUID())
  }
}

let inflight: Promise<SiteStats> | null = null

/** Catat kunjungan hari ini (server menghitung sekali per browser per hari) dan kembalikan statistik terbaru. */
export function recordVisit(): Promise<SiteStats> {
  return (inflight ??= rpc<SiteStats>('record_visit', { p_visitor: visitorId() }).catch((e) => { inflight = null; throw e }))
}

export const fmtCount = (n: number) => new Intl.NumberFormat('id-ID').format(n)
