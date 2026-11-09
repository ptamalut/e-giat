import { CheckCheck } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { cacheSettings, fetchSettings, publicBrandUrl, readCachedSettings } from '../lib/brandApi'
import { assetUrl, DEFAULT_SETTINGS, documentTitle, faviconUrl, type AppSettings } from '../lib/branding'
import { isConfigured } from '../lib/supabase'

interface BrandState { settings: AppSettings; logo: string | null; favicon: string; reload: () => Promise<void> }
const Ctx = createContext<BrandState>({ settings: DEFAULT_SETTINGS, logo: null, favicon: '/favicon.svg', reload: async () => {} })
export const useBrand = () => useContext(Ctx)

/** Pasang judul tab dan ikon (favicon) sesuai pengaturan. */
function applyToDocument(s: AppSettings, favicon: string) {
  document.title = documentTitle(s)
  let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
  if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link) }
  link.type = favicon.endsWith('.svg') ? 'image/svg+xml' : 'image/png'
  if (link.getAttribute('href') !== favicon) link.setAttribute('href', favicon)
  document.querySelector('meta[name="description"]')?.setAttribute('content', `${s.app_name}${s.tagline ? ` - ${s.tagline}` : ''}: absensi, kuis, laporan, sertifikat, notula, dan dokumentasi kegiatan.`)
}

/** Memuat pengaturan aplikasi (publik) dan menyediakannya ke seluruh aplikasi. Cache lokal mencegah tampilan berkedip. */
export function BrandProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => readCachedSettings() ?? DEFAULT_SETTINGS)

  const reload = useCallback(async () => {
    if (!isConfigured) return
    try {
      const s = await fetchSettings()
      cacheSettings(s)
      setSettings(s)
    } catch { /* tetap memakai cache/bawaan: pengaturan belum tentu sudah dimigrasi */ }
  }, [])

  useEffect(() => { void reload() }, [reload])

  const value = useMemo<BrandState>(() => ({
    settings, reload,
    logo: assetUrl(settings.logo_path, publicBrandUrl),
    favicon: faviconUrl(settings, publicBrandUrl),
  }), [settings, reload])

  useEffect(() => { applyToDocument(value.settings, value.favicon) }, [value.settings, value.favicon])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** Penanda merek: logo yang diunggah/dipilih, atau ikon centang bawaan. Ukuran kotak mengikuti kelas induk (.brand-mark). */
export function BrandMark({ size = 18 }: { size?: number }) {
  const { logo } = useBrand()
  if (logo) return <span className="brand-mark has-logo"><img src={logo} alt="" /></span>
  return <span className="brand-mark"><CheckCheck size={size} strokeWidth={2.6} /></span>
}
