import { Award, BarChart3, Building2, CalendarCheck, CheckCircle2, ClipboardList, Download, FileSearch, Percent, Printer, RefreshCw, RotateCcw, TrendingUp, Trophy, Users, type LucideIcon } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Empty, ErrorBox, HBar, BarChart, Loading, RankMedal, Stat, useAsync, useConfirm, useToast } from '../../components/ui'
import { downloadCsv, safeName } from '../../lib/csv'
import { RoleBadge } from '../../components/RoleBadge'
import { SatkerControls, SatkerGroupRow, useCollapsed } from '../../components/SatkerGroup'
import { groupBySatker, matchesUnit, roleSummary, sortPeople } from '../../lib/satker'
import { ROLE_LABEL, ROLES, roleLine } from '../../lib/people'
import { fmtDateTime, fmtDuration, fmtPct, fmtScore } from '../../lib/format'
import {
  attendanceMatrix, gainTable, itemAnalysis, memberMapOf, nGainCategory, quizResults, satkerSummary, sessionRole,
} from '../../lib/reports'
import { errMsg, fetchAll, supabase } from '../../lib/supabase'
import type {
  Attendance, AttendanceSession, Participant, PersonRole, Question, Quiz, QuizAttempt, RankingRow, SessionMember,
} from '../../lib/types'
import { useActivity } from './ActivityLayout'
import { ATT_LABEL, ATT_TONE } from './AttendanceTab'
import { TYPE_LABEL, TYPE_TONE } from './QuizzesTab'

type Section = 'peringkat' | 'satker' | 'kehadiran' | 'kuis' | 'prepost' | 'soal'
const SECTIONS: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: 'peringkat', label: 'Peringkat', icon: Trophy },
  { id: 'satker', label: 'Per satker', icon: Building2 },
  { id: 'kehadiran', label: 'Kehadiran', icon: CalendarCheck },
  { id: 'kuis', label: 'Hasil kuis', icon: ClipboardList },
  { id: 'prepost', label: 'Pre vs Post', icon: TrendingUp },
  { id: 'soal', label: 'Analisis soal', icon: FileSearch },
]

interface Data {
  participants: Participant[]
  sessions: AttendanceSession[]
  attendances: Attendance[]
  members: SessionMember[]
  quizzes: Quiz[]
  questions: Question[]
  attempts: QuizAttempt[]
  ranking: RankingRow[]
}

const scoreTone = (s: number | null, pass: number | null): 'good' | 'mid' | 'bad' | undefined =>
  s == null ? undefined : pass != null ? (s >= pass ? 'good' : 'bad') : s >= 75 ? 'good' : s >= 50 ? 'mid' : 'bad'

