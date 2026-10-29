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
  it('mendeteksi pemisah, header, dan duplikat', () => {
    const r = parseParticipants('Nama\tNIP\tInstansi\nBudi\t1\tDinas A\nSiti\t2\tDinas B\nBudi Lain\t1\tX')
    expect(r.items.map((i) => i.name)).toEqual(['Budi', 'Siti'])
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]).toMatch(/duplikat/)
  })
  it('menolak email tidak valid, menerima baris minimal hanya nama', () => {
    const r = parseParticipants('Andi\nBudi, 1, X, bukan-email')
    expect(r.items).toEqual([{ name: 'Andi', identifier: null, institution: null, email: null, phone: null }])
    expect(r.errors[0]).toMatch(/email/)
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
