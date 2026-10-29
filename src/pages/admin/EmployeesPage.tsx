import { Building2, ClipboardPaste, Contact, Download, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { Fragment, useMemo, useState, type FormEvent } from 'react'
import { Empty, ErrorBox, Field, Loading, Modal, PageHeader, useAsync, useConfirm, useToast } from '../../components/ui'
import { SatkerControls, SatkerGroupRow, useCollapsed } from '../../components/SatkerGroup'
import { downloadCsv } from '../../lib/csv'
import { EMPLOYEE_FORMAT_HELP, normalizeNip, parseEmployees } from '../../lib/parsers'
import { GRADE_SUGGESTIONS } from '../../lib/people'
import { groupBySatker, matchesUnit, normSatker } from '../../lib/satker'
import { errMsg, fetchAll, supabase } from '../../lib/supabase'
import type { Employee } from '../../lib/types'

const EMPTY = { name: '', identifier: '', grade: '', job_title: '', institution: '', phone: '' }

/** Pesan galat yang ramah untuk pelanggaran NIP kembar. */
const saveError = (e: unknown) => (/employees_owner_nip_uq|duplicate key/i.test(errMsg(e)) ? 'NIP ini sudah terdaftar atas nama pegawai lain.' : errMsg(e))

export default function EmployeesPage() {
  const toast = useToast()
  const confirm = useConfirm()
  const [q, setQ] = useState('')
  const [unit, setUnit] = useState('')
  const [grouped, setGrouped] = useState(true)
  const [editing, setEditing] = useState<Partial<Employee> | null>(null)
  const [bulk, setBulk] = useState(false)
  const [renaming, setRenaming] = useState<{ label: string; ids: string[]; none: boolean } | null>(null)
  const { collapsed, toggle, setAll } = useCollapsed()

  const { data, error, loading, reload } = useAsync(async () => {
    const [employees, uses] = await Promise.all([
      fetchAll<Employee>((a, b) => supabase.from('employees').select('*').order('name').order('id').range(a, b)),
      fetchAll<{ id: string; employee_id: string; activity_id: string }>((a, b) => supabase.from('participants').select('id, employee_id, activity_id').not('employee_id', 'is', null).order('id').range(a, b)),
    ])
    const used = new Map<string, Set<string>>()
    for (const u of uses) used.set(u.employee_id, (used.get(u.employee_id) ?? new Set()).add(u.activity_id))
    return { employees, activities: Object.fromEntries([...used].map(([k, v]) => [k, v.size])) as Record<string, number> }
  }, [])

  const all = data?.employees ?? []
  const allGroups = useMemo(() => groupBySatker(all, (e) => e.institution), [all])
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return all.filter((e) => matchesUnit(unit, e.institution) && (!s || [e.name, e.identifier, e.grade, e.job_title, e.institution, e.phone].some((v) => v?.toLowerCase().includes(s))))
  }, [all, q, unit])
  const groups = useMemo(() => groupBySatker(list, (e) => e.institution), [list])

  async function remove(e: Employee) {
    const n = data?.activities[e.id] ?? 0
    const ok = await confirm({ title: `Hapus ${e.name}?`, danger: true, confirmText: 'Hapus pegawai',
      message: n
        ? <>Pegawai ini menjadi peserta di <b>{n} kegiatan</b>. Di kegiatan itu ia tetap tercatat (absensi, kuis, dan sertifikatnya tidak hilang), hanya tidak lagi tertaut ke data pegawai.</>
        : 'Pegawai ini belum dipakai di kegiatan mana pun.' })
    if (!ok) return
    const { error } = await supabase.from('employees').delete().eq('id', e.id)
    if (error) return toast(errMsg(error), 'error')
    toast('Pegawai dihapus.', 'success'); void reload(true)
  }

  function exportCsv() {
    downloadCsv('data-pegawai', [
      ['Satuan Kerja', 'Nama Lengkap & Gelar', 'NIP', 'Pangkat/Gol. Ruang', 'Jabatan', 'No. WhatsApp'],
      ...allGroups.flatMap((g) => g.items.map((e) => [g.label === 'Tanpa satuan kerja' ? '' : g.label, e.name, e.identifier, e.grade, e.job_title, e.phone])),
    ])
  }

  const cols = grouped ? 5 : 6
  const row = (e: Employee, i: number) => (
    <tr key={e.id}>
      <td className="muted">{i + 1}</td>
      <td style={{ minWidth: 220 }}><b>{e.name}</b><div className="mono muted">{e.identifier ? `NIP ${e.identifier}` : '—'}</div></td>
      <td style={{ minWidth: 170 }}>
        {e.job_title ? <div>{e.job_title}</div> : <div className="muted">—</div>}
        {e.grade && <div className="muted small">{e.grade}</div>}
      </td>
      {!grouped && <td style={{ minWidth: 140 }}>{e.institution ?? <span className="muted">—</span>}</td>}
      <td className="nowrap mono">{e.phone ?? <span className="muted">—</span>}</td>
      <td className="actions">
        <div className="row tight" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
          {(data?.activities[e.id] ?? 0) > 0 && <span className="badge">{data!.activities[e.id]} kegiatan</span>}
          <button className="icon-btn" onClick={() => setEditing(e)} aria-label={`Ubah ${e.name}`} title="Ubah"><Pencil size={16} /></button>
          <button className="icon-btn danger" onClick={() => void remove(e)} aria-label={`Hapus ${e.name}`} title="Hapus"><Trash2 size={16} /></button>
        </div>
      </td>
    </tr>
  )

  return (
    <div className="stack">
      <PageHeader title="Data pegawai" subtitle="Induk data orang, dikelompokkan per satuan kerja. Peserta, narasumber, dan panitia kegiatan dipilih dari sini."
        actions={<>
          <button className="btn" onClick={() => setBulk(true)}><ClipboardPaste size={16} /> Impor banyak</button>
          <button className="btn primary" onClick={() => setEditing({ ...EMPTY })}><Plus size={17} /> Tambah pegawai</button>
        </>} />

      <div className="card flush">
        <div className="toolbar">
          <div className="row">
            <label className="search"><Search size={16} /><input className="input" placeholder="Cari nama, NIP, jabatan, atau satuan kerja" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari pegawai" /></label>
            <SatkerControls groups={allGroups} total={all.length} unit={unit} setUnit={setUnit} grouped={grouped} setGrouped={setGrouped} />
            {grouped && groups.length > 1 && (
              <button className="btn ghost sm" onClick={() => setAll(collapsed.size ? null : groups.map((g) => g.key))}>{collapsed.size ? 'Buka semua' : 'Lipat semua'}</button>
            )}
          </div>
          <div className="row tight">
            <span className="muted small">{all.length} pegawai · {allGroups.length} satuan kerja</span>
            <button className="btn sm" onClick={exportCsv} disabled={!all.length}><Download size={14} /> CSV</button>
          </div>
        </div>

        {loading && !data && <Loading />}
        {error && <div style={{ padding: 16 }}><ErrorBox error={error} onRetry={() => void reload()} /></div>}
        {!loading && !error && !all.length && (
          <Empty icon={<Contact size={26} />} title="Belum ada data pegawai">
            Tambahkan pegawai satu per satu atau tempel daftarnya dari Excel. Satuan kerja yang sama otomatis dikelompokkan.
            <div style={{ marginTop: 12 }}><button className="btn primary" onClick={() => setBulk(true)}><ClipboardPaste size={16} /> Impor banyak</button></div>
          </Empty>
        )}
        {!!all.length && (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>#</th><th>Nama &amp; NIP</th><th>Pangkat/Gol. &amp; jabatan</th>{!grouped && <th>Satuan kerja</th>}<th>WhatsApp</th><th className="actions">Aksi</th></tr></thead>
              <tbody>
                {grouped
                  ? groups.map((g) => {
                      const full = allGroups.find((x) => x.key === g.key)
                      const isCollapsed = collapsed.has(g.key)
                      return (
                        <Fragment key={g.key || '__none__'}>
                          <SatkerGroupRow label={g.label} colSpan={cols} collapsed={isCollapsed} onToggle={() => toggle(g.key)} meta={`${g.items.length} pegawai`}
                            actions={full && (
                              <button className="btn ghost sm" onClick={() => setRenaming({ label: g.label, ids: full.items.map((x) => x.id), none: g.key === '' })}>
                                <Building2 size={14} /> {g.key === '' ? 'Isi satuan kerja' : 'Ubah nama'}
                              </button>
                            )} />
                          {!isCollapsed && g.items.map((e, i) => row(e, i))}
                        </Fragment>
                      )
                    })
                  : list.map((e, i) => row(e, i))}
                {list.length === 0 && <tr><td colSpan={cols} className="center muted">Tidak ada hasil{q ? <> untuk "{q}"</> : ''}.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && <EmployeeForm value={editing} institutions={allGroups.filter((g) => g.key).map((g) => g.label)}
        onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(true) }} />}
      {bulk && <BulkImport existing={all} onClose={() => setBulk(false)} onSaved={() => { setBulk(false); void reload(true) }} />}
      {renaming && <RenameSatker target={renaming} others={allGroups.map((g) => g.label).filter((l) => l !== renaming.label)}
        onClose={() => setRenaming(null)} onSaved={() => { setRenaming(null); void reload(true) }} />}
    </div>
  )
}

