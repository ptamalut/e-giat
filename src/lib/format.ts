const dateTime = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
const dateOnly = new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' })
const timeOnly = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' })

export const fmtDateTime = (iso?: string | null) => (iso ? dateTime.format(new Date(iso)) : '—')
export const fmtTime = (iso?: string | null) => (iso ? timeOnly.format(new Date(iso)) : '—')
export const fmtDate = (d?: string | null) => (d ? dateOnly.format(new Date(d.length === 10 ? d + 'T00:00:00' : d)) : '—')

export function fmtDateRange(a?: string | null, b?: string | null) {
  if (!a && !b) return '—'
  if (a && (!b || a === b)) return fmtDate(a)
  return `${fmtDate(a)} – ${fmtDate(b)}`
}

/** ISO -> nilai untuk <input type="datetime-local"> (zona waktu perangkat) */
export function toLocalInput(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** nilai <input type="datetime-local"> -> ISO (UTC) atau null bila kosong */
export function fromLocalInput(v: string): string | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function fmtDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds)) return '—'
  const s = Math.max(0, Math.round(totalSeconds))
  const m = Math.floor(s / 60)
  const r = s % 60
  if (m === 0) return `${r} dtk`
  return `${m} mnt ${String(r).padStart(2, '0')} dtk`
}

export function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${p(m)}:${p(r)}` : `${p(m)}:${p(r)}`
}

export function fmtScore(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  return Number(n).toLocaleString('id-ID', { maximumFractionDigits: digits })
}

export const fmtPct = (n: number | null | undefined) => (n == null ? '—' : `${fmtScore(n, 0)}%`)

export function timeState(start: string | null, end: string | null, now: number): 'upcoming' | 'open' | 'closed' {
  if (start && now < new Date(start).getTime()) return 'upcoming'
  if (end && now > new Date(end).getTime()) return 'closed'
  return 'open'
}

export function participantLink(token: string): string {
  return `${window.location.origin}/p/${token}`
}
