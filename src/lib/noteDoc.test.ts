import { describe, expect, it } from 'vitest'
import { buildNoteDoc, kopFromSettings, noteFileName, timeRange, whenParts } from './noteDoc'
import { SAMPLE_KOP, SAMPLE_NOTE } from './noteFixture'

const TZ = 'Asia/Jayapura'

describe('waktu notula', () => {
  it('hari, tanggal, dan jam pada zona Indonesia', () => {
    expect(whenParts('2026-10-26T01:00:00.000Z', TZ)).toEqual({ day: 'Senin', date: '26 Oktober 2026', time: '10.00', zone: 'WIT' })
    expect(whenParts('2026-10-26T01:30:00.000Z', 'Asia/Jakarta').time).toBe('08.30')
    expect(whenParts('2026-10-26T01:30:00.000Z', 'Asia/Jakarta').zone).toBe('WIB')
  })
  it('pukul "s.d. selesai" atau jam selesai', () => {
    expect(timeRange('2026-10-26T01:00:00.000Z', '', TZ)).toBe('10.00 WIT s.d. selesai')
    expect(timeRange('2026-10-26T01:00:00.000Z', 'selesai', TZ)).toBe('10.00 WIT s.d. selesai')
    expect(timeRange('2026-10-26T01:00:00.000Z', '12:00', TZ)).toBe('10.00 WIT s.d. 12.00 WIT')
    expect(timeRange('2026-10-26T01:00:00.000Z', '12.30', TZ)).toBe('10.00 WIT s.d. 12.30 WIT')
  })
})

describe('buildNoteDoc', () => {
  const d = buildNoteDoc(SAMPLE_NOTE, SAMPLE_KOP, TZ)
  const labels = d.header.map((h) => h.label)

  it('baris keterangan berurutan seperti format notula', () => {
    expect(labels).toEqual(['Dasar', 'Hari', 'Tanggal', 'Pukul', 'Tempat', 'Acara', 'Pimpinan Rapat', 'Notulis', 'Peserta Rapat'])
    const v = Object.fromEntries(d.header.map((h) => [h.label, h.value]))
    expect(v.Hari).toBe('Senin'); expect(v.Tanggal).toBe('26 Oktober 2026'); expect(v.Pukul).toBe('10.00 WIT s.d. selesai')
    expect(v['Pimpinan Rapat']).toBe('Helmi Ashari, S.H. (Ketua Organizing Committee)')
  })
  it('isian kosong tidak muncul', () => {
    const e = buildNoteDoc({ follow_ups: [], held_at: null }, { title: [], address: [] }, TZ)
    expect(e.header).toEqual([]); expect(e.blocks).toEqual([]); expect(e.signature).toBeNull()
  })
  it('bagian diberi huruf A, B, C … dan diawali "Jalannya Rapat:"', () => {
    const heads = d.blocks.filter((b) => b.t === 'heading').map((b) => (b as { text: string }).text)
    expect(heads[0]).toBe('Jalannya Rapat:')
    expect(heads.slice(1)).toEqual(['A. Pembukaan', 'B. Pengarahan Ketua Pengadilan Tinggi Agama Maluku Utara', 'C. Tanggapan dan Masukan Peserta Rapat', 'D. Arahan Penutup Ketua Pengadilan Tinggi Agama Maluku Utara', 'E. Kesimpulan dan Rencana Tindak Lanjut', 'F. Penutup'])
  })
  it('butir: judul tebal + isi; anak butir a, b, c; butir berjudul beranak menjadi baris tebal', () => {
    const items = d.blocks.filter((b) => b.t === 'item') as { marker: string; runs: { text: string; bold?: boolean }[]; level: number }[]
    const struktur = items.find((i) => i.runs[0].text.startsWith('Struktur'))!
    expect(struktur.marker).toBe('1.')
    expect(struktur.runs[0]).toEqual({ text: 'Struktur kepanitiaan.', bold: true })
    expect(struktur.runs[1].bold).toBeUndefined()
    const wakil = items.find((i) => i.runs[0].text.startsWith('Wakil Ketua'))!
    expect(wakil.runs).toHaveLength(1); expect(wakil.runs[0].bold).toBe(true)
    const subs = items.filter((i) => i.level === 1).map((i) => i.marker)
    expect(subs.slice(0, 2)).toEqual(['a.', 'b.'])
  })
  it('tabel tindak lanjut bernomor; kolom Tenggat hanya bila ada yang diisi', () => {
    const t = d.blocks.find((b) => b.t === 'table') as { head: string[]; rows: string[][] }
    expect(t.head).toEqual(['No', 'Rencana Tindak Lanjut', 'Penanggung Jawab'])
    expect(t.rows[1]).toEqual(['2', 'Memastikan tanggal pelaksanaan Bimtek kepada Direktorat Jenderal Badan Peradilan Agama', 'Steering Committee dan Ketua OC'])
    const withDue = buildNoteDoc({ ...SAMPLE_NOTE, follow_ups: [{ id: 'x', task: 'A', pic: '', due: '2026-11-02', done: false }] }, SAMPLE_KOP, TZ)
    const t2 = withDue.blocks.find((b) => b.t === 'table') as { head: string[]; rows: string[][] }
    expect(t2.head[3]).toBe('Tenggat'); expect(t2.rows[0]).toEqual(['1', 'A', '-', '2 November 2026'])
  })
  it('tanda tangan: notulis di kiri, pimpinan (mengetahui) di kanan, beserta NIP', () => {
    expect(d.signature).toEqual({
      left: { caption: ['Notulis'], name: 'Ramadhan Chairil Yustihan, S.T.', nip: 'NIP. 199602022025061013' },
      right: { caption: ['Mengetahui,', 'Ketua Organizing Committee,'], name: 'Helmi Ashari, S.H.', nip: 'NIP. 196806051992031004' },
    })
  })
  it('notula lama (tanpa bagian) diturunkan dari pembahasan, keputusan, dan tindak lanjut', () => {
    const old = buildNoteDoc({ follow_ups: [{ id: '1', task: 'Kirim laporan', pic: 'Budi', due: '', done: false }], discussion: 'Paragraf satu.\n\nParagraf dua.', decisions: '1. Setuju\n2. Lanjut', sections: [] }, { title: [], address: [] }, TZ)
    const heads = old.blocks.filter((b) => b.t === 'heading').map((b) => (b as { text: string }).text)
    expect(heads).toEqual(['Jalannya Rapat:', 'A. Pembahasan', 'B. Keputusan dan Kesimpulan', 'C. Rencana Tindak Lanjut'])
    expect(old.blocks.filter((b) => b.t === 'item')).toHaveLength(4)
    expect(old.blocks.some((b) => b.t === 'table')).toBe(true)
  })
})

