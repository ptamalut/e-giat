import { Download, FileText, Mic, Sparkles, Square, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, useToast } from '../../components/ui'
import { speechSupported, SPEECH_FAILURE_TEXT, startDictation, type Dictation, type SpeechFailure } from '../../lib/speech'
import { buildTranscript, suggestFromTranscript, type Segment } from '../../lib/transcript'
import { downloadBlob } from '../../lib/exportModel'

export interface RecorderApply {
  agenda: string[]
  decisions: string[]
  followUps: { task: string; pic: string; due: string }[]
}

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

/**
 * Rekam suara dan ubah menjadi teks menjadi teks (gratis, memakai pengenalan suara bawaan browser).
 * Hasilnya bisa dimasukkan ke Pembahasan, dan kalimat keputusan/tindak lanjut disarankan berdasarkan kata kunci.
 */
export default function NoteRecorder({ refDate, onDiscussion, onApply }: {
  refDate: Date
  onDiscussion: (text: string) => void
  onApply: (a: RecorderApply) => void
}) {
  const toast = useToast()
  const supported = useMemo(speechSupported, [])
  const [listening, setListening] = useState(false)
  const [base, setBase] = useState('')              // teks yang sudah ada (hasil rekaman sebelumnya / hasil suntingan)
  const [segments, setSegments] = useState<Segment[]>([])
  const [interim, setInterim] = useState('')
  const [secs, setSecs] = useState(0)
  const [failure, setFailure] = useState<SpeechFailure | null>(supported ? null : 'tidak-didukung')
  const [suggest, setSuggest] = useState<ReturnType<typeof suggestFromTranscript> | null>(null)
  const [pick, setPick] = useState<Set<string>>(new Set())
  const dict = useRef<Dictation | null>(null)
  const lock = useRef<{ release: () => Promise<void> } | null>(null)

  const live = useMemo(() => buildTranscript(segments), [segments])
  const text = base && live ? `${base}\n\n${live}` : base || live

  // pewaktu rekaman
  useEffect(() => {
    if (!listening) return
    const t = setInterval(() => setSecs((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [listening])

  // jaga layar tetap menyala selama merekam (bila didukung)
  useEffect(() => {
    if (!listening) return
    const nav = navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
    nav.wakeLock?.request('screen').then((l) => { lock.current = l }).catch(() => { /* tidak wajib */ })
    return () => { void lock.current?.release().catch(() => {}); lock.current = null }
  }, [listening])

  // peringatan bila halaman ditutup saat ada transkrip yang belum dimasukkan
  useEffect(() => {
    if (!listening && !text) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [listening, text])

  useEffect(() => () => dict.current?.stop(), [])

  function start() {
    setFailure(null); setSuggest(null)
    if (segments.length) { setBase(text); setSegments([]) }
    const d = startDictation({
      onFinal: (t) => setSegments((s) => [...s, { text: t, at: Date.now() }]),
      onInterim: setInterim,
      onFail: (why) => { setFailure(why); setListening(false); dict.current = null },
    })
    if (d) { dict.current = d; setSecs(0); setListening(true) }
  }

  function stop() {
    dict.current?.stop(); dict.current = null
    setListening(false); setInterim('')
    setBase(text); setSegments([])  // teks final menjadi isian yang bisa disunting
  }

  function insert() {
    if (!text.trim()) return
    onDiscussion(text)
    setBase(''); setSegments([]); setSuggest(null)
    toast('Transkrip dimasukkan ke Pembahasan.', 'success')
  }

  function analyse() {
    const s = suggestFromTranscript(text, refDate)
    setSuggest(s)
    setPick(new Set([...s.agenda.map((_, i) => `a${i}`), ...s.decisions.map((_, i) => `d${i}`), ...s.followUps.map((_, i) => `f${i}`)]))
    if (!s.agenda.length && !s.decisions.length && !s.followUps.length) toast('Tidak ada kalimat keputusan atau tindak lanjut yang dikenali.')
  }

  function apply() {
    if (!suggest) return
    const a = { agenda: suggest.agenda.filter((_, i) => pick.has(`a${i}`)), decisions: suggest.decisions.filter((_, i) => pick.has(`d${i}`)), followUps: suggest.followUps.filter((_, i) => pick.has(`f${i}`)) }
    if (!a.agenda.length && !a.decisions.length && !a.followUps.length) return toast('Centang minimal satu saran.', 'error')
    onApply(a)
    setSuggest(null)
    toast('Saran dimasukkan ke notula. Periksa dan sunting seperlunya.', 'success')
  }

  const toggle = (k: string) => setPick((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n })

  return (
    <div className="card" aria-label="Rekam suara">
      <div className="card-head">
        <h2><Mic size={18} /> Rekam suara (suara → teks)</h2><span className="spacer" />
        {listening
          ? <button className="btn danger" onClick={stop}><Square size={15} /> Hentikan · {mmss(secs)}</button>
          : <button className="btn primary" onClick={start} disabled={!supported}><Mic size={15} /> {text ? 'Lanjut merekam' : 'Mulai merekam'}</button>}
      </div>
      <p className="muted small" style={{ marginTop: 0 }}>
        Gratis, tanpa API key. Memakai pengenalan suara bawaan <b>Google Chrome / Microsoft Edge</b> (bahasa Indonesia); suara diproses oleh layanan
        browser tersebut dan butuh internet. Letakkan perangkat dekat pembicara. Hasilnya berupa draf teks, bukan notula jadi: sunting dulu sebelum disimpan.
      </p>
      {failure && <div className="alert warn"><span>{SPEECH_FAILURE_TEXT[failure]}</span></div>}

      {(listening || text) && (
        <>
          <textarea className="input" rows={8} aria-label="Transkrip" readOnly={listening} value={text}
            onChange={(e) => setBase(e.target.value)} placeholder="Transkrip akan muncul di sini…" />
          {listening && <p className="muted small" aria-live="polite" style={{ margin: '6px 0 0' }}>
            <span className="badge dot danger">Merekam</span> {interim ? <i>{interim}</i> : 'Mendengarkan…'}</p>}
          {!listening && (
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn primary" onClick={insert} disabled={!text.trim()}><FileText size={15} /> Masukkan ke Pembahasan</button>
              <button className="btn" onClick={analyse} disabled={!text.trim()}><Sparkles size={15} /> Cari keputusan &amp; tindak lanjut</button>
              <button className="btn ghost" onClick={() => downloadBlob('transkrip.txt', new Blob([text], { type: 'text/plain;charset=utf-8' }))} disabled={!text.trim()}><Download size={15} /> Unduh .txt</button>
              <span className="spacer" />
              <button className="btn ghost danger" onClick={() => { setBase(''); setSegments([]); setSuggest(null) }}><Trash2 size={15} /> Kosongkan</button>
            </div>
          )}
        </>
      )}

      {suggest && (
        <div className="card" style={{ background: 'var(--surface-2)', boxShadow: 'none', marginTop: 14 }}>
          <b>Saran dari transkrip</b>
          <p className="muted small" style={{ margin: '2px 0 10px' }}>Dikenali dari kata kunci (mis. "diputuskan", "ditugaskan kepada", "paling lambat"), bukan AI. Centang yang sesuai.</p>
          {suggest.agenda.length > 0 && <><div className="label">Agenda</div>{suggest.agenda.map((x, i) => <Check key={x} label={x} checked={pick.has(`a${i}`)} onChange={() => toggle(`a${i}`)} />)}</>}
          {suggest.decisions.length > 0 && <><div className="label" style={{ marginTop: 8 }}>Keputusan</div>{suggest.decisions.map((x, i) => <Check key={x} label={x} checked={pick.has(`d${i}`)} onChange={() => toggle(`d${i}`)} />)}</>}
          {suggest.followUps.length > 0 && <><div className="label" style={{ marginTop: 8 }}>Tindak lanjut</div>
            {suggest.followUps.map((x, i) => <Check key={x.task} label={x.task} hint={[x.pic && `PJ: ${x.pic}`, x.due && `Tenggat: ${x.due}`].filter(Boolean).join(' · ') || undefined} checked={pick.has(`f${i}`)} onChange={() => toggle(`f${i}`)} />)}</>}
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn primary" onClick={apply}>Tambahkan yang dicentang</button>
            <button className="btn ghost" onClick={() => setSuggest(null)}>Tutup</button>
          </div>
        </div>
      )}
    </div>
  )
}
