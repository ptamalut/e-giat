import { ArrowLeft, CalendarDays, Compass, MapPin, ShieldCheck } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ThemeToggle } from '../components/theme'
import { Field, Loading } from '../components/ui'
import { fmtDateRange } from '../lib/format'
import { cleanNip, fetchPublicActivity, findMessage, findToken } from '../lib/publicApi'
import { errMsg } from '../lib/supabase'
import type { PublicActivity } from '../lib/types'
import { Brand } from './Landing'

/** Masuk ke kegiatan dengan NIP: bila cocok dengan data peserta, langsung membuka link pribadinya. */
export default function PublicActivityPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const [act, setAct] = useState<PublicActivity | null | undefined>(undefined)
  const [nip, setNip] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    fetchPublicActivity(id).then((a) => alive && setAct(a)).catch(() => alive && setAct(null))
    return () => { alive = false }
  }, [id])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const v = cleanNip(nip)
    if (v.length < 5) return setError('Masukkan NIP Anda dengan lengkap.')
    setBusy(true); setError('')
    try {
      const r = await findToken(id, v)
      const msg = findMessage(r)
      if (msg) return setError(msg)
      if ('token' in r) nav(`/p/${r.token}`)
    } catch (err) { setError(errMsg(err)) } finally { setBusy(false) }
  }

  if (act === undefined) return <Loading />

  return (
    <div className="auth-wrap">
      <div className="corner-theme"><ThemeToggle /></div>
      <div className="card auth-card" style={{ maxWidth: 460 }}>
        <Link to="/" className="crumb"><ArrowLeft size={15} /> Semua kegiatan</Link>
        <div style={{ margin: '4px 0 22px' }}><Brand /></div>

        {!act ? (
          <div className="center">
            <div className="empty" style={{ padding: '8px 0' }}><div className="big"><Compass size={26} /></div></div>
            <h2>Kegiatan tidak tersedia</h2>
            <p className="muted">Kegiatan ini belum berjalan, sudah selesai, atau tidak dibuka untuk umum. Hubungi panitia bila Anda merasa seharusnya bisa masuk.</p>
            <Link className="btn" to="/">Lihat kegiatan lain</Link>
          </div>
        ) : (
          <>
            <span className="badge dot success">Sedang berjalan</span>
            <h1 style={{ fontSize: '1.45rem', margin: '10px 0 8px' }}>{act.name}</h1>
            <div className="meta" style={{ marginBottom: 6 }}>
              {(act.start_date || act.end_date) && <span><CalendarDays size={15} /> {fmtDateRange(act.start_date, act.end_date)}</span>}
              {act.location && <span><MapPin size={15} /> {act.location}</span>}
            </div>
            {act.description && <p className="muted small" style={{ whiteSpace: 'pre-wrap' }}>{act.description}</p>}

            <form onSubmit={submit} style={{ marginTop: 22 }} noValidate>
              <Field label="NIP" hint="Tulis NIP Anda seperti yang didaftarkan panitia (spasi tidak masalah).">
                <input className="input mono lg" inputMode="numeric" autoComplete="off" autoFocus value={nip} placeholder="mis. 198001012005011001"
                  onChange={(e) => { setNip(e.target.value); setError('') }} aria-invalid={!!error} />
              </Field>
              {error && <div className="alert error" role="alert"><span>{error}</span></div>}
              <button className="btn primary lg block" disabled={busy || !nip.trim()}>{busy ? 'Memeriksa…' : 'Buka halaman saya'}</button>
            </form>
            <p className="muted small" style={{ margin: '16px 0 0', display: 'flex', gap: 8 }}>
              <ShieldCheck size={16} style={{ flex: 'none', marginTop: 2 }} />
              <span>Hanya NIP yang terdaftar sebagai peserta, narasumber, atau panitia kegiatan ini yang dapat masuk. Jangan membagikan halaman pribadi Anda.</span>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
