import { CheckCheck, ImagePlus, RotateCcw, ShieldAlert, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useBrand } from '../../components/brand'
import { ErrorBox, Field, Loading, PageHeader, useAsync, useToast } from '../../components/ui'
import {
  claimSettings, fetchState, publicBrandUrl, rasterizeFavicon, rasterizeLogo, removeBrandImages, saveSettings, uploadBrandImage,
} from '../../lib/brandApi'
import {
  assetUrl, BUILTIN_LOGOS, DEFAULT_FAVICON_URL, DEFAULT_HERO_TEXT, DEFAULT_HERO_TITLE, documentTitle, isBuiltin, type AppSettings,
} from '../../lib/branding'
import { errMsg } from '../../lib/supabase'

/** Pilihan gambar: yang tersimpan (path/kosong) atau berkas baru yang belum diunggah. */
type Pick = { path: string | null } | { blob: Blob; url: string }
const isNew = (p: Pick): p is { blob: Blob; url: string } => 'blob' in p

const TEXT_KEYS = ['app_name', 'tagline', 'org_name', 'hero_title', 'hero_text', 'address', 'phone', 'email', 'website', 'footer_text'] as const
type TextForm = Record<(typeof TEXT_KEYS)[number], string>
const toForm = (s: AppSettings): TextForm => Object.fromEntries(TEXT_KEYS.map((k) => [k, s[k] ?? ''])) as TextForm

