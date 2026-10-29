import { Camera, CalendarCheck, CalendarX, CheckCircle2, Clock, Copy, Download, HeartPulse, ImageOff, MapPin, Pencil, Plus, RefreshCw, Search, Trash2, UserX, Users } from 'lucide-react'
import { Fragment, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Check, Empty, ErrorBox, Field, Loading, Modal, Stat, useAsync, useConfirm, useToast } from '../../components/ui'
import { downloadCsv, safeName } from '../../lib/csv'
import { fmtDateTime, fmtTime, fromLocalInput, timeState, toLocalInput } from '../../lib/format'
import { sessionCounts } from '../../lib/reports'
import { errMsg, fetchAll, supabase } from '../../lib/supabase'
import { RoleBadge } from '../../components/RoleBadge'
import { SatkerControls, SatkerGroupRow, useCollapsed } from '../../components/SatkerGroup'
import { groupBySatker, matchesUnit, roleSummary, sortPeople } from '../../lib/satker'
import { ROLE_LABEL, ROLES } from '../../lib/people'
import type { Attendance, AttendanceSession, AttendanceStatus, Participant, PersonRole } from '../../lib/types'
import { fmtAccuracy, fmtCoord, mapsUrl } from '../../lib/capture'
import { deleteSessionPhotos, removeSelfiesOf, signedSelfieUrls } from '../../lib/selfieApi'
import { useActivity } from './ActivityLayout'

export const ATT_LABEL: Record<AttendanceStatus, string> = { hadir: 'Hadir', terlambat: 'Terlambat', izin: 'Izin', sakit: 'Sakit', alpa: 'Alpa' }
export const ATT_TONE: Record<AttendanceStatus, string> = { hadir: 'success', terlambat: 'warn', izin: 'info', sakit: 'info', alpa: 'danger' }

const STATE_BADGE = {
  upcoming: <span className="badge dot">Belum dibuka</span>,
  open: <span className="badge dot success">Sedang dibuka</span>,
  closed: <span className="badge dot danger">Ditutup</span>,
}

