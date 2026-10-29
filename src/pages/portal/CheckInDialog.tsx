import { Camera, CheckCircle2, MapPin, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Modal } from '../../components/ui'
import {
  captureSelfie, CaptureError, fmtAccuracy, fmtCoord, getPosition, queryPermission, startCamera, stopStream, type Fix, type PermState,
} from '../../lib/capture'
import { fmtTime } from '../../lib/format'
import { errMsg, rpc, supabase } from '../../lib/supabase'
import type { PortalSession } from '../../lib/types'

export interface CheckInResult { already: boolean; status: 'hadir' | 'terlambat' | 'izin' | 'sakit' | 'alpa' }

const PERM_TEXT: Record<PermState, string> = {
  granted: 'Izin sudah diberikan', denied: 'Izin diblokir di browser', prompt: 'Browser akan meminta izin', unknown: '',
}

/**
 * Absen dengan lokasi dan/atau foto selfie. Izin diminta hanya setelah peserta membaca penjelasan dan menekan tombol.
 * Foto diunggah ke bucket privat lewat slot sekali pakai dari server, lalu absen dikirim bersama path-nya.
 */
export default function CheckInDialog({ token, session, onClose, onDone }: {
  token: string; session: PortalSession; onClose: () => void; onDone: (r: CheckInResult) => void
}) {
  const needLoc = session.require_location
  const needSelfie = session.require_selfie

  const [perm, setPerm] = useState<{ loc: PermState; cam: PermState }>({ loc: 'unknown', cam: 'unknown' })
  const [fix, setFix] = useState<Fix | null>(null)
  const [loc, setLoc] = useState<'idle' | 'busy' | 'error'>('idle')
  const [locErr, setLocErr] = useState('')
  const [cam, setCam] = useState<'idle' | 'starting' | 'live' | 'error'>('idle')
  const [camErr, setCamErr] = useState('')
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const stream = useRef<MediaStream | null>(null)
  const video = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    void Promise.all([queryPermission('geolocation'), queryPermission('camera')]).then(([l, c]) => setPerm({ loc: l, cam: c }))
    return () => stopStream(stream.current) // kamera selalu dimatikan saat dialog ditutup
  }, [])
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url) }, [photo])
  useEffect(() => {
    if (cam === 'live' && video.current && stream.current) {
      video.current.srcObject = stream.current
      void video.current.play().catch(() => {})
    }
  }, [cam])

  async function askLocation() {
    setLoc('busy'); setLocErr('')
    try { setFix(await getPosition()); setLoc('idle'); setPerm((p) => ({ ...p, loc: 'granted' })) }
    catch (e) {
      setLoc('error'); setLocErr(e instanceof Error ? e.message : String(e))
      if (e instanceof CaptureError && e.code === 'denied') setPerm((p) => ({ ...p, loc: 'denied' }))
    }
  }

  async function openCamera() {
    setCam('starting'); setCamErr('')
    stopStream(stream.current)
    try { stream.current = await startCamera(); setCam('live'); setPerm((p) => ({ ...p, cam: 'granted' })) }
    catch (e) {
      setCam('error'); setCamErr(e instanceof Error ? e.message : String(e))
      if (e instanceof CaptureError && e.code === 'denied') setPerm((p) => ({ ...p, cam: 'denied' }))
    }
  }

  async function snap() {
    if (!video.current) return
    try {
      const blob = await captureSelfie(video.current)
      stopStream(stream.current); stream.current = null
      setPhoto({ blob, url: URL.createObjectURL(blob) })
      setCam('idle')
    } catch (e) { setCamErr(e instanceof Error ? e.message : String(e)) }
  }

  async function startAll() {
    if (needLoc && !fix) await askLocation()
    if (needSelfie && !photo) await openCamera()
  }

  const ready = (!needLoc || !!fix) && (!needSelfie || !!photo)
  const untouched = !fix && !photo && cam === 'idle' && loc === 'idle'

  async function submit() {
    setBusy(true); setError('')
    try {
      let path: string | null = null
      if (photo) {
        const slot = await rpc<{ path: string }>('portal_selfie_slot', { p_token: token, p_session: session.id })
        const up = await supabase.storage.from('selfies').upload(slot.path, photo.blob, { contentType: 'image/jpeg', upsert: false })
        if (up.error) throw new Error(`Foto gagal diunggah: ${errMsg(up.error)}`)
        path = slot.path
      }
      const r = await rpc<CheckInResult>('portal_check_in', {
        p_token: token, p_session: session.id,
        p_lat: fix?.lat ?? null, p_lng: fix?.lng ?? null, p_accuracy: fix?.accuracy ?? null, p_selfie_path: path,
      })
      onDone(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  const what = [needSelfie && 'foto selfie', needLoc && 'lokasi'].filter(Boolean).join(' dan ')

  return (
    <Modal title={`Absen: ${session.title}`} onClose={() => !busy && onClose()}
      footer={<>
        <button className="btn" onClick={onClose} disabled={busy}>Batal</button>
        <button className="btn primary lg" onClick={() => void submit()} disabled={!ready || busy}>
          {busy ? 'Mengirim…' : <><CheckCircle2 size={18} /> Kirim absen</>}
        </button>
      </>}>
      <div className="alert info" style={{ alignItems: 'flex-start' }}>
        <ShieldCheck size={18} />
        <span>
          Absen pada sesi ini memerlukan <b>{what}</b>. Browser akan meminta izin {needSelfie && 'kamera'}{needSelfie && needLoc && ' dan '}{needLoc && 'lokasi'}; mohon pilih <b>Izinkan</b>.
          Data hanya dipakai untuk memverifikasi kehadiran dan hanya dapat dilihat oleh panitia kegiatan.
        </span>
      </div>

      {untouched && (
        <button className="btn primary block lg" style={{ marginBottom: 14 }} onClick={() => void startAll()}>
          <Camera size={18} /> Izinkan {needSelfie && 'kamera'}{needSelfie && needLoc && ' & '}{needLoc && 'lokasi'}
        </button>
      )}

      {needLoc && (
        <section className="card" style={{ boxShadow: 'none', marginBottom: 12, padding: 16 }} aria-label="Lokasi">
          <div className="row between" style={{ flexWrap: 'nowrap' }}>
            <div className="row" style={{ flexWrap: 'nowrap', gap: 10 }}>
              <span className={`icon-chip ${fix ? 'success' : ''}`}><MapPin size={18} /></span>
              <div>
                <b>Lokasi</b>
                <div className="muted small">{fix ? <>Terbaca: <span className="mono">{fmtCoord(fix.lat, fix.lng)}</span> {fmtAccuracy(fix.accuracy)}</> : PERM_TEXT[perm.loc] || 'Belum dibaca'}</div>
              </div>
            </div>
            <button className="btn sm" onClick={() => void askLocation()} disabled={loc === 'busy' || busy}>
              {loc === 'busy' ? 'Membaca…' : fix ? <><RefreshCw size={14} /> Perbarui</> : 'Izinkan lokasi'}
            </button>
          </div>
          {loc === 'error' && <div className="alert error" style={{ margin: '12px 0 0' }}><TriangleAlert size={18} /><span>{locErr}</span></div>}
        </section>
      )}

      {needSelfie && (
        <section className="card" style={{ boxShadow: 'none', marginBottom: 12, padding: 16 }} aria-label="Foto selfie">
          <div className="row between" style={{ flexWrap: 'nowrap', marginBottom: 12 }}>
            <div className="row" style={{ flexWrap: 'nowrap', gap: 10 }}>
              <span className={`icon-chip ${photo ? 'success' : ''}`}><Camera size={18} /></span>
              <div>
                <b>Foto selfie</b>
                <div className="muted small">{photo ? 'Foto siap dikirim' : PERM_TEXT[perm.cam] || 'Belum diambil'}</div>
              </div>
            </div>
            {!photo && cam !== 'live' && <button className="btn sm" onClick={() => void openCamera()} disabled={cam === 'starting' || busy}>{cam === 'starting' ? 'Membuka…' : 'Buka kamera'}</button>}
            {photo && <button className="btn sm" onClick={() => { setPhoto(null); void openCamera() }} disabled={busy}><RefreshCw size={14} /> Ulangi foto</button>}
          </div>

          <div className="cam-box">
            {photo ? <img src={photo.url} alt="Foto selfie Anda" />
              : cam === 'live' ? <video ref={video} className="mirror" playsInline muted autoPlay aria-label="Pratinjau kamera" />
              : <div className="cam-empty"><Camera size={30} /><span>{cam === 'starting' ? 'Membuka kamera…' : 'Kamera belum dibuka'}</span></div>}
          </div>
          {cam === 'live' && <button className="btn primary block lg" style={{ marginTop: 12 }} onClick={() => void snap()}><Camera size={18} /> Ambil foto</button>}
          {cam === 'error' && <div className="alert error" style={{ margin: '12px 0 0' }}><TriangleAlert size={18} /><span>{camErr}</span></div>}
          {camErr && cam !== 'error' && <div className="alert error" style={{ margin: '12px 0 0' }}><TriangleAlert size={18} /><span>{camErr}</span></div>}
          <p className="muted small" style={{ margin: '10px 0 0' }}>Hadapkan wajah ke kamera dengan pencahayaan cukup. Foto dikompres otomatis sebelum dikirim.</p>
        </section>
      )}

      {error && <div className="alert error"><TriangleAlert size={18} /><span>{error}</span></div>}
      {!ready && !untouched && <p className="muted small" style={{ margin: 0 }}>Tombol <b>Kirim absen</b> aktif setelah {what} siap{session.start_at ? ` (sesi dibuka ${fmtTime(session.start_at)})` : ''}.</p>}
    </Modal>
  )
}
