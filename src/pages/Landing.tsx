import { ArrowRight, CalendarCheck, CalendarDays, Eye, Images, LogIn, MapPin, TrendingUp, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { BrandMark, useBrand } from '../components/brand'
import InstallInfo from '../components/InstallInfo'
import { ThemeToggle } from '../components/theme'
import { contactLines, copyright, DEFAULT_HERO_TEXT, DEFAULT_HERO_TITLE, websiteHref } from '../lib/branding'
import { fmtDateRange } from '../lib/format'
import { fetchGalleryRecent, galleryPhotoUrl, type GalleryRecent } from '../lib/galleryApi'
import { fetchPublicActivities } from '../lib/publicApi'
import { fmtCount, recordVisit, type SiteStats } from '../lib/siteApi'
import { errMsg } from '../lib/supabase'
import type { PublicActivity } from '../lib/types'


const STEPS = [
  { icon: CalendarDays, title: 'Pilih kegiatan', text: 'Temukan kegiatan yang sedang berjalan di bawah ini.' },
  { icon: UserRound, title: 'Masukkan NIP', text: 'Gunakan NIP yang didaftarkan panitia sebagai peserta.' },
  { icon: CalendarCheck, title: 'Gunakan menu Anda', text: 'Absen, kerjakan kuis, dan unduh sertifikat dari halaman pribadi.' },
]

export function Brand({ light = false }: { light?: boolean }) {
  const { settings } = useBrand()
  return (
    <div className={`landing-brand ${light ? 'light' : ''}`}>
      <BrandMark size={18} />
      <span><b>{settings.app_name}</b>{settings.tagline && <small>{settings.tagline}</small>}</span>
    </div>
  )
}

export default function Landing() {
  const { session } = useAuth()
  const { settings: brand } = useBrand()
  const [items, setItems] = useState<PublicActivity[] | null>(null)
  const [error, setError] = useState('')
  const [stats, setStats] = useState<SiteStats | null>(null)
  const [recent, setRecent] = useState<GalleryRecent[]>([])

  useEffect(() => {
    let alive = true
    fetchPublicActivities().then((d) => alive && setItems(d)).catch((e) => alive && setError(errMsg(e)))
    recordVisit().then((s) => alive && setStats(s)).catch(() => { /* statistik tidak wajib */ })
    fetchGalleryRecent(8).then((d) => alive && setRecent(d)).catch(() => { /* galeri belum aktif */ })
    return () => { alive = false }
  }, [])

  return (
    <div className="landing">
      <header className="landing-hero">
        <div className="container">
          <nav className="landing-nav" aria-label="Navigasi utama">
            <Brand light />
            <span className="spacer" />
            <Link className="landing-navlink" to="/galeri"><Images size={16} /> Galeri</Link>
            <ThemeToggle onDark />
            <Link className="btn landing-login" to={session ? '/admin' : '/login'}><LogIn size={16} /> {session ? 'Buka dashboard' : 'Masuk'}</Link>
          </nav>
          <div className="landing-hero-body">
            <span className="landing-pill">{brand.app_name}{brand.tagline ? ` · ${brand.tagline}` : ''}</span>
            <h1>{brand.hero_title ?? DEFAULT_HERO_TITLE}</h1>
            <p>{brand.hero_text ?? DEFAULT_HERO_TEXT}</p>
            <a className="btn primary lg" href="#kegiatan">Lihat kegiatan berjalan <ArrowRight size={18} /></a>
          </div>
        </div>
      </header>

      <main>
        <section id="kegiatan" className="container landing-section" aria-labelledby="h-kegiatan">
          <div className="landing-head">
            <h2 id="h-kegiatan">Kegiatan berjalan</h2>
            <p className="muted">Pilih kegiatan Anda, lalu masukkan NIP untuk membuka halaman pribadi.</p>
          </div>

          {error && <div className="alert error"><span>Daftar kegiatan tidak dapat dimuat. {error}</span></div>}
          {!items && !error && (
            <div className="landing-grid" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="card landing-skel" />)}</div>
          )}
          {items && items.length === 0 && (
            <div className="card landing-empty">
              <CalendarDays size={28} />
              <h3>Belum ada kegiatan yang sedang berjalan</h3>
              <p className="muted">Kegiatan akan tampil di sini setelah panitia mengaktifkannya. Silakan kembali lagi nanti.</p>
            </div>
          )}
          {items && items.length > 0 && (
            <div className="landing-grid">
              {items.map((a) => (
                <Link key={a.id} to={`/k/${a.id}`} className="card link landing-card" aria-label={`Masuk ke kegiatan ${a.name}`}>
                  <span className="badge dot success">Sedang berjalan</span>
                  <h3>{a.name}</h3>
                  <div className="meta">
                    {(a.start_date || a.end_date) && <span><CalendarDays size={15} /> {fmtDateRange(a.start_date, a.end_date)}</span>}
                    {a.location && <span><MapPin size={15} /> {a.location}</span>}
                  </div>
                  {a.description && <p className="muted small landing-desc">{a.description}</p>}
                  <span className="landing-go">Masuk dengan NIP <ArrowRight size={16} /></span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {recent.length > 0 && (
          <section className="container landing-section" aria-labelledby="h-galeri">
            <div className="landing-head row between">
              <div><h2 id="h-galeri">Galeri kegiatan</h2><p className="muted" style={{ margin: 0 }}>Potret terbaru dari kegiatan kami.</p></div>
              <Link to="/galeri" className="landing-go">Lihat semua galeri <ArrowRight size={16} /></Link>
            </div>
            <div className="landing-recent">
              {recent.map((r) => (
                <Link key={r.path} to={`/galeri/${r.activity_id}`} aria-label={`Galeri ${r.activity_name}`} title={r.caption || r.activity_name}>
                  <img src={galleryPhotoUrl(r.path)} alt={r.caption || r.activity_name} loading="lazy" />
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="container landing-section" aria-label="Pasang aplikasi"><InstallInfo /></section>

        <section className="landing-band" aria-labelledby="h-cara">
          <div className="container landing-section">
            <div className="landing-head"><h2 id="h-cara">Cara masuk</h2></div>
            <ol className="landing-steps">
              {STEPS.map(({ icon: Icon, title, text }, i) => (
                <li key={title}>
                  <span className="landing-step-no">{i + 1}</span>
                  <Icon size={22} className="landing-ico" />
                  <b>{title}</b><span className="muted small">{text}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <footer className="landing-foot">
        <div className="container row between" style={{ alignItems: 'flex-start' }}>
          <div>
            {stats && (
              <div className="site-stats" aria-label="Statistik kunjungan" style={{ marginBottom: 8 }}>
                <span><Eye size={15} style={{ verticalAlign: '-0.2em' }} /> Kunjungan hari ini: <b>{fmtCount(stats.today)}</b></span>
                <span><TrendingUp size={15} style={{ verticalAlign: '-0.2em' }} /> Total kunjungan: <b>{fmtCount(stats.total)}</b></span>
              </div>
            )}
            <span>{copyright(brand)}</span>
            {contactLines(brand).length > 0 && (
              <div className="small" style={{ marginTop: 6 }}>
                {contactLines(brand).map((l) => <div key={l}>{websiteHref(l) && l === brand.website ? <a href={websiteHref(l)!} target="_blank" rel="noreferrer">{l}</a> : l}</div>)}
              </div>
            )}
          </div>
          <Link to={session ? '/admin' : '/login'}>{session ? 'Buka dashboard' : 'Masuk'}</Link>
        </div>
      </footer>
    </div>
  )
}
