import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Field } from '../components/ui'
import { errMsg, supabase } from '../lib/supabase'

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
    <div className="auth-wrap">
      <div className="card auth-card">
        <div className="brand" style={{ marginBottom: 16 }}>
          <span className="brand-mark">✓</span> e-Giat
        </div>
        <h2>{mode === 'in' ? 'Masuk Panitia' : 'Daftar Panitia'}</h2>
        <p className="muted">Kelola kegiatan, peserta, absensi, dan kuis.</p>
        {error && <div className="alert error">{error}</div>}
        {info && <div className="alert success">{info}</div>}
        <form onSubmit={submit}>
          <Field label="Email">
            <input className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Kata sandi" hint={mode === 'up' ? 'Minimal 6 karakter' : undefined}>
            <input className="input" type="password" required minLength={6} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <button className="btn primary block lg" disabled={busy}>{busy ? 'Memproses…' : mode === 'in' ? 'Masuk' : 'Daftar'}</button>
        </form>
        <p className="center small" style={{ marginTop: 16 }}>
          {mode === 'in' ? 'Belum punya akun? ' : 'Sudah punya akun? '}
          <a href="#" onClick={(e) => { e.preventDefault(); setMode(mode === 'in' ? 'up' : 'in'); setError(''); setInfo('') }}>
            {mode === 'in' ? 'Daftar' : 'Masuk'}
          </a>
        </p>
        <p className="center muted small">Peserta tidak perlu login — cukup buka link yang dikirim panitia.</p>
      </div>
    </div>
  )
}
