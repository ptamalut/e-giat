import { ArrowRight, ArrowUp, CalendarCheck, CalendarDays, Download, Eye, Globe, Images, LogIn, Mail, MapPin, Phone, ShieldCheck, TrendingUp, UserRound } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { BrandMark, useBrand } from '../components/brand'
import InstallDialog, { openInstallDialog } from '../components/InstallDialog'
import Slider from '../components/Slider'
import { ThemeToggle } from '../components/theme'
import { copyright, DEFAULT_HERO_TEXT, DEFAULT_HERO_TITLE, websiteHref } from '../lib/branding'
import { activityPhase, todayStr } from '../lib/phase'
import { fmtDateRange } from '../lib/format'
import { fetchGalleryRecent, galleryPhotoUrl, type GalleryRecent } from '../lib/galleryApi'
import { JENIS_LABEL } from '../lib/people'
import { fetchHistory, historyStatusLabel, type HistoryItem } from '../lib/historyApi'
import { fetchPublicActivities } from '../lib/publicApi'
import { useInstall } from '../lib/pwa'
import { fmtCount, recordVisit, type SiteStats } from '../lib/siteApi'
import { errMsg } from '../lib/supabase'
import type { PublicActivity } from '../lib/types'

const STEPS = [
  { icon: CalendarDays, title: 'Pilih kegiatan', text: 'Temukan kegiatan yang sedang berjalan di bagian Kegiatan berjalan.' },
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

function SectionHead({ eyebrow, title, sub, action, id }: { eyebrow: string; title: string; sub?: string; action?: ReactNode; id: string }) {
  return (
    <div className="landing-head row between">
      <div>
        <span className="landing-eyebrow">{eyebrow}</span>
        <h2 id={id}>{title}</h2>
        {sub && <p className="muted" style={{ margin: 0 }}>{sub}</p>}
      </div>
      {action}
    </div>
  )
}

function Stat({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return (
    <div className="landing-stat">
      <span className="landing-stat-ico">{icon}</span>
      <div><b>{value}</b><span>{label}</span></div>
    </div>
  )
}

function ActivityCard({ a, upcoming = false }: { a: PublicActivity; upcoming?: boolean }) {
  return (
    <Link to={`/k/${a.id}`} className="card link landing-card" aria-label={`Masuk ke kegiatan ${a.name}`}>
      <span className="row tight"><span className={`badge dot ${upcoming ? 'warn' : 'success'}`}>{upcoming ? 'Mendatang' : 'Sedang berjalan'}</span>{a.jenis && <span className="badge primary">{JENIS_LABEL[a.jenis]}</span>}</span>
      <h3>{a.name}</h3>
      <div className="meta">
        {(a.start_date || a.end_date) && <span><CalendarDays size={15} /> {fmtDateRange(a.start_date, a.end_date)}</span>}
        {a.location && <span><MapPin size={15} /> {a.location}</span>}
      </div>
      {a.description && <p className="muted small landing-desc">{a.description}</p>}
      <span className="landing-go">Masuk dengan NIP <ArrowRight size={16} /></span>
    </Link>
  )
}

export default function Landing() {
  const { session } = useAuth()
  const { settings: brand } = useBrand()
  const { installed } = useInstall()
  const [items, setItems] = useState<PublicActivity[] | null>(null)
  const [error, setError] = useState('')
  const [stats, setStats] = useState<SiteStats | null>(null)
  const [recent, setRecent] = useState<GalleryRecent[]>([])
  const [history, setHistory] = useState<HistoryItem[]>([])

  useEffect(() => {
    let alive = true
    fetchPublicActivities().then((d) => alive && setItems(d)).catch((e) => alive && setError(errMsg(e)))
    recordVisit().then((s) => alive && setStats(s)).catch(() => { /* statistik tidak wajib */ })
    fetchGalleryRecent(12).then((d) => alive && setRecent(d)).catch(() => { /* galeri belum aktif */ })
    fetchHistory().then((d) => alive && setHistory(d)).catch(() => { /* riwayat belum aktif */ })
    return () => { alive = false }
  }, [])

  const today = todayStr()
  const running = (items ?? []).filter((a) => activityPhase({ status: 'aktif', start_date: a.start_date }, today) === 'berjalan')
  const upcoming = (items ?? []).filter((a) => activityPhase({ status: 'aktif', start_date: a.start_date }, today) === 'mendatang')
  const totalActivities = Math.max(history.length, running.length)
  const photoCount = history.reduce((n, h) => n + h.photo_count, 0)
  const entry = session ? '/admin' : '/login'
  const contact: { icon: ReactNode; text: string; href?: string }[] = []
  if (brand.address) contact.push({ icon: <MapPin size={16} />, text: brand.address })
  if (brand.phone) contact.push({ icon: <Phone size={16} />, text: brand.phone, href: `tel:${brand.phone.replace(/[^\d+]/g, '')}` })
  if (brand.email) contact.push({ icon: <Mail size={16} />, text: brand.email, href: `mailto:${brand.email}` })
  if (brand.website) contact.push({ icon: <Globe size={16} />, text: brand.website, href: websiteHref(brand.website) ?? undefined })

  return (
    <div className="landing" id="top">
      <InstallDialog />
      <header className="landing-hero">
        <div className="landing-hero-art" aria-hidden><span className="orb o1" /><span className="orb o2" /><span className="ring r1" /><span className="ring r2" /></div>
        <div className="container landing-hero-inner">
          <nav className="landing-nav" aria-label="Navigasi utama">
            <Brand light />
            <span className="spacer" />
            <a className="landing-navlink hide-sm" href="#kegiatan"><CalendarCheck size={16} /> <span className="lbl">Kegiatan</span></a>
            {history.length > 0 && <a className="landing-navlink hide-sm" href="#riwayat"><CalendarDays size={16} /> <span className="lbl">Riwayat</span></a>}
            <Link className="landing-navlink" to="/galeri"><Images size={16} /> <span className="lbl">Galeri</span></Link>
            {!installed && <button type="button" className="landing-navlink" onClick={openInstallDialog} aria-label="Pasang aplikasi"><Download size={16} /> <span className="lbl">Pasang</span></button>}
            <ThemeToggle onDark />
            <Link className="btn landing-login" to={entry}><LogIn size={16} /> <span>{session ? 'Buka dashboard' : 'Masuk'}</span></Link>
          </nav>

          <div className="landing-hero-grid">
            <div className="landing-hero-body">
              <span className="landing-pill"><ShieldCheck size={14} /> {brand.app_name}{brand.tagline ? ` · ${brand.tagline}` : ''}</span>
              <h1>{brand.hero_title ?? DEFAULT_HERO_TITLE}</h1>
              <p>{brand.hero_text ?? DEFAULT_HERO_TEXT}</p>
              <div className="row" style={{ gap: 12 }}>
                <a className="btn primary lg" href="#kegiatan">Lihat kegiatan berjalan <ArrowRight size={18} /></a>
                <Link className="btn lg landing-ghost" to="/galeri"><Images size={18} /> Galeri kegiatan</Link>
              </div>
            </div>

            <aside className="landing-hero-card" aria-label="Kegiatan berjalan">
              <div className="row between" style={{ marginBottom: 10 }}>
                <b className="landing-live"><span className="live-dot" /> Sedang berjalan</b>
                <span className="muted-on-dark small">{items ? `${running.length} kegiatan` : '…'}</span>
              </div>
              {!items && !error && <div className="landing-mini-skel" />}
              {items && running.length === 0 && <p className="muted-on-dark small" style={{ margin: 0 }}>Belum ada kegiatan yang sedang berjalan. Silakan kembali lagi nanti.</p>}
              {running.slice(0, 3).map((a) => (
                <Link key={a.id} to={`/k/${a.id}`} className="landing-mini">
                  <span><b>{a.name}</b><small>{[(a.start_date || a.end_date) && fmtDateRange(a.start_date, a.end_date), a.location].filter(Boolean).join(' · ')}</small></span>
                  <ArrowRight size={16} />
                </Link>
              ))}
              {running.length > 3 && <a href="#kegiatan" className="landing-more">Lihat {running.length - 3} kegiatan lainnya</a>}
            </aside>
          </div>
        </div>
      </header>

      <div className="container landing-stats" role="list" aria-label="Ringkasan">
        <Stat icon={<CalendarCheck size={20} />} value={fmtCount(running.length)} label="Kegiatan berjalan" />
        {upcoming.length > 0 && <Stat icon={<CalendarDays size={20} />} value={fmtCount(upcoming.length)} label="Kegiatan mendatang" />}
        <Stat icon={<CalendarDays size={20} />} value={fmtCount(totalActivities)} label="Total kegiatan" />
        {photoCount > 0 && <Stat icon={<Images size={20} />} value={fmtCount(photoCount)} label="Foto dokumentasi" />}
        {stats && <Stat icon={<Eye size={20} />} value={fmtCount(stats.today)} label="Kunjungan hari ini" />}
      </div>

      <main>
        <section id="kegiatan" className="container landing-section" aria-labelledby="h-kegiatan">
          <SectionHead id="h-kegiatan" eyebrow="Peserta" title="Kegiatan berjalan" sub="Pilih kegiatan Anda, lalu masukkan NIP untuk membuka halaman pribadi." />
          {error && <div className="alert error"><span>Daftar kegiatan tidak dapat dimuat. {error}</span></div>}
          {!items && !error && (
            <div className="landing-grid" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="card landing-skel" />)}</div>
          )}
          {items && running.length === 0 && (
            <div className="card landing-empty">
              <CalendarDays size={28} />
              <h3>Belum ada kegiatan yang sedang berjalan</h3>
              <p className="muted">{upcoming.length ? 'Kegiatan akan tampil di sini pada hari pelaksanaannya; lihat Kegiatan mendatang di bawah.' : 'Kegiatan akan tampil di sini setelah panitia mengaktifkannya. Silakan kembali lagi nanti.'}</p>
            </div>
          )}
          {running.length > 0 && <div className="landing-grid">{running.map((a) => <ActivityCard key={a.id} a={a} />)}</div>}
        </section>

        {upcoming.length > 0 && (
          <section id="mendatang" className="container landing-section" aria-labelledby="h-mendatang">
            <SectionHead id="h-mendatang" eyebrow="Segera" title="Kegiatan mendatang" sub="Kegiatan yang akan dimulai pada tanggal berikutnya. Peserta dapat membuka halaman pribadinya sejak sekarang." />
            <div className="landing-grid">{upcoming.map((a) => <ActivityCard key={a.id} a={a} upcoming />)}</div>
          </section>
        )}

        {history.length > 0 && (
          <section id="riwayat" className="container landing-section" aria-labelledby="h-riwayat">
            <SectionHead id="h-riwayat" eyebrow="Arsip" title="Riwayat kegiatan" sub="Kegiatan yang telah dan sedang dilaksanakan, dari yang terbaru." />
            <Slider label="Riwayat kegiatan">
              {history.map((h) => (
                <article key={h.id} className="slider-item">
                  <div className="history-card">
                    <div className="history-cover">
                      {h.cover ? <img src={galleryPhotoUrl(h.cover)} alt="" loading="lazy" /> : <CalendarDays size={40} strokeWidth={1.5} />}
                      <span className={`badge dot ${h.status !== 'aktif' ? '' : activityPhase(h, today) === 'mendatang' ? 'warn' : 'success'}`}>{historyStatusLabel(h)}{h.jenis ? ` · ${JENIS_LABEL[h.jenis]}` : ''}</span>
                    </div>
                    <div className="history-body">
                      <h3>{h.name}</h3>
                      <div className="meta">
                        {(h.start_date || h.end_date) && <span><CalendarDays size={15} /> {fmtDateRange(h.start_date, h.end_date)}</span>}
                        {h.location && <span><MapPin size={15} /> {h.location}</span>}
                      </div>
                      {h.description && <p className="muted small landing-desc" style={{ margin: 0 }}>{h.description}</p>}
                      <div className="history-actions">
                        {h.status === 'aktif' && <Link className="btn sm primary" to={`/k/${h.id}`}>Masuk dengan NIP <ArrowRight size={14} /></Link>}
                        {h.photo_count > 0 && <Link className="btn sm" to={`/galeri/${h.id}`}><Images size={14} /> Galeri ({h.photo_count})</Link>}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </Slider>
          </section>
        )}

        {recent.length > 0 && (
          <section id="galeri" className="container landing-section" aria-labelledby="h-galeri">
            <SectionHead id="h-galeri" eyebrow="Dokumentasi" title="Galeri kegiatan" sub="Potret terbaru dari kegiatan kami."
              action={<Link to="/galeri" className="landing-go">Lihat semua galeri <ArrowRight size={16} /></Link>} />
            <Slider label="Galeri kegiatan" autoplayMs={5000}>
              {recent.map((r) => (
                <div key={r.path} className="slider-item">
                  <Link to={`/galeri/${r.activity_id}`} className="photo-slide" aria-label={`Galeri ${r.activity_name}`}>
                    <img src={galleryPhotoUrl(r.path)} alt={r.caption || r.activity_name} loading="lazy" />
                    <span className="cap"><b>{r.activity_name}</b>{r.caption}</span>
                  </Link>
                </div>
              ))}
            </Slider>
          </section>
        )}

        <section className="landing-band" aria-labelledby="h-cara">
          <div className="container landing-section">
            <SectionHead id="h-cara" eyebrow="Panduan" title="Cara masuk" sub="Tiga langkah singkat untuk membuka halaman pribadi Anda." />
            <ol className="landing-steps">
              {STEPS.map(({ icon: Icon, title, text }, i) => (
                <li key={title}>
                  <span className="landing-step-no">{i + 1}</span>
                  <span className="landing-step-ico"><Icon size={22} /></span>
                  <b>{title}</b><span className="muted small">{text}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="container landing-section" aria-label="Untuk panitia">
          <div className="landing-cta">
            <div>
              <h2>Panitia atau admin kegiatan?</h2>
              <p>Masuk untuk mengelola peserta, absensi, kuis, notula, dokumentasi, dan laporan kegiatan.</p>
            </div>
            <Link className="btn primary lg" to={entry}><LogIn size={18} /> {session ? 'Buka dashboard' : 'Masuk'}</Link>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="container landing-footer-grid">
          <div className="lf-brand">
            <Brand light />
            {brand.org_name && <p className="lf-org">{brand.org_name}</p>}
            <p className="lf-desc">Absensi, kuis, sertifikat, notula, dan dokumentasi kegiatan dalam satu tempat.</p>
          </div>
          <nav aria-label="Tautan footer">
            <h4>Jelajahi</h4>
            <ul>
              <li><a href="#top">Beranda</a></li>
              <li><a href="#kegiatan">Kegiatan berjalan</a></li>
              {history.length > 0 && <li><a href="#riwayat">Riwayat kegiatan</a></li>}
              <li><Link to="/galeri">Galeri kegiatan</Link></li>
              <li><Link to={entry}>{session ? 'Buka dashboard' : 'Masuk'}</Link></li>
            </ul>
          </nav>
          <div>
            <h4>Kontak</h4>
            {contact.length > 0
              ? <ul className="lf-contact">{contact.map((c) => (
                  <li key={c.text}>{c.icon}{c.href ? <a href={c.href} {...(c.href.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}>{c.text}</a> : <span>{c.text}</span>}</li>
                ))}</ul>
              : <p className="lf-desc">Hubungi panitia kegiatan untuk informasi lebih lanjut.</p>}
          </div>
          <div>
            <h4>Kunjungan</h4>
            {stats
              ? <ul className="lf-stats">
                  <li><Eye size={16} /> Hari ini <b>{fmtCount(stats.today)}</b></li>
                  <li><TrendingUp size={16} /> Total <b>{fmtCount(stats.total)}</b></li>
                </ul>
              : <p className="lf-desc">Memuat…</p>}
            {!installed && <button type="button" className="btn sm lf-install" onClick={openInstallDialog}><Download size={14} /> Pasang aplikasi</button>}
          </div>
        </div>
        <div className="landing-footer-bar">
          <div className="container row between">
            <span>{copyright(brand)}</span>
            <a href="#top" className="lf-top"><ArrowUp size={14} /> Kembali ke atas</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
