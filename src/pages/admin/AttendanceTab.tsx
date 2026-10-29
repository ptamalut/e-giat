import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Empty, ErrorBox, Field, Loading, Modal, Stat, useAsync, useConfirm, useToast } from '../../components/ui'
import { downloadCsv, safeName } from '../../lib/csv'
import { fmtDateTime, fmtTime, fromLocalInput, timeState, toLocalInput } from '../../lib/format'
import { sessionCounts } from '../../lib/reports'
import { errMsg, fetchAll, supabase } from '../../lib/supabase'
import type { Attendance, AttendanceSession, AttendanceStatus, Participant } from '../../lib/types'
import { useActivity } from './ActivityLayout'

export const ATT_LABEL: Record<AttendanceStatus, string> = { hadir: 'Hadir', terlambat: 'Terlambat', izin: 'Izin', sakit: 'Sakit', alpa: 'Alpa' }
export const ATT_TONE: Record<AttendanceStatus, string> = { hadir: 'success', terlambat: 'warn', izin: 'info', sakit: 'info', alpa: 'danger' }

const STATE_BADGE = {
  upcoming: <span className="badge">Belum dibuka</span>,
  open: <span className="badge success">● Sedang dibuka</span>,
  closed: <span className="badge danger">Ditutup</span>,
}

