import { describe, expect, it } from 'vitest'
import { certDownloadName, coreName, fmtBytes, matchFile, matchFiles, sniffType, type PersonLite } from './certificates'

const people: PersonLite[] = [
  { id: 'budi', name: 'Dr. Budi Santoso, S.Pd., M.Si.', identifier: '198001012005011001' },
  { id: 'siti', name: 'Siti Aminah, S.E.', identifier: '19850315 201001 2 002' },
  { id: 'ridwan', name: 'Prof. Dr. Ir. Mochamad Ridwan Hidayatullah, M.Sc., Ph.D.', identifier: null },
  { id: 'andi1', name: 'Andi Wijaya, S.T.', identifier: '1' },
  { id: 'andi2', name: 'Andi Wijaya, M.M.', identifier: '2' },
  { id: 'rina', name: 'Rina Marlina S.Kom', identifier: null }, // tanpa koma
]

describe('coreName', () => {
  it('membuang gelar depan dan belakang', () => {
    expect(coreName('Prof. Dr. Ir. Budi Santoso, S.T., M.Sc.')).toBe('budi santoso')
    expect(coreName('Hj. Dewi Lestari, S.H.')).toBe('dewi lestari')
    expect(coreName('Rina Marlina S.Kom')).toBe('rina marlina')
    expect(coreName('Dr')).toBe('dr') // hanya satu kata: jangan dikosongkan
  })
})

describe('matchFile', () => {
  it('NIP persis, juga bila ditulis berspasi/titik atau diberi tambahan kata', () => {
    expect(matchFile('198001012005011001.pdf', people)).toMatchObject({ personId: 'budi', confidence: 'nip' })
    expect(matchFile('Sertifikat_19850315 201001 2 002.pdf', people)).toMatchObject({ personId: 'siti', confidence: 'nip' })
    expect(matchFile('19850315.201001.2.002 - Siti.pdf', people)).toMatchObject({ personId: 'siti', confidence: 'nip' })
  })

  it('nama persis (abaikan gelar, huruf besar, kata "sertifikat", angka urut)', () => {
    expect(matchFile('Sertifikat - Budi Santoso.pdf', people)).toMatchObject({ personId: 'budi', confidence: 'nama' })
    expect(matchFile('siti_aminah_01.PDF', people)).toMatchObject({ personId: 'siti', confidence: 'nama' })
    expect(matchFile('Rina Marlina.png', people)).toMatchObject({ personId: 'rina', confidence: 'nama' })
    // garis bawah sebagai pemisah kata (sangat umum pada nama berkas)
    expect(matchFile('Sertifikat_Budi_Santoso.pdf', people)).toMatchObject({ personId: 'budi', confidence: 'nama' })
    expect(matchFile('Sertifikat_Andi Wijaya_01.pdf', [people[3]])).toMatchObject({ personId: 'andi1', confidence: 'nama' })
  })

  it('nama mirip (sebagian kata, minimal 2 kata) ditandai "mirip"', () => {
    expect(matchFile('Mochamad Ridwan.pdf', people)).toMatchObject({ personId: 'ridwan', confidence: 'mirip' })
  })

  it('satu kata tidak cukup; nama kembar dianggap ambigu; tidak dikenal = tanpa pasangan', () => {
    expect(matchFile('Budi.pdf', people)).toMatchObject({ personId: null, ambiguous: false })
    expect(matchFile('Andi Wijaya.pdf', people)).toMatchObject({ personId: null, ambiguous: true })
    expect(matchFile('Orang Asing.pdf', people)).toMatchObject({ personId: null, ambiguous: false })
  })

  it('NIP pendek (< 8 digit) tidak dipakai mencocokkan', () => {
    expect(matchFile('1.pdf', people).personId).toBeNull()
  })
})

describe('matchFiles', () => {
  it('orang yang sama hanya diberikan ke satu berkas; berikutnya duplikat', () => {
    const r = matchFiles(['Budi Santoso.pdf', '198001012005011001.pdf', 'Siti Aminah.pdf'], people)
    expect(r[0]).toMatchObject({ personId: 'budi', duplicate: false })
    expect(r[1]).toMatchObject({ personId: null, duplicate: true })
    expect(r[2]).toMatchObject({ personId: 'siti' })
  })
})

describe('berkas', () => {
  it('sniffType membaca isi berkas, bukan ekstensi', async () => {
    const pdf = new Blob([new TextEncoder().encode('%PDF-1.7\n...')])
    const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])])
    const jpg = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])])
    expect(await sniffType(pdf)).toBe('application/pdf')
    expect(await sniffType(png)).toBe('image/png')
    expect(await sniffType(jpg)).toBe('image/jpeg')
    expect(await sniffType(new Blob(['MZ-bukan-sertifikat.exe']))).toBeNull()
    expect(await sniffType(new Blob([]))).toBeNull()
  })

  it('nama unduhan aman dan ukuran terbaca', () => {
    expect(certDownloadName('Dr. Budi/Santoso: S.Pd.', 'application/pdf', 'x.pdf')).toBe('Sertifikat - Dr. Budi Santoso S.Pd..pdf')
    expect(certDownloadName('', null, 'scan.JPG')).toBe('Sertifikat - peserta.JPG')
    expect(fmtBytes(500)).toBe('1 KB')
    expect(fmtBytes(2.5 * 1024 * 1024)).toBe('2.5 MB')
  })
})
