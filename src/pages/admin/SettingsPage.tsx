import { CheckCheck, ImagePlus, RotateCcw, ShieldAlert, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { isValidUsername, normalizeUsername, USERNAME_HELP } from '../../lib/account'
import { fetchMyProfile, setMyUsername } from '../../lib/accountApi'
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

type Tab = 'umum' | 'logo' | 'kop' | 'akun'
const TABS: { id: Tab; label: string }[] = [
  { id: 'umum', label: 'Umum' }, { id: 'logo', label: 'Logo dan favicon' }, { id: 'kop', label: 'Kop surat' }, { id: 'akun', label: 'Akun saya' },
]

const TEXT_KEYS = ['app_name', 'tagline', 'org_name', 'hero_title', 'hero_text', 'address', 'phone', 'email', 'website', 'footer_text', 'kop_title', 'kop_address'] as const
type TextForm = Record<(typeof TEXT_KEYS)[number], string>
const toForm = (s: AppSettings): TextForm => Object.fromEntries(TEXT_KEYS.map((k) => [k, s[k] ?? ''])) as TextForm

/** Akun yang sedang masuk: nama pengguna untuk login (bisa diubah). */
function AccountCard() {
  const toast = useToast()
  const me = useAsync(fetchMyProfile, [])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (me.data) setName(me.data.username) }, [me.data])
  const dirty = !!me.data && normalizeUsername(name) !== me.data.username
  async function save() {
    if (!isValidUsername(name)) return toast(USERNAME_HELP, 'error')
    setBusy(true)
    try { await setMyUsername(name); await me.reload(); toast('Nama pengguna diperbarui.', 'success') } catch (e) { toast(errMsg(e), 'error') } finally { setBusy(false) }
  }
  if (me.error || (!me.loading && !me.data)) return null   // migrasi belum dijalankan
  return (
    <div className="card">
      <h2>Akun saya</h2>
      <div className="form-grid">
        <Field label="Nama pengguna" hint="Dipakai untuk masuk. Huruf kecil, angka, titik, garis bawah, atau strip (3-30 karakter).">
          <input className="input" value={name} autoCapitalize="none" spellCheck={false} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email akun" hint="Tidak dipakai untuk masuk; diubah lewat Supabase.">
          <input className="input" value={me.data?.email ?? ''} disabled />
        </Field>
      </div>
      <button className="btn primary" disabled={!dirty || busy} onClick={() => void save()}>{busy ? 'Menyimpan…' : 'Simpan nama pengguna'}</button>
    </div>
  )
}