/** Pengaturan aplikasi: nama, slogan, kontak, teks halaman depan, logo, dan favicon. Hanya pemilik aplikasi yang boleh mengubah. */
export default function SettingsPage() {
  const toast = useToast()
  const { settings, reload } = useBrand()
  const state = useAsync(fetchState, [])
  const [form, setForm] = useState<TextForm>(() => toForm(settings))
  const [logo, setLogo] = useState<Pick>({ path: settings.logo_path })
  const [fav, setFav] = useState<Pick>({ path: settings.favicon_path })
  const [busy, setBusy] = useState(false)
  const [syncedAt, setSyncedAt] = useState(settings)
  const logoInput = useRef<HTMLInputElement>(null)
  const favInput = useRef<HTMLInputElement>(null)

  // pengaturan tersimpan berubah (mis. selesai dimuat dari server): muat ulang isian bila belum ada sunting
  useEffect(() => {
    if (settings === syncedAt) return
    setForm(toForm(settings)); setLogo({ path: settings.logo_path }); setFav({ path: settings.favicon_path }); setSyncedAt(settings)
  }, [settings, syncedAt])

  const owner = state.data?.owner ?? false
  const set = (k: keyof TextForm) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })
  const logoSrc = (p: Pick) => (isNew(p) ? p.url : assetUrl(p.path, publicBrandUrl))
  const favFollowsLogo = !isNew(fav) && !fav.path
  const logoShown = logoSrc(logo)
  const favShown = isNew(fav) ? fav.url : fav.path ? assetUrl(fav.path, publicBrandUrl) : logoShown ?? DEFAULT_FAVICON_URL
  const dirty = TEXT_KEYS.some((k) => form[k].trim() !== (settings[k] ?? '')) || isNew(logo) || isNew(fav)
    || (!isNew(logo) && logo.path !== settings.logo_path) || (!isNew(fav) && fav.path !== settings.favicon_path)

  async function pickFile(kind: 'logo' | 'fav', file: File | undefined) {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) return toast('Ukuran gambar maksimal 5 MB.', 'error')
    try {
      const blob = await (kind === 'logo' ? rasterizeLogo(file) : rasterizeFavicon(file))
      const pick: Pick = { blob, url: URL.createObjectURL(blob) }
      if (kind === 'logo') setLogo(pick); else setFav(pick)
    } catch (e) { toast(errMsg(e), 'error') }
  }

  async function save() {
    if (!form.app_name.trim()) return toast('Nama aplikasi wajib diisi.', 'error')
    setBusy(true)
    const uploaded: string[] = []
    try {
      let logoPath = isNew(logo) ? null : logo.path
      let favPath = isNew(fav) ? null : fav.path
      if (isNew(logo)) { logoPath = await uploadBrandImage(logo.blob); uploaded.push(logoPath) }
      if (isNew(fav)) { favPath = await uploadBrandImage(fav.blob); uploaded.push(favPath) }
      await saveSettings({
        ...settings, ...Object.fromEntries(TEXT_KEYS.map((k) => [k, form[k].trim() || null])) as Partial<AppSettings>,
        app_name: form.app_name.trim(), tagline: form.tagline.trim(), logo_path: logoPath, favicon_path: favPath,
      })
      // berkas lama yang tidak dipakai lagi dihapus (logo bawaan tidak punya berkas)
      await removeBrandImages([settings.logo_path, settings.favicon_path].filter((p): p is string => !!p && !isBuiltin(p) && p !== logoPath && p !== favPath))
      await reload()
      toast('Pengaturan disimpan.', 'success')
    } catch (e) {
      await removeBrandImages(uploaded)   // gagal menyimpan: buang unggahan yang yatim
      toast(errMsg(e), 'error')
    } finally { setBusy(false) }
  }

  async function claim() {
    try { await claimSettings(); await state.reload(); toast('Anda kini pemilik pengaturan aplikasi.', 'success') } catch (e) { toast(errMsg(e), 'error') }
  }

  if (state.loading && !state.data) return <Loading />
  if (state.error) {
    const missing = /app_settings_state|schema cache|does not exist/i.test(state.error)
    return <ErrorBox error={missing ? 'Pengaturan aplikasi belum aktif di database. Jalankan supabase/migrations/013_pengaturan_aplikasi.sql di Supabase SQL Editor, lalu muat ulang halaman ini.' : state.error} onRetry={() => void state.reload()} />
  }

  const ro = !owner
  return (
    <div className="stack">
      <PageHeader title="Pengaturan aplikasi" subtitle="Nama, slogan, kontak, logo, dan favicon yang tampil di halaman depan, login, halaman peserta, dan tab browser."
        actions={<button className="btn primary" disabled={ro || busy || !dirty} onClick={() => void save()}>{busy ? 'Menyimpan…' : 'Simpan pengaturan'}</button>} />

      {ro && (
        <div className="alert warn">
          <ShieldAlert size={18} />
          <span>
            {state.data?.claimable
              ? 'Belum ada pemilik pengaturan aplikasi. '
              : 'Hanya pemilik aplikasi (akun yang pertama terdaftar) yang bisa mengubah pengaturan ini. Anda hanya bisa melihatnya. '}
            {state.data?.claimable && <button className="btn sm primary" onClick={() => void claim()}>Jadikan saya pemilik</button>}
          </span>
        </div>
      )}

      <div className="card">
        <h2>Pratinjau</h2>
        <div className="settings-previews">
          <div className="settings-preview light">
            {logoShown ? <span className="brand-mark has-logo"><img src={logoShown} alt="Pratinjau logo" /></span> : <span className="brand-mark"><CheckCheck size={18} strokeWidth={2.6} /></span>}
            <span><b>{form.app_name || '—'}</b>{form.tagline && <small>{form.tagline}</small>}</span>
          </div>
          <div className="settings-preview hero">
            {logoShown ? <span className="brand-mark has-logo"><img src={logoShown} alt="" /></span> : <span className="brand-mark"><CheckCheck size={18} strokeWidth={2.6} /></span>}
            <span><b>{form.app_name || '—'}</b>{form.tagline && <small>{form.tagline}</small>}</span>
          </div>
          <div className="settings-tab" aria-label="Pratinjau tab browser">
            <img src={favShown ?? DEFAULT_FAVICON_URL} alt="Pratinjau favicon" width={16} height={16} />
            <span>{documentTitle({ app_name: form.app_name || '—', tagline: form.tagline.trim() })}</span>
          </div>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h2>Identitas</h2>
          <Field label="Nama aplikasi *" hint="Tampil di sidebar, halaman depan, login, halaman peserta, dan judul tab."><input className="input" value={form.app_name} maxLength={40} disabled={ro} onChange={set('app_name')} /></Field>
          <Field label="Slogan"><input className="input" value={form.tagline} maxLength={120} disabled={ro} onChange={set('tagline')} placeholder="mis. Pelaksanaan Kegiatan PTA Malut" /></Field>
          <Field label="Nama instansi"><input className="input" value={form.org_name} maxLength={160} disabled={ro} onChange={set('org_name')} placeholder="mis. Pengadilan Tinggi Agama Maluku Utara" /></Field>
        </div>

        <div className="card">
          <h2>Halaman depan</h2>
          <Field label="Judul besar"><input className="input" value={form.hero_title} maxLength={160} disabled={ro} onChange={set('hero_title')} placeholder={DEFAULT_HERO_TITLE} /></Field>
          <Field label="Teks pengantar"><textarea className="input" rows={3} value={form.hero_text} maxLength={400} disabled={ro} onChange={set('hero_text')} placeholder={DEFAULT_HERO_TEXT} /></Field>
          <Field label="Teks footer" hint="Kosongkan untuk memakai “© tahun nama - slogan”."><input className="input" value={form.footer_text} maxLength={200} disabled={ro} onChange={set('footer_text')} /></Field>
        </div>

        <div className="card">
          <h2>Kontak (tampil di footer halaman depan)</h2>
          <Field label="Alamat"><textarea className="input" rows={2} value={form.address} maxLength={300} disabled={ro} onChange={set('address')} /></Field>
          <div className="form-grid">
            <Field label="Telepon"><input className="input" value={form.phone} maxLength={60} disabled={ro} onChange={set('phone')} /></Field>
            <Field label="Email"><input className="input" type="email" value={form.email} maxLength={120} disabled={ro} onChange={set('email')} /></Field>
          </div>
          <Field label="Situs web"><input className="input" value={form.website} maxLength={160} disabled={ro} onChange={set('website')} placeholder="mis. pta-malut.go.id" /></Field>
        </div>

      </div>

      <div className="card">
        <div className="card-head"><h2>Logo</h2><span className="spacer" />
          <button className="btn sm" disabled={ro || (!isNew(logo) && !logo.path)} onClick={() => setLogo({ path: null })}><RotateCcw size={14} /> Pakai ikon bawaan</button>
          <button className="btn sm" disabled={ro} onClick={() => logoInput.current?.click()}><Upload size={14} /> Unggah logo sendiri</button>
          <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden aria-label="Berkas logo" onChange={(e) => { void pickFile('logo', e.target.files?.[0]); e.target.value = '' }} />
        </div>
        <p className="muted small" style={{ marginTop: 0 }}>Pilih salah satu rekomendasi, atau unggah logo sendiri (PNG/JPG/WEBP/SVG, maks. 5 MB; otomatis dikecilkan ke 512 px). Logo berlatar transparan paling bagus. Rasio persegi disarankan.</p>
        <div className="logo-grid" role="radiogroup" aria-label="Pilihan logo">
          {BUILTIN_LOGOS.map((b) => (
            <button key={b.id} type="button" role="radio" aria-checked={!isNew(logo) && logo.path === `builtin:${b.id}`} disabled={ro}
              className={`logo-opt ${!isNew(logo) && logo.path === `builtin:${b.id}` ? 'on' : ''}`} onClick={() => setLogo({ path: `builtin:${b.id}` })}>
              <img src={b.url} alt="" width={56} height={56} /><b>{b.label}</b><span className="muted small">{b.hint}</span>
            </button>
          ))}
          {(isNew(logo) || (logo.path && !isBuiltin(logo.path))) && (
            <div className="logo-opt on" role="radio" aria-checked="true">
              <img src={logoShown!} alt="" width={56} height={56} /><b>{isNew(logo) ? 'Logo baru (belum disimpan)' : 'Logo unggahan'}</b>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>Favicon</h2><span className="spacer" />
          <button className="btn sm" disabled={ro || favFollowsLogo} onClick={() => setFav({ path: null })}><RotateCcw size={14} /> Ikuti logo</button>
          <button className="btn sm" disabled={ro} onClick={() => favInput.current?.click()}><ImagePlus size={14} /> Unggah favicon</button>
          <input ref={favInput} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden aria-label="Berkas favicon" onChange={(e) => { void pickFile('fav', e.target.files?.[0]); e.target.value = '' }} />
        </div>
        <p className="muted small" style={{ marginTop: 0 }}>Ikon kecil di tab browser. Bawaannya mengikuti logo. Gambar persegi yang sederhana paling jelas dibaca; berkas yang diunggah diubah menjadi PNG 128×128.</p>
        <div className="logo-grid" role="radiogroup" aria-label="Pilihan favicon">
          <button type="button" role="radio" aria-checked={favFollowsLogo} disabled={ro} className={`logo-opt ${favFollowsLogo ? 'on' : ''}`} onClick={() => setFav({ path: null })}>
            <img src={logoShown ?? DEFAULT_FAVICON_URL} alt="" width={40} height={40} /><b>Ikuti logo</b><span className="muted small">Favicon sama dengan logo.</span>
          </button>
          {BUILTIN_LOGOS.map((b) => (
            <button key={b.id} type="button" role="radio" aria-checked={!isNew(fav) && fav.path === `builtin:${b.id}`} disabled={ro}
              className={`logo-opt ${!isNew(fav) && fav.path === `builtin:${b.id}` ? 'on' : ''}`} onClick={() => setFav({ path: `builtin:${b.id}` })}>
              <img src={b.url} alt="" width={40} height={40} /><b>{b.label}</b>
            </button>
          ))}
          {(isNew(fav) || (fav.path && !isBuiltin(fav.path))) && (
            <div className="logo-opt on" role="radio" aria-checked="true">
              <img src={favShown ?? DEFAULT_FAVICON_URL} alt="" width={40} height={40} /><b>{isNew(fav) ? 'Favicon baru (belum disimpan)' : 'Favicon unggahan'}</b>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
