import { describe, expect, it } from 'vitest'
import { activityDays, basisFromLetters, dayLabel, joinLocal, letterLine, mergePeople, personKey, splitLocal } from './noteDefaults'
import { attendeeLines, buildNoteDoc } from './noteDoc'

const L = (o: Partial<{ issuer: string; number: string; letter_date: string; subject: string }> = {}) => ({ issuer: null, number: null, letter_date: null, subject: null, ...o })

describe('Dasar dari surat kegiatan', () => {
  it('satu surat: kalimat tanpa nomor urut; bagian kosong dilewati', () => {
    expect(basisFromLetters([L({ issuer: 'Ketua PTA', number: '1598/KPTA/2026', letter_date: '2026-10-23', subject: 'Undangan Rapat' })]))
      .toBe('Surat Ketua PTA Nomor 1598/KPTA/2026 tanggal 23 Oktober 2026 perihal Undangan Rapat')
    expect(letterLine(L({ number: '12/X' }))).toBe('Surat Nomor 12/X')
    expect(letterLine(L({ subject: ' Rapat ' }))).toBe('Surat perihal Rapat')
  })
  it('beberapa surat: bernomor satu per baris; surat kosong diabaikan', () => {
    expect(basisFromLetters([L({ number: 'A' }), L(), L({ number: 'B' })])).toBe('1. Surat Nomor A\n2. Surat Nomor B')
    expect(basisFromLetters([])).toBe('')
    expect(basisFromLetters([L()])).toBe('')
  })
})

describe('tanggal kegiatan', () => {
  it('hari-hari pelaksanaan dari tanggal mulai sampai selesai', () => {
    expect(activityDays('2026-10-26', '2026-10-28')).toEqual(['2026-10-26', '2026-10-27', '2026-10-28'])
    expect(activityDays('2026-10-30', '2026-11-01')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01'])   // lintas bulan
    expect(activityDays('2026-10-26', null)).toEqual(['2026-10-26'])
    expect(activityDays(null, '2026-10-26')).toEqual(['2026-10-26'])
    expect(activityDays(null, null)).toEqual([])
    expect(activityDays('2026-10-28', '2026-10-26')).toEqual(['2026-10-28'])           // selesai sebelum mulai: satu hari
    expect(activityDays('2026-01-01', '2027-12-31', 5)).toHaveLength(5)
  })
  it('label hari dan pemisah tanggal-jam', () => {
    expect(dayLabel('2026-10-26')).toBe('Senin, 26 Oktober 2026')
    expect(splitLocal('2026-10-26T09:30')).toEqual({ day: '2026-10-26', time: '09:30' })
    expect(splitLocal('')).toEqual({ day: '', time: '' })
    expect(joinLocal('2026-10-26', '')).toBe('2026-10-26T09:00')
    expect(joinLocal('', '10:00')).toBe('')
  })
})

describe('peserta rapat', () => {
  const P = (name: string, nip: string | null = null, job: string | null = null) => ({ name, nip, job_title: job, institution: null })
  it('mergePeople tanpa duplikat dan mempertahankan urutan', () => {
    const base = [P('Budi', '1')]
    const out = mergePeople(base, [P('budi', '1'), P(' Siti ', null, ' Staf '), P('Siti'), P('  ')])
    expect(out.map((p) => p.name)).toEqual(['Budi', 'Siti'])
    expect(out[1].job_title).toBe('Staf')
    expect(personKey(P('Budi ', '1'))).toBe(personKey(P('budi', '1')))
  })
  it('dokumen: peserta terpilih tampil bernomor; tanpa daftar memakai teks lama', () => {
    expect(attendeeLines([P('Budi', '1', 'Ketua'), P('Siti')])).toBe('1. Budi – Ketua\n2. Siti')
    expect(attendeeLines([])).toBe('')
    const d = buildNoteDoc({ follow_ups: [], held_at: null, attendee_list: [P('Budi'), P('Siti')], attendees: 'teks lama' }, { title: [], address: [] })
    expect(d.header.find((h) => h.label === 'Peserta Rapat')?.value).toBe('1. Budi\n2. Siti')
    const old = buildNoteDoc({ follow_ups: [], held_at: null, attendee_list: [], attendees: 'teks lama' }, { title: [], address: [] })
    expect(old.header.find((h) => h.label === 'Peserta Rapat')?.value).toBe('teks lama')
  })
})
