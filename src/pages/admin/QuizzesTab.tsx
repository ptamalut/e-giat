import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Empty, ErrorBox, Field, Loading, Modal, useAsync, useConfirm, useToast } from '../../components/ui'
import { fmtDateTime } from '../../lib/format'
import { errMsg, supabase } from '../../lib/supabase'
import type { Quiz, QuizType } from '../../lib/types'
import { useActivity } from './ActivityLayout'

export const TYPE_LABEL: Record<QuizType, string> = { pre: 'Pre Test', post: 'Post Test', lainnya: 'Kuis' }
export const TYPE_TONE: Record<QuizType, string> = { pre: 'info', post: 'primary', lainnya: '' }

function copyTitle(title: string, from: QuizType, to: QuizType): string {
  if (from === to) return `${title} (salinan)`
  const re = /(pre|post)\s*-?\s*test/i
  return re.test(title) ? title.replace(re, TYPE_LABEL[to]) : `${TYPE_LABEL[to]} — ${title}`
}

type Row = Quiz & { questions: { count: number }[]; quiz_attempts: { count: number }[] }

export function windowText(q: Pick<Quiz, 'open_at' | 'close_at'>): string {
  if (!q.open_at && !q.close_at) return 'Selalu terbuka'
  return `${q.open_at ? fmtDateTime(q.open_at) : 'sekarang'} → ${q.close_at ? fmtDateTime(q.close_at) : 'tanpa batas'}`
}

