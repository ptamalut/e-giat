import { describe, expect, it } from 'vitest'
import { buildHadirDocs, sessionDateText, sessionTimeText, type HadirOptions } from './hadirDoc'
import type { Attendance, AttendanceSession, Participant, PersonRole } from './types'

const TZ = 'Asia/Jayapura'
const P = (id: string, institution: string, job: string | null, role: PersonRole = 'peserta'): Participant => ({
  id, activity_id: 'a', name: `Nama ${id}`, identifier: `nip-${id}`, grade: null, job_title: job, institution, email: null, phone: null, role, roles: [role],
  employee_id: null, access_attendance: true, access_materials: true, access_quiz: true, access_certificate: true, access_notes: false, access_documentation: false, sort_order: null, token: id, created_at: '',
})
const S = (o: Partial<AttendanceSession> = {}): AttendanceSession => ({ id: 's1', activity_id: 'a', title: 'Hari 1', start_at: '2026-01-14T05:00:00Z', end_at: '2026-01-14T08:00:00Z', late_minutes: 15, require_selfie: false, require_location: false, custom_members: false, ...o } as AttendanceSession)
const A = (p: string, status: Attendance['status'], code = '0'.repeat(32)): Attendance => ({ id: p, activity_id: 'a', session_id: 's1', participant_id: p, status, checked_in_at: '', note: null, manual: false, sign_code: code } as Attendance)
const people = [P('a', 'Satker A', 'Wakil Ketua'), P('b', 'Satker A', null), P('c', 'Satker B', 'Hakim Tinggi'), P('d', 'Satker B', 'Panitera', 'narasumber')]
const base: HadirOptions = { title: 'Daftar Hadir Pegawai', sessionIds: ['s1'], roles: ['peserta', 'narasumber'], unit: '', agenda: '', place: '', coordinator: '', officer: '', showNip: false, paper: 'F4' }
const kop = { title: ['MAHKAMAH AGUNG'], address: ['Sofifi'] }
const build = (o: Partial<HadirOptions> = {}, atts: Attendance[] = [], s: AttendanceSession[] = [S()]) =>
  buildHadirDocs({ name: 'Monev Penempatan Pegawai', location: 'Aula PTA' }, people, s, atts, [], null, kop, { ...base, ...o }, TZ)

describe('waktu sesi', () => {
  it('hari/tanggal dan jam (14.00 WIT)', () => {
    expect(sessionDateText(S({ start_at: '2026-01-14T05:00:00Z' }), TZ)).toBe('Rabu, 14 Januari 2026')
    expect(sessionTimeText(S({ start_at: '2026-01-14T05:00:00Z' }), TZ)).toBe('14.00 WIT s.d. Selesai')
  })
  it('sesi beberapa hari ditulis rentang; akhir tepat tengah malam dihitung hari sebelumnya', () => {
    expect(sessionDateText(S({ start_at: '2026-01-13T15:00:00Z', end_at: '2026-01-15T15:00:00Z' }), TZ)).toBe('Rabu, 14 Januari 2026 s.d. Kamis, 15 Januari 2026')
    expect(sessionDateText(S({ start_at: '2026-01-13T15:00:00Z', end_at: '2026-01-14T15:00:00Z' }), TZ)).toBe('Rabu, 14 Januari 2026')
  })
  it('sesi otomatis dari tengah malam tidak punya baris Jam', () => {
    expect(sessionTimeText(S({ auto: true, start_at: '2026-01-13T15:00:00Z' }), TZ)).toBeNull()
    expect(sessionTimeText(S({ auto: true, start_at: '2026-01-14T05:00:00Z' }), TZ)).toBe('14.00 WIT s.d. Selesai')
  })
})

describe('daftar hadir resmi', () => {
  it('keterangan: tanggal, jam, agenda (nama kegiatan), tempat (lokasi kegiatan)', () => {
    const [d] = build()
    expect(d.info).toEqual([
      { label: 'Hari/ Tanggal', value: 'Rabu, 14 Januari 2026' }, { label: 'Jam', value: '14.00 WIT s.d. Selesai' },
      { label: 'Agenda', value: 'Monev Penempatan Pegawai' }, { label: 'Tempat', value: 'Aula PTA' },
    ])
    expect(d.title).toBe('DAFTAR HADIR PEGAWAI')
    expect(d.kop).toBe(kop)
    expect(build({ agenda: ' Rapat Khusus ', place: 'Zoom' })[0].info.slice(2)).toEqual([{ label: 'Agenda', value: 'Rapat Khusus' }, { label: 'Tempat', value: 'Zoom' }])
  })
  it('tabel NO / NAMA / JABATAN / TANDA TANGAN, bernomor, mengikuti urutan satker', () => {
    const [d] = build()
    expect(d.head).toEqual(['NO', 'NAMA', 'JABATAN', 'TANDA TANGAN'])
    expect(d.rows.map((r) => r.cells)).toEqual([['1', 'Nama a', 'Wakil Ketua'], ['2', 'Nama b', ''], ['3', 'Nama c', 'Hakim Tinggi'], ['4', 'Nama d', 'Panitera']])
    expect(d.widths.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
  })
  it('kolom NIP opsional', () => {
    const [d] = build({ showNip: true })
    expect(d.head).toEqual(['NO', 'NAMA', 'NIP', 'JABATAN', 'TANDA TANGAN'])
    expect(d.rows[0].cells).toEqual(['1', 'Nama a', 'nip-a', 'Wakil Ketua'])
    expect(d.widths.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
  })
  it('QR hanya untuk hadir/terlambat berkode, dan hanya bila qrBase diisi', () => {
    const atts = [A('a', 'hadir', '1'.repeat(32)), A('b', 'izin', '2'.repeat(32)), A('c', 'terlambat', '3'.repeat(32))]
    const [d] = build({ qrBase: 'https://x.id' }, atts)
    expect(d.rows.map((r) => r.sign)).toEqual([`https://x.id/v/${'1'.repeat(32)}`, null, `https://x.id/v/${'3'.repeat(32)}`, null])
    expect(d.footnote).toMatch(/Tanda tangan elektronik/)
    const [plain] = build({}, atts)
    expect(plain.rows.every((r) => r.sign === null)).toBe(true); expect(plain.footnote).toBeUndefined()
  })
  it('filter jenis dan tanda tangan koordinator/petugas', () => {
    const [d] = build({ roles: ['peserta'], coordinator: ' Dr. Sirajuddin ', officer: 'Meilawati' })
    expect(d.rows).toHaveLength(3)
    expect(d.sign).toEqual({ caption: 'Mengetahui', left: { caption: 'Koordinator Absen,', name: 'Dr. Sirajuddin' }, right: { caption: 'Petugas Absen', name: 'Meilawati' } })
  })
  it('satu dokumen per sesi terpilih', () => {
    const s2 = S({ id: 's2', title: 'Hari 2', start_at: '2026-01-15T05:00:00Z', end_at: '2026-01-15T08:00:00Z' })
    const docs = build({ sessionIds: ['s1', 's2', 'tidak-ada'] }, [], [S(), s2])
    expect(docs).toHaveLength(2)
    expect(docs[1].info[0].value).toBe('Kamis, 15 Januari 2026')
  })
})