export default function AttendanceTab() {
  const { activity } = useActivity()
  const toast = useToast()
  const confirm = useConfirm()
  const [sel, setSel] = useState<string | null>(null)
  const [editing, setEditing] = useState<Partial<AttendanceSession> | null>(null)
  const [q, setQ] = useState('')

  const { data, error, loading, reload } = useAsync(async () => {
    const [sessions, participants, attendances] = await Promise.all([
      fetchAll<AttendanceSession>((a, b) => supabase.from('attendance_sessions').select('*').eq('activity_id', activity.id).order('start_at').order('id').range(a, b)),
      fetchAll<Participant>((a, b) => supabase.from('participants').select('*').eq('activity_id', activity.id).order('name').order('id').range(a, b)),
      fetchAll<Attendance>((a, b) => supabase.from('attendances').select('*').eq('activity_id', activity.id).order('id').range(a, b)),
    ])
    return { sessions, participants, attendances }
  }, [activity.id])

  // pantau kehadiran secara berkala selama tab terbuka
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) void reload(true) }, 15000)
    return () => clearInterval(t)
  }, [reload])

  const sessions = data?.sessions ?? []
  const current = sessions.find((s) => s.id === sel) ?? sessions.find((s) => timeState(s.start_at, s.end_at, Date.now()) === 'open') ?? sessions[0]
  const attByP = useMemo(() => {
    const m = new Map<string, Attendance>()
    for (const a of data?.attendances ?? []) if (a.session_id === current?.id) m.set(a.participant_id, a)
    return m
  }, [data, current?.id])
  const counts = current ? sessionCounts(data!.participants, data!.attendances, current.id) : null
  const rows = (data?.participants ?? []).filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()) || p.institution?.toLowerCase().includes(q.trim().toLowerCase()))

  async function setStatus(p: Participant, status: AttendanceStatus | '') {
    if (!current) return
    const { error } = status
      ? await supabase.from('attendances').upsert(
          { activity_id: activity.id, session_id: current.id, participant_id: p.id, status, checked_in_at: attByP.get(p.id)?.checked_in_at ?? new Date().toISOString(), manual: true },
          { onConflict: 'session_id,participant_id' })
      : await supabase.from('attendances').delete().eq('session_id', current.id).eq('participant_id', p.id)
    if (error) return toast(errMsg(error), 'error')
    void reload(true)
  }

  async function markAbsentAsAlpa() {
    if (!current || !data) return
    const missing = data.participants.filter((p) => !attByP.has(p.id))
    if (!missing.length) return toast('Semua peserta sudah tercatat.')
    const ok = await confirm({ title: `Tandai ${missing.length} peserta sebagai Alpa?`, confirmText: 'Tandai Alpa',
      message: 'Hanya untuk peserta yang belum tercatat pada sesi ini. Status bisa diubah lagi kapan saja.' })
    if (!ok) return
    const { error } = await supabase.from('attendances').upsert(
      missing.map((p) => ({ activity_id: activity.id, session_id: current.id, participant_id: p.id, status: 'alpa', manual: true })),
      { onConflict: 'session_id,participant_id' })
    if (error) return toast(errMsg(error), 'error')
    toast('Selesai.', 'success'); void reload(true)
  }

  async function removeSession(s: AttendanceSession) {
    const ok = await confirm({ title: `Hapus sesi "${s.title}"?`, danger: true, confirmText: 'Hapus',
      message: 'Seluruh data kehadiran pada sesi ini ikut terhapus.' })
    if (!ok) return
    const { error } = await supabase.from('attendance_sessions').delete().eq('id', s.id)
    if (error) return toast(errMsg(error), 'error')
    setSel(null); toast('Sesi dihapus.', 'success'); void reload(true)
  }

  function duplicateNextDay(s: AttendanceSession) {
    const shift = (iso: string) => new Date(new Date(iso).getTime() + 86400000).toISOString()
    setEditing({ title: s.title.replace(/\d+/, (n) => String(Number(n) + 1)) || s.title, start_at: shift(s.start_at), end_at: shift(s.end_at), late_minutes: s.late_minutes })
  }

  function exportCsv() {
    if (!current || !data) return
    downloadCsv(`absensi-${safeName(current.title)}`, [
      ['Nama', 'ID', 'Instansi', 'Status', 'Waktu absen', 'Manual'],
      ...data.participants.map((p) => {
        const a = attByP.get(p.id)
        return [p.name, p.identifier, p.institution, a ? ATT_LABEL[a.status] : 'Belum absen', a ? fmtDateTime(a.checked_in_at) : '', a ? (a.manual ? 'ya' : 'tidak') : '']
      }),
    ])
  }

  if (loading && !data) return <Loading />
  if (error || !data) return <ErrorBox error={error ?? ''} onRetry={() => void reload()} />

  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">
          <h2>Sesi absensi</h2><span className="spacer" />
          <button className="btn primary sm" onClick={() => {
            const start = new Date(); start.setMinutes(0, 0, 0); start.setHours(start.getHours() + 1)
            setEditing({ title: `Hari ${sessions.length + 1}`, start_at: start.toISOString(), end_at: new Date(start.getTime() + 3 * 3600000).toISOString(), late_minutes: 15 })
          }}>＋ Tambah sesi</button>
        </div>
        {sessions.length === 0
          ? <Empty icon="🗓️" title="Belum ada sesi absensi">Buat sesi (mis. Hari 1) lengkap dengan jam buka &amp; tutup. Peserta hanya bisa absen pada rentang waktu itu.</Empty>
          : <div className="pills">{sessions.map((s) => (
              <button key={s.id} className={`pill ${s.id === current?.id ? 'active' : ''}`} onClick={() => setSel(s.id)}>{s.title}</button>
            ))}</div>}
      </div>

      {current && counts && (
        <>
          <div className="card">
            <div className="row between">
              <div>
                <h2 style={{ marginBottom: 4 }}>{current.title} {STATE_BADGE[timeState(current.start_at, current.end_at, Date.now())]}</h2>
                <div className="muted small">{fmtDateTime(current.start_at)} → {fmtDateTime(current.end_at)} · terlambat bila absen lewat {current.late_minutes} menit dari jam mulai</div>
              </div>
              <div className="row">
                <button className="btn sm" onClick={() => setEditing(current)}>✏️ Ubah</button>
                <button className="btn sm" onClick={() => duplicateNextDay(current)}>⧉ Duplikat +1 hari</button>
                <button className="btn sm danger" onClick={() => void removeSession(current)}>Hapus</button>
              </div>
            </div>
          </div>

          <div className="grid cols-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' }}>
            <Stat value={counts.hadir} label="Hadir" />
            <Stat value={counts.terlambat} label="Terlambat" />
            <Stat value={counts.izin + counts.sakit} label="Izin / sakit" />
            <Stat value={counts.alpa} label="Alpa" />
            <Stat value={counts.belum} label="Belum absen" />
          </div>

          <div className="card flush">
            <div style={{ padding: 16 }} className="row between">
              <input className="input" style={{ width: 240 }} placeholder="🔍 Cari peserta" value={q} onChange={(e) => setQ(e.target.value)} />
              <div className="row">
                <span className="muted small">Diperbarui otomatis setiap 15 detik</span>
                <button className="btn sm" onClick={() => void reload(true)}>↻ Segarkan</button>
                <button className="btn sm" onClick={() => void markAbsentAsAlpa()}>Tandai yang belum absen = Alpa</button>
                <button className="btn sm" onClick={exportCsv}>⬇ CSV</button>
              </div>
            </div>
            {data.participants.length === 0
              ? <Empty icon="👥" title="Belum ada peserta">Tambahkan peserta di tab Peserta.</Empty>
              : <div className="table-wrap"><table className="table">
                  <thead><tr><th>Nama</th><th>Instansi</th><th>Waktu absen</th><th>Status</th></tr></thead>
                  <tbody>{rows.map((p) => {
                    const a = attByP.get(p.id)
                    return (
                      <tr key={p.id}>
                        <td><b>{p.name}</b></td>
                        <td>{p.institution ?? '—'}</td>
                        <td>{a ? <>{fmtTime(a.checked_in_at)} {a.manual && <span className="badge">manual</span>}</> : <span className="muted">—</span>}</td>
                        <td>
                          <select className="input" style={{ width: 150, minHeight: 32, padding: '4px 8px' }} value={a?.status ?? ''} onChange={(e) => void setStatus(p, e.target.value as AttendanceStatus | '')} aria-label={`Status ${p.name}`}>
                            <option value="">Belum absen</option>
                            {(Object.keys(ATT_LABEL) as AttendanceStatus[]).map((s) => <option key={s} value={s}>{ATT_LABEL[s]}</option>)}
                          </select>
                        </td>
                      </tr>
                    )
                  })}</tbody>
                </table></div>}
          </div>
        </>
      )}

      {editing && <SessionForm value={editing} activityId={activity.id} onClose={() => setEditing(null)}
        onSaved={(id) => { setEditing(null); setSel(id); void reload(true) }} />}
    </div>
  )
}

