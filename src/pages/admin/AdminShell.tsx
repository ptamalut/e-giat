import { CheckCheck, LayoutGrid, LogOut } from 'lucide-react'
import { createContext, useContext, useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { ACTIVITY_NAV } from './nav'

interface SideActivity { id: string; name: string; statusLabel: string }
const SideCtx = createContext<(a: SideActivity | null) => void>(() => {})

/** Dipakai halaman kegiatan agar sidebar menampilkan menu kegiatan yang sedang dibuka. */
export function useSidebarActivity(a: SideActivity | null) {
  const set = useContext(SideCtx)
  const key = a ? `${a.id}|${a.name}|${a.statusLabel}` : ''
  useEffect(() => {
    set(a)
    return () => set(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, set])
}

export function Brand({ to = '/admin' }: { to?: string }) {
  return <Link to={to} className="brand"><span className="brand-mark"><CheckCheck size={18} strokeWidth={2.6} /></span>e-Giat</Link>
}

export default function AdminShell() {
  const { session, signOut } = useAuth()
  const [act, setAct] = useState<SideActivity | null>(null)
  const email = session?.user.email ?? ''

  return (
    <SideCtx.Provider value={setAct}>
      <div className="shell">
        <aside className="sidebar" aria-label="Menu utama">
          <Brand />
          <nav className="side-nav">
            <NavLink to="/admin" end className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}>
              <LayoutGrid size={18} /> Semua kegiatan
            </NavLink>
            {act && (
              <>
                <div className="side-label">Kegiatan dibuka</div>
                <div className="side-activity"><b>{act.name}</b><span>{act.statusLabel}</span></div>
                {ACTIVITY_NAV.map(({ to, label, icon: Icon, end }) => (
                  <NavLink key={to} to={`/admin/kegiatan/${act.id}${to ? '/' + to : ''}`} end={end}
                    className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}>
                    <Icon size={18} /> {label}
                  </NavLink>
                ))}
              </>
            )}
          </nav>
          <div className="side-foot">
            <span className="avatar" aria-hidden>{email.slice(0, 1).toUpperCase() || '?'}</span>
            <div className="who"><b>{email}</b><span>Panitia</span></div>
            <button className="icon-btn" onClick={() => void signOut()} aria-label="Keluar" title="Keluar"><LogOut size={18} /></button>
          </div>
        </aside>

        <div className="main">
          <header className="mobilebar">
            <div className="container">
              <Brand />
              <span className="spacer" />
              <button className="btn sm" onClick={() => void signOut()}><LogOut size={15} /> Keluar</button>
            </div>
          </header>
          <main className="container page"><Outlet /></main>
        </div>
      </div>
    </SideCtx.Provider>
  )
}
