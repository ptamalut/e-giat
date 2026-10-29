import { ArrowLeft, Calendar, MapPin, PowerOff } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation, useOutletContext, useParams } from 'react-router-dom'
import { Empty, ErrorBox, Loading, PageHeader, useAsync } from '../../components/ui'
import { enabledMenus, menuOfPath, menuOn } from '../../lib/menus'
import { fmtDateRange } from '../../lib/format'
import { errMsg, supabase } from '../../lib/supabase'
import type { Activity } from '../../lib/types'
import { useSidebarActivity } from './AdminShell'
import { STATUS_LABEL, STATUS_TONE } from './Dashboard'
import { activityNav } from './nav'

export interface ActivityCtx { activity: Activity; reload: () => Promise<void> }
export const useActivity = () => useOutletContext<ActivityCtx>()

export default function ActivityLayout() {
  const { id } = useParams()
  const { data, error, loading, reload } = useAsync(async () => {
    const { data, error } = await supabase.from('activities').select('*').eq('id', id!).maybeSingle()
    if (error) throw new Error(errMsg(error))
    if (!data) throw new Error('Kegiatan tidak ditemukan.')
    return data as Activity
  }, [id])

  const { pathname } = useLocation()
  const menus = data ? enabledMenus(data) : []
  useSidebarActivity(data ? { id: data.id, name: data.name, statusLabel: STATUS_LABEL[data.status], menus } : null)

  if (loading && !data) return <Loading />
  if (error || !data) return <ErrorBox error={error ?? 'Kegiatan tidak ditemukan.'} onRetry={() => void reload()} />
  // alamat menu yang dinonaktifkan (mis. dari bookmark) tidak dirender
  const blocked = (() => { const m = menuOfPath(pathname.split(`/kegiatan/${data.id}/`)[1] ?? ''); return m && !menuOn(data, m.key) ? m : null })()

  return (
    <>
      <PageHeader
        back={<Link to="/admin" className="crumb no-print"><ArrowLeft size={15} /> Semua kegiatan</Link>}
        title={data.name}
        subtitle={
          <div className="meta">
            <span className={`badge dot ${STATUS_TONE[data.status]}`}>{STATUS_LABEL[data.status]}</span>
            <span><Calendar size={15} /> {fmtDateRange(data.start_date, data.end_date)}</span>
            {data.location && <span><MapPin size={15} /> {data.location}</span>}
          </div>
        }
      />
      {/* di desktop menu ada di sidebar; di layar kecil tampil sebagai tab */}
      <nav className="tabs only-mobile" aria-label="Menu kegiatan">
        {activityNav(menus).map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}><Icon size={16} />{label}</NavLink>
        ))}
      </nav>
      {blocked
        ? <div className="card"><Empty icon={<PowerOff size={26} />} title={`Menu ${blocked.label} dinonaktifkan`}>
            Menu ini tidak aktif untuk kegiatan ini. Aktifkan di <Link to=".">Ringkasan → Menu kegiatan</Link> bila diperlukan.
          </Empty></div>
        : <Outlet context={{ activity: data, reload: () => reload(true) } satisfies ActivityCtx} />}
    </>
  )
}
