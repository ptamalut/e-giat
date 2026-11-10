import { ArrowLeft, BarChart3, ClipboardList, QrCode } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { BrandMark, useBrand } from '../components/brand'
import { ThemeToggle } from '../components/theme'
import { Field } from '../components/ui'
import { resolveLoginEmail } from '../lib/accountApi'
import { copyright } from '../lib/branding'
import { errMsg, supabase } from '../lib/supabase'

const POINTS = [
  { icon: QrCode, title: 'Absensi lewat link & QR pribadi', text: 'Peserta cukup scan dari HP, tanpa membuat akun.' },
  { icon: ClipboardList, title: 'Pre test & post test berwaktu', text: 'Penilaian otomatis dengan hitung mundur berbasis jam server.' },
  { icon: BarChart3, title: 'Laporan & peringkat lengkap', text: 'Kehadiran, hasil kuis, peningkatan N-Gain, siap diunduh.' },
]

export default function Login() {
  const { session, loading } = useAuth()
  const { settings: brand } = useBrand()
  const loc = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!loading && session) return <Navigate to={(loc.state as { from?: string } | null)?.from ?? '/admin'} replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const login = await resolveLoginEmail(username)
      if (!login) throw new Error('Nama pengguna atau kata sandi salah.')
      const { error } = await supabase.auth.signInWithPassword({ email: login, password })
      if (error) throw error
    } catch (err) {
      const m = errMsg(err)
      setError(/invalid login credentials/i.test(m) ? 'Nama pengguna atau kata sandi salah.' : m)
    } finally { setBusy(false) }
  }

  return (
    <div className="auth-split">
      <div className="corner-theme"><ThemeToggle /></div>
      <aside className="auth-aside">
        <div>
          <div className="brand"><BrandMark size={18} />{brand.app_name}</div>
          {brand.tagline && <div className="brand-sub">{brand.tagline}</div>}
        </div>
        <div>
          <h2>Kelola absensi dan kuis kegiatan dengan rapi.</h2>
          <p>Satu tempat untuk peserta, kehadiran, pre/post test, dan laporan hasil kegiatan Anda.</p>
          <ul className="auth-points">
            {POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title}>
                <span className="icon-chip"><Icon size={17} /></span>
                <div><b>{title}</b><div style={{ opacity: .75, fontSize: '.88rem' }}>{text}</div></div>
              </li>
            ))}
          </ul>
        </div>
        <small style={{ opacity: .6 }}>{copyright(brand)}</small>
      </aside>

      <div className="auth-main">
        <Link to="/" className="auth-back"><ArrowLeft size={16} /> Kembali ke beranda</Link>
        <div className="auth-card">
          <div className="only-mobile" style={{ marginBottom: 28 }}><div className="brand"><BrandMark size={18} />{brand.app_name}</div>{brand.tagline && <div className="brand-sub">{brand.tagline}</div>}</div>
          <h1 style={{ marginBottom: 6 }}>Selamat datang kembali</h1>
          <p className="muted" style={{ marginBottom: 24 }}>Masuk untuk mengelola kegiatan Anda.</p>
          {error && <div className="alert error">{error}</div>}
          <form onSubmit={submit}>
            <Field label="Nama pengguna">
              <input className="input" required autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="mis. budi.santoso" value={username} onChange={(e) => setUsername(e.target.value)} />
            </Field>
            <Field label="Kata sandi">
              <input className="input" type="password" required minLength={6} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <button className="btn primary block lg" disabled={busy}>{busy ? 'Memproses…' : 'Masuk'}</button>
          </form>
          <p className="center muted small" style={{ marginTop: 20 }}>Akun dibuat oleh admin aplikasi. Peserta tidak perlu login: cukup buka link yang dikirim panitia atau masukkan NIP di beranda.</p>
        </div>
      </div>
    </div>
  )
}
