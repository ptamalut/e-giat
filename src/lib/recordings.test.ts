import { describe, expect, it } from 'vitest'
import { baseMime, cleanRecordings, extOfMime, nextRecordingNumber, pickRecorderMime, recordingFileName, droppedPaths, micErrorText, randomRecordingPath } from './recordings'

const R = (file_name: string, over: Record<string, unknown> = {}) => ({ id: file_name, path: 'a/b.webm', file_name, mime: 'audio/webm', size: 1000.4, duration: 59.6, created_at: '', transcript: '  teks  ', ...over })

describe('rekaman suara', () => {
  it('format perekam: pertama yang didukung', () => {
    expect(pickRecorderMime((m) => m === 'audio/webm')).toBe('audio/webm')
    expect(pickRecorderMime((m) => m.startsWith('audio/webm'))).toBe('audio/webm;codecs=opus')
    expect(pickRecorderMime((m) => m === 'audio/mp4')).toBe('audio/mp4')
    expect(pickRecorderMime(() => false)).toBeNull()
  })
  it('tipe dasar dan ekstensi', () => {
    expect(baseMime('audio/webm;codecs=opus')).toBe('audio/webm')
    expect(extOfMime('audio/webm;codecs=opus')).toBe('webm'); expect(extOfMime('audio/ogg;codecs=opus')).toBe('ogg')
    expect(extOfMime('audio/mp4')).toBe('m4a'); expect(extOfMime('audio/mpeg')).toBe('mp3'); expect(extOfMime('audio/wav')).toBe('wav'); expect(extOfMime('')).toBe('webm')
  })
  it('nama dan nomor rekaman', () => {
    expect(recordingFileName(2, new Date(2026, 10, 10, 14, 5), 'webm')).toBe('Rekaman 2 - 10-11-2026 14.05.webm')
    expect(nextRecordingNumber([])).toBe(1)
    expect(nextRecordingNumber([R('Rekaman 1 - x.webm'), R('Rekaman 3 - y.webm'), R('lain.webm')])).toBe(4)
  })
  it('pembersihan daftar', () => {
    const out = cleanRecordings([R('a.webm'), R('b.webm', { path: '' })])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ size: 1000, duration: 60, transcript: 'teks' })
  })
})

describe('rekaman: izin mikrofon, path, pembersihan', () => {
  it('pesan kegagalan mikrofon sesuai jenis error', () => {
    expect(micErrorText({ name: 'NotAllowedError' })).toMatch(/Izin mikrofon ditolak/)
    expect(micErrorText({ name: 'NotFoundError' })).toMatch(/tidak ditemukan/)
    expect(micErrorText({ name: 'NotReadableError' })).toMatch(/dipakai aplikasi lain/)
    expect(micErrorText(null)).toMatch(/tidak bisa dimulai/)
  })
  it('path acak cocok dengan pola yang diterima server dan tidak berulang', () => {
    const a = randomRecordingPath('11111111-2222-3333-4444-555555555555', 'webm')
    expect(a).toMatch(/^11111111-2222-3333-4444-555555555555\/[0-9a-f]{32}\.webm$/)
    expect(randomRecordingPath('x', 'webm')).not.toBe(randomRecordingPath('x', 'webm'))
  })
  it('path yang dibuang = ada sebelumnya, tidak ada lagi sesudahnya', () => {
    const r = (path: string) => ({ path })
    expect(droppedPaths(new Set(['a', 'b', 'c']), [r('b')])).toEqual(['a', 'c'])
    expect(droppedPaths(new Set(), [r('b')])).toEqual([])
  })
})
