import { Link, NavLink, Outlet, useOutletContext, useParams } from 'react-router-dom'
import { ErrorBox, Loading, useAsync } from '../../components/ui'
import { fmtDateRange } from '../../lib/format'
import { errMsg, supabase } from '../../lib/supabase'
import type { Activity } from '../../lib/types'
import { STATUS_LABEL, STATUS_TONE } from './Dashboard'

export interface ActivityCtx { activity: Activity; reload: () => Promise<void> }
export const useActivity = () => useOutletContext<ActivityCtx>()

const TABS = [
  { to: '', label: 'Ringkasan', end: true },
  { to: 'peserta', label: '👥 Peserta' },
  { to: 'absensi', label: '🗓️ Absensi' },
  { to: 'kuis', label: '📝 Kuis' },
  { to: 'laporan', label: '📊 Laporan' },
]

export default function ActivityLayout() {
  const { id } = useParams()
  const { data, error, loading, reload } = useAsync(async () => {
    const { data, error } = await supabase.from('activities').select('*').eq('id', id!).maybeSingle()
    if (error) throw new Error(errMsg(error))
    if (!data) throw new Error('Kegiatan tidak ditemukan.')
    return data as Activity
  }, [id])

  if (loading && !data) return <Loading />
  if (error || !data) return <ErrorBox error={error ?? 'Kegiatan tidak ditemukan.'} onRetry={() => void reload()} />

  return (
    <>
      <div className="no-print"><Link to="/admin" className="muted small">← Semua kegiatan</Link></div>
      <div className="row between" style={{ marginTop: 6 }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>{data.name}</h1>
          <div className="row" style={{ gap: 8 }}>
            <span className={`badge ${STATUS_TONE[data.status]}`}>{STATUS_LABEL[data.status]}</span>
            <span className="muted small">{fmtDateRange(data.start_date, data.end_date)}</span>
            {data.location && <span className="muted small">📍 {data.location}</span>}
          </div>
        </div>
      </div>
      <nav className="tabs" aria-label="Menu kegiatan">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>{t.label}</NavLink>
        ))}
      </nav>
      <Outlet context={{ activity: data, reload: () => reload(true) } satisfies ActivityCtx} />
    </>
  )
}
