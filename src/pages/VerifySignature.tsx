import { ArrowLeft, BadgeCheck, Compass, ShieldAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ThemeToggle } from '../components/theme'
import { Loading } from '../components/ui'
import { fmtDateTime } from '../lib/format'
import { ATT_LABEL } from '../lib/reports'
import { errMsg } from '../lib/supabase'
import { isSignCode, verifySignature, type SignatureCheck } from '../lib/verifyApi'
import { Brand } from './Landing'

/** Pemeriksaan tanda tangan elektronik: dibuka dari QR pada daftar hadir cetak (tanpa login). */
export default function VerifySignaturePage() {
  const { code = '' } = useParams()
  const [res, setRes] = useState<SignatureCheck | null | undefined>(isSignCode(code) ? undefined : null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isSignCode(code)) { setRes(null); return }
    let alive = true
    verifySignature(code).then((r) => alive && setRes(r)).catch((e) => { if (alive) { setError(errMsg(e)); setRes(null) } })
    return () => { alive = false }
  }, [code])

  if (res === undefined) return <Loading />

  const row = (k: string, v: string | null | undefined) => v ? <div className="vs-row"><span className="muted">{k}</span><b>{v}</b></div> : null
  return (
    <div className="auth-wrap">
      <div className="corner-theme"><ThemeToggle /></div>
      <div className="card auth-card" style={{ maxWidth: 480 }}>
        <Link to="/" className="crumb"><ArrowLeft size={15} /> Beranda</Link>
        <div style={{ margin: '4px 0 18px' }}><Brand /></div>
        {!res ? (
          <div className="center">
            <div className="empty" style={{ padding: '8px 0' }}><div className="big"><Compass size={26} /></div></div>
            <h2>Tanda tangan tidak ditemukan</h2>
            <p className="muted">{error || 'Kode pada QR ini tidak dikenali. Dokumen mungkin tidak asli, atau catatan kehadirannya sudah dihapus panitia.'}</p>
          </div>
        ) : (
          <>
            <div className={`vs-status ${res.valid ? 'ok' : 'no'}`} role="status">
              {res.valid ? <BadgeCheck size={28} /> : <ShieldAlert size={28} />}
              <div>
                <b>{res.valid ? 'Tanda tangan elektronik sah' : 'Bukan catatan kehadiran'}</b>
                <span>{res.valid ? 'Kehadiran tercatat di sistem.' : `Statusnya saat ini: ${ATT_LABEL[res.status]}.`}</span>
              </div>
            </div>
            <div className="vs-card">
              {row('Nama', res.name)}
              {row('NIP', res.nip)}
              {row('Jabatan', res.job_title)}
              {row('Satuan kerja', res.institution)}
              {row('Kegiatan', res.activity)}
              {row('Sesi', res.session)}
              {row('Waktu absen', fmtDateTime(res.checked_in_at))}
              {row('Status', ATT_LABEL[res.status])}
            </div>
            {res.manual && <p className="muted small">Kehadiran ini dicatat manual oleh panitia, bukan absen mandiri oleh yang bersangkutan.</p>}
            <p className="muted small" style={{ marginBottom: 0 }}>Cocokkan nama dan kegiatan di atas dengan dokumen yang dicetak. NIP sebagian disamarkan untuk menjaga privasi.</p>
          </>
        )}
      </div>
    </div>
  )
}
