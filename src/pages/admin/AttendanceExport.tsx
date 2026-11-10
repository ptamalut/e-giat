import { FileText, FileType2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { useBrand } from '../../components/brand'
import { Check, Field, Modal, useToast } from '../../components/ui'
import { buildHadirDocs, type HadirOptions, type Paper } from '../../lib/hadirDoc'
import { downloadHadir } from '../../lib/hadirExport'
import { kopFromSettings } from '../../lib/noteDoc'
import { buildAttendanceModels, sessionRoster, type AttColumn, type AttExportOptions, type AttGroup } from '../../lib/exportAttendance'
import { downloadBlob, exportFilename } from '../../lib/exportModel'
import { fmtDateTime } from '../../lib/format'
import { ROLE_LABEL, ROLES, rolesForJenis } from '../../lib/people'
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
  activity: Pick<Activity, 'id' | 'name' | 'location' | 'satker_order' | 'jenis'>
  people: Participant[]          // sudah berurutan, hanya yang berhak absen
  sessions: AttendanceSession[]
  attendances: Attendance[]
  members: SessionMember[]
  currentId: string | undefined
  onClose: () => void
}) {
  const toast = useToast()
  const { settings } = useBrand()
  const saved = useMemo(() => { try { return JSON.parse(localStorage.getItem(`laksana-hadir-${activity.id}`) ?? '{}') as Partial<{ coordinator: string; officer: string; paper: Paper }> } catch { return {} } }, [activity.id])
  const [format, setFormat] = useState<'resmi' | 'tabel'>('resmi')
  const [title, setTitle] = useState('Daftar Hadir Pegawai')
  const [agenda, setAgenda] = useState(activity.name)
  const [place, setPlace] = useState(activity.location ?? '')
  const [coordinator, setCoordinator] = useState(saved.coordinator ?? '')
  const [officer, setOfficer] = useState(saved.officer ?? '')
  const [paper, setPaper] = useState<Paper>(saved.paper ?? 'F4')
  const [showNip, setShowNip] = useState(false)
  const [sessionIds, setSessionIds] = useState<string[]>(currentId ? [currentId] : sessions.slice(0, 1).map((s) => s.id))
  const avail = rolesForJenis(activity.jenis)
  const [roles, setRoles] = useState<PersonRole[]>([...avail])
  const [unit, setUnit] = useState('')
  const [group, setGroup] = useState<AttGroup>('satker')
  const [columns, setColumns] = useState<AttColumn[]>(['identifier', 'job_title', 'role', 'status', 'time'])
  const [landscape, setLandscape] = useState(true)
  const [qr, setQr] = useState(true)
  const [busy, setBusy] = useState<'docx' | 'pdf' | null>(null)

  const chosen = sessions.filter((s) => sessionIds.includes(s.id)) // urutan sesi
  const unitGroups = useMemo(() => groupBySatker(people, (p) => p.institution, activity.satker_order), [people, activity.satker_order])
  // jumlah orang per kedudukan pada sesi terpilih (tanpa filter jenis/satker)
  const roleCounts = useMemo(() => {
    const n: Record<PersonRole, number> = { peserta: 0, narasumber: 0, moderator: 0, panitia: 0, petugas: 0 }
    const everyone = { roles: [...ROLES], unit: '' }
    for (const s of chosen) for (const r of sessionRoster(s, people, members, everyone)) n[r.role]++
    return n
  }, [chosen, people, members])

  const qrOn = qr && columns.includes('signature')
  const noCodes = attendances.length > 0 && attendances.every((a) => !a.sign_code)   // migrasi 022 belum dijalankan
  const opts: AttExportOptions = { title, sessionIds: chosen.map((s) => s.id), roles, unit, group, columns, landscape, qrBase: qrOn ? window.location.origin : undefined }
  const models = useMemo(() => buildAttendanceModels(activity, people, sessions, attendances, members, activity.satker_order, opts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activity, people, sessions, attendances, members, title, sessionIds, roles, unit, group, columns, landscape, qrOn])
  const shown = models.filter((m) => m.total > 0)
  const hadirOpts: HadirOptions = { title, sessionIds: chosen.map((x) => x.id), roles, unit, agenda, place, coordinator, officer, showNip, paper, qrBase: qr ? window.location.origin : undefined }
  const hadirDocs = useMemo(() => buildHadirDocs(activity, people, sessions, attendances, members, activity.satker_order, kopFromSettings(settings), hadirOpts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activity, people, sessions, attendances, members, settings, title, sessionIds, roles, unit, agenda, place, coordinator, officer, showNip, paper, qr])
  const hadirShown = hadirDocs.filter((d) => d.rows.length > 0)
  const total = format === 'resmi' ? hadirShown.reduce((n, d) => n + d.rows.length, 0) : shown.reduce((n, m) => n + m.total, 0)
  const kopEmpty = (() => { const k = kopFromSettings(settings); return !k.title.length && !k.address.length })()
  const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  const crowded = !landscape && columns.length + (group === 'satker' ? 2 : 3) >= 7

  async function run(kind: 'docx' | 'pdf') {
    if (!total) return toast('Tidak ada data untuk diekspor. Periksa pilihan sesi, jenis, dan satuan kerja.', 'error')
    setBusy(kind)
    try {
      if (format === 'resmi') {
        try { localStorage.setItem(`laksana-hadir-${activity.id}`, JSON.stringify({ coordinator, officer, paper })) } catch { /* penyimpanan tidak tersedia */ }
        const name = hadirShown.length === 1 ? chosen.find((x) => x.id === sessionIds[0])?.title ?? '' : 'semua-sesi'
        await downloadHadir(kind, hadirShown, settings, title, exportFilename(`${title}-${name}`, activity.name, kind))
        return void toast(`${kind === 'docx' ? 'Dokumen Word' : 'PDF'} siap diunduh.`, 'success')
      }
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
      <Field label="Format cetak">
        <div className="choice-cards" role="radiogroup" aria-label="Format cetak">
          {([['resmi', 'Daftar hadir resmi', 'Berkop surat dari Pengaturan aplikasi: Hari/Tanggal, Jam, Agenda, Tempat, tabel No–Nama–Jabatan–Tanda Tangan, dan kolom Mengetahui.'],
            ['tabel', 'Tabel data', 'Kolom bebas (NIP, pangkat, status, jam absen, dll.), bisa dikelompokkan per satker atau jenis.']] as const).map(([k, l, h]) => (
            <button type="button" key={k} role="radio" aria-checked={format === k} className={`choice-card ${format === k ? 'on' : ''}`} onClick={() => { setFormat(k); setTitle(k === 'resmi' ? 'Daftar Hadir Pegawai' : 'Daftar Hadir') }}>
              <span><b>{l}</b><small>{h}</small></span>
            </button>
          ))}
        </div>
      </Field>

      <Field label="Judul dokumen">
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="pills" style={{ marginBottom: 16 }} aria-label="Contoh judul">
        {(format === 'resmi' ? ['Daftar Hadir Pegawai', 'Daftar Hadir Rapat', 'Daftar Hadir Peserta'] : PRESETS).map((t) => <button key={t} type="button" className={`pill ${title === t ? 'active' : ''}`} onClick={() => setTitle(t)}>{t}</button>)}
      </div>

      {format === 'resmi' && (
        <>
          {kopEmpty && <div className="alert warn"><span>Kop surat belum diisi, jadi dokumen dicetak tanpa kop. Isi di <Link to="/admin/pengaturan">Pengaturan aplikasi → Kop surat</Link> (judul kop, alamat, dan logo surat).</span></div>}
          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
            <Field label="Agenda" hint="Terisi dari nama kegiatan; ubah bila perlu."><input className="input" value={agenda} onChange={(e) => setAgenda(e.target.value)} aria-label="Agenda" /></Field>
            <Field label="Tempat" hint="Terisi dari tempat kegiatan."><input className="input" value={place} onChange={(e) => setPlace(e.target.value)} aria-label="Tempat" /></Field>
            <Field label="Koordinator Absen" hint="Tanda tangan di bawah “Mengetahui”; saran dari peserta kegiatan.">
              <input className="input" list="hadir-names" value={coordinator} onChange={(e) => setCoordinator(e.target.value)} placeholder="Nama beserta gelar" aria-label="Koordinator Absen" />
            </Field>
            <Field label="Petugas Absen">
              <input className="input" list="hadir-names" value={officer} onChange={(e) => setOfficer(e.target.value)} placeholder="Nama beserta gelar" aria-label="Petugas Absen" />
            </Field>
            <datalist id="hadir-names">{people.map((p) => <option key={p.id} value={p.name} />)}</datalist>
          </div>
          <div className="form-grid">
            <Field label="Ukuran kertas">
              <div className="pills" role="radiogroup" aria-label="Ukuran kertas">
                {(['F4', 'A4'] as const).map((k) => <button type="button" key={k} role="radio" aria-checked={paper === k} className={`pill ${paper === k ? 'active' : ''}`} onClick={() => setPaper(k)}>{k === 'F4' ? 'F4 (Folio)' : 'A4'}</button>)}
              </div>
            </Field>
            <div>
              <Check label="Tampilkan kolom NIP" checked={showNip} onChange={setShowNip} />
              <Check label="Isi kolom Tanda Tangan dengan QR tanda tangan elektronik" hint="Yang sudah hadir/terlambat diberi QR pribadi; yang belum hadir dikosongkan untuk tanda tangan basah." checked={qr} onChange={setQr} />
              {qr && noCodes && <div className="alert warn"><span>Kode tanda tangan elektronik belum tersedia. Jalankan <code>supabase/migrations/022_tanda_tangan_elektronik.sql</code> di Supabase SQL Editor lalu muat ulang halaman.</span></div>}
            </div>
          </div>
        </>
      )}

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
          {avail.map((r) => <Check key={r} label={`${ROLE_LABEL[r]} (${roleCounts[r]})`} checked={roles.includes(r)} onChange={() => setRoles(toggle(roles, r))} />)}
          <Field label="Satuan kerja">
            <select className="input" value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Satuan kerja">
              <option value="">Semua satuan kerja ({people.length})</option>
              {unitGroups.map((g) => <option key={g.key || NONE_KEY} value={g.key || NONE_KEY}>{g.label} ({g.items.length})</option>)}
            </select>
          </Field>
        </div>
      </div>

      {format === 'tabel' && <>
      <div className="form-grid">
        <div>
          <div className="label" style={{ marginBottom: 8 }}>Kolom (selain No dan Nama)</div>
          {COLUMNS.map((c) => <Check key={c.id} label={c.label} hint={c.hint} checked={columns.includes(c.id)} onChange={() => setColumns(toggle(columns, c.id))} />)}
          {columns.includes('signature') && (
            <div style={{ marginLeft: 26 }}>
              <Check label="Isi dengan QR tanda tangan elektronik" hint="Yang sudah hadir/terlambat otomatis diberi QR pribadi; pindai untuk memeriksa keaslian kehadiran. Yang belum hadir dibiarkan kosong untuk tanda tangan basah." checked={qr} onChange={setQr} />
              {qrOn && noCodes && <div className="alert warn"><span>Kode tanda tangan elektronik belum tersedia. Jalankan <code>supabase/migrations/022_tanda_tangan_elektronik.sql</code> di Supabase SQL Editor lalu muat ulang halaman.</span></div>}
            </div>
          )}
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
      {format === 'tabel' && crowded && <div className="alert warn"><span>Kolom cukup banyak. Orientasi <b>Lanskap</b> membuat tabel lebih lega dan tidak terpotong.</span></div>}

      </>}

      <div className="card" style={{ background: 'var(--surface-2)', boxShadow: 'none' }}>
        <b>{total} orang</b> pada <b>{format === 'resmi' ? hadirShown.length : shown.length}</b> sesi
        <div className="muted small">Mengikuti urutan satuan kerja dan urutan orang yang Anda atur di tab Peserta.</div>
        {format === 'resmi' && hadirShown.length > 0 && (
          <ul className="small muted" style={{ margin: '8px 0 0', paddingLeft: 20 }}>
            {hadirShown.map((d, i) => <li key={i}>{d.info[0]?.value} — {d.rows.length} orang</li>)}
          </ul>
        )}
        {format === 'tabel' && shown.length > 0 && (
          <ul className="small muted" style={{ margin: '8px 0 0', paddingLeft: 20 }}>
            {shown.map((m, i) => <li key={i}>{m.subtitle[1]} — {m.groups.length} tabel</li>)}
          </ul>
        )}
      </div>
    </Modal>
  )
}
