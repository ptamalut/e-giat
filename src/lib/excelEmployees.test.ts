import { describe, expect, it } from 'vitest'
import { formatGrade, parseEmployeeSheet, satkerFromTitle, type Sheet } from './excelEmployees'

// Struktur sama dengan berkas rekap pegawai (judul, 4 baris judul kolom, lalu 4 baris per pegawai); data karangan.
const rekap: Sheet = [
  ['Daftar Rekap Pegawai Pada Pengadilan Contoh Daerah', null, null, null, null],
  ['No.', 'Foto', 'Identitas', 'Tempat, Tgl Lahir', 'Jabatan'],
  [null, null, null, 'Usia', 'TMT Jabatan'],
  [null, null, null, 'TMT Pensiun', 'Golongan'],
  [null, null, null, 'Masa Kerja', 'TMT Golongan'],
  [1, null, 'Drs. Budi Santoso, M.H.', 'Kota A, 11 Maret 1963', 'Ketua'],
  [null, null, '19630311.199103.1.007', 'Usia : 63 Tahun', 'TMT Jabatan : 13 Agustus 2026'],
  [null, null, null, 'TMT Pensiun : 01 April 2030', 'Pembina Utama, (IV/e)'],
  [null, null, null, 'Masa Kerja : 35 Tahun', 'TMT Golongan : 01 Oktober 2023'],
  [2, null, 'Rina Marlina, S.E.', 'Kota B, 1 Januari 1990', 'Kepala Sub Bagian Keuangan dan Pelaporan'],
  [null, null, '19900101.201501.2.001', 'Usia : 36 Tahun', 'TMT Jabatan : 30 Desember 2015'],
  [null, null, null, 'TMT Pensiun : 01 Februari 2050', 'Penata Muda, (III/a)'],
  [null, null, null, 'Masa Kerja : 10 Tahun', 'TMT Golongan : 01 April 2025'],
  [3, null, 'ALI UMAR', 'Kota C, 15 Desember 1996', 'Operator Layanan Operasional'],
  [null, null, '19961215.202521.1.025', 'Usia : 29 Tahun', 'TMT Jabatan : 01 September 2025'],
  [null, null, null, 'TMT Pensiun : 01 Januari 2057', 'V, (V)'],
  [null, null, null, 'Masa Kerja : 1 Tahun', 'TMT Golongan : 01 September 2025'],
]

describe('impor Excel: format rekap pegawai', () => {
  const r = parseEmployeeSheet(rekap)
  it('terdeteksi sebagai rekap dan satker diambil dari judul', () => {
    expect(r.format).toBe('rekap')
    expect(r.satker).toBe('Pengadilan Contoh Daerah')
    expect(r.errors).toEqual([])
    expect(r.items).toHaveLength(3)
  })
  it('nama, NIP (titik dibuang), jabatan, dan pangkat/golongan terbaca; kolom yang tidak ada dikosongkan', () => {
    expect(r.items[0]).toEqual({ name: 'Drs. Budi Santoso, M.H.', identifier: '196303111991031007', grade: 'Pembina Utama (IV/e)', job_title: 'Ketua', institution: null, phone: null })
    expect(r.items[1]).toMatchObject({ name: 'Rina Marlina, S.E.', identifier: '199001012015012001', grade: 'Penata Muda (III/a)', job_title: 'Kepala Sub Bagian Keuangan dan Pelaporan' })
  })
  it('golongan PPPK yang namanya sama dengan kodenya ditulis sekali', () => {
    expect(r.items[2].grade).toBe('V')
  })
  it('baris TMT tidak terbaca sebagai pangkat dan blok terakhir yang terpotong tetap terbaca', () => {
    const cut = parseEmployeeSheet(rekap.slice(0, 15)) // blok ke-3 hanya 2 baris
    expect(cut.items).toHaveLength(3)
    expect(cut.items[2].identifier).toBe('19961215202521' + '1025')
  })
  it('NIP kembar dalam berkas dilaporkan', () => {
    const dup = parseEmployeeSheet([...rekap, [4, null, 'Orang Lain', null, 'Staf'], [null, null, '19630311.199103.1.007', null, null]])
    expect(dup.items).toHaveLength(3)
    expect(dup.errors.join(' ')).toMatch(/duplikat/)
  })
  it('NIP berupa angka besar (rusak oleh Excel) dilaporkan, bukan dipakai', () => {
    const bad = parseEmployeeSheet([...rekap.slice(0, 5), [1, null, 'Nama', null, 'Staf'], [null, null, 1.9630311199103e17, null, null]])
    expect(bad.items[0].identifier).toBeNull()
    expect(bad.errors.join(' ')).toMatch(/NIP terbaca sebagai angka/)
  })
})

describe('impor Excel: tabel biasa', () => {
  it('judul di atas tabel dilewati dan kolom dipetakan dari judul kolom', () => {
    const r = parseEmployeeSheet([
      ['Data Pegawai 2026', null, null],
      [],
      ['Nama Pegawai', 'NIP', 'Satuan Kerja', 'Jabatan', 'Golongan'],
      ['Budi, S.H.', '198001012005011001', 'Dinas A', 'Kepala', 'Pembina (IV/a)'],
      ['Siti', null, null, null, null],
    ])
    expect(r.format).toBe('tabel')
    expect(r.items).toHaveLength(2)
    expect(r.items[0]).toMatchObject({ name: 'Budi, S.H.', identifier: '198001012005011001', institution: 'Dinas A', job_title: 'Kepala', grade: 'Pembina (IV/a)' })
    expect(r.items[1]).toMatchObject({ name: 'Siti', identifier: null, institution: null })
  })
  it('tanpa baris judul: urutan kolom bawaan', () => {
    const r = parseEmployeeSheet([['Budi', '198001012005011001', 'Pembina (IV/a)', 'Kepala', 'Dinas A', '0812']])
    expect(r.items[0]).toMatchObject({ name: 'Budi', institution: 'Dinas A', phone: '0812' })
  })
  it('angka NIP yang terlalu panjang dilaporkan', () => {
    const r = parseEmployeeSheet([['Nama', 'NIP'], ['Budi', 1.98001012005011e17]])
    expect(r.errors.join(' ')).toMatch(/angka terlalu panjang/)
  })
})

describe('pembantu', () => {
  it('formatGrade', () => {
    expect(formatGrade('Pembina Tingkat I, (IV/b)')).toBe('Pembina Tingkat I (IV/b)')
    expect(formatGrade('IX, (IX)')).toBe('IX')
    expect(formatGrade('  ')).toBeNull()
    expect(formatGrade('Penata')).toBe('Penata')
  })
  it('satkerFromTitle', () => {
    expect(satkerFromTitle('Daftar Rekap Pegawai Pada Pengadilan Tinggi Agama Maluku Utara')).toBe('Pengadilan Tinggi Agama Maluku Utara')
    expect(satkerFromTitle('Data Pegawai 2026')).toBeNull()
  })
})
