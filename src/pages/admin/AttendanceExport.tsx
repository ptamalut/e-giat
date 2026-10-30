import { FileText, FileType2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Check, Field, Modal, useToast } from '../../components/ui'
import { buildAttendanceModels, sessionRoster, type AttColumn, type AttExportOptions, type AttGroup } from '../../lib/exportAttendance'
import { downloadBlob, exportFilename } from '../../lib/exportModel'
import { fmtDateTime } from '../../lib/format'
import { ROLE_LABEL, ROLES } from '../../lib/people'
import { groupBySatker, NONE_KEY } from '../../lib/satker'
import { errMsg } from '../../lib/supabase'
import type { Activity, Attendance, AttendanceSession, Participant, PersonRole, SessionMember } from '../../lib/types'

const COLUMNS: { id: AttColumn; label: string; hint?: string }[] = [
  { id: 'identifier', label: 'NIP' },
  { id: 'grade', label: 'Pangkat/Gol. Ruang' },
  { id: 'job_title', label: 'Jabatan' },
  { id: 'phone', label: 'No. WhatsApp' },
  { id: 'role', label: 'Kedudukan', hint: 'Peserta / Narasumber / Moderator / Panitia pada sesi itu' },
  { id: 'status', label: 'Status kehadiran' },
  { id: 'time', label: 'Jam absen' },
  { id: 'signature', label: 'Kolom tanda tangan', hint: 'Untuk daftar hadir yang dicetak dan ditandatangani' },
]
const PRESETS = ['Daftar Hadir', 'Rekap Kehadiran']
const GROUPS: { id: AttGroup; label: string }[] = [
  { id: 'satker', label: 'Tabel per satker' }, { id: 'jenis', label: 'Tabel per jenis' }, { id: 'none', label: 'Satu tabel' },
]

