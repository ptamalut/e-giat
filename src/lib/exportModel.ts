import { fmtDateRange } from './format'
import { rolesLabel, rolesOf } from './people'
import { groupBySatker } from './satker'
import type { Activity, Participant, PersonRole } from './types'

export type ExportColumn = 'identifier' | 'grade' | 'job_title' | 'phone' | 'role' | 'signature'
export type ColumnKey = ExportColumn | 'no' | 'name' | 'unit' | 'status' | 'time'

export interface ExportOptions {
  title: string
  roles: PersonRole[]
  columns: ExportColumn[]
  landscape: boolean
  /** true: tabel terpisah per satuan kerja; false: satu tabel dengan kolom Satuan Kerja */
  grouped: boolean
}

export interface ExportModel {
  title: string
  subtitle: string[]
  headers: string[]
  /** kunci kolom (sejajar dengan headers), dipakai untuk menentukan lebar */
  keys: ColumnKey[]
  groups: { label: string | null; rows: string[][] }[]
  total: number
  landscape: boolean
  hasSignature: boolean
}

const LABEL: Record<ExportColumn, string> = {
  identifier: 'NIP', grade: 'Pangkat/Gol. Ruang', job_title: 'Jabatan', phone: 'No. WhatsApp', role: 'Peran', signature: 'Tanda Tangan',
}
/** Lebar tetap (mm) untuk kolom data pendek agar nomor, NIP, dan nomor WhatsApp tidak terpecah baris. */
const FIXED_MM: Partial<Record<ColumnKey, number>> = { no: 10, identifier: 36, phone: 30, role: 24, signature: 32, status: 22, time: 20 }
/** Bobot kolom teks panjang yang berbagi sisa lebar. */
const FLEX_WEIGHT: Partial<Record<ColumnKey, number>> = { name: 26, unit: 18, grade: 15, job_title: 20 }

/** Lebar tiap kolom dalam mm bila total lebar tabel `totalMm`. Kolom tetap tidak dikecilkan kecuali ruang benar-benar kurang. */
export function columnWidthsMm(keys: readonly ColumnKey[], totalMm: number): number[] {
  const fixed = keys.reduce((n, k) => n + (FIXED_MM[k] ?? 0), 0)
  const flexKeys = keys.filter((k) => FIXED_MM[k] == null)
  const flexSum = flexKeys.reduce((n, k) => n + (FLEX_WEIGHT[k] ?? 10), 0)
  const minFlex = 22 * flexKeys.length
  const rest = Math.max(totalMm - fixed, minFlex)
  const widths = keys.map((k) => FIXED_MM[k] ?? (rest * (FLEX_WEIGHT[k] ?? 10)) / flexSum)
  const total = widths.reduce((a, b) => a + b, 0)
  return total > totalMm ? widths.map((w) => (w * totalMm) / total) : widths // ruang kurang: kecilkan proporsional
}
/** Urutan kolom tetap, terlepas dari urutan klik pengguna. */
const ORDER: ExportColumn[] = ['identifier', 'grade', 'job_title', 'phone', 'role', 'signature']

/**
 * Susun data ekspor. `people` harus sudah berurutan (lihat sortPeople); urutan satker mengikuti `satkerOrder`.
 * Penomoran diulang dari 1 di tiap satuan kerja bila `grouped`, selain itu berlanjut.
 */
export function buildExportModel(
  activity: Pick<Activity, 'name' | 'start_date' | 'end_date' | 'location'>,
  people: readonly Participant[],
  satkerOrder: readonly string[] | null,
  opts: ExportOptions,
): ExportModel {
  const cols = ORDER.filter((c) => opts.columns.includes(c))
  const selected = people.filter((p) => rolesOf(p).some((r) => opts.roles.includes(r)))
  const cell = (p: Participant, c: ExportColumn): string => {
    switch (c) {
      case 'identifier': return p.identifier ?? ''
      case 'grade': return p.grade ?? ''
      case 'job_title': return p.job_title ?? ''
      case 'phone': return p.phone ?? ''
      case 'role': return rolesLabel(p)
      case 'signature': return ''
    }
  }

  const headers = ['No', 'Nama Lengkap & Gelar', ...(opts.grouped ? [] : ['Satuan Kerja']), ...cols.map((c) => LABEL[c])]
  const keys: ColumnKey[] = ['no', 'name', ...(opts.grouped ? [] : (['unit'] as const)), ...cols]
  const row = (p: Participant, n: number) => [String(n), p.name, ...(opts.grouped ? [] : [p.institution?.trim() ?? '']), ...cols.map((c) => cell(p, c))]

  const groups = opts.grouped
    ? groupBySatker(selected, (p) => p.institution, satkerOrder).map((g) => ({
        label: `${g.label} (${g.items.length} orang)`,
        rows: g.items.map((p, i) => row(p, i + 1)),
      }))
    : [{ label: null, rows: groupBySatker(selected, (p) => p.institution, satkerOrder).flatMap((g) => g.items).map((p, i) => row(p, i + 1)) }]

  return {
    title: opts.title.trim() || 'Daftar Peserta',
    subtitle: [activity.name, [fmtDateRange(activity.start_date, activity.end_date), activity.location].filter((v) => v && v !== '—').join(' · ')].filter(Boolean),
    headers,
    keys,
    groups: groups.filter((g) => g.rows.length > 0),
    total: selected.length,
    landscape: opts.landscape,
    hasSignature: cols.includes('signature'),
  }
}

/** Nama berkas aman: daftar-peserta-nama-kegiatan.ext */
export const exportFilename = (title: string, activityName: string, ext: string) =>
  `${[title, activityName].map((s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')).filter(Boolean).join('-').slice(0, 80) || 'daftar'}.${ext}`

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
