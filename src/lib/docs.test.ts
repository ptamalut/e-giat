import { describe, expect, it } from 'vitest'
import { DEFAULT_ALBUM, groupByAlbum, normalizeUrl } from './docs'
import type { DocItem } from './types'

const D = (id: string, album: string | null, taken: string | null, up = '2026-01-01T00:00:00Z'): DocItem => ({
  id, activity_id: 'a', kind: 'foto', storage_path: id, file_name: id, mime_type: 'image/jpeg', size_bytes: 1, url: null, title: null, caption: null, album, taken_on: taken, uploaded_at: up,
})

describe('dokumentasi', () => {
  it('normalizeUrl menerima http(s) dan menambah https bila tanpa skema, menolak skema lain', () => {
    expect(normalizeUrl('drive.google.com/x')).toBe('https://drive.google.com/x')
    expect(normalizeUrl('http://a.id/b')).toBe('http://a.id/b')
    expect(normalizeUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeUrl('ftp://a.id')).toBeNull()
    expect(normalizeUrl('  ')).toBeNull()
  })
  it('groupByAlbum: abjad, "Umum" terakhir, terbaru dulu di dalam album', () => {
    const g = groupByAlbum([D('1', 'Hari 2', '2026-01-02'), D('2', null, '2026-01-05'), D('3', 'Hari 1', '2026-01-01'), D('4', 'Hari 1', '2026-01-03'), D('5', '  ', null)])
    expect(g.map((x) => x.album)).toEqual(['Hari 1', 'Hari 2', DEFAULT_ALBUM])
    expect(g[0].items.map((x) => x.id)).toEqual(['4', '3'])
    expect(g[2].items).toHaveLength(2)
  })
})
