import { ArrowUpDown, FileText, FileType2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Check, Field, Modal, useToast } from '../../components/ui'
import { buildExportModel, downloadBlob, exportFilename, type ExportColumn, type ExportOptions } from '../../lib/exportModel'
import { hasRole, ROLE_LABEL, ROLES } from '../../lib/people'
import { errMsg } from '../../lib/supabase'
import type { Activity, Participant, PersonRole } from '../../lib/types'

const COLUMNS: { id: ExportColumn; label: string; hint?: string }[] = [
  { id: 'identifier', label: 'NIP' },
  { id: 'grade', label: 'Pangkat/Gol. Ruang' },
  { id: 'job_title', label: 'Jabatan' },
  { id: 'phone', label: 'No. WhatsApp' },
  { id: 'role', label: 'Peran', hint: 'Peserta / Narasumber / Moderator / Panitia' },
  { id: 'signature', label: 'Kolom tanda tangan', hint: 'Untuk daftar hadir yang dicetak' },
]
const PRESETS = ['Daftar Peserta', 'Daftar Hadir', 'Daftar Narasumber', 'Daftar Panitia']

/** Ekspor daftar peserta/narasumber/panitia ke Word (.docx) atau PDF, mengikuti urutan satker dan urutan orang. */
export default function ExportModal({ activity, people, onClose, onOrder }: {
  activity: Pick<Activity, 'name' | 'start_date' | 'end_date' | 'location' | 'satker_order'>
  people: Participant[]   // sudah berurutan
  onClose: () => void
  onOrder: () => void
}) {
  const toast = useToast()
  const present = ROLES.filter((r) => people.some((p) => hasRole(p, r)))
  const [title, setTitle] = useState('Daftar Peserta')
  const [roles, setRoles] = useState<PersonRole[]>(present.length ? present : ['peserta'])
  // bila ada lebih dari satu peran, kolom Peran diaktifkan agar pembaca dokumen tahu siapa narasumber/panitia
  const [columns, setColumns] = useState<ExportColumn[]>(present.length > 1 ? ['identifier', 'grade', 'job_title', 'role'] : ['identifier', 'grade', 'job_title'])
  const [landscape, setLandscape] = useState(true)
  const [grouped, setGrouped] = useState(true)
  const [busy, setBusy] = useState<'docx' | 'pdf' | null>(null)

  const opts: ExportOptions = { title, roles, columns, landscape, grouped }
  const model = useMemo(() => buildExportModel(activity, people, activity.satker_order, opts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activity, people, title, roles, columns, landscape, grouped])
  const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  const crowded = !landscape && model.headers.length >= 6

  async function run(kind: 'docx' | 'pdf') {
    if (!model.total) return toast('Pilih minimal satu peran yang memiliki data.', 'error')
    setBusy(kind)
    try {
      // pustaka dokumen cukup besar, jadi dimuat hanya saat dibutuhkan
      const blob = kind === 'docx'
        ? await (await import('../../lib/exportDocx')).exportDocx(model)
        : await (await import('../../lib/exportPdf')).exportPdf(model)
      downloadBlob(exportFilename(model.title, activity.name, kind), blob)
      toast(`${kind === 'docx' ? 'Dokumen Word' : 'PDF'} siap diunduh.`, 'success')
    } catch (e) {
      toast(`Gagal membuat dokumen: ${errMsg(e)}`, 'error')
    } finally { setBusy(null) }
  }

  return (
    <Modal wide title="Ekspor daftar ke Word / PDF" onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Tutup</button>
        <button className="btn" disabled={!!busy || !model.total} onClick={() => void run('docx')}><FileType2 size={16} /> {busy === 'docx' ? 'Membuat…' : 'Unduh Word (.docx)'}</button>
        <button className="btn primary" disabled={!!busy || !model.total} onClick={() => void run('pdf')}><FileText size={16} /> {busy === 'pdf' ? 'Membuat…' : 'Unduh PDF'}</button>
      </>}>
      <Field label="Judul dokumen">
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="pills" style={{ marginBottom: 16 }} aria-label="Contoh judul">
        {PRESETS.map((t) => <button key={t} type="button" className={`pill ${title === t ? 'active' : ''}`} onClick={() => setTitle(t)}>{t}</button>)}
      </div>

      <div className="form-grid">
        <div>
          <div className="label" style={{ marginBottom: 8 }}>Siapa saja yang dimasukkan</div>
          {ROLES.map((r) => {
            const n = people.filter((p) => hasRole(p, r)).length
            return <Check key={r} label={`${ROLE_LABEL[r]} (${n})`} checked={roles.includes(r)} onChange={() => setRoles(toggle(roles, r))} />
          })}
        </div>
        <div>
          <div className="label" style={{ marginBottom: 8 }}>Kolom (selain No dan Nama)</div>
          {COLUMNS.map((c) => <Check key={c.id} label={c.label} hint={c.hint} checked={columns.includes(c.id)} onChange={() => setColumns(toggle(columns, c.id))} />)}
        </div>
      </div>

      <div className="row" style={{ gap: 24, margin: '4px 0 12px' }}>
        <div>
          <div className="label" style={{ marginBottom: 6 }}>Tata letak</div>
          <div className="pills" role="radiogroup" aria-label="Tata letak">
            <button type="button" role="radio" aria-checked={grouped} className={`pill ${grouped ? 'active' : ''}`} onClick={() => setGrouped(true)}>Tabel per satker</button>
            <button type="button" role="radio" aria-checked={!grouped} className={`pill ${!grouped ? 'active' : ''}`} onClick={() => setGrouped(false)}>Satu tabel</button>
          </div>
        </div>
        <div>
          <div className="label" style={{ marginBottom: 6 }}>Orientasi kertas A4</div>
          <div className="pills" role="radiogroup" aria-label="Orientasi">
            <button type="button" role="radio" aria-checked={landscape} className={`pill ${landscape ? 'active' : ''}`} onClick={() => setLandscape(true)}>Lanskap</button>
            <button type="button" role="radio" aria-checked={!landscape} className={`pill ${!landscape ? 'active' : ''}`} onClick={() => setLandscape(false)}>Potret</button>
          </div>
        </div>
      </div>
      {crowded && <div className="alert warn"><span>Kolom cukup banyak. Orientasi <b>Lanskap</b> membuat tabel lebih lega dan tidak terpotong.</span></div>}

      <div className="card" style={{ background: 'var(--surface-2)', boxShadow: 'none' }}>
        <div className="row between">
          <div>
            <b>{model.total} orang</b> dalam <b>{model.groups.length}</b> {grouped ? 'satuan kerja' : 'tabel'}
            <div className="muted small">Mengikuti urutan satuan kerja dan urutan orang yang Anda atur.</div>
          </div>
          <button className="btn sm" onClick={onOrder}><ArrowUpDown size={14} /> Atur urutan</button>
        </div>
        {grouped && model.groups.length > 0 && (
          <ol className="small muted" style={{ margin: '10px 0 0', paddingLeft: 20, columns: model.groups.length > 4 ? 2 : 1 }}>
            {model.groups.map((g) => <li key={g.label}>{g.label}</li>)}
          </ol>
        )}
      </div>
    </Modal>
  )
}
