import { DOC_BUCKET } from './docs'
import { rpc, supabase } from './supabase'

export interface GalleryActivity {
  id: string; name: string; location: string | null; start_date: string | null; end_date: string | null
  photo_count: number; cover: string; previews: string[]
}
export interface GalleryPhoto { id: string; path: string; caption: string | null; album: string | null; taken_on: string | null }
export interface GalleryDetail {
  activity: { id: string; name: string; description: string | null; location: string | null; start_date: string | null; end_date: string | null }
  photos: GalleryPhoto[]
}
export interface GalleryRecent { path: string; caption: string | null; activity_id: string; activity_name: string }

export const fetchGallery = () => rpc<GalleryActivity[]>('public_gallery', {})
export const fetchGalleryActivity = (id: string) => rpc<GalleryDetail | null>('public_gallery_activity', { p_id: id })
export const fetchGalleryRecent = (limit = 8) => rpc<GalleryRecent[]>('public_gallery_recent', { p_limit: limit })

export const galleryPhotoUrl = (path: string) => supabase.storage.from(DOC_BUCKET).getPublicUrl(path).data.publicUrl

/** Kelompokkan foto per album (urutan abjad, tanpa album terakhir); urutan foto dipertahankan. */
export function groupPhotos(photos: readonly GalleryPhoto[], fallback = 'Foto kegiatan'): { album: string; photos: GalleryPhoto[] }[] {
  const map = new Map<string, GalleryPhoto[]>()
  for (const p of photos) { const a = (p.album ?? '').trim() || fallback; map.set(a, [...(map.get(a) ?? []), p]) }
  return [...map.entries()]
    .map(([album, list]) => ({ album, photos: list }))
    .sort((a, b) => (a.album === fallback ? 1 : b.album === fallback ? -1 : a.album.localeCompare(b.album, 'id', { sensitivity: 'base' })))
}
