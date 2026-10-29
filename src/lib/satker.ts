import type { PersonRole } from './types'

export const NO_SATKER = 'Tanpa satuan kerja'
/** Nilai opsi filter untuk "orang tanpa satuan kerja" (kunci kelompoknya string kosong). */
export const NONE_KEY = '__none__'

/** Rapikan spasi pada nama satuan kerja. */
export const normSatker = (s: string | null | undefined) => (s ?? '').trim().replace(/\s+/g, ' ')
/** Kunci pengelompokan: tidak peka huruf besar/kecil dan spasi ganda, agar "Dinas  Pendidikan" = "dinas pendidikan". */
export const satkerKey = (s: string | null | undefined) => normSatker(s).toLowerCase()

/** Jumlah huruf kapital: bila dua penulisan sama banyak, pilih yang lebih rapi (huruf awal kapital). */
const upper = (s: string) => (s.match(/\p{Lu}/gu) ?? []).length

export interface SatkerGroup<T> { key: string; label: string; items: T[] }

/**
 * Kelompokkan berdasarkan satuan kerja. Urutan kelompok alfabetis (Indonesia), kelompok "tanpa satuan kerja" di akhir.
 * Nama yang ditampilkan memakai penulisan yang paling sering dipakai di kelompok itu (seri: yang lebih banyak huruf kapital). Urutan anggota dipertahankan.
 */
export function groupBySatker<T>(items: readonly T[], get: (t: T) => string | null | undefined): SatkerGroup<T>[] {
  const map = new Map<string, { items: T[]; spellings: Map<string, number> }>()
  for (const it of items) {
    const key = satkerKey(get(it))
    const g = map.get(key) ?? { items: [] as T[], spellings: new Map<string, number>() }
    g.items.push(it)
    const sp = normSatker(get(it))
    if (sp) g.spellings.set(sp, (g.spellings.get(sp) ?? 0) + 1)
    map.set(key, g)
  }
  const groups: SatkerGroup<T>[] = [...map.entries()].map(([key, g]) => {
    const label = key === ''
      ? NO_SATKER
      : [...g.spellings.entries()].sort((a, b) => b[1] - a[1] || upper(b[0]) - upper(a[0]) || a[0].localeCompare(b[0], 'id'))[0][0]
    return { key, label, items: g.items }
  })
  return groups.sort((a, b) => (a.key === '' ? 1 : b.key === '' ? -1 : a.label.localeCompare(b.label, 'id', { sensitivity: 'base' })))
}

/** Hitungan per peran, tanpa peran yang kosong: "3 peserta · 1 narasumber". */
export function roleSummary(items: readonly { role: PersonRole }[]): string {
  const n: Record<PersonRole, number> = { peserta: 0, narasumber: 0, panitia: 0 }
  for (const i of items) n[i.role]++
  return (['peserta', 'narasumber', 'panitia'] as const).filter((r) => n[r] > 0).map((r) => `${n[r]} ${r}`).join(' · ')
}

/** Pencocokan filter satuan kerja dari <select> (NONE_KEY = tanpa satuan kerja, '' = semua). */
export const matchesUnit = (filter: string, institution: string | null | undefined) =>
  filter === '' || (filter === NONE_KEY ? satkerKey(institution) === '' : satkerKey(institution) === filter)