export default function AttendanceTab() {
  const { activity } = useActivity()
  const toast = useToast()
  const confirm = useConfirm()
  const [sel, setSel] = useState<string | null>(null)
  const [editing, setEditing] = useState<Partial<AttendanceSession> | null>(null)
  const [q, setQ] = useState('')
  const [roleFilter, setRoleFilter] = useState<'semua' | PersonRole>('semua')
  const [grouped, setGrouped] = useState(true)
  const [unit, setUnit] = useState('')
  const { collapsed, toggle, setAll } = useCollapsed()
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [viewing, setViewing] = useState<{ p: Participant; a: Attendance } | null>(null)

  const { data, error, loading, reload } = useAsync(async () => {
    const [sessions, participants, attendances] = await Promise.all([
      fetchAll<AttendanceSession>((a, b) => supabase.from('attendance_sessions').select('*').eq('activity_id', activity.id).order('start_at').order('id').range(a, b)),
      fetchAll<Participant>((a, b) => supabase.from('participants').select('*').eq('activity_id', activity.id).order('name').order('id').range(a, b)),
      fetchAll<Attendance>((a, b) => supabase.from('attendances').select('*').eq('activity_id', activity.id).order('id').range(a, b)),
    ])
    return { sessions, participants: sortPeople(participants), attendances }
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
  // foto bersifat privat: dimuat lewat tautan bertanda tangan, diperbarui sebelum kedaluwarsa
  const photoPaths = useMemo(() => [...attByP.values()].map((a) => a.selfie_path).filter((x): x is string => !!x), [attByP])
  const photoKey = photoPaths.join('|')
  useEffect(() => {
    if (!photoPaths.length) { setPhotoUrls({}); return }
    let alive = true
    const load = () => signedSelfieUrls(photoPaths, 3600).then((u) => { if (alive) setPhotoUrls(u) }).catch(() => { /* thumbnail kosong */ })
    void load()
    const t = setInterval(() => void load(), 45 * 60000)
    return () => { alive = false; clearInterval(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoKey])
  const roleCount = (r: 'semua' | PersonRole) => (data?.participants ?? []).filter((p) => r === 'semua' || p.role === r).length
  // urutan mengikuti pengaturan satker & orang (tab Peserta -> Atur urutan)
  const orderedAll = useMemo(() => groupBySatker(data?.participants ?? [], (p) => p.institution, activity.satker_order).flatMap((g) => g.items), [data, activity.satker_order])
  const group = orderedAll.filter((p) => (roleFilter === 'semua' || p.role === roleFilter) && matchesUnit(unit, p.institution))
  const counts = current ? sessionCounts(group, data!.attendances, current.id) : null
  const rows = group.filter((p) => !q.trim() || [p.name, p.identifier, p.job_title, p.institution].some((v) => v?.toLowerCase().includes(q.trim().toLowerCase())))
  // pilihan satker dihitung dari peran terpilih, tanpa filter satker itu sendiri
  const unitGroups = useMemo(
    () => groupBySatker(orderedAll.filter((p) => roleFilter === 'semua' || p.role === roleFilter), (p) => p.institution, activity.satker_order),
    [orderedAll, roleFilter, activity.satker_order])
  const rowGroups = useMemo(() => groupBySatker(rows, (p) => p.institution, activity.satker_order), [rows, activity.satker_order])
  const attendedOf = (items: Participant[]) => items.filter((p) => { const st = attByP.get(p.id)?.status; return st === 'hadir' || st === 'terlambat' }).length

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
    const missing = group.filter((p) => !attByP.has(p.id))
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
      message: 'Seluruh data kehadiran pada sesi ini, termasuk foto selfie dan lokasi, ikut terhapus.' })
    if (!ok) return
    await removeSelfiesOf({ sessionId: s.id })
    const { error } = await supabase.from('attendance_sessions').delete().eq('id', s.id)
    if (error) return toast(errMsg(error), 'error')
    setSel(null); toast('Sesi dihapus.', 'success'); void reload(true)
  }

  async function removePhotos(s: AttendanceSession) {
    const ok = await confirm({ title: `Hapus semua foto selfie sesi "${s.title}"?`, danger: true, confirmText: 'Hapus foto',
      message: 'Berkas foto dihapus permanen dari penyimpanan. Catatan kehadiran dan lokasi tetap ada.' })
    if (!ok) return
    try {
      const n = await deleteSessionPhotos(s.id)
      toast(n ? `${n} foto dihapus.` : 'Tidak ada foto pada sesi ini.', n ? 'success' : 'info')
    } catch (e) { return toast(errMsg(e), 'error') }
    void reload(true)
  }

  function duplicateNextDay(s: AttendanceSession) {
    const shift = (iso: string) => new Date(new Date(iso).getTime() + 86400000).toISOString()
    setEditing({ title: s.title.replace(/\d+/, (n) => String(Number(n) + 1)) || s.title, start_at: shift(s.start_at), end_at: shift(s.end_at), late_minutes: s.late_minutes, require_selfie: s.require_selfie, require_location: s.require_location })
  }

  function exportCsv() {
    if (!current || !data) return
    downloadCsv(`absensi-${safeName(current.title)}`, [
      ['Peran', 'Nama Lengkap & Gelar', 'NIP', 'Pangkat/Gol. Ruang', 'Jabatan', 'Satuan Kerja', 'Status', 'Waktu absen', 'Manual', 'Latitude', 'Longitude', 'Akurasi (m)', 'Tautan peta', 'Foto selfie'],
      ...groupBySatker(group, (p) => p.institution).flatMap((g) => g.items).map((p) => {
        const a = attByP.get(p.id)
        return [ROLE_LABEL[p.role], p.name, p.identifier, p.grade, p.job_title, p.institution, a ? ATT_LABEL[a.status] : 'Belum absen', a ? fmtDateTime(a.checked_in_at) : '', a ? (a.manual ? 'ya' : 'tidak') : '',
          a?.lat != null && a.lng != null ? a.lat : '', a?.lat != null && a.lng != null ? a.lng : '', a?.accuracy_m != null ? Math.round(a.accuracy_m) : '',
          a?.lat != null && a.lng != null ? mapsUrl(a.lat, a.lng) : '', a ? (a.selfie_path ? 'ada' : 'tidak') : '']
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
            setEditing({ title: `Hari ${sessions.length + 1}`, start_at: start.toISOString(), end_at: new Date(start.getTime() + 3 * 3600000).toISOString(), late_minutes: 15, require_selfie: true, require_location: true })
          }}><Plus size={16} /> Tambah sesi</button>
        </div>
        {sessions.length === 0
          ? <Empty icon={<CalendarX size={26} />} title="Belum ada sesi absensi">Buat sesi (mis. Hari 1) lengkap dengan jam buka &amp; tutup. Peserta hanya bisa absen pada rentang waktu itu.</Empty>
          : <div className="pills">{sessions.map((s) => (
              <button key={s.id} className={`pill ${s.id === current?.id ? 'active' : ''}`} onClick={() => setSel(s.id)}>{s.title}</button>
            ))}</div>}
      </div>

      {current && counts && (
        <>
          <div className="card">
            <div className="row between">
              <div>
                <h2 style={{ marginBottom: 6, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>{current.title} {STATE_BADGE[timeState(current.start_at, current.end_at, Date.now())]}</h2>
                <div className="meta"><span><Clock size={15} /> {fmtDateTime(current.start_at)} → {fmtDateTime(current.end_at)}</span><span>Terlambat bila absen lewat {current.late_minutes} menit dari jam mulai</span>
                  <span><Camera size={15} /> {current.require_selfie ? 'Selfie wajib' : 'Selfie tidak diminta'}</span>
                  <span><MapPin size={15} /> {current.require_location ? 'Lokasi wajib' : 'Lokasi tidak diminta'}</span></div>
              </div>
              <div className="row tight">
                <button className="btn sm" onClick={() => setEditing(current)}><Pencil size={14} /> Ubah</button>
                <button className="btn sm" onClick={() => duplicateNextDay(current)}><Copy size={14} /> Duplikat +1 hari</button>
                {photoPaths.length > 0 && <button className="btn sm" onClick={() => void removePhotos(current)}><ImageOff size={14} /> Hapus foto</button>}
                <button className="btn sm danger" onClick={() => void removeSession(current)}><Trash2 size={14} /> Hapus</button>
              </div>
            </div>
          </div>

          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
            <Stat icon={<CheckCircle2 size={20} />} tone="success" value={counts.hadir} label="Hadir" />
            <Stat icon={<Clock size={20} />} tone="warn" value={counts.terlambat} label="Terlambat" />
            <Stat icon={<HeartPulse size={20} />} tone="info" value={counts.izin + counts.sakit} label="Izin / sakit" />
            <Stat icon={<UserX size={20} />} tone="danger" value={counts.alpa} label="Alpa" />
            <Stat icon={<CalendarCheck size={20} />} value={counts.belum} label="Belum absen" />
          </div>

          <div className="card flush">
            <div className="toolbar">
              <div className="row">
              <label className="search"><Search size={16} /><input className="input" placeholder="Cari peserta" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari peserta" /></label>
              <div className="pills" role="group" aria-label="Filter peran">
                {(['semua', ...ROLES] as const).map((r) => (
                  <button key={r} className={`pill ${roleFilter === r ? 'active' : ''}`} onClick={() => setRoleFilter(r)}>
                    {r === 'semua' ? 'Semua' : ROLE_LABEL[r]} <span className="muted">{roleCount(r)}</span>
                  </button>
                ))}
              </div>
              <SatkerControls groups={unitGroups} total={unitGroups.reduce((n, g) => n + g.items.length, 0)} unit={unit} setUnit={setUnit} grouped={grouped} setGrouped={setGrouped} />
              {grouped && rowGroups.length > 1 && (
                <button className="btn ghost sm" onClick={() => setAll(collapsed.size ? null : rowGroups.map((g) => g.key))}>{collapsed.size ? 'Buka semua' : 'Lipat semua'}</button>
              )}
              </div>
              <div className="row tight">
                <span className="muted small hide-sm">Diperbarui otomatis tiap 15 detik</span>
                <button className="btn sm" onClick={() => void reload(true)}><RefreshCw size={14} /> Segarkan</button>
                <button className="btn sm" onClick={() => void markAbsentAsAlpa()}>Belum absen = Alpa</button>
                <button className="btn sm" onClick={exportCsv}><Download size={14} /> CSV</button>
              </div>
            </div>
            {group.length === 0
              ? <Empty icon={<Users size={26} />} title="Tidak ada data">Tambahkan peserta, narasumber, atau panitia di tab Peserta.</Empty>
              : <div className="table-wrap"><table className="table">
                  <thead><tr><th>Nama</th><th>Jabatan</th>{!grouped && <th>Satuan kerja</th>}<th>Waktu absen</th><th>Foto</th><th>Lokasi</th><th>Status</th></tr></thead>
                  <tbody>
                    {(grouped ? rowGroups : [{ key: '__all', label: '', items: rows }]).map((g) => {
                      const isCollapsed = grouped && collapsed.has(g.key)
                      return (
                        <Fragment key={g.key || '__none__'}>
                          {grouped && (
                            <SatkerGroupRow label={g.label} colSpan={6} collapsed={isCollapsed} onToggle={() => toggle(g.key)}
                              meta={`${attendedOf(g.items)}/${g.items.length} hadir · ${roleSummary(g.items)}`} />
                          )}
                          {!isCollapsed && g.items.map((p) => {
                            const a = attByP.get(p.id)
                            return (
                              <tr key={p.id}>
                                <td><b>{p.name}</b><RoleBadge role={p.role} />{p.identifier && <div className="mono muted">NIP {p.identifier}</div>}</td>
                                <td>{p.job_title ?? <span className="muted">—</span>}</td>
                                {!grouped && <td>{p.institution ?? <span className="muted">—</span>}</td>}
                                <td>{a ? <>{fmtTime(a.checked_in_at)} {a.manual && <span className="badge">manual</span>}</> : <span className="muted">—</span>}</td>
                                <td>{a?.selfie_path
                                  ? (photoUrls[a.selfie_path]
                                    ? <button type="button" className="thumb-btn" onClick={() => setViewing({ p, a })} aria-label={`Lihat foto ${p.name}`}><img className="thumb" src={photoUrls[a.selfie_path]} alt={`Selfie ${p.name}`} loading="lazy" /></button>
                                    : <span className="muted small">Memuat…</span>)
                                  : <span className="muted">—</span>}</td>
                                <td>{a?.lat != null && a.lng != null
                                  ? <a href={mapsUrl(a.lat, a.lng)} target="_blank" rel="noreferrer" className="small"><MapPin size={13} /> {fmtCoord(a.lat, a.lng)}<div className="muted">{fmtAccuracy(a.accuracy_m)}</div></a>
                                  : <span className="muted">—</span>}</td>
                                <td>
                                  <select className="input" style={{ width: 150, minHeight: 32, padding: '4px 8px' }} value={a?.status ?? ''} onChange={(e) => void setStatus(p, e.target.value as AttendanceStatus | '')} aria-label={`Status ${p.name}`}>
                                    <option value="">Belum absen</option>
                                    {(Object.keys(ATT_LABEL) as AttendanceStatus[]).map((s) => <option key={s} value={s}>{ATT_LABEL[s]}</option>)}
                                  </select>
                                </td>
                              </tr>
                            )
                          })}
                        </Fragment>
                      )
                    })}
                    {rows.length === 0 && <tr><td colSpan={grouped ? 6 : 7} className="center muted">Tidak ada hasil.</td></tr>}
                  </tbody>
                </table></div>}
          </div>
        </>
      )}

      {viewing && (
        <Modal title={`Absensi ${viewing.p.name}`} onClose={() => setViewing(null)} footer={<button className="btn" onClick={() => setViewing(null)}>Tutup</button>}>
          {viewing.a.selfie_path && photoUrls[viewing.a.selfie_path] && <img className="photo-view" src={photoUrls[viewing.a.selfie_path]} alt={`Selfie ${viewing.p.name}`} />}
          <div className="stack" style={{ marginTop: 12, gap: 6 }}>
            <div><b>{viewing.p.name}</b> <RoleBadge role={viewing.p.role} /></div>
            <div className="muted small">Absen {fmtDateTime(viewing.a.checked_in_at)} · {ATT_LABEL[viewing.a.status]}</div>
            {viewing.a.lat != null && viewing.a.lng != null && (
              <a href={mapsUrl(viewing.a.lat, viewing.a.lng)} target="_blank" rel="noreferrer"><MapPin size={14} /> {fmtCoord(viewing.a.lat, viewing.a.lng)} {fmtAccuracy(viewing.a.accuracy_m)} — buka di peta</a>
            )}
          </div>
        </Modal>
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
  const [f, setF] = useState({ title: value.title ?? '', start: toLocalInput(value.start_at), end: toLocalInput(value.end_at), late: value.late_minutes ?? 15,
    selfie: value.require_selfie ?? true, loc: value.require_location ?? true })
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const start = fromLocalInput(f.start), end = fromLocalInput(f.end)
    if (!start || !end) return toast('Isi waktu mulai dan selesai.', 'error')
    if (new Date(end) <= new Date(start)) return toast('Waktu selesai harus setelah waktu mulai.', 'error')
    setBusy(true)
    const payload = { title: f.title.trim(), start_at: start, end_at: end, late_minutes: f.late, require_selfie: f.selfie, require_location: f.loc }
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
        <Check label="Wajib foto selfie" hint="Peserta diminta izin kamera lalu mengambil foto saat absen. Tanpa foto, absen ditolak." checked={f.selfie} onChange={(v) => setF({ ...f, selfie: v })} />
        <Check label="Wajib lokasi" hint="Peserta diminta izin lokasi; koordinat dan akurasinya dicatat. Tanpa lokasi, absen ditolak." checked={f.loc} onChange={(v) => setF({ ...f, loc: v })} />
        <p className="hint">Foto dan lokasi hanya dapat dilihat admin kegiatan ini. Jika keduanya dimatikan, peserta langsung absen satu ketukan.</p>
      </form>
    </Modal>
  )
}
