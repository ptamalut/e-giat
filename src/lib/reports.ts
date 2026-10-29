import type {
  Attendance, AttendanceSession, AttendanceStatus, Participant, Question, Quiz, QuizAttempt,
} from './types'

export const ATTENDED: AttendanceStatus[] = ['hadir', 'terlambat']

/* ---------- Kehadiran ---------- */

export interface AttendanceRow {
  participant: Participant
  cells: Record<string, Attendance | undefined>
  attended: number
  pct: number | null
}

export function attendanceMatrix(
  participants: Participant[], sessions: AttendanceSession[], attendances: Attendance[],
): AttendanceRow[] {
  const byKey = new Map<string, Attendance>()
  for (const a of attendances) byKey.set(`${a.participant_id}:${a.session_id}`, a)
  return participants.map((p) => {
    const cells: Record<string, Attendance | undefined> = {}
    let attended = 0
    for (const s of sessions) {
      const a = byKey.get(`${p.id}:${s.id}`)
      cells[s.id] = a
      if (a && ATTENDED.includes(a.status)) attended++
    }
    return { participant: p, cells, attended, pct: sessions.length ? (attended / sessions.length) * 100 : null }
  })
}

export function sessionCounts(participants: Participant[], attendances: Attendance[], sessionId: string) {
  const counts: Record<AttendanceStatus | 'belum', number> = { hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpa: 0, belum: 0 }
  const ids = new Set(participants.map((p) => p.id))
  let marked = 0
  for (const a of attendances) {
    if (a.session_id !== sessionId || !ids.has(a.participant_id)) continue
    counts[a.status]++
    marked++
  }
  counts.belum = participants.length - marked
  return counts
}

/* ---------- Kuis ---------- */

export const durationSeconds = (t: QuizAttempt): number | null =>
  t.submitted_at ? (new Date(t.submitted_at).getTime() - new Date(t.started_at).getTime()) / 1000 : null

/** Percobaan terbaik: skor tertinggi, lalu yang paling cepat. Hanya percobaan yang sudah selesai. */
export function bestAttempt(attempts: QuizAttempt[]): QuizAttempt | undefined {
  let best: QuizAttempt | undefined
  for (const t of attempts) {
    if (!t.submitted_at || t.score == null) continue
    if (!best) { best = t; continue }
    const diff = Number(t.score) - Number(best.score)
    if (diff > 0 || (diff === 0 && (durationSeconds(t) ?? Infinity) < (durationSeconds(best) ?? Infinity))) best = t
  }
  return best
}

export interface QuizResultRow {
  participant: Participant
  attempts: number
  best?: QuizAttempt
  score: number | null
  duration: number | null
  passed: boolean | null
  rank: number | null
}

export interface QuizStats {
  taken: number
  total: number
  avg: number | null
  max: number | null
  min: number | null
  passRate: number | null
  /** 10 kelompok: 0–10, 10–20, … 90–100 */
  distribution: number[]
}

export function quizResults(quiz: Quiz, participants: Participant[], attempts: QuizAttempt[]) {
  const byP = new Map<string, QuizAttempt[]>()
  for (const t of attempts) {
    if (t.quiz_id !== quiz.id) continue
    const arr = byP.get(t.participant_id) ?? []
    arr.push(t)
    byP.set(t.participant_id, arr)
  }

  const rows: QuizResultRow[] = participants.map((p) => {
    const mine = byP.get(p.id) ?? []
    const best = bestAttempt(mine)
    const score = best ? Number(best.score) : null
    return {
      participant: p,
      attempts: mine.length,
      best,
      score,
      duration: best ? durationSeconds(best) : null,
      passed: score != null && quiz.passing_score != null ? score >= Number(quiz.passing_score) : null,
      rank: null,
    }
  })

  // peringkat: skor tinggi dulu, seri -> waktu lebih cepat; seri penuh berbagi peringkat
  const ranked = rows.filter((r) => r.score != null).sort((a, b) =>
    b.score! - a.score! || (a.duration ?? Infinity) - (b.duration ?? Infinity))
  ranked.forEach((r, i) => {
    const prev = ranked[i - 1]
    r.rank = prev && prev.score === r.score && Math.round(prev.duration ?? -1) === Math.round(r.duration ?? -2) ? prev.rank : i + 1
  })

  const scores = ranked.map((r) => r.score!)
  const distribution = Array<number>(10).fill(0)
  for (const s of scores) distribution[Math.min(9, Math.floor(s / 10))]++
  const stats: QuizStats = {
    taken: scores.length,
    total: participants.length,
    avg: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    max: scores.length ? Math.max(...scores) : null,
    min: scores.length ? Math.min(...scores) : null,
    passRate: quiz.passing_score != null && scores.length
      ? (scores.filter((s) => s >= Number(quiz.passing_score)).length / scores.length) * 100 : null,
    distribution,
  }
  return { rows, ranked, stats }
}