export default function QuizzesTab() {
  const { activity } = useActivity()
  const toast = useToast()
  const confirm = useConfirm()
  const nav = useNavigate()
  const [creating, setCreating] = useState(false)

  const { data, error, loading, reload } = useAsync(async () => {
    const { data, error } = await supabase.from('quizzes')
      .select('*, questions(count), quiz_attempts(count)').eq('activity_id', activity.id).order('created_at')
    if (error) throw new Error(errMsg(error))
    return data as Row[]
  }, [activity.id])

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const type = String(f.get('type')) as QuizType
    const { data, error } = await supabase.from('quizzes').insert({
      activity_id: activity.id,
      title: String(f.get('title')).trim(),
      type,
      duration_minutes: type === 'pre' ? 15 : 30,
      passing_score: 70,
      counts_toward_final: type !== 'pre',
    }).select('id').single()
    if (error) return toast(errMsg(error), 'error')
    nav(`${data.id}`)
  }

  async function togglePublish(q: Row) {
    if (!q.is_published && !(q.questions[0]?.count > 0)) return toast('Tambahkan soal terlebih dahulu.', 'error')
    const { error } = await supabase.from('quizzes').update({ is_published: !q.is_published }).eq('id', q.id)
    if (error) return toast(errMsg(error), 'error')
    toast(q.is_published ? 'Kuis disembunyikan dari peserta.' : 'Kuis diterbitkan untuk peserta.', 'success')
    void reload(true)
  }

  /** Salin kuis beserta soalnya, mis. membuat Post Test dari soal Pre Test. */
  async function copyAs(q: Row, type: QuizType) {
    const { data: qs, error: e1 } = await supabase.from('questions').select('*').eq('quiz_id', q.id).order('position')
    if (e1) return toast(errMsg(e1), 'error')
    const { id: _i, created_at: _c, questions: _q, quiz_attempts: _a, ...base } = q
    const { data: nq, error: e2 } = await supabase.from('quizzes').insert({
      ...base, type, is_published: false, open_at: null, close_at: null,
      counts_toward_final: type !== 'pre',
      title: copyTitle(q.title, q.type, type),
    }).select('id').single()
    if (e2) return toast(errMsg(e2), 'error')
    if (qs.length) {
      const { error: e3 } = await supabase.from('questions').insert(qs.map((s) => ({
        activity_id: s.activity_id, quiz_id: nq.id, position: s.position, text: s.text, options: s.options,
        correct_index: s.correct_index, points: s.points, explanation: s.explanation,
      })))
      if (e3) return toast(errMsg(e3), 'error')
    }
    toast(`Disalin sebagai ${TYPE_LABEL[type]} (belum terbit).`, 'success')
    nav(`${nq.id}`)
  }

  async function remove(q: Row) {
    const n = q.quiz_attempts[0]?.count ?? 0
    const ok = await confirm({ title: `Hapus "${q.title}"?`, danger: true, confirmText: 'Hapus',
      message: n ? <>Sudah ada <b>{n}</b> percobaan peserta. Semua soal dan hasilnya akan terhapus permanen.</> : 'Semua soal di dalamnya ikut terhapus.' })
    if (!ok) return
    const { error } = await supabase.from('quizzes').delete().eq('id', q.id)
    if (error) return toast(errMsg(error), 'error')
    toast('Kuis dihapus.', 'success'); void reload(true)
  }

  if (loading && !data) return <Loading />
  if (error || !data) return <ErrorBox error={error ?? ''} onRetry={() => void reload()} />

  return (
    <div className="stack">
      <div className="row between">
        <p className="muted" style={{ margin: 0 }}>Buat pre test &amp; post test dengan batas waktu. Peserta mengerjakan lewat link pribadi mereka.</p>
        <button className="btn primary" onClick={() => setCreating(true)}>＋ Buat kuis</button>
      </div>

      {data.length === 0 && <div className="card"><Empty icon="📝" title="Belum ada kuis">Mulai dengan Pre Test untuk mengukur pengetahuan awal peserta.</Empty></div>}

      <div className="grid cols-2">
        {data.map((q) => {
          const n = q.questions[0]?.count ?? 0
          const attempts = q.quiz_attempts[0]?.count ?? 0
          return (
            <div className="card" key={q.id}>
              <div className="row" style={{ marginBottom: 6 }}>
                <span className={`badge ${TYPE_TONE[q.type]}`}>{TYPE_LABEL[q.type]}</span>
                {q.is_published ? <span className="badge success">Terbit</span> : <span className="badge warn">Draft</span>}
              </div>
              <h3><Link to={q.id}>{q.title}</Link></h3>
              <div className="muted small" style={{ lineHeight: 1.8 }}>
                📋 {n} soal · ⏱ {q.duration_minutes ? `${q.duration_minutes} menit` : 'tanpa batas waktu'} · 🔁 maks {q.max_attempts}x<br />
                🗓️ {windowText(q)}<br />
                👥 {attempts} percobaan masuk
              </div>
              <div className="row" style={{ marginTop: 12 }}>
                <Link className="btn sm primary" to={q.id}>Kelola soal &amp; pengaturan</Link>
                <button className="btn sm" onClick={() => void togglePublish(q)}>{q.is_published ? 'Sembunyikan' : 'Terbitkan'}</button>
                {q.type === 'pre' && <button className="btn sm" onClick={() => void copyAs(q, 'post')} title="Salin soal ini menjadi Post Test">Jadikan Post Test ⧉</button>}
                <span className="spacer" />
                <button className="btn ghost sm" onClick={() => void remove(q)} aria-label="Hapus kuis">🗑️</button>
              </div>
            </div>
          )
        })}
      </div>

      {creating && (
        <Modal title="Kuis baru" onClose={() => setCreating(false)}
          footer={<><button className="btn" onClick={() => setCreating(false)}>Batal</button><button className="btn primary" form="newquiz">Buat &amp; tambah soal</button></>}>
          <form id="newquiz" onSubmit={create}>
            <Field label="Jenis">
              <select className="input" name="type" defaultValue="pre">
                <option value="pre">Pre Test (sebelum materi)</option>
                <option value="post">Post Test (setelah materi)</option>
                <option value="lainnya">Kuis lainnya</option>
              </select>
            </Field>
            <Field label="Judul *"><input className="input" name="title" required autoFocus placeholder="mis. Pre Test Materi Dasar" /></Field>
          </form>
        </Modal>
      )}
    </div>
  )
}
