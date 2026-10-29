import { ArrowDown, ArrowLeft, ArrowUp, BarChart3, Check as CheckIcon, ClipboardPaste, Lightbulb, Pencil, Plus, ShieldCheck, Shuffle, Target, Timer, Trash2, X, FileQuestion } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Check, Empty, ErrorBox, Field, Loading, Modal, useAsync, useConfirm, useToast } from '../../components/ui'
import { fromLocalInput, toLocalInput } from '../../lib/format'
import { parseQuestions, QUESTION_FORMAT_HELP } from '../../lib/parsers'
import { errMsg, supabase } from '../../lib/supabase'
import type { Question, Quiz, QuizType } from '../../lib/types'
import { useActivity } from './ActivityLayout'
import { TYPE_LABEL } from './QuizzesTab'

const LETTERS = 'ABCDEFGH'

export default function QuizEditor() {
  const { quizId } = useParams()
  const { activity } = useActivity()
  const toast = useToast()
  const confirm = useConfirm()
  const [editQ, setEditQ] = useState<Partial<Question> | null>(null)
  const [bulk, setBulk] = useState(false)

  const { data, error, loading, reload } = useAsync(async () => {
    const [q, qs, at] = await Promise.all([
      supabase.from('quizzes').select('*').eq('id', quizId!).eq('activity_id', activity.id).maybeSingle(),
      supabase.from('questions').select('*').eq('quiz_id', quizId!).order('position').order('created_at'),
      supabase.from('quiz_attempts').select('id', { count: 'exact', head: true }).eq('quiz_id', quizId!),
    ])
    for (const r of [q, qs, at]) if (r.error) throw new Error(errMsg(r.error))
    if (!q.data) throw new Error('Kuis tidak ditemukan.')
    return { quiz: q.data as Quiz, questions: qs.data as Question[], attempts: at.count ?? 0 }
  }, [quizId, activity.id])

  if (loading && !data) return <Loading />
  if (error || !data) return <ErrorBox error={error ?? ''} onRetry={() => void reload()} />
  const { quiz, questions, attempts } = data
  const totalPoints = questions.reduce((s, q) => s + Number(q.points), 0)

  async function move(i: number, dir: -1 | 1) {
    if (!questions[i + dir]) return
    // tulis ulang posisi berurutan supaya tidak ada posisi kembar
    const order = questions.map((q) => q.id)
    ;[order[i], order[i + dir]] = [order[i + dir], order[i]]
    const results = await Promise.all(order.map((id, idx) => supabase.from('questions').update({ position: idx + 1 }).eq('id', id)))
    const failed = results.find((r) => r.error)
    if (failed?.error) toast(errMsg(failed.error), 'error')
    void reload(true)
  }

  async function removeQ(q: Question) {
    const ok = await confirm({ title: 'Hapus soal ini?', danger: true, confirmText: 'Hapus',
      message: attempts ? 'Sudah ada peserta yang mengerjakan kuis ini. Skor yang sudah tercatat tidak dihitung ulang.' : undefined })
    if (!ok) return
    const { error } = await supabase.from('questions').delete().eq('id', q.id)
    if (error) return toast(errMsg(error), 'error')
    void reload(true)
  }

  return (
    <div className="stack">
      <div className="row between">
        <Link to=".." relative="path" className="crumb"><ArrowLeft size={15} /> Daftar kuis</Link>
        <Link className="btn sm" to="../laporan" relative="path"><BarChart3 size={15} /> Lihat hasil</Link>
      </div>

      {attempts > 0 && (
        <div className="alert warn">
          <span>Sudah ada <b>{attempts}</b> percobaan peserta pada kuis ini. Mengubah kunci jawaban tidak menghitung ulang skor yang sudah tercatat.</span>
        </div>
      )}

      <Settings quiz={quiz} questionCount={questions.length} onSaved={() => void reload(true)} />

      <div className="card flush">
        <div className="toolbar">
          <div>
            <h2 style={{ margin: 0 }}>Soal ({questions.length})</h2>
            <span className="muted small">Total bobot {totalPoints} poin · skor akhir dinormalkan ke 0–100</span>
          </div>
          <div className="row tight">
            <button className="btn sm" onClick={() => setBulk(true)}><ClipboardPaste size={15} /> Impor dari teks</button>
            <button className="btn primary sm" onClick={() => setEditQ({ options: ['', ''], correct_index: 0, points: 1 })}><Plus size={16} /> Tambah soal</button>
          </div>
        </div>
        {questions.length === 0 && <Empty icon={<FileQuestion size={26} />} title="Belum ada soal">Tambahkan satu per satu atau impor banyak soal sekaligus dari teks.</Empty>}
        {questions.map((q, i) => (
          <div key={q.id} style={{ padding: '18px 20px', borderTop: '1px solid var(--border)' }}>
            <div className="row between" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', gap: 16 }}>
              <span className="medal" style={{ marginTop: 1 }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, whiteSpace: 'pre-wrap' }}>{q.text} {Number(q.points) !== 1 && <span className="badge">{q.points} poin</span>}</div>
                <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'grid', gap: 4 }}>
                  {q.options.map((o, oi) => (
                    <li key={oi} className="row tight" style={{ flexWrap: 'nowrap', alignItems: 'flex-start', color: oi === q.correct_index ? 'var(--success)' : 'var(--text-2)', fontWeight: oi === q.correct_index ? 650 : 400 }}>
                      <b style={{ width: 18 }}>{LETTERS[oi]}.</b><span>{o}</span>{oi === q.correct_index && <CheckIcon size={16} />}
                    </li>
                  ))}
                </ul>
                {q.explanation && <div className="muted small row tight" style={{ marginTop: 10, flexWrap: 'nowrap', alignItems: 'flex-start' }}><Lightbulb size={15} style={{ marginTop: 2 }} /> {q.explanation}</div>}
              </div>
              <div className="row tight" style={{ flexWrap: 'nowrap' }}>
                <button className="icon-btn" disabled={i === 0} onClick={() => void move(i, -1)} aria-label="Naikkan"><ArrowUp size={16} /></button>
                <button className="icon-btn" disabled={i === questions.length - 1} onClick={() => void move(i, 1)} aria-label="Turunkan"><ArrowDown size={16} /></button>
                <button className="icon-btn" onClick={() => setEditQ(q)} aria-label="Ubah"><Pencil size={16} /></button>
                <button className="icon-btn danger" onClick={() => void removeQ(q)} aria-label="Hapus"><Trash2 size={16} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {editQ && <QuestionForm value={editQ} quizId={quiz.id} activityId={activity.id} nextPos={questions.length + 1}
        onClose={() => setEditQ(null)} onSaved={() => { setEditQ(null); void reload(true) }} />}
      {bulk && <BulkQuestions quizId={quiz.id} activityId={activity.id} startPos={questions.length + 1}
        onClose={() => setBulk(false)} onSaved={() => { setBulk(false); void reload(true) }} />}
    </div>
  )
}

