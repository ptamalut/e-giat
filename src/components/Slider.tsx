import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { currentPage, EDGE, nextScrollLeft, slidePages } from '../lib/slider'

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Slider horizontal: geser dengan sentuhan/trackpad, tombol panah, atau titik halaman.
 * `autoplayMs` > 0 menggeser otomatis; berhenti saat kursor/fokus di atasnya, tab tersembunyi, atau pengguna memilih gerak minimal.
 */
export default function Slider({ label, children, autoplayMs = 0, className = '' }: {
  label: string; children: ReactNode; autoplayMs?: number; className?: string
}) {
  const track = useRef<HTMLDivElement>(null)
  const paused = useRef(false)
  const [st, setSt] = useState({ page: 0, pages: 1, atStart: true, atEnd: true })

  const measure = useCallback(() => {
    const t = track.current
    if (!t) return
    const pages = slidePages(t.scrollWidth, t.clientWidth)
    setSt({
      pages, page: currentPage(t.scrollLeft, t.clientWidth, t.scrollWidth),
      atStart: t.scrollLeft <= EDGE, atEnd: t.scrollLeft + t.clientWidth >= t.scrollWidth - EDGE,
    })
  }, [])

  useEffect(() => {
    const t = track.current
    if (!t) return
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(t)
    return () => ro.disconnect()
  }, [measure, children])

  const go = useCallback((dir: 1 | -1, wrap = false) => {
    const t = track.current
    if (!t) return
    const to = nextScrollLeft(t.scrollLeft, t.clientWidth, t.scrollWidth, dir, wrap)
    if (to != null) t.scrollTo({ left: to, behavior: reducedMotion() ? 'auto' : 'smooth' })
  }, [])

  useEffect(() => {
    if (autoplayMs <= 0 || reducedMotion()) return
    const id = setInterval(() => { if (!paused.current && !document.hidden) go(1, true) }, autoplayMs)
    return () => clearInterval(id)
  }, [autoplayMs, go])

  const toPage = (i: number) => {
    const t = track.current
    if (t) t.scrollTo({ left: Math.min(i * t.clientWidth, t.scrollWidth - t.clientWidth), behavior: reducedMotion() ? 'auto' : 'smooth' })
  }

  const hold = (v: boolean) => () => { paused.current = v }
  return (
    <div className={`slider ${className}`} role="group" aria-roledescription="carousel" aria-label={label}
      onMouseEnter={hold(true)} onMouseLeave={hold(false)} onFocus={hold(true)} onBlur={hold(false)} onTouchStart={hold(true)} onTouchEnd={hold(false)}>
      <div className="slider-track" ref={track} onScroll={measure} tabIndex={0} aria-label={`${label} (geser untuk melihat lainnya)`}>
        {children}
      </div>
      {!(st.atStart && st.atEnd) && (
        <>
          <button type="button" className="slider-nav prev" aria-label="Sebelumnya" disabled={st.atStart} onClick={() => go(-1)}><ChevronLeft size={22} /></button>
          <button type="button" className="slider-nav next" aria-label="Berikutnya" disabled={st.atEnd} onClick={() => go(1)}><ChevronRight size={22} /></button>
          {st.pages > 1 && (
            <div className="slider-dots" role="group" aria-label="Halaman slider">
              {Array.from({ length: st.pages }, (_, i) => (
                <button key={i} type="button" aria-label={`Halaman ${i + 1}`} aria-current={i === st.page ? 'true' : undefined} className={i === st.page ? 'on' : ''} onClick={() => toPage(i)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
