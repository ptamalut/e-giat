import { Award, Calendar, CalendarCheck, CheckCheck, ClipboardList, Download, ExternalLink, Hourglass, LinkIcon, Lock, MapPin, Play, RotateCcw, Trophy, UserCheck } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ThemeToggle } from '../../components/theme'
import { CardTitle, Empty, Loading, RankMedal, useToast } from '../../components/ui'
import { fmtDate, fmtDateRange, fmtDateTime, fmtPct, fmtScore, fmtTime, timeState } from '../../lib/format'
import { RoleBadge } from '../../components/RoleBadge'
import { isStaff, nameInitial, ROLE_LABEL, roleLine } from '../../lib/people'
import CheckInDialog, { type CheckInResult } from './CheckInDialog'
import { certPublicUrl } from '../../lib/certificateApi'
import { certDownloadName } from '../../lib/certificates'
import { rpc } from '../../lib/supabase'
import type { Leaderboard, PortalData, PortalQuiz, PortalSession } from '../../lib/types'

const ATT = {
  hadir: ['success', 'Hadir'], terlambat: ['warn', 'Terlambat'], izin: ['info', 'Izin'], sakit: ['info', 'Sakit'], alpa: ['danger', 'Alpa'],
} as const
const TYPE = { pre: 'Pre Test', post: 'Post Test', lainnya: 'Kuis' } as const