describe('kop dan nama berkas', () => {
  const base = { kop_title: null, kop_address: null, org_name: null, address: null, phone: null, email: null, website: null }
  it('kop memakai isian kop; bila kosong memakai nama instansi dan kontak', () => {
    expect(kopFromSettings({ ...base, kop_title: 'A\n\n B ', kop_address: 'Jl. X' })).toEqual({ title: ['A', 'B'], address: ['Jl. X'] })
    expect(kopFromSettings({ ...base, org_name: 'PTA Malut', address: 'Sofifi', phone: '0921', email: 'a@b.id', website: 'pta.go.id' })).toEqual({ title: ['PTA Malut'], address: ['Sofifi', 'Telp. 0921, a@b.id', 'pta.go.id'] })
    expect(kopFromSettings(base)).toEqual({ title: [], address: [] })
  })
  it('nama berkas aman', () => {
    expect(noteFileName('Rapat Panitia: Bimtek CPP / 2026!', 'pdf')).toBe('notula-rapat-panitia-bimtek-cpp-2026.pdf')
    expect(noteFileName('', 'docx')).toBe('notula-rapat.docx')
    expect(noteFileName('Évaluasi Ünit', 'docx')).toBe('notula-evaluasi-unit.docx')
  })
})

describe('tebal di tengah kalimat', () => {
  it('**…** menjadi tebal; tanda yang tidak berpasangan dibiarkan', async () => {
    const { inlineRuns } = await import('./noteDoc')
    expect(inlineRuns('Pada **hari Kamis**, lanjut')).toEqual([{ text: 'Pada ' }, { text: 'hari Kamis', bold: true }, { text: ', lanjut' }])
    expect(inlineRuns('Tanpa tanda')).toEqual([{ text: 'Tanpa tanda' }])
    expect(inlineRuns('Ada ** sendirian')).toEqual([{ text: 'Ada ** sendirian' }])
    expect(inlineRuns('**a** dan **b** lalu ** c')).toEqual([{ text: 'a', bold: true }, { text: ' dan ' }, { text: 'b', bold: true }, { text: ' lalu ** c' }])
  })
})
