import { normalizeSettings, randomBrandPath, BRANDING_BUCKET, FAVICON_PX, MAX_LOGO_PX, fitBox, type AppSettings } from './branding'
import { errMsg, supabase } from './supabase'

const CACHE_KEY = 'laksana-brand'

export const publicBrandUrl = (path: string) => supabase.storage.from(BRANDING_BUCKET).getPublicUrl(path).data.publicUrl

export function readCachedSettings(): AppSettings | null {
  try { const v = localStorage.getItem(CACHE_KEY); return v ? normalizeSettings(JSON.parse(v)) : null } catch { return null }
}
export function cacheSettings(s: AppSettings) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(s)) } catch { /* penyimpanan tidak tersedia */ }
}

export async function fetchSettings(): Promise<AppSettings> {
  const { data, error } = await supabase.rpc('public_app_settings')
  if (error) throw new Error(errMsg(error))
  return normalizeSettings(data)
}

export interface SettingsState { owner: boolean; claimable: boolean }
export async function fetchState(): Promise<SettingsState> {
  const { data, error } = await supabase.rpc('app_settings_state')
  if (error) throw new Error(errMsg(error))
  const d = (data ?? {}) as Partial<SettingsState>
  return { owner: !!d.owner, claimable: !!d.claimable }
}

export async function claimSettings(): Promise<void> {
  const { error } = await supabase.rpc('claim_app_settings')
  if (error) throw new Error(errMsg(error))
}

export async function saveSettings(s: AppSettings): Promise<void> {
  const { error } = await supabase.rpc('save_app_settings', { p: s })
  if (error) throw new Error(errMsg(error))
}

/** Unggah PNG ke bucket branding dengan nama acak; mengembalikan path-nya. */
export async function uploadBrandImage(blob: Blob): Promise<string> {
  const path = randomBrandPath()
  const { error } = await supabase.storage.from(BRANDING_BUCKET).upload(path, blob, { contentType: 'image/png', upsert: false })
  if (error) throw new Error(errMsg(error))
  return path
}

export async function removeBrandImages(paths: readonly string[]): Promise<void> {
  const list = paths.filter(Boolean)
  if (list.length) await supabase.storage.from(BRANDING_BUCKET).remove([...list]).catch(() => undefined)
}

/** Baca gambar (PNG/JPG/WEBP/SVG) di perangkat. */
function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Berkas gambar tidak bisa dibaca. Gunakan PNG, JPG, WEBP, atau SVG.')) }
    img.src = url
  })
}

const toPng = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Gagal memproses gambar.'))), 'image/png'))

/** Logo: skala ke maksimum 512 px (rasio dipertahankan), transparansi dijaga, keluaran PNG. */
export async function rasterizeLogo(file: Blob): Promise<Blob> {
  const img = await loadImage(file)
  const w0 = img.naturalWidth || MAX_LOGO_PX, h0 = img.naturalHeight || MAX_LOGO_PX
  const { w, h } = fitBox(w0, h0, MAX_LOGO_PX)
  const c = document.createElement('canvas'); c.width = w; c.height = h
  c.getContext('2d')!.drawImage(img, 0, 0, w, h)
  return toPng(c)
}

/** Favicon: kanvas persegi 128 px, gambar diletakkan di tengah (tanpa terpotong), keluaran PNG. */
export async function rasterizeFavicon(file: Blob): Promise<Blob> {
  const img = await loadImage(file)
  const w0 = img.naturalWidth || FAVICON_PX, h0 = img.naturalHeight || FAVICON_PX
  const k = Math.min(FAVICON_PX / w0, FAVICON_PX / h0)
  const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k))
  const c = document.createElement('canvas'); c.width = FAVICON_PX; c.height = FAVICON_PX
  c.getContext('2d')!.drawImage(img, Math.round((FAVICON_PX - w) / 2), Math.round((FAVICON_PX - h) / 2), w, h)
  return toPng(c)
}
