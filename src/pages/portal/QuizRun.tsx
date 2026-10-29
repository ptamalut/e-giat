import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Loading, Modal } from '../../components/ui'
import { fmtClock } from '../../lib/format'
import { seededShuffle } from '../../lib/shuffle'
import { rpc } from '../../lib/supabase'
import type { AttemptResult, PortalData, StartAttemptData } from '../../lib/types'

type Answers = Record<string, number>
const LETTERS = 'ABCDEFGH'

export default function QuizRun() {
  const { token = '', quizId = '' } = useParams()
  const nav = useNavigate()
  const [intro, setIntro] = useState<{ portal: PortalData; quiz: PortalData['quizzes'][number] } | null>(null)
  const [run, setRun] = useState<StartAttemptData | null>(null)
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    let alive = true
    rpc<PortalData>('portal_get', { p_token: token })
      .then((p) => {
        if (!alive) return
        const quiz = p.quizzes.find((q) => q.id === quizId)
        if (!quiz) setError('Kuis tidak ditemukan.')
        else setIntro({ portal: p, quiz })
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
    return () => { alive = false }
  }, [token, quizId])

  async function start() {
    setStarting(true); setError('')
    try { setRun(await rpc<StartAttemptData>('portal_start_attempt', { p_token: token, p_quiz: quizId })) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setStarting(false) }
  }

  if (run) return <Runner token={token} data={run} onDone={(r) => nav(`/p/${token}/hasil/${r.attempt_id}`, { replace: true })} />
  if (!intro && !error) return <Loading />

  const q = intro?.quiz
  const running = q?.attempts.find((t) => !t.submitted_at)
  const left = q ? q.max_attempts - q.attempts.length : 0

  return (
    <div className="auth-wrap">
      <div className="card auth-card" style={{ maxWidth: 520 }}>
        <Link to={`/p/${token}`} className="muted small">← Kembali</Link>
        {q && (
          <>
            <h2 style={{ marginTop: 8 }}>{q.title}</h2>
            <p className="muted">{intro!.portal.activity.name}</p>
            {q.description && <p style={{ whiteSpace: 'pre-wrap' }}>{q.description}</p>}
            <ul style={{ lineHeight: 1.9, paddingLeft: 20 }}>
              <li><b>{q.question_count}</b> soal pilihan ganda</li>
              <li>Waktu: <b>{q.duration_minutes ? `${q.duration_minutes} menit` : 'tidak dibatasi'}</b>{q.duration_minutes ? ' — hitung mundur dimulai saat Anda menekan tombol mulai dan tetap berjalan walau halaman ditutup.' : ''}</li>
              <li>{running ? 'Anda memiliki pengerjaan yang belum selesai.' : `Kesempatan tersisa: ${left} dari ${q.max_attempts}`}</li>
              <li>Jawaban tersimpan otomatis. Waktu habis = jawaban otomatis dikumpulkan.</li>
            </ul>
          </>
        )}
        {error && <div className="alert error">{error}</div>}
        {q && (running || left > 0) && (
          <button className="btn primary block lg" disabled={starting} onClick={() => void start()}>
            {starting ? 'Menyiapkan…' : running ? '▶ Lanjutkan mengerjakan' : '▶ Mulai sekarang'}
          </button>
        )}
        {q && !running && left <= 0 && <div className="alert info">Kesempatan mengerjakan sudah habis.</div>}
      </div>
    </div>
  )
}

