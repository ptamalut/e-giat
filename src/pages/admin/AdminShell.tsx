import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'

export default function AdminShell() {
  const { session, signOut } = useAuth()
  return (
    <>
      <header className="topbar">
        <div className="container">
          <Link to="/admin" className="brand"><span className="brand-mark">✓</span> e-Giat</Link>
          <span className="spacer" />
          <span className="muted small email">{session?.user.email}</span>
          <button className="btn sm" onClick={() => void signOut()}>Keluar</button>
        </div>
      </header>
      <main className="container page"><Outlet /></main>
    </>
  )
}
