import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Images, MapPin, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Empty, ErrorBox, Loading, useAsync } from '../components/ui'
import { fmtDate, fmtDateRange } from '../lib/format'
import { fetchGallery, fetchGalleryActivity, galleryPhotoUrl, groupPhotos, type GalleryPhoto } from '../lib/galleryApi'
import { Brand } from './Landing'
import { ThemeToggle } from '../components/theme'

function Shell({ children, back }: { children: React.ReactNode; back: { to: string; label: string } }) {
  return (
    <div className="landing">
      <header className="gallery-top">
        <div className="container">
          <nav className="landing-nav" aria-label="Navigasi galeri">
            <Link to="/" aria-label="Beranda"><Brand light /></Link>
            <span className="spacer" />
            <ThemeToggle onDark />
            <Link className="btn landing-login" to={back.to}><ArrowLeft size={16} /> {back.label}</Link>
          </nav>
        </div>
      </header>
      <main className="container landing-section">{children}</main>
    </div>
  )
}

/** Daftar kegiatan yang galerinya dibuka panitia. */
export function GalleryList() {
  const { data, error, loading } = useAsync(fetchGallery, [])
  return (
    <Shell back={{ to: '/', label: 'Beranda' }}>
      <div className="landing-head">
        <h1 style={{ marginBottom: 4 }}>Galeri kegiatan</h1>
        <p className="muted">Foto dokumentasi kegiatan. Pilih kegiatan untuk melihat semua fotonya.</p>
      </div>
      {error && <ErrorBox error={error} />}
      {loading && !data && <Loading />}
      {data && data.length === 0 && <Empty icon={<Images size={26} />} title="Belum ada galeri">Galeri akan tampil di sini setelah panitia membukanya untuk umum.</Empty>}
      {data && data.length > 0 && (
        <div className="landing-grid">
          {data.map((g) => (
            <Link key={g.id} to={`/galeri/${g.id}`} className="card link gallery-card" aria-label={`Galeri ${g.name}`}>
              <div className={`gallery-mosaic n${Math.min(g.previews.length, 4)}`}>
                {g.previews.slice(0, 4).map((p) => <img key={p} src={galleryPhotoUrl(p)} alt="" loading="lazy" />)}
              </div>
              <h3>{g.name}</h3>
              <div className="meta">
                {(g.start_date || g.end_date) && <span><CalendarDays size={15} /> {fmtDateRange(g.start_date, g.end_date)}</span>}
                {g.location && <span><MapPin size={15} /> {g.location}</span>}
                <span><Images size={15} /> {g.photo_count} foto</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Shell>
  )
}

/** Semua foto sebuah kegiatan, per album, dengan penampil foto layar penuh. */
export function GalleryActivityPage() {
  const { id = '' } = useParams()
  const { data, error, loading } = useAsync(() => fetchGalleryActivity(id), [id])
  const [open, setOpen] = useState<number | null>(null)
  const groups = groupPhotos(data?.photos ?? [])
  const photos = groups.flatMap((g) => g.photos)   // urutan penampil = urutan di layar (per album)
  const step = useCallback((d: number) => setOpen((i) => (i == null ? i : (i + d + photos.length) % photos.length)), [photos.length])

  useEffect(() => {
    if (open == null) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); else if (e.key === 'ArrowLeft') step(-1); else if (e.key === 'ArrowRight') step(1) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, step])

  const cur: GalleryPhoto | null = open != null ? photos[open] ?? null : null
  return (
    <Shell back={{ to: '/galeri', label: 'Semua galeri' }}>
      {error && <ErrorBox error={error} />}
      {loading && !data && <Loading />}
      {!loading && !error && !data && <Empty icon={<Images size={26} />} title="Galeri tidak tersedia">Galeri kegiatan ini belum dibuka untuk umum atau sudah ditutup.</Empty>}
      {data && (
        <>
          <div className="landing-head">
            <h1 style={{ marginBottom: 6 }}>{data.activity.name}</h1>
            <div className="meta">
              {(data.activity.start_date || data.activity.end_date) && <span><CalendarDays size={15} /> {fmtDateRange(data.activity.start_date, data.activity.end_date)}</span>}
              {data.activity.location && <span><MapPin size={15} /> {data.activity.location}</span>}
              <span><Images size={15} /> {photos.length} foto</span>
            </div>
          </div>
          {groups.map((g) => (
            <section key={g.album} style={{ marginBottom: 22 }} aria-label={g.album}>
              <div className="label" style={{ marginBottom: 8 }}>{g.album} <span className="muted">· {g.photos.length}</span></div>
              <div className="gallery gallery-lg">
                {g.photos.map((p) => (
                  <button key={p.id} type="button" className="gallery-item" onClick={() => setOpen(photos.findIndex((x) => x.id === p.id))} aria-label={`Lihat ${p.caption || 'foto'}`}>
                    <img src={galleryPhotoUrl(p.path)} alt={p.caption || 'Foto kegiatan'} loading="lazy" />
                    {p.caption && <span className="gallery-cap">{p.caption}</span>}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
      {cur && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label="Penampil foto" onClick={() => setOpen(null)}>
          <button className="lightbox-x" aria-label="Tutup" onClick={() => setOpen(null)}><X size={22} /></button>
          {photos.length > 1 && <button className="lightbox-nav prev" aria-label="Foto sebelumnya" onClick={(e) => { e.stopPropagation(); step(-1) }}><ChevronLeft size={28} /></button>}
          <figure onClick={(e) => e.stopPropagation()}>
            <img src={galleryPhotoUrl(cur.path)} alt={cur.caption || 'Foto kegiatan'} />
            <figcaption>{[cur.caption, cur.album, cur.taken_on && fmtDate(cur.taken_on)].filter(Boolean).join(' · ')}<span className="muted"> ({(open ?? 0) + 1}/{photos.length})</span></figcaption>
          </figure>
          {photos.length > 1 && <button className="lightbox-nav next" aria-label="Foto berikutnya" onClick={(e) => { e.stopPropagation(); step(1) }}><ChevronRight size={28} /></button>}
        </div>
      )}
    </Shell>
  )
}
