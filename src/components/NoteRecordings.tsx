import { Download, FileText, FileAudio, Loader2, Mic, Sparkles, Square, Trash2, Type, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, useConfirm, useToast } from './ui'
import { SPEECH_FAILURE_TEXT, speechSupported, trackSpeechSupported } from '../lib/speech'
import { buildTranscript, suggestFromTranscript, type Segment } from '../lib/transcript'
import { transcribeBlob, type TranscribeJob } from '../lib/transcribe'
import { downloadBlob } from '../lib/exportModel'
import { baseMime, extOfMime, micErrorText, nextRecordingNumber, pickRecorderMime, REC_BITRATE, REC_MAX_BYTES, recordingFileName } from '../lib/recordings'
import { recordingUrl, uploadRecordingBlob } from '../lib/recordingsApi'
import type { NoteRecording } from '../lib/types'

export interface RecorderApply {
  agenda: string[]
  decisions: string[]
  followUps: { task: string; pic: string; due: string }[]
}

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
const mb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)
const when = (iso: string) => new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))

interface Pending { blob: Blob; mime: string; duration: number }

/**
 * Rekaman suara pada notula. Dua langkah yang terpisah: (1) merekam suara, yang langsung tersimpan sebagai berkas audio di server
 * dan tercantum pada notula; (2) mengubah sebuah rekaman menjadi teks (gratis, memakai pengenalan suara bawaan browser) yang
 * hasilnya bisa disunting, dimasukkan ke isi notula, atau dicari keputusan dan tindak lanjutnya.
 */