/** Ekspor absensi ke Word (.docx) atau PDF: pilih sesi, jenis (kedudukan di sesi), satuan kerja, dan pengelompokan tabel. */
export default function AttendanceExport({ activity, people, sessions, attendances, members, currentId, onClose }: {
  activity: Pick<Activity, 'name' | 'satker_order'>
  people: Participant[]          // sudah berurutan, hanya yang berhak absen
  sessions: AttendanceSession[]
  attendances: Attendance[]
  members: SessionMember[]
  currentId: string | undefined
  onClose: () => void
}) {
  const toast = useToast()
  const [title, setTitle] = useState('Daftar Hadir')
  const [sessionIds, setSessionIds] = useState<string[]>(currentId ? [currentId] : sessions.slice(0, 1).map((s) => s.id))
  const [roles, setRoles] = useState<PersonRole[]>([...ROLES])
  const [unit, setUnit] = useState('')
  const [group, setGroup] = useState<AttGroup>('satker')
  const [columns, setColumns] = useState<AttColumn[]>(['identifier', 'job_title', 'role', 'status', 'time'])
  const [landscape, setLandscape] = useState(true)
  const [busy, setBusy] = useState<'docx' | 'pdf' | null>(null)

  const chosen = sessions.filter((s) => sessionIds.includes(s.id)) // urutan sesi
  const unitGroups = useMemo(() => groupBySatker(people, (p) => p.institution, activity.satker_order), [people, activity.satker_order])
  // jumlah orang per kedudukan pada sesi terpilih (tanpa filter jenis/satker)
  const roleCounts = useMemo(() => {
    const n: Record<PersonRole, number> = { peserta: 0, narasumber: 0, moderator: 0, panitia: 0 }
    const everyone = { roles: [...ROLES], unit: '' }
    for (const s of chosen) for (const r of sessionRoster(s, people, members, everyone)) n[r.role]++
    return n
  }, [chosen, people, members])

  const opts: AttExportOptions = { title, sessionIds: chosen.map((s) => s.id), roles, unit, group, columns, landscape }
  const models = useMemo(() => buildAttendanceModels(activity, people, sessions, attendances, members, activity.satker_order, opts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activity, people, sessions, attendances, members, title, sessionIds, roles, unit, group, columns, landscape])
  const shown = models.filter((m) => m.total > 0)
  const total = shown.reduce((n, m) => n + m.total, 0)
  const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  const crowded = !landscape && columns.length + (group === 'satker' ? 2 : 3) >= 7

  async function run(kind: 'docx' | 'pdf') {
    if (!shown.length) return toast('Tidak ada data untuk diekspor. Periksa pilihan sesi, jenis, dan satuan kerja.', 'error')
    setBusy(kind)
    try {
      // pustaka dokumen cukup besar, jadi dimuat hanya saat dibutuhkan
      const blob = kind === 'docx'
        ? await (await import('../../lib/exportDocx')).exportDocx(shown)
        : await (await import('../../lib/exportPdf')).exportPdf(shown)
      const name = shown.length === 1 ? chosen.find((s) => s.id === sessionIds[0])?.title ?? '' : 'semua-sesi'
      downloadBlob(exportFilename(`${title}-${name}`, activity.name, kind), blob)
      toast(`${kind === 'docx' ? 'Dokumen Word' : 'PDF'} siap diunduh.`, 'success')
    } catch (e) {
      toast(`Gagal membuat dokumen: ${errMsg(e)}`, 'error')
    } finally { setBusy(null) }
  }

  return (
    <Modal wide title="Ekspor absensi ke Word / PDF" onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Tutup</button>
        <button className="btn" disabled={!!busy || !total} onClick={() => void run('docx')}><FileType2 size={16} /> {busy === 'docx' ? 'Membuat…' : 'Unduh Word (.docx)'}</button>
        <button className="btn primary" disabled={!!busy || !total} onClick={() => void run('pdf')}><FileText size={16} /> {busy === 'pdf' ? 'Membuat…' : 'Unduh PDF'}</button>
      </>}>
      <Field label="Judul dokumen">
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="pills" style={{ marginBottom: 16 }} aria-label="Contoh judul">
        {PRESETS.map((t) => <button key={t} type="button" className={`pill ${title === t ? 'active' : ''}`} onClick={() => setTitle(t)}>{t}</button>)}
      </div>

      <div className="form-grid">
        <div>
          <div className="row between" style={{ marginBottom: 8 }}>
            <span className="label" style={{ margin: 0 }}>Sesi</span>
            <button type="button" className="btn ghost sm" onClick={() => setSessionIds(sessionIds.length === sessions.length ? sessions.slice(0, 1).map((s) => s.id) : sessions.map((s) => s.id))}>
              {sessionIds.length === sessions.length ? 'Hanya satu sesi' : 'Pilih semua sesi'}
            </button>
          </div>
          {sessions.map((s) => <Check key={s.id} label={s.title} hint={fmtDateTime(s.start_at)} checked={sessionIds.includes(s.id)} onChange={() => setSessionIds(toggle(sessionIds, s.id))} />)}
          {sessionIds.length > 1 && <p className="hint">Tiap sesi menjadi bagian tersendiri (halaman baru) dalam satu dokumen.</p>}
        </div>
        <div>
          <div className="label" style={{ marginBottom: 8 }}>Jenis (kedudukan pada sesi)</div>
          {ROLES.map((r) => <Check key={r} label={`${ROLE_LABEL[r]} (${roleCounts[r]})`} checked={roles.includes(r)} onChange={() => setRoles(toggle(roles, r))} />)}
          <Field label="Satuan kerja">
            <select className="input" value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Satuan kerja">
              <option value="">Semua satuan kerja ({people.length})</option>
              {unitGroups.map((g) => <option key={g.key || NONE_KEY} value={g.key || NONE_KEY}>{g.label} ({g.items.length})</option>)}
            </select>
          </Field>
        </div>
      </div>

      <div className="form-grid">
        <div>
          <div className="label" style={{ marginBottom: 8 }}>Kolom (selain No dan Nama)</div>
          {COLUMNS.map((c) => <Check key={c.id} label={c.label} hint={c.hint} checked={columns.includes(c.id)} onChange={() => setColumns(toggle(columns, c.id))} />)}
        </div>
        <div>
          <div className="label" style={{ marginBottom: 6 }}>Pengelompokan tabel</div>
          <div className="pills" role="radiogroup" aria-label="Pengelompokan tabel" style={{ marginBottom: 14 }}>
            {GROUPS.map((g) => <button key={g.id} type="button" role="radio" aria-checked={group === g.id} className={`pill ${group === g.id ? 'active' : ''}`} onClick={() => setGroup(g.id)}>{g.label}</button>)}
          </div>
          <div className="label" style={{ marginBottom: 6 }}>Orientasi kertas A4</div>
          <div className="pills" role="radiogroup" aria-label="Orientasi">
            <button type="button" role="radio" aria-checked={landscape} className={`pill ${landscape ? 'active' : ''}`} onClick={() => setLandscape(true)}>Lanskap</button>
            <button type="button" role="radio" aria-checked={!landscape} className={`pill ${!landscape ? 'active' : ''}`} onClick={() => setLandscape(false)}>Potret</button>
          </div>
        </div>
      </div>
      {crowded && <div className="alert warn"><span>Kolom cukup banyak. Orientasi <b>Lanskap</b> membuat tabel lebih lega dan tidak terpotong.</span></div>}

      <div className="card" style={{ background: 'var(--surface-2)', boxShadow: 'none' }}>
        <b>{total} orang</b> pada <b>{shown.length}</b> sesi
        <div className="muted small">Mengikuti urutan satuan kerja dan urutan orang yang Anda atur di tab Peserta.</div>
        {shown.length > 0 && (
          <ul className="small muted" style={{ margin: '8px 0 0', paddingLeft: 20 }}>
            {shown.map((m, i) => <li key={i}>{m.subtitle[1]} — {m.groups.length} tabel</li>)}
          </ul>
        )}
      </div>
    </Modal>
  )
}