export default function ReportsTab() {
  const { activity } = useActivity()
  const [sp, setSp] = useSearchParams()
  // bagian laporan mengikuti menu yang aktif pada kegiatan
  const quizSections: Section[] = ['kuis', 'prepost', 'soal']
  const sections = SECTIONS.filter((s) => (s.id === 'kehadiran' ? activity.enable_attendance : quizSections.includes(s.id) ? activity.enable_quiz : true))
  const section = (sections.find((s) => s.id === sp.get('bagian'))?.id ?? 'peringkat') as Section

  const { data, error, loading, reload } = useAsync<Data>(async () => {
    const [participants, sessions, attendances, members, quizzes, questions, attempts, rank] = await Promise.all([
      fetchAll<Participant>((a, b) => supabase.from('participants').select('*').eq('activity_id', activity.id).order('name').order('id').range(a, b)),
      fetchAll<AttendanceSession>((a, b) => supabase.from('attendance_sessions').select('*').eq('activity_id', activity.id).order('start_at').order('id').range(a, b)),
      fetchAll<Attendance>((a, b) => supabase.from('attendances').select('*').eq('activity_id', activity.id).order('id').range(a, b)),
      fetchAll<SessionMember>((a, b) => supabase.from('session_members').select('*').eq('activity_id', activity.id).order('session_id').order('participant_id').range(a, b)),
      fetchAll<Quiz>((a, b) => supabase.from('quizzes').select('*').eq('activity_id', activity.id).order('created_at').order('id').range(a, b)),
      fetchAll<Question>((a, b) => supabase.from('questions').select('*').eq('activity_id', activity.id).order('position').order('id').range(a, b)),
      fetchAll<QuizAttempt>((a, b) => supabase.from('quiz_attempts').select('*').eq('activity_id', activity.id).order('id').range(a, b)),
      supabase.rpc('activity_ranking', { p_activity: activity.id }),
    ])
    if (rank.error) throw new Error(errMsg(rank.error))
    return { participants: sortPeople(participants), sessions, attendances, members, quizzes, questions, attempts, ranking: (rank.data ?? []) as RankingRow[] }
  }, [activity.id])

  // laporan kuis hanya memuat orang yang punya hak akses kuis; laporan kehadiran hanya yang punya hak akses absensi
  const pesertaData = useMemo(
    () => (data ? { ...data, participants: data.participants.filter((p) => p.access_quiz) } : null), [data])
  const hadirData = useMemo(
    () => (data ? { ...data, participants: data.participants.filter((p) => p.access_attendance) } : null), [data])

  if (loading && !data) return <Loading />
  if (error || !data || !pesertaData) return <ErrorBox error={error ?? ''} onRetry={() => void reload()} />

  return (
    <div className="stack">
      <div className="row between no-print">
        <div className="pills">
          {sections.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`pill ${section === id ? 'active' : ''}`}
              onClick={() => setSp((p) => { const n = new URLSearchParams(p); n.set('bagian', id); return n }, { replace: true })}><Icon size={15} />{label}</button>
          ))}
        </div>
        <div className="row tight">
          <button className="btn sm" onClick={() => void reload(true)}><RefreshCw size={14} /> Segarkan</button>
          <button className="btn sm" onClick={() => window.print()}><Printer size={14} /> Cetak / PDF</button>
        </div>
      </div>

      <div className="print-only">
        <h2 style={{ marginBottom: 0 }}>Laporan: {activity.name}</h2>
        <div>Dicetak {fmtDateTime(new Date().toISOString())}</div>
      </div>

      {data.participants.length === 0
        ? <div className="card"><Empty icon={<BarChart3 size={26} />} title="Belum ada data">Tambahkan peserta terlebih dahulu.</Empty></div>
        : section === 'peringkat' ? <RankingSection data={data} name={activity.name} weight={activity.weight_attendance} />
        : section === 'satker' ? <SatkerSection data={data} name={activity.name} />
        : section === 'kehadiran' ? <AttendanceSection data={hadirData ?? data} name={activity.name} satkerOrder={activity.satker_order} />
        : section === 'kuis' ? <QuizSection data={pesertaData} name={activity.name} onChanged={() => void reload(true)} />
        : section === 'prepost' ? <PrePostSection data={pesertaData} name={activity.name} />
        : <ItemSection data={pesertaData} name={activity.name} />}
    </div>
  )
}

