import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Loading } from '../../components/ui'
import { fmtDateTime, fmtScore } from '../../lib/format'
import { rpc } from '../../lib/supabase'
import type { AttemptResult } from '../../lib/types'

const LETTERS = 'ABCDEFGH'

export default function QuizResult() {
  const { token = '', attemptId = '' } = useParams()
  const [r, setR] = useState<AttemptResult | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    rpc<AttemptResult>('portal_get_result', { p_token: token, p_attempt: attemptId })
      .then(setR).catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [token, attemptId])

  if (error) {
    return <div className="auth-wrap"><div className="card auth-card center"><h2>Hasil tidak ditemukan</h2><p className="muted">{error}</p><Link className="btn" to={`/p/${token}`}>Kembali</Link></div></div>
  }
  if (!r) return <Loading />

  const hasScore = r.show_result && r.score != null
  const score = Number(r.score ?? 0)
  const ring = r.passed === false ? 'var(--danger)' : r.passed ? 'var(--success)' : 'var(--primary)'

  return (
    <div className="container narrow page stack">
      <Link to={`/p/${token}`} className="muted small">← Kembali ke halaman kegiatan</Link>
      <div className="card center">
        <div className="muted">{r.quiz_title} · percobaan ke-{r.attempt_no}</div>
        {hasScore ? (
          <>
            <div className="score-ring" style={{ '--p': score, '--ring': ring } as React.CSSProperties}><div>{fmtScore(score, 0)}</div></div>
            {r.passed != null && <h2 style={{ color: ring }}>{r.passed ? '🎉 Lulus' : 'Belum lulus'}</h2>}
            <p>Benar <b>{r.correct_count}</b> dari <b>{r.total_questions}</b> soal{r.passing_score != null ? ` · nilai lulus ${fmtScore(r.passing_score, 0)}` : ''}</p>
          </>
        ) : (
          <>
            <div style={{ fontSize: '3rem', margin: '12px 0' }}>✅</div>
            <h2>Jawaban Anda sudah terkirim</h2>
            <p className="muted">Hasil akan diumumkan oleh panitia.</p>
          </>
        )}
        <div className="muted small">Dikumpulkan {fmtDateTime(r.submitted_at)}{r.auto_submitted ? ' · otomatis (waktu habis)' : ''}</div>
      </div>

      {r.review && (
        <div className="card">
          <h2>Pembahasan</h2>
          {r.review.map((q, i) => (
            <div key={q.id} style={{ padding: '14px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
              <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                <span className={`badge ${q.is_correct ? 'success' : 'danger'}`}>{q.is_correct ? '✓' : '✗'} {i + 1}</span>
                <div className="q-text" style={{ fontSize: '1rem' }}>{q.text}</div>
              </div>
              <div style={{ marginTop: 8 }}>
                {q.options.map((o, oi) => (
                  <div key={oi} className={`opt ${oi === q.correct_index ? 'correct' : oi === q.selected ? 'wrong' : ''}`} style={{ cursor: 'default', marginBottom: 6, padding: '8px 12px' }}>
                    <span className="letter">{LETTERS[oi]}</span>
                    <span>{o}{oi === q.correct_index ? ' ✓ kunci' : ''}{oi === q.selected && oi !== q.correct_index ? ' (jawaban Anda)' : ''}</span>
                  </div>
                ))}
                {q.selected == null && <div className="muted small">Tidak dijawab</div>}
                {q.explanation && <div className="alert info" style={{ marginTop: 8, marginBottom: 0 }}>💡 {q.explanation}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
