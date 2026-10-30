import { describe, expect, it } from 'vitest'
import { buildExportModel, columnWidthsMm, exportFilename, type ExportOptions } from './exportModel'
import { groupBySatker, moveItem, sortPeople } from './satker'
import type { Participant } from './types'

const P = (name: string, institution: string | null, sort_order: number | null = null, role: Participant['role'] = 'peserta'): Participant => ({
  id: name, activity_id: 'a', name, identifier: name === 'Budi' ? '198001' : null, grade: 'III/a', job_title: 'Staf', institution, email: null, phone: '08', role, employee_id: null, access_attendance: true, access_quiz: role === 'peserta', access_certificate: true, access_notes: false, access_documentation: false, roles: [], sort_order, token: name, created_at: '',
})

describe('urutan', () => {
  it('moveItem memindahkan dan tidak mengubah array asli', () => {
    const a = [1, 2, 3, 4]
    expect(moveItem(a, 0, 2)).toEqual([2, 3, 1, 4])
    expect(moveItem(a, 3, 0)).toEqual([4, 1, 2, 3])
    expect(moveItem(a, 1, 1)).toEqual([1, 2, 3, 4])
    expect(moveItem(a, 9, 0)).toEqual([1, 2, 3, 4])
    expect(a).toEqual([1, 2, 3, 4])
  })

  it('sortPeople: yang berurutan dulu, sisanya abjad', () => {
    const r = sortPeople([P('Zaki', 'x'), P('Andi', 'x'), P('Citra', 'x', 2), P('Budi', 'x', 1)])
    expect(r.map((p) => p.name)).toEqual(['Budi', 'Citra', 'Andi', 'Zaki'])
  })

  it('urutan satker buatan pengguna dipakai; satker baru menyusul; "tanpa satker" tetap terakhir', () => {
    const people = [P('1', 'Dinas A'), P('2', 'Dinas B'), P('3', 'Dinas C'), P('4', null), P('5', 'Dinas D')]
    const g = groupBySatker(people, (p) => p.institution, ['dinas c', 'dinas a'])
    expect(g.map((x) => x.label)).toEqual(['Dinas C', 'Dinas A', 'Dinas B', 'Dinas D', 'Tanpa satuan kerja'])
  })

  it('kunci urutan yang sudah tidak ada diabaikan; tanpa urutan = abjad', () => {
    const people = [P('1', 'Dinas B'), P('2', 'Dinas A')]
    expect(groupBySatker(people, (p) => p.institution, ['hantu', 'dinas b']).map((x) => x.label)).toEqual(['Dinas B', 'Dinas A'])
    expect(groupBySatker(people, (p) => p.institution, null).map((x) => x.label)).toEqual(['Dinas A', 'Dinas B'])
  })
})

describe('model ekspor', () => {
  const act = { name: 'Diklat Uji', start_date: '2026-10-29', end_date: '2026-10-30', location: 'Aula' }
  const people = sortPeople([P('Budi', 'Dinas A', 2), P('Andi', 'Dinas A', 1), P('Citra', 'Dinas B'), P('Dr. Nara', 'Dinas B', null, 'narasumber'), P('Tanpa', null)])
  const base: ExportOptions = { title: 'Daftar Peserta', roles: ['peserta'], columns: ['grade', 'identifier', 'signature'], landscape: true, grouped: true }

  it('mengikuti urutan orang & satker, penomoran diulang per satker, kolom urut tetap', () => {
    const m = buildExportModel(act, people, ['dinas b', 'dinas a'], base)
    expect(m.headers).toEqual(['No', 'Nama Lengkap & Gelar', 'NIP', 'Pangkat/Gol. Ruang', 'Tanda Tangan'])
    expect(m.groups.map((g) => g.label)).toEqual(['Dinas B (1 orang)', 'Dinas A (2 orang)', 'Tanpa satuan kerja (1 orang)'])
    expect(m.groups[1].rows.map((r) => [r[0], r[1]])).toEqual([['1', 'Andi'], ['2', 'Budi']])
    expect(m.groups[1].rows[1][2]).toBe('198001')
    expect(m.hasSignature).toBe(true)
    expect(m.total).toBe(4)
  })

  it('filter peran', () => {
    const m = buildExportModel(act, people, null, { ...base, roles: ['narasumber'] })
    expect(m.total).toBe(1)
    expect(m.groups).toHaveLength(1)
  })

  it('mode satu tabel: kolom Satuan Kerja, penomoran berlanjut, tanpa judul kelompok', () => {
    const m = buildExportModel(act, people, ['dinas b', 'dinas a'], { ...base, grouped: false, columns: [] })
    expect(m.headers).toEqual(['No', 'Nama Lengkap & Gelar', 'Satuan Kerja'])
    expect(m.groups).toHaveLength(1)
    expect(m.groups[0].label).toBeNull()
    expect(m.groups[0].rows.map((r) => r[0])).toEqual(['1', '2', '3', '4'])
    expect(m.groups[0].rows.map((r) => r[1])).toEqual(['Citra', 'Andi', 'Budi', 'Tanpa'])
  })

  it('kelompok tanpa orang terpilih dibuang; judul kosong memakai bawaan; subjudul memuat kegiatan', () => {
    const m = buildExportModel(act, people, null, { ...base, title: '  ', roles: ['panitia'] })
    expect(m.groups).toEqual([])
    expect(m.title).toBe('Daftar Peserta')
    expect(m.subtitle[0]).toBe('Diklat Uji')
  })

  it('nama berkas aman', () => {
    expect(exportFilename('Daftar Hadir', 'Diklat: Manajemen/Proyek #3', 'docx')).toBe('daftar-hadir-diklat-manajemen-proyek-3.docx')
  })
})

describe('lebar kolom ekspor', () => {
  it('kolom data pendek berlebar tetap; sisa dibagi ke kolom teks; total = lebar tabel', () => {
    const w = columnWidthsMm(['no', 'name', 'identifier', 'grade', 'job_title', 'phone'], 267)
    expect(w[0]).toBe(10)
    expect(w[2]).toBe(36)
    expect(w[5]).toBe(30)
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(267, 5)
    expect(w[1]).toBeGreaterThan(w[3]) // nama lebih lebar dari pangkat
  })
  it('ruang kurang (potret penuh): semua dikecilkan proporsional dan tetap muat', () => {
    const w = columnWidthsMm(['no', 'name', 'unit', 'identifier', 'grade', 'job_title', 'phone', 'role', 'signature'], 180)
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(180, 5)
    expect(Math.min(...w)).toBeGreaterThan(0)
  })
})