export default function NoteRecordings({ recordings, savedPaths, newPath, refDate, onChange, onInsert, onApply, onBusy }: {
  recordings: NoteRecording[]
  /** path rekaman yang sudah tercantum pada notula tersimpan */
  savedPaths: ReadonlySet<string>
  /** path unggahan baru (dicadangkan server untuk petugas) */
  newPath: (ext: string) => Promise<string>
  refDate: Date
  onChange: (list: NoteRecording[]) => void
  onInsert: (text: string) => void
  onApply: (a: RecorderApply) => void
  /** true selama merekam, mengunggah, atau mengubah ke teks */
  onBusy?: (busy: boolean) => void
}) {
  const toast = useToast()
  const confirm = useConfirm()
  const canRecord = useMemo(() => typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia, [])
  const canTranscribe = useMemo(speechSupported, [])
  const viaMic = useMemo(() => !trackSpeechSupported(), [])

  const [phase, setPhase] = useState<'idle' | 'recording' | 'saving'>('idle')
  const [secs, setSecs] = useState(0)
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)     // rekaman yang belum berhasil diunggah (tidak boleh hilang)
  const [tx, setTx] = useState<{ id: string; interim: string; secs: number; loading: boolean } | null>(null)
  const [live, setLive] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [suggest, setSuggest] = useState<{ id: string; data: ReturnType<typeof suggestFromTranscript> } | null>(null)
  const [pick, setPick] = useState<Set<string>>(new Set())

  const recsRef = useRef(recordings); recsRef.current = recordings
  const blobs = useRef(new Map<string, Blob>())      // rekaman yang baru dibuat di sesi ini (tanpa unduh ulang)
  const urls = useRef(new Map<string, string>())
  const recorder = useRef<{ mr: MediaRecorder; stream: MediaStream; chunks: Blob[]; size: number; startedAt: number; mime: string } | null>(null)
  const job = useRef<TranscribeJob | null>(null)
  const txId = useRef<string | null>(null)
  const segs = useRef<Segment[]>([])
  const lock = useRef<{ release: () => Promise<void> } | null>(null)

  const busy = phase !== 'idle' || !!pending || !!tx
  useEffect(() => { onBusy?.(phase !== 'idle' || !!tx) }, [phase, tx, onBusy])

  useEffect(() => {
    if (phase !== 'recording') return
    const t = setInterval(() => setSecs(Math.round((Date.now() - (recorder.current?.startedAt ?? Date.now())) / 1000)), 500)
    return () => clearInterval(t)
  }, [phase])

  // jaga layar tetap menyala selama merekam (bila didukung)
  useEffect(() => {
    if (phase !== 'recording') return
    const nav = navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
    nav.wakeLock?.request('screen').then((l) => { lock.current = l }).catch(() => { /* tidak wajib */ })
    return () => { void lock.current?.release().catch(() => {}); lock.current = null }
  }, [phase])

  // peringatan bila halaman ditutup saat ada rekaman yang belum selesai disimpan
  useEffect(() => {
    if (!busy) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [busy])

  useEffect(() => () => {
    job.current?.stop()
    const r = recorder.current
    if (r) { r.mr.onstop = null; try { r.mr.stop() } catch { /* sudah berhenti */ } r.stream.getTracks().forEach((t) => t.stop()) }
    urls.current.forEach((u) => URL.revokeObjectURL(u))
  }, [])

  const srcOf = (r: NoteRecording) => {
    const local = blobs.current.get(r.path)
    if (!local) return recordingUrl(r.path)
    let u = urls.current.get(r.path)
    if (!u) { u = URL.createObjectURL(local); urls.current.set(r.path, u) }
    return u
  }

  const patch = (id: string, change: Partial<NoteRecording>) => onChange(recsRef.current.map((r) => (r.id === id ? { ...r, ...change } : r)))

  // ---------- merekam ----------
  async function startRec() {
    setFailure(null); setSuggest(null)
    let stream: MediaStream
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }) }
    catch (e) { setFailure(micErrorText(e)); return }
    const mime = pickRecorderMime((m) => MediaRecorder.isTypeSupported(m)) ?? ''
    let mr: MediaRecorder
    try { mr = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: REC_BITRATE }) }
    catch { stream.getTracks().forEach((t) => t.stop()); setFailure('Perekam suara tidak didukung di browser ini. Gunakan Google Chrome, Microsoft Edge, atau Firefox terbaru.'); return }
    const state = { mr, stream, chunks: [] as Blob[], size: 0, startedAt: Date.now(), mime: mr.mimeType || mime || 'audio/webm' }
    recorder.current = state
    mr.ondataavailable = (e) => {
      if (!e.data.size) return
      state.chunks.push(e.data); state.size += e.data.size
      if (state.size >= REC_MAX_BYTES - 1048576 && mr.state === 'recording') { mr.stop(); toast('Batas ukuran rekaman tercapai; rekaman dihentikan dan disimpan.', 'info') }
    }
    mr.onerror = () => { setFailure('Perekaman terhenti karena kesalahan. Rekaman sebelumnya tetap diselamatkan.'); if (mr.state !== 'inactive') mr.stop() }
    mr.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      recorder.current = null
      const duration = Math.max(1, Math.round((Date.now() - state.startedAt) / 1000))
      const blob = new Blob(state.chunks, { type: baseMime(state.mime) })
      if (!blob.size) { setPhase('idle'); setFailure('Tidak ada suara yang terekam.'); return }
      void store({ blob, mime: state.mime, duration })
    }
    mr.start(5000)
    setSecs(0); setPhase('recording')
  }

  function stopRec() {
    const r = recorder.current
    if (!r || r.mr.state === 'inactive') return
    setPhase('saving')
    r.mr.stop()
  }

  /** Unggah ke server lalu cantumkan pada notula. Bila gagal, rekaman ditahan agar bisa dicoba lagi atau diunduh. */
  async function store(p: Pending) {
    setPhase('saving'); setPending(null)
    try {
      const ext = extOfMime(p.mime)
      const path = await newPath(ext)
      await uploadRecordingBlob(path, p.blob, p.mime)
      blobs.current.set(path, p.blob)
      const now = new Date()
      const rec: NoteRecording = {
        id: crypto.randomUUID(), path, file_name: recordingFileName(nextRecordingNumber(recsRef.current), now, ext), mime: baseMime(p.mime),
        size: p.blob.size, duration: p.duration, created_at: now.toISOString(), transcript: '',
      }
      onChange([...recsRef.current, rec])
      toast('Rekaman tersimpan. Klik Simpan untuk mencantumkannya pada notula.', 'success')
    } catch (e) {
      setPending(p)
      setFailure(`Rekaman belum terunggah (${e instanceof Error ? e.message : 'kesalahan jaringan'}). Rekaman masih ada di halaman ini: coba unggah lagi atau unduh dulu.`)
    } finally { setPhase('idle') }
  }

  async function remove(r: NoteRecording) {
    if (tx?.id === r.id) return
    const ok = await confirm({ title: 'Hapus rekaman ini?', danger: true, confirmText: 'Hapus', message: `${r.file_name} akan dihapus dari notula${r.transcript ? ', beserta transkripnya' : ''}.` })
    if (!ok) return
    onChange(recsRef.current.filter((x) => x.id !== r.id))
    blobs.current.delete(r.path)
    const u = urls.current.get(r.path); if (u) { URL.revokeObjectURL(u); urls.current.delete(r.path) }
  }

  // ---------- rekaman -> teks ----------
  async function startTx(r: NoteRecording) {
    if (r.transcript.trim() && !(await confirm({ title: 'Ulangi pengubahan ke teks?', confirmText: 'Ulangi', message: 'Transkrip yang ada (termasuk suntingan Anda) akan diganti hasil yang baru.' }))) return
    setFailure(null); setSuggest(null)
    segs.current = []; setLive(''); txId.current = r.id
    setTx({ id: r.id, interim: '', secs: 0, loading: true })
    let blob = blobs.current.get(r.path)
    if (!blob) {
      try {
        const res = await fetch(recordingUrl(r.path))
        if (!res.ok) throw new Error(String(res.status))
        blob = await res.blob()
      } catch { txId.current = null; setTx(null); return setFailure('Berkas rekaman tidak bisa dimuat. Periksa koneksi internet lalu coba lagi.') }
    }
    setTx({ id: r.id, interim: '', secs: 0, loading: false })
    let failed = false
    const j = transcribeBlob(blob, {
      onFinal: (t) => { segs.current = [...segs.current, { text: t, at: Date.now() }]; setLive(buildTranscript(segs.current)) },
      onInterim: (t) => setTx((c) => (c ? { ...c, interim: t } : c)),
      onProgress: (s) => setTx((c) => (c ? { ...c, secs: s } : c)),
      onFail: (why) => { failed = true; setFailure(SPEECH_FAILURE_TEXT[why]) },
      onDone: () => {
        if (txId.current !== r.id) return
        txId.current = null; job.current = null
        const text = buildTranscript(segs.current)
        setTx(null); setLive('')
        if (text) {
          patch(r.id, { transcript: text })
          setOpen((o) => new Set(o).add(r.id))
          toast(failed ? 'Transkrip sebagian tersimpan; pengenalan suara terhenti.' : 'Rekaman selesai diubah ke teks. Periksa dan sunting seperlunya.', failed ? 'info' : 'success')
        } else if (!failed) toast('Tidak ada ucapan yang dikenali pada rekaman ini.', 'info')
      },
    })
    job.current = j
    if (!j && txId.current === r.id) { txId.current = null; setTx(null) }
  }

  function analyse(r: NoteRecording) {
    const s = suggestFromTranscript(r.transcript, refDate)
    setSuggest({ id: r.id, data: s })
    setPick(new Set([...s.agenda.map((_, i) => `a${i}`), ...s.decisions.map((_, i) => `d${i}`), ...s.followUps.map((_, i) => `f${i}`)]))
    if (!s.agenda.length && !s.decisions.length && !s.followUps.length) toast('Tidak ada kalimat keputusan atau tindak lanjut yang dikenali.')
  }

  function apply() {
    if (!suggest) return
    const d = suggest.data
    const a = { agenda: d.agenda.filter((_, i) => pick.has(`a${i}`)), decisions: d.decisions.filter((_, i) => pick.has(`d${i}`)), followUps: d.followUps.filter((_, i) => pick.has(`f${i}`)) }
    if (!a.agenda.length && !a.decisions.length && !a.followUps.length) return toast('Centang minimal satu saran.', 'error')
    onApply(a)
    setSuggest(null)
    toast('Saran dimasukkan ke notula. Periksa dan sunting seperlunya.', 'success')
  }

  const toggle = (k: string) => setPick((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const toggleOpen = (id: string) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n })

  return (
    <div className="card" aria-label="Rekaman suara">
      <div className="card-head">
        <h2><Mic size={18} /> Rekaman suara</h2><span className="spacer" />
        {phase === 'recording'
          ? <button type="button" className="btn danger" onClick={stopRec}><Square size={15} /> Hentikan · {mmss(secs)}</button>
          : <button type="button" className="btn primary" onClick={() => void startRec()} disabled={!canRecord || phase === 'saving' || !!tx}>
              {phase === 'saving' ? <><Loader2 size={15} className="spin" /> Menyimpan…</> : <><Mic size={15} /> {recordings.length ? 'Rekam lagi' : 'Mulai merekam'}</>}
            </button>}
      </div>
      <p className="muted small" style={{ marginTop: 0 }}>
        Rekam jalannya kegiatan sebagai suara; rekaman langsung tersimpan di server dan menempel pada notula ini. Setelah itu, bila perlu, ubah rekaman menjadi teks untuk dimasukkan ke isi notula.
        Letakkan perangkat dekat pembicara dan biarkan halaman ini tetap terbuka selama merekam.
      </p>
      {!canRecord && <div className="alert warn"><span>Browser ini belum mendukung perekam suara. Gunakan Google Chrome, Microsoft Edge, atau Firefox terbaru lewat alamat https.</span></div>}
      {failure && <div className="alert warn" role="alert"><span>{failure}</span></div>}
      {phase === 'recording' && <p className="muted small" aria-live="polite" style={{ margin: '6px 0 0' }}><span className="badge dot danger">Merekam</span> {mmss(secs)} · jangan tutup halaman ini</p>}
      {pending && (
        <div className="callout warn" style={{ marginTop: 10 }}>
          <b>Rekaman {mmss(pending.duration)} ({mb(pending.blob.size)}) belum terunggah</b>
          <div className="row" style={{ marginTop: 8 }}>
            <button type="button" className="btn primary sm" onClick={() => void store(pending)} disabled={phase !== 'idle'}><RotateCcw size={14} /> Unggah lagi</button>
            <button type="button" className="btn sm" onClick={() => downloadBlob(recordingFileName(nextRecordingNumber(recordings), new Date(), extOfMime(pending.mime)), pending.blob)}><Download size={14} /> Unduh rekaman</button>
            <button type="button" className="btn ghost sm" onClick={() => setPending(null)}>Buang</button>
          </div>
        </div>
      )}

      {recordings.length === 0 && phase === 'idle' && !pending && <p className="muted small" style={{ margin: '10px 0 0' }}>Belum ada rekaman pada notula ini.</p>}
      {recordings.map((r) => {
        const active = tx?.id === r.id
        const isOpen = open.has(r.id) || active
        return (
          <div className="rec-item" key={r.id} aria-label={`Rekaman ${r.file_name}`}>
            <div className="row" style={{ flexWrap: 'nowrap', gap: 10 }}>
              <FileAudio size={20} aria-hidden style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <b className="rec-name">{r.file_name}</b>
                <div className="muted small">{when(r.created_at)} · {mmss(r.duration)} · {mb(r.size)}
                  {!savedPaths.has(r.path) && <span className="badge warn" style={{ marginLeft: 8 }}>Belum disimpan di notula</span>}
                  {r.transcript && <span className="badge success" style={{ marginLeft: 8 }}>Ada transkrip</span>}</div>
              </div>
            </div>
            <audio className="rec-audio" controls preload="none" src={srcOf(r)} aria-label={`Putar ${r.file_name}`} />
            <div className="row tight" style={{ marginTop: 8 }}>
              {active
                ? <button type="button" className="btn sm danger" onClick={() => job.current?.stop()}><Square size={14} /> Hentikan · {mmss(tx!.secs)} / {mmss(r.duration)}</button>
                : <button type="button" className="btn sm" onClick={() => void startTx(r)} disabled={!canTranscribe || busy || !!tx} title={canTranscribe ? undefined : 'Browser ini belum mendukung pengenalan suara'}>
                    <Type size={14} /> {r.transcript ? 'Ubah ke teks lagi' : 'Ubah ke teks'}</button>}
              {r.transcript && !active && <button type="button" className="btn sm ghost" onClick={() => toggleOpen(r.id)} aria-expanded={isOpen}><FileText size={14} /> {isOpen ? 'Sembunyikan transkrip' : 'Lihat transkrip'}</button>}
              <a className="btn sm ghost" href={recordingUrl(r.path, r.file_name)} download={r.file_name} onClick={(e) => { const b = blobs.current.get(r.path); if (b) { e.preventDefault(); downloadBlob(r.file_name, b) } }}><Download size={14} /> Unduh</a>
              <span className="spacer" />
              <button type="button" className="btn sm ghost danger" onClick={() => void remove(r)} disabled={active} aria-label={`Hapus ${r.file_name}`}><Trash2 size={14} /> Hapus</button>
            </div>
            {!canTranscribe && !r.transcript && <p className="muted small" style={{ margin: '6px 0 0' }}>Mengubah rekaman ke teks memerlukan Google Chrome atau Microsoft Edge.</p>}
            {active && (
              <div className="callout" style={{ marginTop: 8 }} aria-live="polite">
                {tx!.loading ? <div><Loader2 size={14} className="spin" /> Memuat rekaman…</div> : <div>
                  <span className="badge dot info">Mengubah ke teks</span> berjalan sepanjang durasi rekaman ({mmss(r.duration)}); jangan tutup halaman ini.
                  {viaMic && <div className="small" style={{ marginTop: 4 }}>Browser ini memakai cara cadangan: rekaman diputar lewat speaker dan didengarkan mikrofon. Naikkan volume dan hindari suara lain. Chrome versi terbaru tidak memerlukan ini.</div>}
                  {tx!.interim && <div className="small" style={{ marginTop: 4 }}><i>{tx!.interim}</i></div>}
                </div>}
              </div>
            )}
            {isOpen && (r.transcript || (active && live)) && (
              <div style={{ marginTop: 8 }}>
                <textarea className="input" rows={8} aria-label={`Transkrip ${r.file_name}`} readOnly={active} value={active ? live : r.transcript}
                  onChange={(e) => patch(r.id, { transcript: e.target.value })} placeholder="Transkrip akan muncul di sini…" />
                {!active && (
                  <div className="row" style={{ marginTop: 8 }}>
                    <button type="button" className="btn primary sm" onClick={() => { onInsert(r.transcript); toast('Transkrip dimasukkan ke isi notula.', 'success') }} disabled={!r.transcript.trim()}><FileText size={14} /> Masukkan ke isi notula</button>
                    <button type="button" className="btn sm" onClick={() => analyse(r)} disabled={!r.transcript.trim()}><Sparkles size={14} /> Cari keputusan &amp; tindak lanjut</button>
                    <button type="button" className="btn ghost sm" onClick={() => downloadBlob(r.file_name.replace(/\.[^.]+$/, '') + '.txt', new Blob([r.transcript], { type: 'text/plain;charset=utf-8' }))} disabled={!r.transcript.trim()}><Download size={14} /> Unduh .txt</button>
                  </div>
                )}
                {suggest?.id === r.id && (
                  <div className="card" style={{ background: 'var(--surface-2)', boxShadow: 'none', marginTop: 12 }}>
                    <b>Saran dari transkrip</b>
                    <p className="muted small" style={{ margin: '2px 0 10px' }}>Dikenali dari kata kunci (mis. "diputuskan", "ditugaskan kepada", "paling lambat"), bukan AI. Centang yang sesuai.</p>
                    {suggest.data.agenda.length > 0 && <><div className="label">Agenda</div>{suggest.data.agenda.map((x, i) => <Check key={x} label={x} checked={pick.has(`a${i}`)} onChange={() => toggle(`a${i}`)} />)}</>}
                    {suggest.data.decisions.length > 0 && <><div className="label" style={{ marginTop: 8 }}>Keputusan</div>{suggest.data.decisions.map((x, i) => <Check key={x} label={x} checked={pick.has(`d${i}`)} onChange={() => toggle(`d${i}`)} />)}</>}
                    {suggest.data.followUps.length > 0 && <><div className="label" style={{ marginTop: 8 }}>Tindak lanjut</div>
                      {suggest.data.followUps.map((x, i) => <Check key={x.task} label={x.task} hint={[x.pic && `PJ: ${x.pic}`, x.due && `Tenggat: ${x.due}`].filter(Boolean).join(' · ') || undefined} checked={pick.has(`f${i}`)} onChange={() => toggle(`f${i}`)} />)}</>}
                    <div className="row" style={{ marginTop: 10 }}>
                      <button type="button" className="btn primary" onClick={apply}>Tambahkan yang dicentang</button>
                      <button type="button" className="btn ghost" onClick={() => setSuggest(null)}>Tutup</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
