import { normalizeNip, parseEmployees, type ParsedEmployee } from './parsers'

export type Cell = string | number | boolean | Date | null | undefined
export type Sheet = Cell[][]

export interface EmployeeSheet {
  items: ParsedEmployee[]
  errors: string[]
  /** tabel biasa dengan baris judul kolom, atau rekap (satu pegawai di beberapa baris) */
  format: 'tabel' | 'rekap'
  /** satuan kerja yang terbaca dari judul lembar (mis. "…Pada Pengadilan Tinggi Agama X"); null bila tidak ada */
  satker: string | null
}

const norm = (h: unknown) => String(h ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const text = (c: Cell): string => {
  if (c == null) return ''
  if (c instanceof Date) return ''
  if (typeof c === 'number') return Number.isInteger(c) ? String(c) : String(c)
  return String(c).replace(/\s+/g, ' ').trim()
}

/** "Pembina Utama, (IV/e)" -> "Pembina Utama (IV/e)"; "IX, (IX)" -> "IX" (golongan yang namanya sama dengan kodenya). */
export function formatGrade(raw: string): string | null {
  const v = raw.replace(/\s+/g, ' ').trim()
  if (!v) return null
  const m = v.match(/^(.*?),?\s*\(([^)]+)\)$/)
  if (!m) return v
  const name = m[1].trim(), code = m[2].trim()
  return !name || name.toUpperCase() === code.toUpperCase() ? code : `${name} (${code})`
}

/** Satuan kerja dari judul seperti "Daftar Rekap Pegawai Pada Pengadilan Tinggi Agama Maluku Utara". */
export function satkerFromTitle(title: string): string | null {
  const m = title.match(/\bpada\s+(.{3,})$/i)
  return m ? m[1].replace(/\s+/g, ' ').trim() : null
}

const isNum = (c: Cell) => (typeof c === 'number' && Number.isInteger(c)) || (typeof c === 'string' && /^\d{1,4}$/.test(c.trim()))
const looksNip = (s: string) => /^\d[\d.\s]{7,}$/.test(s)

/** Format rekap: judul kolom "Identitas" dan "Jabatan"; tiap pegawai menempati beberapa baris berurutan. */
function parseRekap(rows: Sheet, headRow: number, idCol: number): EmployeeSheet {
  const errors: string[] = []
  const items: ParsedEmployee[] = []
  // kolom jabatan & nomor dari baris-baris judul
  let jabCol = -1, noCol = 0
  for (let r = headRow; r < Math.min(rows.length, headRow + 5); r++) {
    rows[r]?.forEach((c, i) => {
      const n = norm(c)
      if (n === 'jabatan' && jabCol < 0) jabCol = i
      if ((n === 'no' || n === 'nomor') && r === headRow) noCol = i
    })
  }
  if (jabCol < 0) jabCol = idCol + 2
  const title = rows.slice(0, headRow).flat().map(text).find(Boolean) ?? ''

  const starts: number[] = []
  for (let r = headRow + 1; r < rows.length; r++) if (isNum(rows[r]?.[noCol])) starts.push(r)
  const seen = new Set<string>()
  starts.forEach((s, bi) => {
    const block = rows.slice(s, starts[bi + 1] ?? rows.length)
    const name = text(block[0]?.[idCol])
    const no = text(block[0]?.[noCol])
    if (!name) { errors.push(`No. ${no}: nama kosong.`); return }
    const rawNip = block.slice(1).map((r) => r?.[idCol])
    let nip: string | null = null
    for (const c of rawNip) {
      if (typeof c === 'number' && Math.abs(c) > 1e15) { errors.push(`No. ${no} (${name}): NIP terbaca sebagai angka. Ubah kolom NIP menjadi format Teks.`); continue }
      const t = text(c)
      if (looksNip(t)) { nip = normalizeNip(t.replace(/\D/g, '')) || null; break }
    }
    const jabatan = text(block[0]?.[jabCol]) || null
    let grade: string | null = null
    for (const r of block.slice(1)) {
      const t = text(r?.[jabCol])
      if (t && !/^tmt\b/i.test(t) && /\(.+\)/.test(t)) { grade = formatGrade(t); break }
    }
    const key = (nip || name).toLowerCase()
    if (seen.has(key)) { errors.push(`No. ${no} (${name}): duplikat dalam berkas.`); return }
    seen.add(key)
    items.push({ name: name.replace(/\s+/g, ' '), identifier: nip, grade, job_title: jabatan, institution: null, phone: null })
  })
  return { items, errors, format: 'rekap', satker: satkerFromTitle(title) }
}

/** Tabel biasa: baris judul dicari (judul/catatan di atasnya dilewati), lalu dibaca seperti data tempel. */
function parseTable(rows: Sheet): EmployeeSheet {
  const probe = ['nama', 'namalengkap', 'namapegawai', 'namalengkapgelar', 'nip', 'jabatan', 'satuankerja', 'unitkerja', 'pangkat', 'golongan', 'pangkatgolruang', 'nowhatsapp', 'nohp', 'whatsapp']
  let head = rows.findIndex((r) => (r ?? []).filter((c) => probe.includes(norm(c))).length >= 2)
  if (head < 0) head = 0
  const errors: string[] = []
  const lines: string[] = []
  rows.slice(head).forEach((r, i) => {
    const cells = (r ?? []).map((c) => {
      if (typeof c === 'number' && Math.abs(c) > 1e15) { errors.push(`Baris ${head + i + 1}: angka terlalu panjang (mungkin NIP terbaca sebagai angka). Ubah kolom menjadi format Teks.`); return '' }
      return text(c).replace(/[\t\n]/g, ' ')
    })
    if (cells.some(Boolean)) lines.push(cells.join('\t'))
  })
  const r = parseEmployees(lines.join('\n'))
  return { items: r.items, errors: [...errors, ...r.errors], format: 'tabel', satker: null }
}

/** Baca lembar Excel (larik 2 dimensi) menjadi daftar pegawai. Kolom yang tidak ada dibiarkan kosong. */
export function parseEmployeeSheet(rows: Sheet): EmployeeSheet {
  const clean = rows.map((r) => r ?? [])
  for (let r = 0; r < Math.min(clean.length, 15); r++) {
    const idCol = clean[r].findIndex((c) => norm(c) === 'identitas')
    if (idCol >= 0) return parseRekap(clean, r, idCol)
  }
  return parseTable(clean)
}