export default function Portal() {
  const { token = '' } = useParams()
  const toast = useToast()
  const [data, setData] = useState<PortalData | null>(null)
  const [error, setError] = useState('')
  const [offset, setOffset] = useState(0)
  const [tick, setTick] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [dialog, setDialog] = useState<PortalSession | null>(null)
  const [board, setBoard] = useState<Leaderboard | null>(null)
  const [boardOpen, setBoardOpen] = useState(false)
  const seq = useRef(0)

  const load = useCallback(async () => {
    const my = ++seq.current
    try {
      const d = await rpc<PortalData>('portal_get', { p_token: token })
      if (my !== seq.current) return
      setData(d); setError('')
      setOffset(new Date(d.now).getTime() - Date.now())
    } catch (e) {
      if (my === seq.current) setError(e instanceof Error ? e.message : String(e))
    }
  }, [token])

  const loadBoard = useCallback(async () => {
    try { setBoard(await rpc<Leaderboard>('portal_leaderboard', { p_token: token })) } catch { /* abaikan */ }
  }, [token])

  useEffect(() => {
    void load()
    const clock = setInterval(() => setTick((x) => x + 1), 15000) // segarkan status buka/tutup
    const poll = setInterval(() => { if (!document.hidden) void load() }, 60000)
    const onVis = () => { if (!document.hidden) void load() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(clock); clearInterval(poll); document.removeEventListener('visibilitychange', onVis) }
  }, [load])

  useEffect(() => { if (boardOpen) void loadBoard() }, [boardOpen, loadBoard, tick])

  const now = Date.now() + offset

  function afterCheckIn(r: CheckInResult) {
    setDialog(null)
    toast(r.already ? 'Anda sudah tercatat hadir.' : r.status === 'terlambat' ? 'Absen tercatat (terlambat).' : '✓ Absen berhasil. Terima kasih!', r.status === 'terlambat' ? 'info' : 'success')
    void load()
  }

  async function checkIn(s: PortalSession) {
    // sesi yang meminta selfie/lokasi memakai dialog izin; selain itu absen langsung seperti biasa
    if (s.require_selfie || s.require_location) return setDialog(s)
    setBusy(s.id)
    try {
      const r = await rpc<{ already: boolean; status: keyof typeof ATT }>('portal_check_in', { p_token: token, p_session: s.id })
      toast(r.already ? 'Anda sudah tercatat hadir.' : r.status === 'terlambat' ? 'Absen tercatat (terlambat).' : '✓ Absen berhasil. Terima kasih!', r.status === 'terlambat' ? 'info' : 'success')
      await load()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal absen.', 'error')
      await load()
    } finally { setBusy(null) }
  }

  if (error && !data) {
    return (
      <div className="auth-wrap"><div className="card auth-card center">
        <div className="empty" style={{ padding: '8px 0' }}><div className="big"><LinkIcon size={26} /></div></div>
        <h2>Link tidak dapat dibuka</h2>
        <p className="muted">{error}</p>
        <p className="muted small">Hubungi panitia untuk mendapatkan link yang benar.</p>
        <button className="btn" onClick={() => void load()}>Coba lagi</button>
      </div></div>
    )
  }
  if (!data) return <Loading />
  const { activity: a, participant: p } = data
  const closed = a.status === 'draft'
  const staff = isStaff(p.role)

  return (
    <>
      <div className="portal-hero">
        <div className="container narrow">
          <div className="top"><span className="brand-mark"><CheckCheck size={16} strokeWidth={2.6} /></span>LAKSANA<span className="spacer" /><ThemeToggle onDark /></div>
          <h1>{a.name}</h1>
          <div className="meta">
            <span><Calendar size={15} /> {fmtDateRange(a.start_date, a.end_date)}</span>
            {a.location && <span><MapPin size={15} /> {a.location}</span>}
          </div>
          <div className="me">
            <span className="avatar" aria-hidden>{nameInitial(p.name)}</span>
            <div>
              <b>{p.name}<RoleBadge role={p.role} style={{ background: 'rgb(255 255 255 / 20%)', color: '#fff' }} /></b>
              {(p.identifier || p.grade) && <span>{[p.identifier && `NIP ${p.identifier}`, p.grade].filter(Boolean).join(' · ')}</span>}
              {roleLine(p) && <span>{roleLine(p)}</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="container narrow portal-body stack" style={{ paddingBottom: 48 }}>
        {error && <div className="alert warn">Koneksi bermasalah, data mungkin tidak terbaru. {error}</div>}
        {closed && <div className="alert warn">Kegiatan ini belum dibuka oleh panitia. Absensi dan kuis belum tersedia.</div>}
        {staff && <div className="alert info"><span>Anda terdaftar sebagai <b>{ROLE_LABEL[p.role].toLowerCase()}</b>. Cukup lakukan absensi pada sesi yang sedang dibuka; kuis tidak diperlukan.</span></div>}
        {a.description && <div className="card"><p style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'var(--text-2)' }}>{a.description}</p></div>}

        <section className="card">
          <div className="card-head"><CardTitle icon={<CalendarCheck size={18} />} tone="success">Absensi</CardTitle></div>
          {data.sessions.length === 0 && <Empty icon={<CalendarCheck size={26} />} title="Belum ada sesi absensi" />}
          {data.sessions.map((s) => {
            const st = timeState(s.start_at, s.end_at, now)
            const att = s.attendance
            return (
              <div className="item" key={s.id}>
                <div className="grow">
                  <div className="title">{s.title}</div>
                  <div className="muted small">{fmtDate(s.start_at)} · {fmtTime(s.start_at)} – {fmtTime(s.end_at)}</div>
                </div>
                {att ? (
                  <div className="right">
                    <span className={`badge dot ${ATT[att.status][0]}`}>{ATT[att.status][1]}</span>
                    <div className="muted small">{fmtTime(att.checked_in_at)}</div>
                  </div>
                ) : st === 'open' ? (
                  <button className="btn primary lg" disabled={closed || busy === s.id} onClick={() => void checkIn(s)}>
                    {busy === s.id ? 'Memproses…' : <><UserCheck size={19} /> Absen sekarang</>}
                  </button>
                ) : st === 'upcoming' ? (
                  <span className="badge dot">Dibuka {fmtDateTime(s.start_at)}</span>
                ) : (
                  <span className="badge dot danger">Tidak tercatat</span>
                )}
              </div>
            )
          })}
        </section>

        {!staff && <section className="card">
          <div className="card-head"><CardTitle icon={<ClipboardList size={18} />}>Kuis</CardTitle></div>
          {data.quizzes.length === 0 && <Empty icon={<ClipboardList size={26} />} title="Belum ada kuis tersedia" />}
          {data.quizzes.map((q) => <QuizItem key={q.id} q={q} token={token} now={now} closed={closed} hasAttendance={data.sessions.some((s) => s.attendance && ['hadir', 'terlambat'].includes(s.attendance.status))} />)}
        </section>}

        {data.certificate && <CertificateCard token={token} personName={p.name} cert={data.certificate} />}

        {a.show_leaderboard && !staff && (
          <section className="card">
            <div className="card-head">
              <CardTitle icon={<Trophy size={18} />} tone="warn">Peringkat</CardTitle><span className="spacer" />
              <button className="btn sm" onClick={() => setBoardOpen(!boardOpen)}>{boardOpen ? 'Sembunyikan' : 'Tampilkan'}</button>
            </div>
            {boardOpen && !board && <Loading />}
            {boardOpen && board?.rows.length === 0 && <p className="muted">Belum ada data peringkat.</p>}
            {boardOpen && board?.rows.map((r) => (
              <div className="item" key={r.rank + r.name} style={r.is_me ? { background: 'var(--primary-50)', margin: '0 -22px', padding: '12px 22px' } : undefined}>
                <RankMedal rank={r.rank} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="title">{r.name} {r.is_me && <span className="badge primary">Anda</span>}</div>
                  <div className="muted small">{r.institution ?? ''} · hadir {fmtPct(r.attendance_pct)} · kuis {fmtScore(r.quiz_avg)}</div>
                </div>
                <b style={{ fontSize: '1.1rem' }}>{fmtScore(r.final_score)}</b>
              </div>
            ))}
            {boardOpen && board?.rows.length ? <p className="muted small" style={{ margin: '12px 0 0' }}>Nilai akhir = gabungan kehadiran &amp; skor kuis yang dihitung panitia.</p> : null}
          </section>
        )}
        <p className="center muted small">Link ini bersifat pribadi — jangan dibagikan ke orang lain.</p>
      </div>
      {dialog && <CheckInDialog token={token} session={dialog} onClose={() => setDialog(null)} onDone={afterCheckIn} />}
    </>
  )
}

