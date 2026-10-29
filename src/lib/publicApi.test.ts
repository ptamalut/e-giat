import { describe, expect, it } from 'vitest'
import { cleanNip, findMessage } from './publicApi'

describe('halaman depan', () => {
  it('cleanNip membuang spasi, titik, dan strip', () => {
    expect(cleanNip(' 1980 0101-2005.0110 01 ')).toBe('198001012005011001')
  })
  it('findMessage: kosong untuk berhasil, pesan berbeda untuk tidak ditemukan dan diblokir', () => {
    expect(findMessage({ token: 'abc' })).toBeNull()
    expect(findMessage({ found: false })).toMatch(/tidak ditemukan/i)
    expect(findMessage({ blocked: true })).toMatch(/terlalu banyak/i)
  })
})
