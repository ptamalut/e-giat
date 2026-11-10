/** Modul Materi: aturan berkas, jenis, dan penamaan. Bagian murni; pemanggilan database ada di materialsApi. */

export const MATERIAL_BUCKET = 'materi'
export const MATERIAL_MAX_BYTES = 50 * 1024 * 1024

/** Ekstensi yang diterima -> tipe MIME (harus sama dengan daftar di bucket "materi"). */
export const EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  zip: 'application/zip', txt: 'text/plain',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  mp4: 'video/mp4', mp3: 'audio/mpeg',
}
export const MATERIAL_ACCEPT = Object.keys(EXT_MIME).map((e) => `.${e}`).join(',')
export const MATERIAL_TYPES_TEXT = 'PDF, Word, PowerPoint, Excel, ZIP, gambar, MP4, MP3'

const ALLOWED = new Set(Object.values(EXT_MIME).concat('application/x-zip-compressed'))
const extOf = (name: string) => (name.includes('.') ? name.split('.').pop()!.toLowerCase() : '')

/** Tipe MIME untuk berkas: dari tipe yang dilaporkan browser bila diizinkan, selain itu dari ekstensinya; null bila tidak didukung. */
export function mimeOf(f: { name: string; type: string }): string | null {
  const byExt = EXT_MIME[extOf(f.name)]
  if (f.type && ALLOWED.has(f.type)) return f.type === 'application/x-zip-compressed' ? 'application/zip' : f.type
  return byExt ?? null
}

/** Periksa berkas materi: jenis yang didukung dan maksimal 50 MB. Mengembalikan pesan galat atau null. */
export function checkMaterialFile(f: { name: string; type: string; size: number }): string | null {
  if (!mimeOf(f)) return `“${f.name}”: jenis berkas tidak didukung. Gunakan ${MATERIAL_TYPES_TEXT}.`
  if (f.size > MATERIAL_MAX_BYTES) return `“${f.name}”: ukuran maksimal 50 MB.`
  if (f.size === 0) return `“${f.name}”: berkas kosong.`
  return null
}

export type FileKind = 'pdf' | 'word' | 'slide' | 'sheet' | 'image' | 'video' | 'audio' | 'arsip' | 'teks' | 'tautan' | 'lain'

export const FILE_KIND_LABEL: Record<FileKind, string> = {
  pdf: 'PDF', word: 'Word', slide: 'Presentasi', sheet: 'Excel', image: 'Gambar', video: 'Video', audio: 'Audio', arsip: 'ZIP', teks: 'Teks', tautan: 'Tautan', lain: 'Berkas',
}

/** Golongan berkas (untuk ikon dan label) dari jenis materi dan tipe MIME. */
export function fileKind(kind: 'berkas' | 'tautan', mime: string | null | undefined): FileKind {
  if (kind === 'tautan') return 'tautan'
  const m = mime ?? ''
  if (m === 'application/pdf') return 'pdf'
  if (m.includes('word')) return 'word'
  if (m.includes('presentation') || m.includes('powerpoint')) return 'slide'
  if (m.includes('sheet') || m.includes('excel')) return 'sheet'
  if (m.startsWith('image/')) return 'image'
  if (m.startsWith('video/')) return 'video'
  if (m.startsWith('audio/')) return 'audio'
  if (m.includes('zip')) return 'arsip'
  if (m === 'text/plain') return 'teks'
  return 'lain'
}

/** "1,2 MB", "340 KB". */
export function fmtSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toLocaleString('id-ID', { maximumFractionDigits: 1 })} MB`
}

/** Judul awal dari nama berkas: tanpa ekstensi, garis bawah/strip menjadi spasi. */
export function titleFromFileName(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, '').replace(/[_]+/g, ' ').replace(/\s*-\s*/g, ' - ').replace(/\s+/g, ' ').trim()
  return (base || name.trim()).slice(0, 200)
}

/** Path acak: <id kegiatan>/<32 hex>.<ekstensi>. */
export const randomMaterialPath = (activityId: string, name: string) => {
  const ext = extOf(name)
  return `${activityId}/${crypto.randomUUID().replace(/-/g, '')}${ext && /^[a-z0-9]{1,5}$/.test(ext) ? `.${ext}` : ''}`
}

/** Alamat http/https yang sah (spasi dipangkas); null bila tidak sah. */
export function cleanUrl(v: string): string | null {
  const t = v.trim()
  if (!t || t.length > 1000) return null
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null
  } catch { return null }
}

/** Nama situs dari alamat, mis. "drive.google.com". */
export const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url } }