function Runner({ token, data, onDone }: { token: string; data: StartAttemptData; onDone: (r: AttemptResult) => void }) {
  const { attempt, quiz, questions } = data
  const [answers, setAnswers] = useState<Answers>(attempt.answers ?? {})
  const [idx, setIdx] = useState(0)
  const [offset] = useState(() => new Date(data.now).getTime() - Date.now())
  const [remaining, setRemaining] = useState<number | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved')
  const [error, setError] = useState('')
  const answersRef = useRef(answers)
  const submittedRef = useRef(false)
  const dirtyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  answersRef.current = answers

  const deadline = attempt.deadline_at ? new Date(attempt.deadline_at).getTime() : null

  // urutan opsi diacak secara deterministik per percobaan
  const view = useMemo(() => questions.map((q) => ({
    ...q, options: quiz.shuffle_options ? seededShuffle(q.options, attempt.id + q.id) : q.options,
  })), [questions, quiz.shuffle_options, attempt.id])

  const save = useCallback(async () => {
    setSaveState('saving')
    try {
      await rpc('portal_save_answers', { p_token: token, p_attempt: attempt.id, p_answers: answersRef.current })
      setSaveState('saved')
    } catch { setSaveState('error') }
  }, [token, attempt.id])

  const submit = useCallback(async () => {
    if (submittedRef.current) return
    submittedRef.current = true
    setSubmitting(true); setError('')
    if (dirtyTimer.current) clearTimeout(dirtyTimer.current)
    // coba ulang bila jaringan putus, jangan sampai jawaban hilang
    for (let attemptNo = 0; ; attemptNo++) {
      try {
        const r = await rpc<AttemptResult>('portal_submit_attempt', { p_token: token, p_attempt: attempt.id, p_answers: answersRef.current })
        onDone(r)
        return
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (/tidak ditemukan|tidak valid/i.test(msg) || attemptNo >= 40) {
          submittedRef.current = false; setSubmitting(false); setError(msg); return
        }
        setError(`Gagal mengirim (${msg}). Mencoba lagi…`)
        await new Promise((r) => setTimeout(r, 3000))
      }
    }
  }, [token, attempt.id, onDone])

  // hitung mundur berdasar jam server
  useEffect(() => {
    if (deadline == null) return
    const tick = () => {
      const left = Math.ceil((deadline - (Date.now() + offset)) / 1000)
      setRemaining(left)
      if (left <= 0) void submit()
    }
    tick()
    const t = setInterval(tick, 500)
    return () => clearInterval(t)
  }, [deadline, offset, submit])

  // simpan otomatis (debounce) + peringatan sebelum menutup halaman
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (!submittedRef.current) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  function choose(qid: string, i: number) {
    const next = { ...answers, [qid]: i }
    setAnswers(next); answersRef.current = next
    setSaveState('saving')
    if (dirtyTimer.current) clearTimeout(dirtyTimer.current)
    dirtyTimer.current = setTimeout(() => void save(), 700)
  }

  const q = view[idx]
  const answered = view.filter((x) => answers[x.id] != null).length
  const low = remaining != null && remaining <= 60
  const crit = remaining != null && remaining <= 15

  return (
    <>
      <div className="quiz-bar">
        <div className="container narrow">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{quiz.title}</div>
            <div className="muted small">{answered}/{view.length} terjawab · {saveState === 'saving' ? 'menyimpan…' : saveState === 'saved' ? '✓ tersimpan' : '⚠ belum tersimpan'}</div>
          </div>
          {remaining != null && <div className={`timer ${crit ? 'crit' : low ? 'low' : ''}`} role="timer" aria-label="Sisa waktu">⏱ {fmtClock(remaining)}</div>}
        </div>
      </div>

      <div className="container narrow page stack">
        {error && <div className="alert error">{error}</div>}
        <div className="card">
          <div className="muted small" style={{ marginBottom: 6 }}>Soal {idx + 1} dari {view.length}</div>
          <div className="q-text" style={{ marginBottom: 16 }}>{q.text}</div>
          {q.options.map((o, pos) => (
            <button key={o.i} className={`opt ${answers[q.id] === o.i ? 'selected' : ''}`} onClick={() => choose(q.id, o.i)} aria-pressed={answers[q.id] === o.i}>
              <span className="letter">{LETTERS[pos]}</span><span style={{ paddingTop: 3 }}>{o.t}</span>
            </button>
          ))}
          <div className="row between" style={{ marginTop: 16 }}>
            <button className="btn" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>← Sebelumnya</button>
            {idx < view.length - 1
              ? <button className="btn primary" onClick={() => setIdx(idx + 1)}>Selanjutnya →</button>
              : <button className="btn primary" onClick={() => setConfirming(true)}>Selesai &amp; kumpulkan</button>}
          </div>
        </div>

        <div className="card">
          <div className="qnav">
            {view.map((x, i) => (
              <button key={x.id} className={`${answers[x.id] != null ? 'answered' : ''} ${i === idx ? 'current' : ''}`} onClick={() => setIdx(i)} aria-label={`Soal ${i + 1}${answers[x.id] != null ? ', terjawab' : ''}`}>{i + 1}</button>
            ))}
          </div>
          <button className="btn block" style={{ marginTop: 14 }} onClick={() => setConfirming(true)}>Kumpulkan jawaban</button>
        </div>
      </div>

      {confirming && !submitting && (
        <Modal title="Kumpulkan jawaban?" onClose={() => setConfirming(false)}
          footer={<><button className="btn" onClick={() => setConfirming(false)}>Kembali periksa</button><button className="btn primary" onClick={() => void submit()}>Ya, kumpulkan</button></>}>
          {answered < view.length
            ? <div className="alert warn"><b>{view.length - answered} soal</b> belum dijawab.</div>
            : <p>Semua soal sudah dijawab.</p>}
          <p className="muted">Setelah dikumpulkan, jawaban tidak bisa diubah{remaining != null ? ` (sisa waktu ${fmtClock(remaining)})` : ''}.</p>
        </Modal>
      )}
      {submitting && <div className="overlay" style={{ alignItems: 'center' }}><div className="card center"><Loading text="Mengumpulkan jawaban…" /></div></div>}
    </>
  )
}