/* ---------- Analisis butir soal ---------- */

export interface ItemAnalysis {
  question: Question
  answered: number
  correct: number
  pctCorrect: number | null
  level: 'mudah' | 'sedang' | 'sulit' | null
  optionCounts: number[]
}

/** Dihitung dari percobaan terbaik tiap peserta supaya percobaan ulang tidak menggandakan data. */
export function itemAnalysis(questions: Question[], attempts: QuizAttempt[]): ItemAnalysis[] {
  const bestPerParticipant = new Map<string, QuizAttempt[]>()
  for (const t of attempts) {
    const arr = bestPerParticipant.get(t.participant_id) ?? []
    arr.push(t)
    bestPerParticipant.set(t.participant_id, arr)
  }
  const used = [...bestPerParticipant.values()].map(bestAttempt).filter((t): t is QuizAttempt => !!t)

  return questions.map((q) => {
    const optionCounts = q.options.map(() => 0)
    let answered = 0
    let correct = 0
    for (const t of used) {
      if (!(t.answers && q.id in t.answers)) continue
      const v = Number(t.answers[q.id])
      if (!Number.isInteger(v) || v < 0 || v >= q.options.length) continue
      answered++
      optionCounts[v]++
      if (v === q.correct_index) correct++
    }
    // peserta yang tidak menjawab dihitung salah
    const denom = used.length
    const pctCorrect = denom ? (correct / denom) * 100 : null
    const level = pctCorrect == null ? null : pctCorrect >= 80 ? 'mudah' : pctCorrect >= 40 ? 'sedang' : 'sulit'
    return { question: q, answered, correct, pctCorrect, level, optionCounts }
  })
}

/* ---------- Pre test vs Post test ---------- */

export interface GainRow {
  participant: Participant
  pre: number | null
  post: number | null
  gain: number | null
  /** N-gain Hake: (post − pre) / (100 − pre) */
  nGain: number | null
}

export function nGainCategory(g: number | null): string {
  if (g == null) return '—'
  return g >= 0.7 ? 'Tinggi' : g >= 0.3 ? 'Sedang' : 'Rendah'
}

export function gainTable(pre: Quiz, post: Quiz, participants: Participant[], attempts: QuizAttempt[]) {
  const a = quizResults(pre, participants, attempts).rows
  const b = quizResults(post, participants, attempts).rows
  const rows: GainRow[] = participants.map((p, i) => {
    const x = a[i].score
    const y = b[i].score
    const both = x != null && y != null
    return {
      participant: p,
      pre: x,
      post: y,
      gain: both ? y - x : null,
      nGain: both ? (x >= 100 ? (y >= 100 ? 1 : 0) : (y - x) / (100 - x)) : null,
    }
  })
  const paired = rows.filter((r) => r.gain != null)
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null)
  return {
    rows,
    pairs: paired.length,
    avgPre: mean(paired.map((r) => r.pre!)),
    avgPost: mean(paired.map((r) => r.post!)),
    avgGain: mean(paired.map((r) => r.gain!)),
    avgNGain: mean(paired.map((r) => r.nGain!)),
    improved: paired.filter((r) => r.gain! > 0).length,
  }
}
