/** Pengaturan tampilan aplikasi (nama, slogan, kontak, logo, favicon). Bagian murni; pemanggilan database ada di brandApi. */

export interface AppSettings {
  app_name: string
  tagline: string
  org_name: string | null
  hero_title: string | null
  hero_text: string | null
  address: string | null
  phone: string | null
  email: string | null
  website: string | null
  footer_text: string | null
  logo_path: string | null
  favicon_path: string | null
}

export const DEFAULT_SETTINGS: AppSettings = {
  app_name: 'LAKSANA', tagline: 'Pelaksanaan Kegiatan PTA Malut', org_name: null, hero_title: null, hero_text: null,
  address: null, phone: null, email: null, website: null, footer_text: null, logo_path: null, favicon_path: null,
}

export const DEFAULT_HERO_TITLE = 'Satu pintu untuk semua pelaksanaan kegiatan.'
export const DEFAULT_HERO_TEXT = 'Absensi, kuis, sertifikat, notula, dan dokumentasi kegiatan dalam satu tempat. Peserta cukup memasukkan NIP, tanpa membuat akun.'

export const BRANDING_BUCKET = 'branding'
export const MAX_LOGO_PX = 512
export const FAVICON_PX = 128

/** Logo bawaan (rekomendasi) yang tersedia tanpa mengunggah apa pun; berkasnya ada di public/brand. */
export const BUILTIN_LOGOS = [
  { id: 'neraca', label: 'Neraca Terlaksana', hint: 'Timbangan keadilan + centang. Rekomendasi logo utama.', url: '/brand/logo-neraca.svg' },
  { id: 'perisai', label: 'Perisai Centang', hint: 'Resmi dan tegas.', url: '/brand/logo-perisai.svg' },
  { id: 'monogram', label: 'Monogram L', hint: 'Jelas di ukuran kecil. Rekomendasi favicon.', url: '/brand/logo-monogram.svg' },
] as const

export const DEFAULT_FAVICON_URL = '/favicon.svg'

export const isBuiltin = (p: string | null | undefined): p is string => !!p && p.startsWith('builtin:')
const builtinUrl = (p: string) => BUILTIN_LOGOS.find((b) => b.id === p.slice('builtin:'.length))?.url ?? null

/** Alamat gambar dari nilai `logo_path`/`favicon_path`: logo bawaan, atau berkas di bucket (lewat `publicUrl`). */
export function assetUrl(path: string | null | undefined, publicUrl: (p: string) => string): string | null {
  if (!path) return null
  return isBuiltin(path) ? builtinUrl(path) : publicUrl(path)
}

/** Favicon yang dipakai: pilihan sendiri; bila kosong mengikuti logo; bila logo juga kosong memakai favicon bawaan. */
export function faviconUrl(s: Pick<AppSettings, 'logo_path' | 'favicon_path'>, publicUrl: (p: string) => string): string {
  return assetUrl(s.favicon_path, publicUrl) ?? assetUrl(s.logo_path, publicUrl) ?? DEFAULT_FAVICON_URL
}

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim().slice(0, max)
  return t || null
}

/** Data mentah dari server (atau cache) -> pengaturan lengkap dengan nilai bawaan. */
export function normalizeSettings(raw: unknown): AppSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    app_name: str(r.app_name, 40) ?? DEFAULT_SETTINGS.app_name,
    tagline: typeof r.tagline === 'string' ? r.tagline.trim().slice(0, 120) : DEFAULT_SETTINGS.tagline,
    org_name: str(r.org_name, 160), hero_title: str(r.hero_title, 160), hero_text: str(r.hero_text, 400),
    address: str(r.address, 300), phone: str(r.phone, 60), email: str(r.email, 120), website: str(r.website, 160),
    footer_text: str(r.footer_text, 200), logo_path: str(r.logo_path, 200), favicon_path: str(r.favicon_path, 200),
  }
}

export const documentTitle = (s: Pick<AppSettings, 'app_name' | 'tagline'>) => (s.tagline ? `${s.app_name} - ${s.tagline}` : s.app_name)
export const copyright = (s: Pick<AppSettings, 'app_name' | 'tagline' | 'footer_text'>, year = new Date().getFullYear()) =>
  s.footer_text ?? `© ${year} ${s.app_name}${s.tagline ? ` - ${s.tagline}` : ''}`

/** Nama berkas acak di bucket branding (selalu PNG): 32 heksadesimal. */
export const randomBrandPath = () => `${crypto.randomUUID().replace(/-/g, '')}.png`

/** Baris kontak yang terisi (untuk footer). */
export function contactLines(s: Pick<AppSettings, 'org_name' | 'address' | 'phone' | 'email' | 'website'>): string[] {
  return [s.org_name, s.address, [s.phone && `Telp. ${s.phone}`, s.email].filter(Boolean).join(' · '), s.website].filter((x): x is string => !!x)
}

/** Tautan situs yang aman (http/https) dari isian bebas; null bila tidak valid. */
export function websiteHref(v: string | null): string | null {
  if (!v) return null
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null
  } catch { return null }
}

/** Ukuran hasil skala: muat dalam kotak maxW×maxH tanpa membesarkan. */
export function fitBox(w: number, h: number, maxW: number, maxH = maxW): { w: number; h: number } {
  const k = Math.min(1, maxW / w, maxH / h)
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }
}