/* ---------- Pengaturan kuis ---------- */

function Settings({ quiz, questionCount, onSaved }: { quiz: Quiz; questionCount: number; onSaved: () => void }) {
  const toast = useToast()
  const init = () => ({
    title: quiz.title, type: quiz.type, description: quiz.description ?? '',
    duration: quiz.duration_minutes ? String(quiz.duration_minutes) : '',
    open_at: toLocalInput(quiz.open_at), close_at: toLocalInput(quiz.close_at),
    passing: quiz.passing_score != null ? String(quiz.passing_score) : '',
    max_attempts: quiz.max_attempts,
    shuffle_questions: quiz.shuffle_questions, shuffle_options: quiz.shuffle_options,
    show_result: quiz.show_result, show_answers: quiz.show_answers,
    require_checkin: quiz.require_checkin, counts_toward_final: quiz.counts_toward_final,
    is_published: quiz.is_published,
  })
  const [f, setF] = useState(init)
  const [busy, setBusy] = useState(false)
  useEffect(() => setF(init()), [quiz]) // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = useMemo(() => JSON.stringify(f) !== JSON.stringify(init()), [f, quiz]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save(e: FormEvent) {
    e.preventDefault()
    const open = fromLocalInput(f.open_at), close = fromLocalInput(f.close_at)
    if (open && close && new Date(close) <= new Date(open)) return toast('Waktu ditutup harus setelah waktu dibuka.', 'error')
    if (f.is_published && questionCount === 0) return toast('Tambahkan soal sebelum menerbitkan kuis.', 'error')
    const duration = f.duration ? Math.max(1, Math.round(Number(f.duration))) : null
    const passing = f.passing !== '' ? Math.min(100, Math.max(0, Number(f.passing))) : null
    setBusy(true)
    const { error } = await supabase.from('quizzes').update({
      title: f.title.trim(), type: f.type, description: f.description.trim() || null,
      duration_minutes: duration, open_at: open, close_at: close, passing_score: passing,
      max_attempts: Math.max(1, f.max_attempts),
      shuffle_questions: f.shuffle_questions, shuffle_options: f.shuffle_options,
      show_result: f.show_result, show_answers: f.show_answers,
      require_checkin: f.require_checkin, counts_toward_final: f.counts_toward_final, is_published: f.is_published,
    }).eq('id', quiz.id)
    setBusy(false)
    if (error) return toast(errMsg(error), 'error')
    toast('Pengaturan kuis disimpan.', 'success')
    onSaved()
  }

  return (
    <form className="card" onSubmit={save}>
      <div className="card-head">
        <h2>Pengaturan kuis</h2>
        <span className={`badge dot ${f.is_published ? 'success' : 'warn'}`}>{f.is_published ? 'Terbit' : 'Draft'}</span>
        <span className="spacer" />
        <button className="btn primary" disabled={busy || !dirty}>{busy ? 'Menyimpan…' : dirty ? 'Simpan pengaturan' : 'Tersimpan'}</button>
      </div>
      <div className="form-grid">
        <Field label="Judul *"><input className="input" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Jenis">
          <select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as QuizType })}>
            {(Object.keys(TYPE_LABEL) as QuizType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Petunjuk untuk peserta"><textarea className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="mis. Kerjakan dengan jujur tanpa membuka materi." /></Field>

      <div className="form-section"><Timer size={17} /> Waktu</div>
      <div className="form-grid">
        <Field label="Durasi pengerjaan (menit)" hint="Kosongkan = tanpa batas waktu. Dihitung server sejak peserta menekan Mulai.">
          <input className="input" type="number" min={1} value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value })} placeholder="tanpa batas" />
        </Field>
        <Field label="Dibuka pada" hint="Kosong = langsung dibuka"><input className="input" type="datetime-local" value={f.open_at} onChange={(e) => setF({ ...f, open_at: e.target.value })} /></Field>
        <Field label="Ditutup pada" hint="Pengerjaan yang sedang berjalan dipotong sampai jam ini"><input className="input" type="datetime-local" value={f.close_at} onChange={(e) => setF({ ...f, close_at: e.target.value })} /></Field>
      </div>

      <div className="form-section"><Target size={17} /> Penilaian</div>
      <div className="form-grid">
        <Field label="Nilai kelulusan (0–100)" hint="Kosong = tanpa status lulus"><input className="input" type="number" min={0} max={100} value={f.passing} onChange={(e) => setF({ ...f, passing: e.target.value })} /></Field>
        <Field label="Maksimal percobaan" hint="Skor terbaik yang dipakai"><input className="input" type="number" min={1} max={20} value={f.max_attempts} onChange={(e) => setF({ ...f, max_attempts: Number(e.target.value) })} /></Field>
      </div>
      <Check label="Masuk perhitungan nilai akhir &amp; peringkat" hint="Biasanya dimatikan untuk Pre Test." checked={f.counts_toward_final} onChange={(v) => setF({ ...f, counts_toward_final: v })} />
      <Check label="Tampilkan skor ke peserta setelah selesai" checked={f.show_result} onChange={(v) => setF({ ...f, show_result: v })} />
      <Check label="Tampilkan pembahasan &amp; kunci jawaban setelah selesai" checked={f.show_answers} onChange={(v) => setF({ ...f, show_answers: v })} />

      <div className="form-section"><Shuffle size={17} /> Aturan</div>
      <Check label="Acak urutan soal" checked={f.shuffle_questions} onChange={(v) => setF({ ...f, shuffle_questions: v })} />
      <Check label="Acak urutan pilihan jawaban" checked={f.shuffle_options} onChange={(v) => setF({ ...f, shuffle_options: v })} />
      <Check label="Wajib sudah absen sebelum mengerjakan" hint="Peserta harus tercatat hadir/terlambat di minimal satu sesi." checked={f.require_checkin} onChange={(v) => setF({ ...f, require_checkin: v })} />

      <div className="form-section"><ShieldCheck size={17} /> Publikasi</div>
      <Check label="Terbitkan kuis (terlihat oleh peserta)" checked={f.is_published} onChange={(v) => setF({ ...f, is_published: v })} />
    </form>
  )
}

