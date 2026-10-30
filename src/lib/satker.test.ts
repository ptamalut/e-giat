import { describe, expect, it } from 'vitest'
import { groupBySatker, matchesUnit, NONE_KEY, normSatker, roleSummary, satkerKey } from './satker'
import { satkerSummary } from './reports'
import type { Attendance, AttendanceSession, Participant, RankingRow } from './types'

const P = (id: string, institution: string | null, role: Participant['role'] = 'peserta'): Participant => ({
  id, activity_id: 'a', name: id, identifier: null, grade: null, job_title: null, institution, email: null, phone: null, role, employee_id: null, access_attendance: true, access_quiz: role === 'peserta', access_certificate: true, access_notes: false, access_documentation: false, roles: [], sort_order: null, token: id, created_at: '',
})

describe('groupBySatker', () => {
  const people = [P('1', 'Dinas Pendidikan'), P('2', 'dinas  pendidikan '), P('3', 'Dinas Kesehatan'), P('4', null), P('5', '   '), P('6', 'Dinas Pendidikan')]
  const groups = groupBySatker(people, (p) => p.institution)

  it('menggabungkan penulisan yang beda huruf/spasi menjadi satu kelompok', () => {
    expect(groups.map((g) => g.label)).toEqual(['Dinas Kesehatan', 'Dinas Pendidikan', 'Tanpa satuan kerja'])
    expect(groups[1].items.map((p) => p.id)).toEqual(['1', '2', '6'])
  })
  it('memakai penulisan yang paling sering sebagai nama kelompok', () => {
    expect(groups[1].label).toBe('Dinas Pendidikan')
  })
  it('penulisan sama banyak: pilih yang berhuruf kapital, bukan huruf kecil semua', () => {
    const g = groupBySatker([P('1', 'dinas pendidikan provinsi'), P('2', 'Dinas Pendidikan Provinsi')], (p) => p.institution)
    expect(g).toHaveLength(1)
    expect(g[0].label).toBe('Dinas Pendidikan Provinsi')
  })
  it('kosong/spasi saja masuk "Tanpa satuan kerja" dan selalu di akhir', () => {
    const last = groups[groups.length - 1]
    expect(last.key).toBe('')
    expect(last.items.map((p) => p.id)).toEqual(['4', '5'])
  })
  it('urutan abjad Indonesia tidak peka huruf besar', () => {
    const g = groupBySatker([P('x', 'universitas'), P('y', 'Badan Kepegawaian'), P('z', 'Dinas')], (p) => p.institution)
    expect(g.map((x) => x.label)).toEqual(['Badan Kepegawaian', 'Dinas', 'universitas'])
  })
})

describe('helper satker', () => {
  it('normalisasi dan kunci', () => {
    expect(normSatker('  Dinas   X ')).toBe('Dinas X')
    expect(satkerKey('DINAS  x')).toBe('dinas x')
  })
  it('roleSummary tanpa peran kosong', () => {
    expect(roleSummary([P('1', 'x'), P('2', 'x'), P('3', 'x', 'narasumber')])).toBe('2 peserta · 1 narasumber')
  })
  it('matchesUnit', () => {
    expect(matchesUnit('', 'apa saja')).toBe(true)
    expect(matchesUnit('dinas x', 'Dinas  X')).toBe(true)
    expect(matchesUnit('dinas x', 'Dinas Y')).toBe(false)
    expect(matchesUnit(NONE_KEY, null)).toBe(true)
    expect(matchesUnit(NONE_KEY, 'Dinas')).toBe(false)
  })
})

describe('satkerSummary', () => {
  const ps = [P('a', 'Dinas A'), P('b', 'Dinas A'), P('c', 'Dinas B'), P('d', 'Dinas B', 'narasumber'), P('e', 'Dinas C', 'panitia')]
  const ss: AttendanceSession[] = [{ id: 's1', activity_id: 'a', title: 's1', start_at: '', end_at: '', late_minutes: 0, require_selfie: false, require_location: false, custom_members: false }]
  const at = (p: string): Attendance => ({ id: p, activity_id: 'a', session_id: 's1', participant_id: p, status: 'hadir', checked_in_at: '', note: null, manual: false, selfie_path: null, lat: null, lng: null, accuracy_m: null })
  const rk = (id: string, quiz: number, final: number): RankingRow => ({ participant_id: id, name: id, institution: null, sessions_attended: 0, sessions_total: 1, attendance_pct: 0, quiz_avg: quiz, final_score: final, rank: 1 })
  const rows = satkerSummary(ps, ss, [at('a'), at('d')], [rk('a', 80, 90), rk('b', 60, 40), rk('c', 100, 95)])
  const by = Object.fromEntries(rows.map((r) => [r.label, r]))

  it('menghitung jumlah per peran', () => {
    expect(by['Dinas A']).toMatchObject({ peserta: 2, narasumber: 0, panitia: 0 })
    expect(by['Dinas B']).toMatchObject({ peserta: 1, narasumber: 1 })
    expect(by['Dinas C']).toMatchObject({ peserta: 0, panitia: 1 })
  })
  it('kehadiran rata-rata semua peran; nilai hanya dari peserta', () => {
    expect(by['Dinas A'].attendancePct).toBe(50) // a hadir, b tidak
    expect(by['Dinas B'].attendancePct).toBe(50) // c tidak, d (narasumber) hadir
    expect(by['Dinas A'].avgFinal).toBe(65)
    expect(by['Dinas A'].avgQuiz).toBe(70)
    expect(by['Dinas C'].avgFinal).toBeNull()
  })
  it('kelompok tanpa satuan kerja tidak ikut diperingkat', () => {
    const r = satkerSummary([P('a', 'Dinas A'), P('z', null)], ss, [], [rk('a', 50, 50), rk('z', 100, 100)])
    expect(r.find((x) => x.key === '')?.rank).toBeNull()
    expect(r.find((x) => x.label === 'Dinas A')?.rank).toBe(1)
  })
  it('peringkat satker hanya untuk yang punya peserta bernilai', () => {
    expect(by['Dinas B'].rank).toBe(1)
    expect(by['Dinas A'].rank).toBe(2)
    expect(by['Dinas C'].rank).toBeNull()
  })
})
