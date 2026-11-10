import { describe, expect, it } from 'vitest'
import { assetUrl, contactLines, copyright, documentTitle, faviconUrl, fitBox, normalizeSettings, randomBrandPath, websiteHref, DEFAULT_SETTINGS } from './branding'

const pub = (p: string) => `https://x.supabase.co/storage/v1/object/public/branding/${p}`

describe('pengaturan aplikasi', () => {
  it('normalizeSettings: nilai bawaan, pemangkasan, dan batas panjang', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    const s = normalizeSettings({ app_name: '  SIMPEL  ', tagline: ' Slogan ', org_name: '   ', phone: 123, hero_text: 'x'.repeat(500) })
    expect(s.app_name).toBe('SIMPEL')
    expect(s.tagline).toBe('Slogan')
    expect(s.org_name).toBeNull()
    expect(s.phone).toBeNull()
    expect(s.hero_text).toHaveLength(400)
    expect(normalizeSettings({ app_name: '' }).app_name).toBe('LAKSANA')
  })
  it('assetUrl: logo bawaan, berkas bucket, dan kosong', () => {
    expect(assetUrl('builtin:neraca', pub)).toBe('/brand/logo-neraca.svg')
    expect(assetUrl('builtin:tidak-ada', pub)).toBeNull()
    expect(assetUrl('abc.png', pub)).toBe(pub('abc.png'))
    expect(assetUrl(null, pub)).toBeNull()
  })
  it('faviconUrl: pilihan sendiri > ikut logo > favicon bawaan', () => {
    expect(faviconUrl({ logo_path: 'builtin:neraca', favicon_path: 'builtin:monogram' }, pub)).toBe('/brand/logo-monogram.svg')
    expect(faviconUrl({ logo_path: 'builtin:neraca', favicon_path: null }, pub)).toBe('/brand/logo-neraca.svg')
    expect(faviconUrl({ logo_path: 'l.png', favicon_path: null }, pub)).toBe(pub('l.png'))
    expect(faviconUrl({ logo_path: null, favicon_path: null }, pub)).toBe('/favicon.svg')
  })
  it('judul tab, hak cipta, dan kontak', () => {
    expect(documentTitle({ app_name: 'A', tagline: 'B' })).toBe('A - B')
    expect(documentTitle({ app_name: 'A', tagline: '' })).toBe('A')
    expect(copyright({ app_name: 'A', tagline: 'B', footer_text: null }, 2026)).toBe('© 2026 A - B')
    expect(copyright({ app_name: 'A', tagline: 'B', footer_text: 'Hak cipta X' }, 2026)).toBe('Hak cipta X')
    expect(contactLines({ org_name: 'PTA', address: 'Jl. A', phone: '0921', email: 'a@x.id', website: null })).toEqual(['PTA', 'Jl. A', 'Telp. 0921 · a@x.id'])
    expect(contactLines({ org_name: null, address: null, phone: null, email: null, website: null })).toEqual([])
  })
  it('websiteHref hanya http/https', () => {
    expect(websiteHref('pta-malut.go.id')).toBe('https://pta-malut.go.id/')
    expect(websiteHref('javascript:alert(1)')).toBeNull()
    expect(websiteHref(null)).toBeNull()
  })
  it('randomBrandPath cocok dengan aturan database dan fitBox tidak membesarkan', () => {
    expect(randomBrandPath()).toMatch(/^[0-9a-f]{32}\.png$/)
    expect(fitBox(1024, 512, 512)).toEqual({ w: 512, h: 256 })
    expect(fitBox(100, 50, 512)).toEqual({ w: 100, h: 50 })
  })
})

describe('kop surat', () => {
  it('kop_title dan kop_address dirapikan per baris; kosong menjadi null', async () => {
    const { normalizeSettings } = await import('./branding')
    const s = normalizeSettings({ kop_title: '  A  \n\n B ', kop_address: '   ' })
    expect(s.kop_title).toBe('A\nB'); expect(s.kop_address).toBeNull()
    expect(normalizeSettings({}).kop_title).toBeNull()
  })
})
