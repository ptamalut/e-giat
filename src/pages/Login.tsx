import { BarChart3, CheckCheck, ClipboardList, QrCode } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ThemeToggle } from '../components/theme'
import { Field } from '../components/ui'
import { errMsg, supabase } from '../lib/supabase'

const POINTS = [
  { icon: QrCode, title: 'Absensi lewat link & QR pribadi', text: 'Peserta cukup scan dari HP, tanpa membuat akun.' },
  { icon: ClipboardList, title: 'Pre test & post test berwaktu', text: 'Penilaian otomatis dengan hitung mundur berbasis jam server.' },
  { icon: BarChart3, title: 'Laporan & peringkat lengkap', text: 'Kehadiran, hasil kuis, peningkatan N-Gain, siap diunduh.' },
]

export default function Login() {
  const { session, loading } = useAuth()
  const loc = useLocation()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  if (!loading && session) return <Navigate to={(loc.state as { from?: string } | null)?.from ?? '/admin'} replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError(''); setInfo('')
    try {
      if (mode === 'in') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        if (!data.session) setInfo('Pendaftaran berhasil. Cek email Anda untuk konfirmasi, lalu masuk.')
      }
    } catch (err) {
      const m = errMsg(err)
      setError(/invalid login credentials/i.test(m) ? 'Email atau kata sandi salah.' : m)
    } finally { setBusy(false) }
  }

  return (
    <div className="auth-split">
      <div className="corner-theme"><ThemeToggle /></div>
      <aside className="auth-aside">
        <div>
          <div className="brand"><span className="brand-mark"><CheckCheck size={18} strokeWidth={2.6} /></span>LAKSANA</div>
          <div className="brand-sub">Pelaksanaan Kegiatan PTA Malut</div>
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
        <small style={{ opacity: .6 }}>© {new Date().getFullYear()} LAKSANA - Pelaksanaan Kegiatan PTA Malut</small>
      </aside>

      <div className="auth-main">
        <div className="auth-card">
          <div className="only-mobile" style={{ marginBottom: 28 }}><div className="brand"><span className="brand-mark"><CheckCheck size={18} strokeWidth={2.6} /></span>LAKSANA</div><div className="brand-sub">Pelaksanaan Kegiatan PTA Malut</div></div>
          <h1 style={{ marginBottom: 6 }}>{mode === 'in' ? 'Selamat datang kembali' : 'Buat akun panitia'}</h1>
          <p className="muted" style={{ marginBottom: 24 }}>{mode === 'in' ? 'Masuk untuk mengelola kegiatan Anda.' : 'Daftar untuk mulai membuat kegiatan.'}</p>
          {error && <div className="alert error">{error}</div>}
          {info && <div className="alert success">{info}</div>}
          <form onSubmit={submit}>
            <Field label="Email">
              <input className="input" type="email" required autoComplete="email" placeholder="nama@instansi.id" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Kata sandi" hint={mode === 'up' ? 'Minimal 6 karakter' : undefined}>
              <input className="input" type="password" required minLength={6} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <button className="btn primary block lg" disabled={busy}>{busy ? 'Memproses…' : mode === 'in' ? 'Masuk' : 'Daftar'}</button>
          </form>
          <p className="center small" style={{ marginTop: 20 }}>
            {mode === 'in' ? 'Belum punya akun? ' : 'Sudah punya akun? '}
            <a href="#" onClick={(e) => { e.preventDefault(); setMode(mode === 'in' ? 'up' : 'in'); setError(''); setInfo('') }}>
              <b>{mode === 'in' ? 'Daftar' : 'Masuk'}</b>
            </a>
          </p>
          <p className="center muted small">Peserta tidak perlu login. Cukup buka link yang dikirim panitia.</p>
        </div>
      </div>
    </div>
  )
}
