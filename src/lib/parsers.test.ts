import { describe, expect, it } from 'vitest'
import { parseParticipants, parseQuestions, waNumber, QUESTION_FORMAT_HELP } from './parsers'

describe('parseQuestions', () => {
  it('membaca kunci dengan tanda * dan baris Kunci:, serta pembahasan', () => {
    const r = parseQuestions(QUESTION_FORMAT_HELP)
    expect(r.errors).toEqual([])
    expect(r.items).toHaveLength(2)
    expect(r.items[0]).toMatchObject({ text: 'Ibu kota Indonesia adalah...', options: ['Bandung', 'Jakarta', 'Surabaya'], correct_index: 1 })
    expect(r.items[0].explanation).toMatch(/ibu kota/)
    expect(r.items[1].correct_index).toBe(0)
  })

  it('melaporkan soal yang tidak valid tanpa menggagalkan soal lain', () => {
    const r = parseQuestions('1. Tanpa kunci\nA. x\nB. y\n\n2. Satu opsi\nA. x *\n\n3. OK\nA. x\nB. y *\n\n4. Kunci salah\nA. x\nB. y\nKunci: F')
    expect(r.items).toHaveLength(1)
    expect(r.errors).toHaveLength(3)
    expect(r.errors[0]).toMatch(/Soal ke-1.*kunci/i)
  })

  it('menggabungkan soal multi-baris dan menolak dua tanda *', () => {
    const ok = parseQuestions('Soal panjang\nlanjutan soal?\nA) satu\nB) dua *')
    expect(ok.items[0].text).toBe('Soal panjang lanjutan soal?')
    const bad = parseQuestions('Q\nA. x *\nB. y *')
    expect(bad.errors.join()).toMatch(/lebih dari satu/)
  })
})

describe('parseParticipants', () => {
  it('urutan bawaan: nama, NIP, pangkat/gol, jabatan, satuan kerja, WhatsApp (Tab dari Excel)', () => {
    const r = parseParticipants('Dr. Budi Santoso, M.Si.\t19800101 200501 1 001\tPembina (IV/a)\tKepala Bidang\tDinas Pendidikan\t081234567890')
    expect(r.errors).toEqual([])
    expect(r.items[0]).toEqual({
      name: 'Dr. Budi Santoso, M.Si.', identifier: '198001012005011001', grade: 'Pembina (IV/a)',
      job_title: 'Kepala Bidang', institution: 'Dinas Pendidikan', phone: '081234567890',
    })
  })

  it('membaca baris judul dan memetakan kolom sesuai namanya (urutan bebas, kolom asing diabaikan)', () => {
    const r = parseParticipants('No\tNo. WhatsApp\tNama Lengkap beserta Gelar\tNIP\tSatuan Kerja\tJabatan\tPangkat/Gol. Ruang\n1\t0812\tSiti, S.Pd.\t1985\tDinas B\tStaf\tPenata (III/c)')
    expect(r.errors).toEqual([])
    expect(r.items[0]).toMatchObject({ name: 'Siti, S.Pd.', identifier: '1985', phone: '0812', institution: 'Dinas B', job_title: 'Staf', grade: 'Penata (III/c)' })
  })

  it('titik koma dan tanda kutip menjaga koma pada gelar', () => {
    expect(parseParticipants('Andi, S.T., M.T.;1;III/a;Staf;Dinas;08').items[0].name).toBe('Andi, S.T., M.T.')
    const q = parseParticipants('"Rina, S.E., M.M.",2,III/b,Analis,Dinas C,08')
    expect(q.errors).toEqual([])
    expect(q.items[0]).toMatchObject({ name: 'Rina, S.E., M.M.', identifier: '2', grade: 'III/b' })
  })

  it('koma tanpa kutip yang membuat kolom berlebih dilaporkan, bukan diterima diam-diam', () => {
    const r = parseParticipants('Budi, S.Pd., M.Si., 1980, III/a, Staf, Dinas, 08')
    expect(r.items).toHaveLength(0)
    expect(r.errors[0]).toMatch(/kolom lebih dari 6/)
  })

  it('mendeteksi duplikat (NIP sama setelah spasi dibuang), NIP ilmiah, dan nama kosong', () => {
    const r = parseParticipants('A\t1980 01\nB\t198001\nC\t1.98E+17\n\t123')
    expect(r.items.map((i) => i.name)).toEqual(['A'])
    expect(r.errors).toHaveLength(3)
    expect(r.errors.join('|')).toMatch(/duplikat/)
    expect(r.errors.join('|')).toMatch(/angka ilmiah/)
    expect(r.errors.join('|')).toMatch(/nama kosong/)
  })

  it('baris minimal hanya nama diterima', () => {
    expect(parseParticipants('Andi').items).toEqual([{ name: 'Andi', identifier: null, grade: null, job_title: null, institution: null, phone: null }])
  })
})

describe('waNumber', () => {
  it('menormalkan nomor Indonesia', () => {
    expect(waNumber('0812-3456-7890')).toBe('6281234567890')
    expect(waNumber('+62 812 3456 7890')).toBe('6281234567890')
    expect(waNumber('812345678')).toBe('62812345678')
    expect(waNumber('12')).toBeNull()
    expect(waNumber(null)).toBeNull()
  })
})
