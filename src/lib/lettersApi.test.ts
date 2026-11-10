import { describe, expect, it } from 'vitest'
import { checkLetterFile, emptyLetter, hasLetterText, letterSummary, randomLetterPath } from './lettersApi'

describe('dasar surat', () => {
  it('checkLetterFile: PDF/gambar, maksimal 10 MB', () => {
    expect(checkLetterFile({ type: 'application/pdf', size: 1000 })).toBeNull()
    expect(checkLetterFile({ type: 'image/png', size: 1000 })).toBeNull()
    expect(checkLetterFile({ type: 'application/msword', size: 1000 })).toMatch(/PDF atau gambar/)
    expect(checkLetterFile({ type: 'application/pdf', size: 11 * 1024 * 1024 })).toMatch(/10 MB/)
  })
  it('randomLetterPath: folder kegiatan, nama acak, ekstensi sesuai jenis', () => {
    const p = randomLetterPath('aaaa', { type: 'application/pdf', name: 'Surat Undangan.pdf' })
    expect(p).toMatch(/^aaaa\/[0-9a-f]{32}\.pdf$/)
    expect(randomLetterPath('x', { type: 'image/webp', name: 'a' })).toMatch(/\.webp$/)
  })
  it('hasLetterText: kosong bila semua isian kosong', () => {
    expect(hasLetterText(emptyLetter())).toBe(false)
    expect(hasLetterText({ ...emptyLetter(), number: ' 12 ' })).toBe(true)
  })
  it('letterSummary menggabungkan bagian yang terisi', () => {
    expect(letterSummary({ issuer: 'Ketua PTA', number: '12/X', letter_date: '2026-11-01', subject: 'Undangan' }, (d) => d)).toBe('Ketua PTA, Nomor 12/X, tanggal 2026-11-01, perihal Undangan')
    expect(letterSummary({ issuer: null, number: '12/X', letter_date: null, subject: null }, (d) => d)).toBe('Nomor 12/X')
  })
})
