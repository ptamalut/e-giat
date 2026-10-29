import { describe, expect, it } from 'vitest'
import { attendanceMatrix, bestAttempt, gainTable, itemAnalysis, quizResults, sessionCounts } from './reports'
import type { Attendance, AttendanceSession, Participant, Question, Quiz, QuizAttempt } from './types'

const P = (id: string): Participant => ({ id, activity_id: 'a', name: id, identifier: null, grade: null, job_title: null, institution: null, email: null, phone: null, role: 'peserta', employee_id: null, access_attendance: true, access_quiz: true, access_certificate: true, sort_order: null, token: id, created_at: '' })
const quiz = (id: string, passing: number | null = 70): Quiz => ({ id, activity_id: 'a', title: id, type: 'pre', description: null, duration_minutes: null, open_at: null, close_at: null, passing_score: passing, max_attempts: 3, shuffle_questions: false, shuffle_options: false, show_result: true, show_answers: false, require_checkin: false, counts_toward_final: true, is_published: true, created_at: '' })
let n = 0
const T = (quiz_id: string, participant_id: string, score: number, secs: number, answers: Record<string, number> = {}): QuizAttempt => ({
  id: 't' + n++, activity_id: 'a', quiz_id, participant_id, attempt_no: 1, started_at: '2026-01-01T00:00:00Z',
  deadline_at: null, submitted_at: new Date(Date.UTC(2026, 0, 1, 0, 0, secs)).toISOString(), answers, score, correct_count: 0, total_questions: 0, auto_submitted: false,
})

describe('kuis', () => {
  const ps = [P('a'), P('b'), P('c'), P('d')]
  const q = quiz('q1')
  const attempts = [T('q1', 'a', 60, 100), T('q1', 'a', 90, 300), T('q1', 'b', 90, 200), T('q1', 'c', 40, 50)]

  it('memilih percobaan terbaik (skor tertinggi, lalu tercepat)', () => {
    expect(bestAttempt([T('q1', 'a', 80, 100), T('q1', 'a', 80, 50), T('q1', 'a', 70, 10)])?.submitted_at).toContain('00:00:50')
    expect(bestAttempt([{ ...T('q1', 'a', 99, 1), submitted_at: null }])).toBeUndefined()
  })

  it('menghitung peringkat, statistik, dan distribusi', () => {
    const { rows, stats } = quizResults(q, ps, attempts)
    const by = Object.fromEntries(rows.map((r) => [r.participant.id, r]))
    expect(by.b.rank).toBe(1) // 90 dalam 200 dtk lebih cepat dari a (90 dalam 300 dtk)
    expect(by.a.rank).toBe(2)
    expect(by.c.rank).toBe(3)
    expect(by.d.rank).toBeNull()
    expect(by.a.passed).toBe(true)
    expect(by.c.passed).toBe(false)
    expect(by.d.passed).toBeNull()
    expect(stats).toMatchObject({ taken: 3, total: 4, max: 90, min: 40 })
    expect(stats.avg).toBeCloseTo(73.33, 1)
    expect(stats.passRate).toBeCloseTo(66.67, 1)
    expect(stats.distribution[9]).toBe(2) // 90 masuk kelompok 90–100
    expect(stats.distribution[4]).toBe(1)
  })

  it('N-gain pre vs post', () => {
    const pre = quiz('pre'), post = quiz('post')
    const g = gainTable(pre, post, ps.slice(0, 3), [T('pre', 'a', 50, 1), T('post', 'a', 80, 1), T('pre', 'b', 100, 1), T('post', 'b', 100, 1), T('pre', 'c', 30, 1)])
    expect(g.pairs).toBe(2)
    expect(g.rows[0].gain).toBe(30)
    expect(g.rows[0].nGain).toBeCloseTo(0.6)
    expect(g.rows[1].nGain).toBe(1)
    expect(g.rows[2].gain).toBeNull()
    expect(g.improved).toBe(1)
  })

  it('analisis butir soal memakai percobaan terbaik per peserta', () => {
    const qs: Question[] = [{ id: 'x', activity_id: 'a', quiz_id: 'q1', position: 1, text: 'x', options: ['a', 'b'], correct_index: 1, points: 1, explanation: null }]
    const r = itemAnalysis(qs, [T('q1', 'a', 100, 1, { x: 1 }), T('q1', 'a', 0, 1, { x: 0 }), T('q1', 'b', 0, 1, { x: 0 })])
    expect(r[0].pctCorrect).toBe(50)
    expect(r[0].level).toBe('sedang')
    expect(r[0].optionCounts).toEqual([1, 1])
  })
})

describe('kehadiran', () => {
  const ps = [P('a'), P('b')]
  const ss: AttendanceSession[] = ['s1', 's2'].map((id) => ({ id, activity_id: 'a', title: id, start_at: '', end_at: '', late_minutes: 0, require_selfie: false, require_location: false }))
  const at = (s: string, p: string, status: Attendance['status']): Attendance => ({ id: s + p, activity_id: 'a', session_id: s, participant_id: p, status, checked_in_at: '', note: null, manual: false, selfie_path: null, lat: null, lng: null, accuracy_m: null })
  const list = [at('s1', 'a', 'hadir'), at('s2', 'a', 'terlambat'), at('s1', 'b', 'izin')]

  it('persentase menghitung hadir + terlambat saja', () => {
    const m = attendanceMatrix(ps, ss, list)
    expect(m[0].pct).toBe(100)
    expect(m[1].pct).toBe(0)
    expect(attendanceMatrix(ps, [], [])[0].pct).toBeNull()
  })
  it('rekap per sesi termasuk yang belum absen', () => {
    expect(sessionCounts(ps, list, 's1')).toEqual({ hadir: 1, terlambat: 0, izin: 1, sakit: 0, alpa: 0, belum: 0 })
    expect(sessionCounts(ps, list, 's2')).toMatchObject({ terlambat: 1, belum: 1 })
  })
})