function CertificateCard({ token, personName, cert }: { token: string; personName: string; cert: NonNullable<PortalData['certificate']> }) {
  const toast = useToast()
  const [busy, setBusy] = useState<'unduh' | 'lihat' | null>(null)

  async function go(mode: 'unduh' | 'lihat') {
    setBusy(mode)
    try {
      // alamat berkas baru diberikan server setelah token pribadi divalidasi
      const r = await rpc<{ path: string; file_name: string; mime_type: string | null }>('portal_certificate', { p_token: token })
      const url = certPublicUrl(r.path, mode === 'unduh' ? certDownloadName(personName, r.mime_type, r.file_name) : undefined)
      const a = document.createElement('a')
      a.href = url
      if (mode === 'lihat') { a.target = '_blank'; a.rel = 'noopener' }
      document.body.appendChild(a); a.click(); a.remove()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal mengunduh sertifikat.', 'error')
    } finally { setBusy(null) }
  }

  return (
    <section className="card">
      <div className="card-head"><CardTitle icon={<Award size={18} />} tone="warn">Sertifikat</CardTitle></div>
      {cert.open && cert.available ? (
        <div className="item">
          <div className="grow">
            <div className="title">Sertifikat Anda sudah tersedia</div>
            <div className="muted small" style={{ overflowWrap: 'anywhere' }}>{cert.file_name}</div>
          </div>
          <div className="row tight">
            <button className="btn primary lg" disabled={busy !== null} onClick={() => void go('unduh')}><Download size={18} /> {busy === 'unduh' ? 'Menyiapkan…' : 'Unduh'}</button>
            <button className="btn" disabled={busy !== null} onClick={() => void go('lihat')}><ExternalLink size={16} /> Lihat</button>
          </div>
        </div>
      ) : cert.available ? (
        <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
          <span className="icon-chip info"><Lock size={18} /></span>
          <div><div className="title">Sertifikat Anda sudah disiapkan</div><div className="muted small">Unduhan akan dibuka oleh panitia. Silakan cek kembali nanti.</div></div>
        </div>
      ) : (
        <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
          <span className="icon-chip warn"><Hourglass size={18} /></span>
          <div><div className="title">Sertifikat Anda belum tersedia</div><div className="muted small">Hubungi panitia bila Anda merasa seharusnya sudah menerimanya.</div></div>
        </div>
      )}
    </section>
  )
}

function QuizItem({ q, token, now, closed, hasAttendance }: { q: PortalQuiz; token: string; now: number; closed: boolean; hasAttendance: boolean }) {
  const st = timeState(q.open_at, q.close_at, now)
  const running = q.attempts.find((t) => !t.submitted_at && (!t.deadline_at || new Date(t.deadline_at).getTime() + 20000 > now))
  const done = q.attempts.filter((t) => t.submitted_at)
  const last = done[done.length - 1]
  const left = q.max_attempts - q.attempts.length
  const needsCheckin = q.require_checkin && !hasAttendance

  let action
  if (running) action = <Link className="btn primary lg" to={`/p/${token}/kuis/${q.id}`}><Play size={18} /> Lanjutkan</Link>
  else if (closed) action = null
  else if (st === 'upcoming') action = <span className="badge dot">Dibuka {fmtDateTime(q.open_at)}</span>
  else if (st === 'closed' && !last) action = <span className="badge dot danger">Ditutup</span>
  else if (left > 0 && st === 'open' && q.question_count > 0)
    action = needsCheckin
      ? <span className="badge dot warn">Absen dulu untuk membuka</span>
      : <Link className="btn primary lg" to={`/p/${token}/kuis/${q.id}`}>{done.length ? <><RotateCcw size={17} /> Coba lagi</> : <><Play size={18} /> Mulai kuis</>}</Link>

  return (
    <div className="item">
      <div className="grow">
        <div className="title">{q.title} <span className={`badge ${q.type === 'pre' ? 'info' : q.type === 'post' ? 'primary' : ''}`}>{TYPE[q.type]}</span></div>
        <div className="muted small">
          {q.question_count} soal · {q.duration_minutes ? `${q.duration_minutes} menit` : 'tanpa batas waktu'}
          {q.max_attempts > 1 && ` · sisa kesempatan ${Math.max(0, left)} dari ${q.max_attempts}`}
        </div>
        {(q.open_at || q.close_at) && st !== 'closed' && <div className="muted small">{q.close_at ? `Ditutup ${fmtDateTime(q.close_at)}` : `Dibuka ${fmtDateTime(q.open_at)}`}</div>}
        {last && (
          <div className="small" style={{ marginTop: 4 }}>
            {q.show_result && last.score != null
              ? <>Skor terakhir: <b>{fmtScore(last.score)}</b> {last.passed != null && <span className={`badge ${last.passed ? 'success' : 'danger'}`}>{last.passed ? 'Lulus' : 'Belum lulus'}</span>}</>
              : <span className="badge dot success">Sudah dikerjakan</span>}{' '}
            <Link to={`/p/${token}/hasil/${last.id}`}>Lihat hasil</Link>
          </div>
        )}
      </div>
      {action}
    </div>
  )
}
