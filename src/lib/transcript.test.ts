import { describe, expect, it } from 'vitest'
import { appendBlock, appendLines, buildTranscript, parseDue, parsePic, splitSentences, suggestFromTranscript, tidySegment } from './transcript'

const REF = new Date(2026, 10, 9) // 9 November 2026

describe('transkrip rapat', () => {
  it('tidySegment: kapital di awal dan titik di akhir', () => {
    expect(tidySegment('  selamat pagi   bapak ibu ')).toBe('Selamat pagi bapak ibu.')
    expect(tidySegment('apakah sudah siap?')).toBe('Apakah sudah siap?')
    expect(tidySegment('   ')).toBe('')
  })
  it('buildTranscript: jeda panjang memulai paragraf baru', () => {
    const t = buildTranscript([{ text: 'halo semua', at: 1000 }, { text: 'kita mulai', at: 3000 }, { text: 'agenda pertama', at: 20000 }])
    expect(t).toBe('Halo semua. Kita mulai.\n\nAgenda pertama.')
  })
  it('splitSentences', () => {
    expect(splitSentences('Satu kalimat. Dua kalimat? Ya!\nBaris baru')).toEqual(['Satu kalimat.', 'Dua kalimat?', 'Ya!', 'Baris baru'])
  })
  it('parseDue: tanggal, tahun depan bila sudah lewat, dan kata relatif', () => {
    expect(parseDue('paling lambat 15 November 2026', REF)).toBe('2026-11-15')
    expect(parseDue('selesai 20 Desember', REF)).toBe('2026-12-20')
    expect(parseDue('selesai 2 Maret', REF)).toBe('2027-03-02')
    expect(parseDue('dikirim besok', REF)).toBe('2026-11-10')
    expect(parseDue('minggu depan', REF)).toBe('2026-11-16')
    expect(parseDue('31 April', REF)).toBe('')
    expect(parseDue('tanpa tanggal', REF)).toBe('')
  })
  it('parsePic: sapaan/jabatan setelah kata pemicu, berhenti di kata sambung', () => {
    expect(parsePic('Laporan disiapkan oleh bapak budi santoso untuk dikirim')).toBe('Bapak Budi Santoso')
    expect(parsePic('Ditugaskan kepada bagian umum untuk menyiapkan ruangan')).toBe('Bagian Umum')
    expect(parsePic('PIC: Ibu Siti paling lambat besok')).toBe('Ibu Siti')
    expect(parsePic('Dikerjakan oleh semua orang')).toBe('')
  })
  it('suggestFromTranscript memisahkan keputusan dan tindak lanjut', () => {
    const text = [
      'Rapat membahas persiapan kegiatan hari pertama.',
      'Diputuskan kegiatan dimulai pukul delapan pagi.',
      'Ruangan ditugaskan kepada bagian umum paling lambat 12 November.',
      'Terima kasih.',
    ].join(' ')
    const s = suggestFromTranscript(text, REF)
    expect(s.agenda).toEqual(['Rapat membahas persiapan kegiatan hari pertama'])
    expect(s.decisions).toEqual(['Diputuskan kegiatan dimulai pukul delapan pagi'])
    expect(s.followUps).toEqual([{ task: 'Ruangan ditugaskan kepada bagian umum paling lambat 12 November', pic: 'Bagian Umum', due: '2026-11-12' }])
  })
  it('appendBlock dan appendLines', () => {
    expect(appendBlock('', ' baru ')).toBe('baru')
    expect(appendBlock('lama\n', 'baru')).toBe('lama\n\nbaru')
    expect(appendLines('', ['a', 'b'])).toBe('1. a\n2. b')
    expect(appendLines('1. x', ['y'])).toBe('1. x\n2. y')
  })
})