/* ---------- Form soal ---------- */

function QuestionForm({ value, quizId, activityId, nextPos, onClose, onSaved }: {
  value: Partial<Question>; quizId: string; activityId: string; nextPos: number; onClose: () => void; onSaved: () => void
}) {
  const toast = useToast()
  const [text, setText] = useState(value.text ?? '')
  const [options, setOptions] = useState<string[]>(value.options ?? ['', ''])
  const [correct, setCorrect] = useState(value.correct_index ?? 0)
  const [points, setPoints] = useState(String(value.points ?? 1))
  const [explanation, setExplanation] = useState(value.explanation ?? '')
  const [busy, setBusy] = useState(false)

  function removeOption(i: number) {
    setOptions(options.filter((_, x) => x !== i))
    setCorrect(correct === i ? 0 : correct > i ? correct - 1 : correct)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const opts = options.map((o) => o.trim())
    if (opts.some((o) => !o)) return toast('Semua pilihan jawaban harus diisi (hapus yang tidak dipakai).', 'error')
    const pts = Number(points)
    if (!(pts > 0)) return toast('Bobot poin harus lebih dari 0.', 'error')
    setBusy(true)
    const payload = { text: text.trim(), options: opts, correct_index: correct, points: pts, explanation: explanation.trim() || null }
    const { error } = value.id
      ? await supabase.from('questions').update(payload).eq('id', value.id)
      : await supabase.from('questions').insert({ ...payload, quiz_id: quizId, activity_id: activityId, position: nextPos })
    setBusy(false)
    if (error) return toast(errMsg(error), 'error')
    onSaved()
  }

  return (
    <Modal wide title={value.id ? 'Ubah soal' : 'Soal baru'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Batal</button><button className="btn primary" form="qform" disabled={busy}>Simpan</button></>}>
      <form id="qform" onSubmit={submit}>
        <Field label="Pertanyaan *"><textarea className="input" required autoFocus value={text} onChange={(e) => setText(e.target.value)} /></Field>
        <div className="label" style={{ marginBottom: 6 }}>Pilihan jawaban — pilih bulatan untuk menandai kunci</div>
        {options.map((o, i) => (
          <div className="row" key={i} style={{ marginBottom: 8, flexWrap: 'nowrap' }}>
            <input type="radio" name="correct" checked={correct === i} onChange={() => setCorrect(i)} aria-label={`Kunci jawaban ${LETTERS[i]}`} style={{ width: 20, height: 20, accentColor: 'var(--success)' }} />
            <b style={{ width: 20 }}>{LETTERS[i]}</b>
            <input className="input" value={o} onChange={(e) => setOptions(options.map((x, xi) => (xi === i ? e.target.value : x)))} placeholder={`Pilihan ${LETTERS[i]}`} />
            <button type="button" className="icon-btn" disabled={options.length <= 2} onClick={() => removeOption(i)} aria-label="Hapus pilihan"><X size={16} /></button>
          </div>
        ))}
        <button type="button" className="btn sm" disabled={options.length >= 6} onClick={() => setOptions([...options, ''])}><Plus size={15} /> Tambah pilihan</button>
        <div className="form-grid" style={{ marginTop: 16 }}>
          <Field label="Bobot poin"><input className="input" type="number" min={0.5} step={0.5} value={points} onChange={(e) => setPoints(e.target.value)} /></Field>
        </div>
        <Field label="Pembahasan (opsional)" hint="Ditampilkan ke peserta bila pembahasan diaktifkan."><textarea className="input" value={explanation} onChange={(e) => setExplanation(e.target.value)} /></Field>
      </form>
    </Modal>
  )
}