function EmployeeForm({ value, institutions, onClose, onSaved }: {
  value: Partial<Employee>; institutions: string[]; onClose: () => void; onSaved: () => void
}) {
  const toast = useToast()
  const [f, setF] = useState({
    name: value.name ?? '', identifier: value.identifier ?? '', grade: value.grade ?? '',
    job_title: value.job_title ?? '', institution: value.institution ?? '', phone: value.phone ?? '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const payload = {
      name: f.name.trim().replace(/\s+/g, ' '),
      identifier: normalizeNip(f.identifier) || null,
      grade: f.grade.trim() || null,
      job_title: f.job_title.trim() || null,
      institution: normSatker(f.institution) || null,
      phone: f.phone.trim() || null,
    }
    const { error } = value.id
      ? await supabase.from('employees').update(payload).eq('id', value.id)
      : await supabase.from('employees').insert(payload)
    setBusy(false)
    if (error) return toast(saveError(error), 'error')
    toast(value.id ? 'Data diperbarui (kegiatan yang memakainya ikut diperbarui).' : 'Pegawai ditambahkan.', 'success')
    onSaved()
  }

  return (
    <Modal wide title={value.id ? 'Ubah data pegawai' : 'Tambah pegawai'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Batal</button><button className="btn primary" form="eform" disabled={busy}>Simpan</button></>}>
      <form id="eform" onSubmit={submit}>
        <Field label="Nama lengkap beserta gelar *" hint="Tulis lengkap dengan gelar, mis. Dr. Budi Santoso, S.Pd., M.Si.">
          <input className="input" required autoFocus value={f.name} onChange={set('name')} />
        </Field>
        <div className="form-grid">
          <Field label="NIP" hint="Spasi otomatis dihapus. Kosongkan jika tidak ada (mis. narasumber luar).">
            <input className="input mono" inputMode="numeric" value={f.identifier} onChange={set('identifier')} placeholder="18 digit" />
          </Field>
          <Field label="Pangkat / Gol. Ruang" hint="Pilih dari saran atau ketik sendiri (mis. golongan PPPK)">
            <input className="input" list="e-grade-list" value={f.grade} onChange={set('grade')} placeholder="mis. Penata Muda (III/a)" />
          </Field>
          <Field label="Jabatan"><input className="input" value={f.job_title} onChange={set('job_title')} placeholder="mis. Kepala Seksi Perencanaan" /></Field>
          <Field label="Satuan kerja" hint="Pilih dari satuan kerja yang sudah ada atau ketik yang baru.">
            <input className="input" list="e-unit-list" value={f.institution} onChange={set('institution')} placeholder="mis. Dinas Pendidikan" />
          </Field>
          <Field label="No. WhatsApp" hint="Dipakai untuk tombol kirim link lewat WhatsApp">
            <input className="input" type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} placeholder="08xxxxxxxxxx" />
          </Field>
        </div>
        <datalist id="e-grade-list">{GRADE_SUGGESTIONS.map((g) => <option key={g} value={g} />)}</datalist>
        <datalist id="e-unit-list">{institutions.map((g) => <option key={g} value={g} />)}</datalist>
      </form>
    </Modal>
  )
}