function SessionForm({ value, activityId, onClose, onSaved }: {
  value: Partial<AttendanceSession>; activityId: string; onClose: () => void; onSaved: (id: string) => void
}) {
  const toast = useToast()
  const [f, setF] = useState({ title: value.title ?? '', start: toLocalInput(value.start_at), end: toLocalInput(value.end_at), late: value.late_minutes ?? 15 })
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const start = fromLocalInput(f.start), end = fromLocalInput(f.end)
    if (!start || !end) return toast('Isi waktu mulai dan selesai.', 'error')
    if (new Date(end) <= new Date(start)) return toast('Waktu selesai harus setelah waktu mulai.', 'error')
    setBusy(true)
    const payload = { title: f.title.trim(), start_at: start, end_at: end, late_minutes: f.late }
    const res = value.id
      ? await supabase.from('attendance_sessions').update(payload).eq('id', value.id).select('id').single()
      : await supabase.from('attendance_sessions').insert({ ...payload, activity_id: activityId }).select('id').single()
    setBusy(false)
    if (res.error) return toast(errMsg(res.error), 'error')
    toast('Sesi disimpan.', 'success')
    onSaved(res.data.id)
  }

  return (
    <Modal title={value.id ? 'Ubah sesi absensi' : 'Sesi absensi baru'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Batal</button><button className="btn primary" form="sform" disabled={busy}>Simpan</button></>}>
      <form id="sform" onSubmit={submit}>
        <Field label="Nama sesi *"><input className="input" required autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="mis. Hari 1 — Pagi" /></Field>
        <div className="form-grid">
          <Field label="Absensi dibuka *"><input className="input" type="datetime-local" required value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
          <Field label="Absensi ditutup *"><input className="input" type="datetime-local" required value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
        </div>
        <Field label="Batas terlambat (menit)" hint="Absen setelah jam dibuka + batas ini dicatat sebagai Terlambat. Isi 0 bila tidak ada toleransi.">
          <input className="input" type="number" min={0} value={f.late} onChange={(e) => setF({ ...f, late: Math.max(0, Number(e.target.value)) })} />
        </Field>
      </form>
    </Modal>
  )
}