/* ---------- Impor soal dari teks ---------- */

function BulkQuestions({ quizId, activityId, startPos, onClose, onSaved }: {
  quizId: string; activityId: string; startPos: number; onClose: () => void; onSaved: () => void
}) {
  const toast = useToast()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const parsed = useMemo(() => parseQuestions(text), [text])

  async function save() {
    setBusy(true)
    const { error } = await supabase.from('questions').insert(parsed.items.map((q, i) => ({
      activity_id: activityId, quiz_id: quizId, position: startPos + i, text: q.text, options: q.options,
      correct_index: q.correct_index, points: 1, explanation: q.explanation ?? null,
    })))
    setBusy(false)
    if (error) return toast(errMsg(error), 'error')
    toast(`${parsed.items.length} soal ditambahkan.`, 'success')
    onSaved()
  }

  return (
    <Modal wide title="Impor soal dari teks" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Batal</button>
        <button className="btn primary" disabled={busy || parsed.items.length === 0} onClick={() => void save()}>{busy ? 'Menyimpan…' : `Tambahkan ${parsed.items.length} soal`}</button></>}>
      <p className="muted small">Pisahkan antar soal dengan baris kosong. Tandai kunci dengan <b>*</b> di akhir pilihan, atau baris <b>Kunci: B</b>. Contoh:</p>
      <pre className="card mono" style={{ background: 'var(--surface-2)', whiteSpace: 'pre-wrap', margin: '0 0 12px' }}>{QUESTION_FORMAT_HELP}</pre>
      <textarea className="input" style={{ minHeight: 220 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Tempel soal di sini…" />
      {text.trim() && (
        <div style={{ marginTop: 12 }}>
          <span className="badge success">{parsed.items.length} soal valid</span>{' '}
          {parsed.errors.length > 0 && <span className="badge danger">{parsed.errors.length} masalah</span>}
          {parsed.errors.length > 0 && <ul className="small" style={{ color: 'var(--danger)' }}>{parsed.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
        </div>
      )}
    </Modal>
  )
}