/* ---------- Peringkat keseluruhan ---------- */
function RankingSection({ data, name, weight }: { data: Data; name: string; weight: number }) {
  const r = data.ranking
  const byId = useMemo(() => new Map(data.participants.map((p) => [p.id, p])), [data.participants])
  const active = r.filter((x) => x.final_score > 0)
  const avg = r.length ? r.reduce((s, x) => s + Number(x.final_score), 0) / r.length : null
  const countedQuizzes = data.quizzes.filter((q) => q.is_published && q.counts_toward_final)

  return (
    <>
      <div className="grid cols-4">
        <Stat icon={<Users size={20} />} value={r.length} label="Peserta" />
        <Stat icon={<Percent size={20} />} tone="info" value={fmtScore(avg)} label="Rata-rata nilai akhir" />
        <Stat icon={<Award size={20} />} tone="warn" value={fmtScore(r[0]?.final_score ?? null)} label="Nilai tertinggi" sub={r[0]?.name} />
        <Stat icon={<CheckCircle2 size={20} />} tone="success" value={active.length} label="Sudah punya nilai" />
      </div>
      <div className="alert info">
        <span>
          Nilai akhir = <b>{weight}%</b> kehadiran + <b>{100 - weight}%</b> rata-rata skor terbaik kuis
          {countedQuizzes.length ? <> ({countedQuizzes.map((q) => q.title).join(', ')})</> : ' (belum ada kuis terbit yang dihitung)'}.
          Hadir &amp; terlambat dihitung hadir.
        </span>
      </div>
      <div className="card flush">
        <div className="card-head">
          <h2>Peringkat keseluruhan</h2><span className="spacer" />
          <button className="btn sm no-print" onClick={() => downloadCsv(`peringkat-${safeName(name)}`, [
            ['Peringkat', 'Nama Lengkap & Gelar', 'NIP', 'Pangkat/Gol. Ruang', 'Jabatan', 'Satuan Kerja', 'Hadir', 'Total sesi', 'Kehadiran %', 'Rata-rata kuis', 'Nilai akhir'],
            ...r.map((x) => { const p = byId.get(x.participant_id); return [x.rank, x.name, p?.identifier, p?.grade, p?.job_title, x.institution, x.sessions_attended, x.sessions_total, x.attendance_pct, x.quiz_avg, x.final_score] }),
          ])}><Download size={14} /> CSV</button>
        </div>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>#</th><th>Nama</th><th>Jabatan / satuan kerja</th><th className="num">Kehadiran</th><th className="num">Rata-rata kuis</th><th style={{ minWidth: 160 }}>Nilai akhir</th></tr></thead>
          <tbody>{r.map((x) => (
            <tr key={x.participant_id}>
              <td><RankMedal rank={x.rank} /></td>
              <td><b>{x.name}</b></td>
              <td>{roleLine({ job_title: byId.get(x.participant_id)?.job_title, institution: x.institution }) || '—'}</td>
              <td className="num">{x.attendance_pct == null ? '—' : `${x.sessions_attended}/${x.sessions_total} (${fmtPct(x.attendance_pct)})`}</td>
              <td className="num">{fmtScore(x.quiz_avg)}</td>
              <td><HBar value={Number(x.final_score)} tone={scoreTone(Number(x.final_score), null)} label={fmtScore(x.final_score)} /></td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>
    </>
  )
}

/* ---------- Kehadiran ---------- */
function AttendanceSection({ data, name, satkerOrder }: { data: Data; name: string; satkerOrder: string[] | null }) {
  const [roleFilter, setRoleFilter] = useState<'semua' | PersonRole>('semua')
  const [grouped, setGrouped] = useState(true)
  const [unit, setUnit] = useState('')
  const { collapsed, toggle, setAll } = useCollapsed()
  const byRole = useMemo(() => data.participants.filter((p) => roleFilter === 'semua' || p.role === roleFilter), [data.participants, roleFilter])
  const unitGroups = useMemo(() => groupBySatker(byRole, (p) => p.institution, satkerOrder), [byRole, satkerOrder])
  // diurutkan per satuan kerja sehingga tabel dan CSV selalu berkelompok
  const people = useMemo(() => unitGroups.flatMap((g) => g.items).filter((p) => matchesUnit(unit, p.institution)), [unitGroups, unit])
  const rows = useMemo(() => attendanceMatrix(people, data.sessions, data.attendances, data.members), [people, data.sessions, data.attendances, data.members])
  const rowGroups = useMemo(() => groupBySatker(rows, (r) => r.participant.institution, satkerOrder), [rows, satkerOrder])
  const mm = useMemo(() => memberMapOf(data.members), [data.members])
  const roleCount = (r: 'semua' | PersonRole) => data.participants.filter((p) => r === 'semua' || p.role === r).length
  if (data.sessions.length === 0) return <div className="card"><Empty icon={<CalendarCheck size={26} />} title="Belum ada sesi absensi" /></div>
  const avg = rows.length ? rows.reduce((s, r) => s + (r.pct ?? 0), 0) / rows.length : 0
  const perSession = data.sessions.map((s) => ({
    s, n: rows.filter((r) => ['hadir', 'terlambat'].includes(r.cells[s.id]?.status ?? '')).length,
  }))
  const short = (s: AttendanceSession) => s.title.length > 14 ? s.title.slice(0, 13) + '…' : s.title

  return (
    <>
      <div className="row no-print">
        {data.participants.some((p) => p.role !== 'peserta') && (
          <div className="pills" role="group" aria-label="Filter peran">
            {(['semua', ...ROLES] as const).map((r) => (
              <button key={r} className={`pill ${roleFilter === r ? 'active' : ''}`} onClick={() => setRoleFilter(r)}>
                {r === 'semua' ? 'Semua' : ROLE_LABEL[r]} <span className="muted">{roleCount(r)}</span>
              </button>
            ))}
          </div>
        )}
        <SatkerControls groups={unitGroups} total={byRole.length} unit={unit} setUnit={setUnit} grouped={grouped} setGrouped={setGrouped} />
        {grouped && rowGroups.length > 1 && (
          <button className="btn ghost sm" onClick={() => setAll(collapsed.size ? null : rowGroups.map((g) => g.key))}>{collapsed.size ? 'Buka semua' : 'Lipat semua'}</button>
        )}
      </div>
      <div className="grid cols-4">
        <Stat icon={<Percent size={20} />} value={fmtPct(avg)} label="Rata-rata kehadiran" />
        <Stat icon={<CheckCircle2 size={20} />} tone="success" value={rows.filter((r) => r.pct === 100).length} label="Hadir di semua sesi" />
        <Stat icon={<Users size={20} />} tone="danger" value={rows.filter((r) => (r.pct ?? 0) < 75).length} label="Kehadiran < 75%" />
        <Stat icon={<CalendarCheck size={20} />} tone="info" value={data.sessions.length} label="Sesi" />
      </div>
      <div className="card">
        <h3>Kehadiran per sesi</h3>
        <BarChart data={perSession.map(({ s, n }) => ({ label: short(s), value: n }))} max={Math.max(data.participants.length, 1)} />
      </div>
      <div className="card flush">
        <div className="card-head">
          <h2>Rekap kehadiran</h2><span className="spacer" />
          <button className="btn sm no-print" onClick={() => downloadCsv(`kehadiran-${safeName(name)}`, [
            ['Peran', 'Nama Lengkap & Gelar', 'NIP', 'Pangkat/Gol. Ruang', 'Jabatan', 'Satuan Kerja', ...data.sessions.map((s) => s.title), 'Hadir', 'Persen'],
            ...rows.map((r) => [ROLE_LABEL[r.participant.role], r.participant.name, r.participant.identifier, r.participant.grade, r.participant.job_title, r.participant.institution,
              ...data.sessions.map((s) => {
                if (!r.applicable[s.id]) return 'Tidak ikut'
                const a = r.cells[s.id], jr = sessionRole(s, r.participant, mm)
                return (a ? ATT_LABEL[a.status] : 'Belum absen') + (jr && jr !== r.participant.role ? ` (${ROLE_LABEL[jr]})` : '')
              }),
              r.attended, r.pct == null ? '' : Math.round(r.pct)]),
          ])}><Download size={14} /> CSV</button>
        </div>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Nama</th>{data.sessions.map((s) => <th key={s.id} title={fmtDateTime(s.start_at)}>{short(s)}</th>)}<th className="num">Hadir</th><th className="num">%</th></tr></thead>
          <tbody>{(grouped ? rowGroups : [{ key: '__all', label: '', items: rows }]).map((g) => {
            const isCollapsed = grouped && collapsed.has(g.key)
            const pct = g.items.length ? g.items.reduce((n, r) => n + (r.pct ?? 0), 0) / g.items.length : null
            return (
            <Fragment key={g.key || '__none__'}>
              {grouped && <SatkerGroupRow label={g.label} colSpan={data.sessions.length + 3} collapsed={isCollapsed} onToggle={() => toggle(g.key)}
                meta={`rata-rata hadir ${fmtPct(pct)} · ${g.items.length} orang (${roleSummary(g.items.map((r) => r.participant))})`} />}
              {!isCollapsed && g.items.map((r) => (
            <tr key={r.participant.id}>
              <td><b>{r.participant.name}</b><RoleBadge role={r.participant.role} /><div className="muted small">{roleLine(r.participant)}</div></td>
              {data.sessions.map((s) => {
                if (!r.applicable[s.id]) return <td key={s.id} title="Tidak ikut sesi ini"><span className="muted">×</span></td>
                const a = r.cells[s.id], jr = sessionRole(s, r.participant, mm)
                const asRole = jr && jr !== r.participant.role ? <div className="muted small">sebagai {ROLE_LABEL[jr].toLowerCase()}</div> : null
                return <td key={s.id}>{a ? <span className={`badge ${ATT_TONE[a.status]}`}>{ATT_LABEL[a.status]}</span> : <span className="muted">—</span>}{asRole}</td>
              })}
              <td className="num">{r.attended}/{r.total}</td>
              <td className="num"><b>{fmtPct(r.pct)}</b></td>
            </tr>
              ))}
            </Fragment>
            )
          })}</tbody>
        </table></div>
      </div>
    </>
  )
}

/* ---------- Rekap per satuan kerja ---------- */
function SatkerSection({ data, name }: { data: Data; name: string }) {
  const rows = useMemo(() => satkerSummary(data.participants, data.sessions, data.attendances, data.ranking, data.members), [data])
  const top = rows.filter((r) => r.rank === 1)
  const bestAtt = [...rows].filter((r) => r.attendancePct != null).sort((a, b) => b.attendancePct! - a.attendancePct!)[0]
  const order = [...rows].sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999) || a.label.localeCompare(b.label, 'id'))

  return (
    <>
      <div className="grid cols-4">
        <Stat icon={<Building2 size={20} />} value={rows.length} label="Satuan kerja" />
        <Stat icon={<Users size={20} />} tone="info" value={data.participants.length} label="Total orang" sub={`${rows.reduce((n, r) => n + r.peserta, 0)} peserta`} />
        <Stat icon={<Trophy size={20} />} tone="warn" value={top[0] ? fmtScore(top[0].avgFinal) : '—'} label="Rata-rata nilai tertinggi" sub={top.map((r) => r.label).join(', ') || undefined} />
        <Stat icon={<Percent size={20} />} tone="success" value={bestAtt ? fmtPct(bestAtt.attendancePct) : '—'} label="Kehadiran tertinggi" sub={bestAtt?.label} />
      </div>
      <div className="card flush">
        <div className="card-head">
          <h2>Rekap per satuan kerja</h2><span className="spacer" />
          <button className="btn sm no-print" onClick={() => downloadCsv(`per-satker-${safeName(name)}`, [
            ['Peringkat', 'Satuan Kerja', 'Peserta', 'Narasumber', 'Moderator', 'Panitia', 'Kehadiran %', 'Rata-rata kuis', 'Rata-rata nilai akhir'],
            ...order.map((r) => [r.rank, r.label, r.peserta, r.narasumber, r.moderator, r.panitia, r.attendancePct == null ? '' : Math.round(r.attendancePct), r.avgQuiz == null ? '' : Number(r.avgQuiz.toFixed(1)), r.avgFinal == null ? '' : Number(r.avgFinal.toFixed(1))]),
          ])}><Download size={14} /> CSV</button>
        </div>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>#</th><th>Satuan kerja</th><th className="num">Peserta</th><th className="num">Narasumber</th><th className="num">Moderator</th><th className="num">Panitia</th><th style={{ minWidth: 150 }}>Kehadiran</th><th className="num">Rata-rata kuis</th><th style={{ minWidth: 160 }}>Rata-rata nilai akhir</th></tr></thead>
          <tbody>{order.map((r) => (
            <tr key={r.key || '__none__'}>
              <td><RankMedal rank={r.rank} /></td>
              <td><b>{r.label}</b></td>
              <td className="num">{r.peserta}</td>
              <td className="num">{r.narasumber || <span className="muted">—</span>}</td>
              <td className="num">{r.moderator || <span className="muted">—</span>}</td>
              <td className="num">{r.panitia || <span className="muted">—</span>}</td>
              <td>{r.attendancePct == null ? <span className="muted">—</span> : <HBar value={r.attendancePct} tone={r.attendancePct >= 75 ? 'good' : r.attendancePct >= 50 ? 'mid' : 'bad'} label={fmtPct(r.attendancePct)} />}</td>
              <td className="num">{fmtScore(r.avgQuiz)}</td>
              <td>{r.avgFinal == null ? <span className="muted">Belum ada peserta bernilai</span> : <HBar value={r.avgFinal} tone={scoreTone(r.avgFinal, null)} label={fmtScore(r.avgFinal)} />}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>
      <p className="muted small">Kehadiran dihitung dari seluruh orang di satker (semua peran). Rata-rata kuis dan nilai akhir hanya dari peserta; peringkat satker menurut rata-rata nilai akhir.</p>
    </>
  )
}

/* ---------- Pemilih kuis ---------- */
function QuizPicker({ quizzes, value, onChange }: { quizzes: Quiz[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="pills no-print">
      {quizzes.map((q) => (
        <button key={q.id} className={`pill ${value === q.id ? 'active' : ''}`} onClick={() => onChange(q.id)}>
          {TYPE_LABEL[q.type]}: {q.title}
        </button>
      ))}
    </div>
  )
}

/* ---------- Hasil kuis ---------- */
function QuizSection({ data, name, onChanged }: { data: Data; name: string; onChanged: () => void }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [selId, setSelId] = useState('')
  const quiz = data.quizzes.find((q) => q.id === selId) ?? data.quizzes[0]
  const res = useMemo(() => (quiz ? quizResults(quiz, data.participants, data.attempts) : null), [quiz, data])
  if (!quiz || !res) return <div className="card"><Empty icon={<ClipboardList size={26} />} title="Belum ada kuis" /></div>
  const inProgress = (pid: string) => data.attempts.some((t) => t.quiz_id === quiz.id && t.participant_id === pid && !t.submitted_at)
  const order = [...res.rows].sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999) || a.participant.name.localeCompare(b.participant.name))

  async function reset(pid: string, pname: string) {
    const ok = await confirm({ title: `Reset percobaan ${pname}?`, danger: true, confirmText: 'Reset',
      message: 'Semua percobaan peserta ini pada kuis tersebut dihapus sehingga ia bisa mengerjakan dari awal.' })
    if (!ok) return
    const { error } = await supabase.from('quiz_attempts').delete().eq('quiz_id', quiz.id).eq('participant_id', pid)
    if (error) return toast(errMsg(error), 'error')
    toast('Percobaan direset.', 'success'); onChanged()
  }

  const { stats } = res
  return (
    <>
      <QuizPicker quizzes={data.quizzes} value={quiz.id} onChange={setSelId} />
      <div className="grid cols-4">
        <Stat icon={<Users size={20} />} value={`${stats.taken}/${stats.total}`} label="Sudah mengerjakan" />
        <Stat icon={<Percent size={20} />} tone="info" value={fmtScore(stats.avg)} label="Rata-rata" sub={stats.min != null ? `terendah ${fmtScore(stats.min)} · tertinggi ${fmtScore(stats.max)}` : undefined} />
        <Stat icon={<CheckCircle2 size={20} />} tone="success" value={stats.passRate == null ? '—' : fmtPct(stats.passRate)} label="Tingkat kelulusan" sub={quiz.passing_score != null ? `nilai lulus ${quiz.passing_score}` : 'tanpa nilai lulus'} />
        <Stat icon={<Award size={20} />} tone="warn" value={res.ranked[0] ? fmtScore(res.ranked[0].score) : '—'} label="Skor tertinggi" sub={res.ranked[0]?.participant.name} />
      </div>
      <div className="card">
        <h3>Sebaran nilai</h3>
        <BarChart data={stats.distribution.map((v, i) => ({ label: i === 9 ? '90–100' : `${i * 10}–${i * 10 + 9}`, value: v }))} />
      </div>
      <div className="card flush">
        <div className="card-head">
          <h2>{quiz.title} <span className={`badge ${TYPE_TONE[quiz.type]}`}>{TYPE_LABEL[quiz.type]}</span></h2><span className="spacer" />
          <button className="btn sm no-print" onClick={() => downloadCsv(`hasil-${safeName(quiz.title)}-${safeName(name)}`, [
            ['Peringkat', 'Nama Lengkap & Gelar', 'NIP', 'Pangkat/Gol. Ruang', 'Jabatan', 'Satuan Kerja', 'Percobaan', 'Skor terbaik', 'Benar', 'Durasi', 'Status'],
            ...order.map((r) => [r.rank, r.participant.name, r.participant.identifier, r.participant.grade, r.participant.job_title, r.participant.institution, r.attempts, r.score,
              r.best ? `${r.best.correct_count}/${r.best.total_questions}` : '', r.duration != null ? fmtDuration(r.duration) : '',
              r.passed == null ? (r.score == null ? 'Belum mengerjakan' : '') : r.passed ? 'Lulus' : 'Tidak lulus']),
          ])}><Download size={14} /> CSV</button>
        </div>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>#</th><th>Nama</th><th className="num">Percobaan</th><th style={{ minWidth: 150 }}>Skor terbaik</th><th className="num">Benar</th><th className="num">Durasi</th><th>Status</th><th className="no-print"></th></tr></thead>
          <tbody>{order.map((r) => (
            <tr key={r.participant.id}>
              <td><RankMedal rank={r.rank} /></td>
              <td><b>{r.participant.name}</b><div className="muted small">{roleLine(r.participant)}</div></td>
              <td className="num">{r.attempts}{inProgress(r.participant.id) && <span className="badge warn" style={{ marginLeft: 6 }}>berjalan</span>}</td>
              <td>{r.score == null ? <span className="muted">Belum mengerjakan</span> : <HBar value={r.score} tone={scoreTone(r.score, quiz.passing_score)} label={fmtScore(r.score)} />}</td>
              <td className="num">{r.best ? `${r.best.correct_count}/${r.best.total_questions}` : '—'}</td>
              <td className="num">{fmtDuration(r.duration)}</td>
              <td>{r.passed == null ? '' : r.passed ? <span className="badge success">Lulus</span> : <span className="badge danger">Tidak lulus</span>}</td>
              <td className="no-print actions">{r.attempts > 0 && <button className="btn ghost sm" onClick={() => void reset(r.participant.id, r.participant.name)} title="Reset percobaan"><RotateCcw size={14} /> Reset</button>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>
    </>
  )
}

/* ---------- Pre vs Post ---------- */
function PrePostSection({ data, name }: { data: Data; name: string }) {
  const pres = data.quizzes.filter((q) => q.type === 'pre')
  const posts = data.quizzes.filter((q) => q.type === 'post')
  const [preId, setPreId] = useState('')
  const [postId, setPostId] = useState('')
  const pre = data.quizzes.find((q) => q.id === preId) ?? pres[0]
  const post = data.quizzes.find((q) => q.id === postId) ?? posts[0]
  const g = useMemo(() => (pre && post ? gainTable(pre, post, data.participants, data.attempts) : null), [pre, post, data])

  if (!pre || !post || !g) {
    return <div className="card"><Empty icon={<TrendingUp size={26} />} title="Perlu Pre Test dan Post Test">Buat kuis berjenis Pre Test dan Post Test untuk melihat peningkatan pemahaman peserta.</Empty></div>
  }
  const rows = [...g.rows].sort((a, b) => (b.gain ?? -999) - (a.gain ?? -999))
  const sel = (items: Quiz[], v: string, set: (s: string) => void) => (
    <select className="input" style={{ width: 'auto' }} value={v} onChange={(e) => set(e.target.value)}>{items.map((q) => <option key={q.id} value={q.id}>{q.title}</option>)}</select>
  )

  return (
    <>
      <div className="row no-print">
        <span>Pre Test:</span>{sel(pres, pre.id, setPreId)}<span>Post Test:</span>{sel(posts, post.id, setPostId)}
      </div>
      <div className="grid cols-4">
        <Stat icon={<ClipboardList size={20} />} tone="info" value={fmtScore(g.avgPre)} label="Rata-rata Pre Test" sub={`${g.pairs} peserta mengerjakan keduanya`} />
        <Stat icon={<ClipboardList size={20} />} value={fmtScore(g.avgPost)} label="Rata-rata Post Test" />
        <Stat icon={<TrendingUp size={20} />} tone="success" value={g.avgGain == null ? '—' : `${g.avgGain > 0 ? '+' : ''}${fmtScore(g.avgGain)}`} label="Rata-rata peningkatan" sub={g.pairs ? `${g.improved} dari ${g.pairs} meningkat` : undefined} />
        <Stat icon={<Award size={20} />} tone="warn" value={g.avgNGain == null ? '—' : fmtScore(g.avgNGain, 2)} label="N-Gain rata-rata" sub={nGainCategory(g.avgNGain)} />
      </div>
      {g.pairs > 0 && (
        <div className="card">
          <h3>Rata-rata skor</h3>
          <BarChart max={100} data={[{ label: 'Pre Test', value: g.avgPre ?? 0 }, { label: 'Post Test', value: g.avgPost ?? 0 }]} />
        </div>
      )}
      <div className="card flush">
        <div className="card-head">
          <h2>Peningkatan per peserta</h2><span className="spacer" />
          <button className="btn sm no-print" onClick={() => downloadCsv(`pre-vs-post-${safeName(name)}`, [
            ['Nama Lengkap & Gelar', 'NIP', 'Jabatan', 'Satuan Kerja', 'Pre Test', 'Post Test', 'Selisih', 'N-Gain', 'Kategori'],
            ...rows.map((r) => [r.participant.name, r.participant.identifier, r.participant.job_title, r.participant.institution, r.pre, r.post, r.gain, r.nGain == null ? '' : Number(r.nGain.toFixed(2)), nGainCategory(r.nGain)]),
          ])}><Download size={14} /> CSV</button>
        </div>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Nama</th><th className="num">Pre</th><th className="num">Post</th><th className="num">Selisih</th><th className="num">N-Gain</th><th>Kategori</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.participant.id}>
              <td><b>{r.participant.name}</b></td>
              <td className="num">{fmtScore(r.pre)}</td>
              <td className="num">{fmtScore(r.post)}</td>
              <td className="num" style={{ color: r.gain == null ? undefined : r.gain > 0 ? 'var(--success)' : r.gain < 0 ? 'var(--danger)' : undefined, fontWeight: 700 }}>
                {r.gain == null ? '—' : `${r.gain > 0 ? '+' : ''}${fmtScore(r.gain)}`}
              </td>
              <td className="num">{r.nGain == null ? '—' : fmtScore(r.nGain, 2)}</td>
              <td>{r.nGain == null ? '' : <span className={`badge ${r.nGain >= 0.7 ? 'success' : r.nGain >= 0.3 ? 'info' : 'warn'}`}>{nGainCategory(r.nGain)}</span>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>
      <p className="muted small">N-Gain (Hake) = (Post − Pre) ÷ (100 − Pre). Kategori: ≥ 0,7 tinggi · 0,3–0,7 sedang · &lt; 0,3 rendah.</p>
    </>
  )
}

/* ---------- Analisis butir soal ---------- */
function ItemSection({ data, name }: { data: Data; name: string }) {
  const [selId, setSelId] = useState('')
  const quiz = data.quizzes.find((q) => q.id === selId) ?? data.quizzes[0]
  const items = useMemo(() => {
    if (!quiz) return []
    return itemAnalysis(data.questions.filter((q) => q.quiz_id === quiz.id), data.attempts.filter((t) => t.quiz_id === quiz.id))
  }, [quiz, data])
  if (!quiz) return <div className="card"><Empty icon={<FileSearch size={26} />} title="Belum ada kuis" /></div>
  const LV = { mudah: ['success', 'Mudah'], sedang: ['info', 'Sedang'], sulit: ['danger', 'Sulit'] } as const

  return (
    <>
      <QuizPicker quizzes={data.quizzes} value={quiz.id} onChange={setSelId} />
      <div className="card flush">
        <div className="card-head">
          <h2>Analisis soal: {quiz.title}</h2><span className="spacer" />
          <button className="btn sm no-print" onClick={() => downloadCsv(`analisis-soal-${safeName(quiz.title)}`, [
            ['No', 'Soal', 'Dijawab benar (%)', 'Tingkat', 'Kunci', ...['A', 'B', 'C', 'D', 'E', 'F'].map((l) => `Pilih ${l}`)],
            ...items.map((it, i) => [i + 1, it.question.text, it.pctCorrect == null ? '' : Math.round(it.pctCorrect), it.level ?? '', 'ABCDEFGH'[it.question.correct_index], ...it.optionCounts]),
          ])}><Download size={14} /> CSV</button>
        </div>
        {items.length === 0 ? <Empty icon={<FileSearch size={26} />} title="Kuis ini belum punya soal" /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>#</th><th>Soal</th><th style={{ minWidth: 150 }}>Dijawab benar</th><th>Tingkat</th><th>Sebaran jawaban</th></tr></thead>
            <tbody>{items.map((it, i) => (
              <tr key={it.question.id}>
                <td>{i + 1}</td>
                <td style={{ maxWidth: 360 }}>{it.question.text}</td>
                <td><HBar value={it.pctCorrect} tone={it.level === 'mudah' ? 'good' : it.level === 'sedang' ? 'mid' : 'bad'} label={it.pctCorrect == null ? '—' : `${Math.round(it.pctCorrect)}%`} /></td>
                <td>{it.level && <span className={`badge ${LV[it.level][0]}`}>{LV[it.level][1]}</span>}</td>
                <td className="small">{it.optionCounts.map((c, oi) => (
                  <span key={oi} style={{ marginRight: 8, fontWeight: oi === it.question.correct_index ? 800 : 400, color: oi === it.question.correct_index ? 'var(--success)' : undefined }}>
                    {'ABCDEFGH'[oi]}:{c}
                  </span>
                ))}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      <p className="muted small">Soal sulit (&lt; 40% benar) layak ditinjau ulang: materi belum tersampaikan, atau soal/kuncinya ambigu. Dihitung dari skor terbaik tiap peserta; {name}.</p>
    </>
  )
}
