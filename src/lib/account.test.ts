import { describe, expect, it } from 'vitest'
import { isValidUsername, looksLikeEmail, normalizeUsername } from './account'
import { groupPhotos } from './galleryApi'
import { detectPlatform } from './pwa'
import { fmtCount } from './siteApi'

describe('nama pengguna', () => {
  it('normalisasi dan validasi', () => {
    expect(normalizeUsername('  Budi.Santoso ')).toBe('budi.santoso')
    expect(isValidUsername('Budi.Santoso')).toBe(true)
    expect(isValidUsername('a_b-c.9')).toBe(true)
    expect(isValidUsername('ab')).toBe(false)
    expect(isValidUsername('a'.repeat(31))).toBe(false)
    expect(isValidUsername('budi santoso')).toBe(false)
    expect(isValidUsername('budi@pta')).toBe(false)
  })
  it('looksLikeEmail', () => {
    expect(looksLikeEmail('a@b.id')).toBe(true)
    expect(looksLikeEmail('budi')).toBe(false)
  })
})

describe('galeri', () => {
  const P = (id: string, album: string | null) => ({ id, path: id + '.jpg', caption: null, album, taken_on: null })
  it('groupPhotos: per album abjad, tanpa album terakhir, urutan foto dipertahankan', () => {
    const g = groupPhotos([P('1', 'Hari 2'), P('2', null), P('3', 'Hari 1'), P('4', 'Hari 2')])
    expect(g.map((x) => x.album)).toEqual(['Hari 1', 'Hari 2', 'Foto kegiatan'])
    expect(g[1].photos.map((p) => p.id)).toEqual(['1', '4'])
  })
})

describe('PWA dan statistik', () => {
  it('detectPlatform', () => {
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 5)).toBe('ios')
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe('ios')   // iPadOS
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe('desktop')
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8)', 5)).toBe('android')
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 0)).toBe('desktop')
  })
  it('fmtCount memakai pemisah ribuan Indonesia', () => {
    expect(fmtCount(1234567)).toBe('1.234.567')
  })
})