function BulkImport({ existing, onClose, onSaved }: { existing: Employee[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const parsed = useMemo(() => parseEmployees(text), [text])
  // NIP yang sama (atau nama yang sama bila tanpa NIP) dianggap sudah ada
  const known = new Set(existing.map((p) => (p.identifier || p.name).toLowerCase()))
  const fresh = parsed.items.filter((i) => !known.has((i.identifier || i.name).toLowerCase()))
  const skipped = parsed.items.length - fresh.length
  const unitCount = new Set(fresh.map((i) => (i.institution ?? '').trim().replace(/\s+/g, ' ').toLowerCase())).size

  async function save() {
    setBusy(true)
    const { error } = await supabase.from('employees').insert(fresh.map((i) => ({ ...i, institution: normSatker(i.institution) || null })))
    setBusy(false)
    if (error) return toast(saveError(error), 'error')
    toast(`${fresh.length} pegawai ditambahkan.`, 'success')
    onSaved()
  }

  function downloadTemplate() {
    downloadCsv('templat-pegawai', [
      ['Nama Lengkap & Gelar', 'NIP', 'Pangkat/Gol. Ruang', 'Jabatan', 'Satuan Kerja', 'No. WhatsApp'],
      ['Dr. Budi Santoso, M.Si.', '198001012005011001', 'Pembina (IV/a)', 'Kepala Bidang', 'Dinas Pendidikan', '081234567890'],
      ['Rina Marlina, S.E.', '199001012015012001', 'Penata Muda (III/a)', 'Staf Sekretariat', 'Dinas Pendidikan', '081211111111'],
      ['Prof. Dr. Ahmad Fauzi, M.A.', '', '', 'Guru Besar', 'Universitas Negeri', '081200000000'],
    ])
  }

  return (
    <Modal wide title="Impor banyak pegawai" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Batal</button>
        <button className="btn primary" disabled={busy || fresh.length === 0} onClick={() => void save()}>{busy ? 'Menyimpan…' : `Tambahkan ${fresh.length} pegawai`}</button></>}>
      <p className="muted small" style={{ whiteSpace: 'pre-line' }}>{EMPLOYEE_FORMAT_HELP}</p>
      <div className="row" style={{ marginBottom: 12 }}>
        <span className="spacer" />
        <button className="btn sm" onClick={downloadTemplate}><Download size={14} /> Unduh templat (CSV)</button>
      </div>
      <textarea className="input mono" style={{ minHeight: 160, whiteSpace: 'pre' }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Tempel data dari Excel di sini…" autoFocus />
      {text.trim() && (
        <div style={{ marginTop: 14 }}>
          <div className="row tight">
            <span className="badge success">{fresh.length} siap diimpor{unitCount ? ` di ${unitCount} satuan kerja` : ''}</span>
            {skipped > 0 && <span className="badge warn">{skipped} sudah ada, dilewati</span>}
            {parsed.errors.length > 0 && <span className="badge danger">{parsed.errors.length} baris bermasalah</span>}
          </div>
          {parsed.errors.length > 0 && <ul className="small" style={{ color: 'var(--danger)', paddingLeft: 18 }}>{parsed.errors.slice(0, 8).map((e) => <li key={e}>{e}</li>)}</ul>}
          {fresh.length > 0 && (
            <div className="table-wrap" style={{ marginTop: 10, border: '1px solid var(--border)', borderRadius: 10 }}>
              <table className="table">
                <thead><tr><th>Nama</th><th>NIP</th><th>Pangkat/Gol.</th><th>Jabatan</th><th>Satuan kerja</th><th>WhatsApp</th></tr></thead>
                <tbody>{fresh.slice(0, 5).map((i, n) => (
                  <tr key={n}><td>{i.name}</td><td className="mono">{i.identifier ?? '—'}</td><td>{i.grade ?? '—'}</td><td>{i.job_title ?? '—'}</td><td>{i.institution ?? '—'}</td><td className="mono">{i.phone ?? '—'}</td></tr>
                ))}</tbody>
              </table>
              {fresh.length > 5 && <div className="muted small" style={{ padding: '8px 16px' }}>…dan {fresh.length - 5} lainnya. Pastikan kolom di atas sudah benar sebelum menambahkan.</div>}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

function RenameSatker({ target, others, onClose, onSaved }: {
  target: { label: string; ids: string[]; none: boolean }; others: string[]; onClose: () => void; onSaved: () => void
}) {
  const toast = useToast()
  const [name, setName] = useState(target.none ? '' : target.label)
  const [busy, setBusy] = useState(false)
  const merging = others.some((o) => o.toLowerCase() === normSatker(name).toLowerCase())

  async function save() {
    setBusy(true)
    const { error } = await supabase.from('employees').update({ institution: normSatker(name) || null }).in('id', target.ids)
    setBusy(false)
    if (error) return toast(errMsg(error), 'error')
    toast(`${target.ids.length} pegawai dipindahkan ke "${normSatker(name)}".`, 'success')
    onSaved()
  }

  return (
    <Modal title={target.none ? 'Isi satuan kerja' : 'Ubah nama satuan kerja'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Batal</button>
        <button className="btn primary" disabled={busy || !normSatker(name)} onClick={() => void save()}>{busy ? 'Menyimpan…' : 'Simpan'}</button></>}>
      <p className="muted">Berlaku untuk <b>{target.ids.length} pegawai</b> di kelompok <b>{target.label}</b>; kegiatan yang memakai mereka ikut diperbarui.</p>
      <Field label="Nama satuan kerja" hint="Ketik nama satuan kerja lain yang sudah ada untuk menggabungkan kelompok, atau pilih dari saran.">
        <input className="input" list="e-satker-others" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <datalist id="e-satker-others">{others.map((o) => <option key={o} value={o} />)}</datalist>
      {merging && <div className="alert info"><span>Nama ini sudah dipakai kelompok lain, jadi kedua kelompok akan <b>digabung</b>.</span></div>}
    </Modal>
  )
}
