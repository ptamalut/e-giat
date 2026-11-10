// @vitest-environment node
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { exportHadirDocx } from './exportHadir'
import { exportHadirPdf } from './exportHadirPdf'
import type { NoteLogo } from './exportNote'
import { buildHadirDocs, type HadirOptions } from './hadirDoc'
import type { Attendance, AttendanceSession, Participant } from './types'

function png(w: number, h: number): Uint8Array {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = (b: Uint8Array) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const u32 = (n: number) => Uint8Array.of(n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255)
  const chunk = (type: string, data: Uint8Array) => { const body = Uint8Array.from([...Array.from(type, (c) => c.charCodeAt(0)), ...data]); return Uint8Array.from([...u32(data.length), ...body, ...u32(crc(body))]) }
  const raw = new Uint8Array(h * (1 + w * 3))
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (1 + w * 3) + 1 + x * 3; raw[o] = 14; raw[o + 1] = 122; raw[o + 2] = 69 }
  return Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, ...chunk('IHDR', Uint8Array.from([...u32(w), ...u32(h), 8, 2, 0, 0, 0])), ...chunk('IDAT', deflateSync(raw)), ...chunk('IEND', new Uint8Array())])
}
const LOGO: NoteLogo = { w: 20, h: 20, data: png(20, 20) }
const NAMES: [string, string][] = [['Dr. Drs. Sirajuddin Sailellah, S.H.,M.H', 'Wakil Ketua'], ['Drs. H. Amir Husin, S.H.', 'Hakim Tinggi'], ['Drs. H. Qomaru Zaman, M.H.', 'Hakim Tinggi'], ['H. Jainudin Zaman, S.H., M.H', 'Panitera'], ['Ismail Difinubun, S.Ag., M.H.', 'Sekretaris'], ['Hj. Andi Wanci, S.Ag., M.H.', 'Panmud Hukum'], ['Dra. Gamaria Dodungo', 'Panmud Banding'], ['Kahpi Manilet, S.Ag.', 'Kabag Umum Dan Keuangan'], ['Suhardhono, S.H.I., M.H.', 'Kabag Perencanaan dan Kepegawaian'], ['Zainudin Arsyad, S.H.I.', 'Kasubbag. Renprog. Dan Anggaran'], ['Nurzannah, S.E., M.H.', 'Kasubbag. Kepegawaian Dan TI'], ['Djulaiha Nahumarury, S.Pi., M.H.', 'Kasubbag. Tata Usaha Dan Rumah Tangga'], ['Ida Fitri, S.E., M,H.', 'Kasubbag. Keuangan Dan Pelaporan']]
const people: Participant[] = NAMES.map(([name, job], i) => ({ id: `p${i}`, activity_id: 'a', name, identifier: `1970${i}`, grade: null, job_title: job, institution: 'PTA Maluku Utara', email: null, phone: null, role: 'peserta', roles: ['peserta'], employee_id: null, access_attendance: true, access_materials: true, access_quiz: false, access_certificate: true, access_notes: false, access_documentation: false, sort_order: i, token: `t${i}`, created_at: '' }))
const session = { id: 's1', activity_id: 'a', title: 'Rapat', start_at: '2026-01-14T05:00:00Z', end_at: '2026-01-14T08:00:00Z', late_minutes: 15, require_selfie: false, require_location: false, custom_members: false } as AttendanceSession
const atts = people.slice(0, 9).map((p, i) => ({ id: p.id, activity_id: 'a', session_id: 's1', participant_id: p.id, status: 'hadir', checked_in_at: '', note: null, manual: false, sign_code: String(i).repeat(32) } as Attendance))
const opts: HadirOptions = { title: 'Daftar Hadir Pegawai', sessionIds: ['s1'], roles: ['peserta'], unit: '', agenda: 'Monitoring Dan Evaluasi Penempatan Pegawai PTA Maluku Utara', place: 'Aula Pengadilan Tinggi Agama Maluku Utara', coordinator: 'Dr. Drs. Sirajuddin Sailellah, S.H.,M.H', officer: 'Meilawati Lestari, S.H.', showNip: false, paper: 'F4', qrBase: 'https://laksana.example' }
const kop = { title: ['Mahkamah Agung Republik Indonesia', 'Direktorat Jenderal Badan Peradilan Agama', 'Pengadilan Tinggi Agama Maluku Utara'], address: ['Jalan Raya Km. 40, Sofifi, Maluku Utara 0921 6121929,', 'Website : www.pta-malut.go.id Email : ptamalut@gmail.com'] }
const docs = buildHadirDocs({ name: 'Monev', location: 'Aula' }, people, [session], atts, [], null, kop, opts, 'Asia/Jayapura')
const OUT = process.env.NOTE_OUT

describe('ekspor daftar hadir resmi', () => {
  it('Word: kop, judul, keterangan, tabel, QR, dan tanda tangan', async () => {
    const bytes = new Uint8Array(await (await exportHadirDocx(docs, LOGO)).arrayBuffer())
    if (OUT) writeFileSync(`${OUT}/hadir-resmi.docx`, bytes)
    const zip = unzipSync(bytes)
    const xml = strFromU8(zip['word/document.xml'])
    for (const s of ['MAHKAMAH AGUNG REPUBLIK INDONESIA', 'DAFTAR HADIR PEGAWAI', 'Hari/ Tanggal', 'Rabu, 14 Januari 2026', '14.00 WIT s.d. Selesai', 'Monitoring Dan Evaluasi', 'TANDA TANGAN', 'Wakil Ketua', 'Mengetahui', 'Koordinator Absen,', 'Petugas Absen', 'Meilawati Lestari, S.H.', 'Tanda tangan elektronik']) expect(xml, s).toContain(s)
    expect(Object.keys(zip).filter((f) => f.startsWith('word/media/')).length).toBe(1 + 9)        // logo + 9 QR
  })
  it('PDF: dokumen F4 dengan gambar QR dan logo', async () => {
    const bytes = new Uint8Array(await (await exportHadirPdf(docs, LOGO)).arrayBuffer())
    if (OUT) writeFileSync(`${OUT}/hadir-resmi.pdf`, bytes)
    const text = new TextDecoder('latin1').decode(bytes)
    expect(text.startsWith('%PDF-')).toBe(true)
    expect((text.match(/\/Subtype\s*\/Image/g) ?? []).length).toBeGreaterThanOrEqual(10)
    expect(text).toMatch(/MediaBox\s*\[0\s+0\s+609\.\d+\s+935\.\d+\]/)   // 215 × 330 mm
  })
  it('tanpa logo, tanpa kop, tanpa QR, dan tanpa nama tanda tangan tetap jadi', async () => {
    const bare = buildHadirDocs({ name: 'K', location: null }, people, [session], [], [], null, { title: [], address: [] }, { ...opts, qrBase: undefined, coordinator: '', officer: '', showNip: true, paper: 'A4' })
    const w = unzipSync(new Uint8Array(await (await exportHadirDocx(bare, null)).arrayBuffer()))
    expect(Object.keys(w).some((f) => f.startsWith('word/media/'))).toBe(false)
    const p = new Uint8Array(await (await exportHadirPdf(bare, null)).arrayBuffer())
    expect(String.fromCharCode(...p.slice(0, 5))).toBe('%PDF-')
  })
})