/** Pengaturan aplikasi: nama, slogan, kontak, teks halaman depan, logo, dan favicon. Hanya pemilik aplikasi yang boleh mengubah. */
export default function SettingsPage() {
  const toast = useToast()
  const { settings, reload } = useBrand()
  const state = useAsync(fetchState, [])
  const [form, setForm] = useState<TextForm>(() => toForm(settings))
  const [logo, setLogo] = useState<Pick>({ path: settings.logo_path })
  const [fav, setFav] = useState<Pick>({ path: settings.favicon_path })
  const [kopLogo, setKopLogo] = useState<Pick>({ path: settings.kop_logo_path })
  const [tab, setTab] = useState<Tab>('umum')
  const [busy, setBusy] = useState(false)
  const [syncedAt, setSyncedAt] = useState(settings)
  const logoInput = useRef<HTMLInputElement>(null)
  const favInput = useRef<HTMLInputElement>(null)
  const kopInput = useRef<HTMLInputElement>(null)

  // pengaturan tersimpan berubah (mis. selesai dimuat dari server): muat ulang isian bila belum ada sunting
  useEffect(() => {
    if (settings === syncedAt) return
    setForm(toForm(settings)); setLogo({ path: settings.logo_path }); setFav({ path: settings.favicon_path }); setKopLogo({ path: settings.kop_logo_path }); setSyncedAt(settings)
  }, [settings, syncedAt])

  const owner = state.data?.owner ?? false
  const set = (k: keyof TextForm) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })
  const logoSrc = (p: Pick) => (isNew(p) ? p.url : assetUrl(p.path, publicBrandUrl))
  const favFollowsLogo = !isNew(fav) && !fav.path
  const logoShown = logoSrc(logo)
  const favShown = isNew(fav) ? fav.url : fav.path ? assetUrl(fav.path, publicBrandUrl) : logoShown ?? DEFAULT_FAVICON_URL
  const kopShown = logoSrc(kopLogo)
  const dirty = TEXT_KEYS.some((k) => form[k].trim() !== (settings[k] ?? '')) || isNew(logo) || isNew(fav) || isNew(kopLogo)
    || (!isNew(logo) && logo.path !== settings.logo_path) || (!isNew(fav) && fav.path !== settings.favicon_path) || (!isNew(kopLogo) && kopLogo.path !== settings.kop_logo_path)

  async function pickFile(kind: 'logo' | 'fav' | 'kop', file: File | undefined) {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) return toast('Ukuran gambar maksimal 5 MB.', 'error')
    try {
      const blob = await (kind === 'fav' ? rasterizeFavicon(file) : rasterizeLogo(file))
      const pick: Pick = { blob, url: URL.createObjectURL(blob) }
      if (kind === 'logo') setLogo(pick); else if (kind === 'kop') setKopLogo(pick); else setFav(pick)
    } catch (e) { toast(errMsg(e), 'error') }
  }

  async function save() {
    if (!form.app_name.trim()) return toast('Nama aplikasi wajib diisi.', 'error')
    setBusy(true)
    const uploaded: string[] = []
    try {
      let logoPath = isNew(logo) ? null : logo.path
      let favPath = isNew(fav) ? null : fav.path
      let kopPath = isNew(kopLogo) ? null : kopLogo.path
      if (isNew(logo)) { logoPath = await uploadBrandImage(logo.blob); uploaded.push(logoPath) }
      if (isNew(fav)) { favPath = await uploadBrandImage(fav.blob); uploaded.push(favPath) }
      if (isNew(kopLogo)) { kopPath = await uploadBrandImage(kopLogo.blob); uploaded.push(kopPath) }
      await saveSettings({
        ...settings, ...Object.fromEntries(TEXT_KEYS.map((k) => [k, form[k].trim() || null])) as Partial<AppSettings>,
        app_name: form.app_name.trim(), tagline: form.tagline.trim(), logo_path: logoPath, favicon_path: favPath, kop_logo_path: kopPath,
      })
      // berkas lama yang tidak dipakai lagi dihapus (logo bawaan tidak punya berkas)
      await removeBrandImages([settings.logo_path, settings.favicon_path, settings.kop_logo_path].filter((p): p is string => !!p && !isBuiltin(p) && p !== logoPath && p !== favPath && p !== kopPath))
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
  const identityPreview = (
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
  )
  const kopTitleLines = (form.kop_title.trim() ? form.kop_title.split('\n') : form.org_name ? [form.org_name] : []).filter((l) => l.trim())
  const kopAddressLines = form.kop_address.split('\n').filter((l) => l.trim())

  return (
    <div className="stack settings">
      <PageHeader title="Pengaturan aplikasi" subtitle={<>Nama, slogan, kontak, logo, favicon, dan kop surat.{dirty && <span className="badge warn" style={{ marginLeft: 8 }}>Belum disimpan</span>}</>}
        actions={tab === 'akun' ? undefined : <button className="btn primary" disabled={ro || busy || !dirty} onClick={() => void save()}>{busy ? 'Menyimpan…' : 'Simpan pengaturan'}</button>} />

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

      <div className="tabs" role="tablist" aria-label="Bagian pengaturan" style={{ margin: 0 }}>
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" id={`set-tab-${t.id}`} aria-selected={tab === t.id} aria-controls="set-panel" className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      <div className="settings-panel stack" role="tabpanel" id="set-panel" aria-labelledby={`set-tab-${tab}`}>
        {tab === 'umum' && <>
          {identityPreview}
          <div className="card">
            <h2>Identitas</h2>
            <div className="form-grid">
              <Field label="Nama aplikasi *" hint="Tampil di sidebar, halaman depan, login, halaman peserta, dan judul tab."><input className="input" value={form.app_name} maxLength={40} disabled={ro} onChange={set('app_name')} /></Field>
              <Field label="Slogan"><input className="input" value={form.tagline} maxLength={120} disabled={ro} onChange={set('tagline')} placeholder="mis. Pelaksanaan Kegiatan PTA Malut" /></Field>
            </div>
            <Field label="Nama instansi"><input className="input" value={form.org_name} maxLength={160} disabled={ro} onChange={set('org_name')} placeholder="mis. Pengadilan Tinggi Agama Maluku Utara" /></Field>
          </div>
          <div className="card">
            <h2>Halaman depan</h2>
            <Field label="Judul besar"><input className="input" value={form.hero_title} maxLength={160} disabled={ro} onChange={set('hero_title')} placeholder={DEFAULT_HERO_TITLE} /></Field>
            <Field label="Teks pengantar"><textarea className="input" rows={3} value={form.hero_text} maxLength={400} disabled={ro} onChange={set('hero_text')} placeholder={DEFAULT_HERO_TEXT} /></Field>
            <Field label="Teks footer" hint="Kosongkan untuk memakai “© tahun nama - slogan”."><input className="input" value={form.footer_text} maxLength={200} disabled={ro} onChange={set('footer_text')} /></Field>
          </div>
          <div className="card">
            <h2>Kontak <span className="muted small" style={{ fontWeight: 400 }}>· tampil di footer halaman depan</span></h2>
            <Field label="Alamat"><textarea className="input" rows={2} value={form.address} maxLength={300} disabled={ro} onChange={set('address')} /></Field>
            <div className="form-grid">
              <Field label="Telepon"><input className="input" value={form.phone} maxLength={60} disabled={ro} onChange={set('phone')} /></Field>
              <Field label="Email"><input className="input" type="email" value={form.email} maxLength={120} disabled={ro} onChange={set('email')} /></Field>
            </div>
            <Field label="Situs web"><input className="input" value={form.website} maxLength={160} disabled={ro} onChange={set('website')} placeholder="mis. pta-malut.go.id" /></Field>
          </div>
        </>}

        {tab === 'logo' && <>
          {identityPreview}
          <div className="card">
            <div className="card-head"><h2>Logo aplikasi</h2><span className="spacer" />
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
        </>}

        {tab === 'kop' && <>
          <div className="card">
            <h2>Kop surat</h2>
            <p className="muted small" style={{ marginTop: 0 }}>Dipakai pada hasil unduhan Word dan PDF notula. Satu baris teks = satu baris pada kop. Bila judul dan alamat dikosongkan, kop memakai nama instansi dan kontak dari tab Umum.</p>
            <Field label="Judul kop" hint="Dicetak tebal dan huruf kapital."><textarea className="input" rows={3} value={form.kop_title} maxLength={400} disabled={ro} onChange={set('kop_title')}
              placeholder={'Mahkamah Agung Republik Indonesia\nDirektorat Jenderal Badan Peradilan Agama\nPengadilan Tinggi Agama Maluku Utara'} /></Field>
            <Field label="Alamat dan kontak" hint="Dicetak dengan huruf kecil di bawah judul."><textarea className="input" rows={2} value={form.kop_address} maxLength={400} disabled={ro} onChange={set('kop_address')}
              placeholder={'Jalan Raya Kilometer 40, Balbar, Oba Utara\nKota Sofifi, Maluku Utara 97852, www.pta-malut.go.id, ptamalut@gmail.com'} /></Field>
          </div>
          <div className="card">
            <div className="card-head"><h2>Logo surat</h2><span className="spacer" />
              <button className="btn sm" disabled={ro || (!isNew(kopLogo) && !kopLogo.path)} onClick={() => setKopLogo({ path: null })}><Trash2 size={14} /> Hapus logo surat</button>
              <button className="btn sm" disabled={ro} onClick={() => kopInput.current?.click()}><Upload size={14} /> {kopShown ? 'Ganti logo surat' : 'Unggah logo surat'}</button>
              <input ref={kopInput} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden aria-label="Berkas logo surat" onChange={(e) => { void pickFile('kop', e.target.files?.[0]); e.target.value = '' }} />
            </div>
            <p className="muted small" style={{ marginTop: 0 }}>Logo instansi yang tampil di sisi kiri kop (mis. lambang Mahkamah Agung). Terpisah dari logo aplikasi. PNG/JPG/WEBP/SVG, maks. 5 MB; latar transparan paling bagus. Tanpa logo, kop hanya berisi teks.</p>
            {kopShown
              ? <div className="kop-logo-box"><img src={kopShown} alt="Logo surat" /><span className="muted small">{isNew(kopLogo) ? 'Logo surat baru (belum disimpan)' : 'Logo surat tersimpan'}</span></div>
              : <div className="kop-logo-box empty muted small">Belum ada logo surat.</div>}
          </div>
          <div className="card">
            <h2>Pratinjau kop</h2>
            <div className="kop-preview" aria-label="Pratinjau kop surat">
              {kopShown && <img src={kopShown} alt="" />}
              <div>
                {kopTitleLines.map((l, i) => <b key={i}>{l.trim().toUpperCase()}</b>)}
                {kopAddressLines.map((l, i) => <small key={i}>{l.trim()}</small>)}
                {!kopTitleLines.length && !kopAddressLines.length && <small className="muted">Isi judul dan alamat kop di atas.</small>}
              </div>
            </div>
          </div>
        </>}

        {tab === 'akun' && <AccountCard />}
      </div>
    </div>
  )
}
