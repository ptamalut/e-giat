import type { DocItem } from './types'
import { fitSize } from './capture'

export const DOC_BUCKET = 'dokumentasi'
export const DEFAULT_ALBUM = 'Umum'

/** Path acak: <id kegiatan>/<32 hex>.jpg */
export const randomDocPath = (activityId: string) =>
  `${activityId}/${crypto.randomUUID().replace(/-/g, '')}.jpg`

/** Tautan hanya boleh http/https. Mengembalikan URL yang sudah dirapikan, atau null bila tidak valid. */
export function normalizeUrl(input: string): string | null {
  const v = input.trim()
  if (!v) return null
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null
  } catch { return null }
}

/** Kelompokkan per album (urutan abjad, "Umum" terakhir); item dalam album: tanggal terbaru dulu. */
export function groupByAlbum(items: readonly DocItem[]): { album: string; items: DocItem[] }[] {
  const map = new Map<string, DocItem[]>()
  for (const it of items) {
    const a = (it.album ?? '').trim() || DEFAULT_ALBUM
    map.set(a, [...(map.get(a) ?? []), it])
  }
  const key = (d: DocItem) => d.taken_on ?? d.uploaded_at.slice(0, 10)
  return [...map.entries()]
    .map(([album, list]) => ({ album, items: list.sort((x, y) => key(y).localeCompare(key(x)) || y.uploaded_at.localeCompare(x.uploaded_at)) }))
    .sort((a, b) => (a.album === DEFAULT_ALBUM ? 1 : b.album === DEFAULT_ALBUM ? -1 : a.album.localeCompare(b.album, 'id', { sensitivity: 'base' })))
}

/** Kompres foto di perangkat: sisi terpanjang <= maxSide, JPEG. Bila gagal dibaca, mengembalikan null. */
export async function compressImage(file: File, maxSide = 1600, quality = 0.82): Promise<Blob | null> {
  let bmp: ImageBitmap
  try { bmp = await createImageBitmap(file) } catch { return null }
  const { w, h } = fitSize(bmp.width, bmp.height, maxSide)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
  bmp.close?.()
  return new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality))
}
