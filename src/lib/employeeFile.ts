import { parseEmployeeSheet, type EmployeeSheet } from './excelEmployees'
import { parseEmployees, type ParsedEmployee } from './parsers'

export interface EmployeeFile extends EmployeeSheet { fileName: string; sheets: number }

const MAX_BYTES = 8 * 1024 * 1024

/** Baca berkas impor pegawai (.xlsx, .csv, atau .txt) menjadi daftar pegawai. Kolom yang tidak ada dikosongkan. */
export async function readEmployeeFile(file: File): Promise<EmployeeFile> {
  if (file.size > MAX_BYTES) throw new Error('Berkas terlalu besar (maksimal 8 MB).')
  const ext = file.name.toLowerCase().split('.').pop() ?? ''

  if (ext === 'csv' || ext === 'txt' || ext === 'tsv') {
    const r = parseEmployees(await file.text())
    return { items: r.items, errors: r.errors, format: 'tabel', satker: null, fileName: file.name, sheets: 1 }
  }
  if (ext === 'xls') throw new Error('Format .xls (Excel lama) tidak didukung. Simpan ulang sebagai .xlsx (File → Simpan Sebagai) lalu pilih lagi.')
  if (ext !== 'xlsx') throw new Error('Format berkas tidak didukung. Gunakan .xlsx, .csv, atau .txt.')

  let sheets: { sheet: string; data: unknown[][] }[]
  try {
    const { default: readXlsxFile } = await import('read-excel-file/universal')
    sheets = (await readXlsxFile(file)) as unknown as { sheet: string; data: unknown[][] }[]
  } catch {
    throw new Error('Berkas tidak dapat dibaca sebagai Excel (.xlsx). Pastikan berkasnya tidak rusak atau diberi kata sandi.')
  }

  const items: ParsedEmployee[] = []
  const errors: string[] = []
  const seen = new Set<string>()
  let satker: string | null = null
  let format: EmployeeSheet['format'] = 'tabel'
  const used = sheets.filter((s) => s.data?.length)
  for (const s of used) {
    const r = parseEmployeeSheet(s.data as never)
    if (r.format === 'rekap') format = 'rekap'
    satker ??= r.satker
    const prefix = used.length > 1 ? `[${s.sheet}] ` : ''
    errors.push(...r.errors.map((e) => prefix + e))
    for (const it of r.items) {
      const key = (it.identifier || it.name).toLowerCase()
      if (seen.has(key)) { errors.push(`${prefix}${it.name}: duplikat dengan lembar lain, dilewati.`); continue }
      seen.add(key); items.push(it)
    }
  }
  return { items, errors, format, satker, fileName: file.name, sheets: used.length }
}
