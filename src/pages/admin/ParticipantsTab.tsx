import { ArrowUpDown, Building2, ClipboardPaste, Download, FileDown, ExternalLink, Link2, MessageCircle, Pencil, Plus, Printer, QrCode, RefreshCcw, Search, Trash2, Users } from 'lucide-react'
import QRCode from 'qrcode'
import { Fragment, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Empty, ErrorBox, Field, Loading, Modal, useAsync, useConfirm, useToast } from '../../components/ui'
import { downloadCsv, safeName } from '../../lib/csv'
import { RoleBadge } from '../../components/RoleBadge'
import { SatkerControls, SatkerGroupRow, useCollapsed } from '../../components/SatkerGroup'
import { GRADE_SUGGESTIONS, isStaff, ROLE_HINT, ROLE_LABEL, ROLES, roleLine } from '../../lib/people'
import { participantLink } from '../../lib/format'
import { groupBySatker, matchesUnit, normSatker, roleSummary, sortPeople } from '../../lib/satker'
import { normalizeNip, PARTICIPANT_FORMAT_HELP, parseParticipants, waNumber } from '../../lib/parsers'
import { errMsg, fetchAll, supabase } from '../../lib/supabase'
import type { Participant, PersonRole } from '../../lib/types'
import { useActivity } from './ActivityLayout'
import ExportModal from './ExportModal'
import OrderModal from './OrderModal'

const EMPTY = { name: '', identifier: '', grade: '', job_title: '', institution: '', phone: '', role: 'peserta' as PersonRole }

async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true } catch {
    const t = document.createElement('textarea')
    t.value = text; document.body.appendChild(t); t.select()
    const ok = document.execCommand('copy'); t.remove(); return ok
  }
}

export default function ParticipantsTab() {
  const { activity, reload: reloadActivity } = useActivity()
  const toast = useToast()
  const confirm = useConfirm()
  const [q, setQ] = useState('')
  const [roleFilter, setRoleFilter] = useState<'semua' | PersonRole>('semua')
  const [editing, setEditing] = useState<Partial<Participant> | null>(null)
  const [bulk, setBulk] = useState(false)
  const [qr, setQr] = useState<Participant | null>(null)
  const [grouped, setGrouped] = useState(true)
  const [unit, setUnit] = useState('')
  const { collapsed, toggle, setAll } = useCollapsed()
  const [ordering, setOrdering] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [renaming, setRenaming] = useState<{ label: string; ids: string[]; none: boolean } | null>(null)
  const [cards, setCards] = useState<{ p: Participant; img: string }[] | null>(null)

  const { data, error, loading, reload } = useAsync(async () => {
    return sortPeople(await fetchAll<Participant>((a, b) => supabase.from('participants').select('*').eq('activity_id', activity.id).order('name').order('id').range(a, b)))
  }, [activity.id])

  const counts = useMemo(() => {
    const all = data ?? []
    return Object.fromEntries([['semua', all.length], ...ROLES.map((r) => [r, all.filter((p) => p.role === r).length])]) as Record<'semua' | PersonRole, number>
  }, [data])

  // semua kelompok (tanpa filter) berurutan sesuai pengaturan; dipakai untuk pilihan satker, ubah nama, ekspor, dan cetak
  const allGroups = useMemo(() => groupBySatker(data ?? [], (p) => p.institution, activity.satker_order), [data, activity.satker_order])
  const ordered = useMemo(() => allGroups.flatMap((g) => g.items), [allGroups])

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return ordered.filter((p) => (roleFilter === 'semua' || p.role === roleFilter) && matchesUnit(unit, p.institution) && (!s || [p.name, p.identifier, p.grade, p.job_title, p.institution, p.phone].some((v) => v?.toLowerCase().includes(s))))
  }, [ordered, q, roleFilter, unit])
  const groups = useMemo(() => groupBySatker(list, (p) => p.institution, activity.satker_order), [list, activity.satker_order])

  const waText = (p: Participant) =>
    isStaff(p.role)
      ? `Yth. ${p.name}, berikut link pribadi Anda untuk absensi sebagai ${ROLE_LABEL[p.role].toLowerCase()} pada kegiatan "${activity.name}":\n${participantLink(p.token)}\n\nJangan dibagikan ke orang lain.`
      : `Yth. ${p.name}, berikut link pribadi Anda untuk absensi & kuis kegiatan "${activity.name}":\n${participantLink(p.token)}\n\nJangan dibagikan ke orang lain.`

  async function remove(p: Participant) {
    const ok = await confirm({ title: `Hapus ${p.name}?`, danger: true, confirmText: 'Hapus',
      message: 'Data absensi dan hasil kuis peserta ini juga akan terhapus. Link pribadinya tidak berlaku lagi.' })
    if (!ok) return
    const { error } = await supabase.from('participants').delete().eq('id', p.id)
    if (error) return toast(errMsg(error), 'error')
    toast('Peserta dihapus.', 'success'); void reload(true)
  }

  async function regenerate(p: Participant) {
    const ok = await confirm({ title: 'Buat ulang link?', confirmText: 'Buat link baru',
      message: <>Link lama milik <b>{p.name}</b> akan berhenti berfungsi. Gunakan jika link bocor/salah kirim. Data absensi & kuis tetap aman.</> })
    if (!ok) return
    const token = crypto.randomUUID().replace(/-/g, '')
    const { error } = await supabase.from('participants').update({ token }).eq('id', p.id)
    if (error) return toast(errMsg(error), 'error')
    toast('Link baru dibuat.', 'success'); void reload(true)
  }

  async function printCards() {
    if (!ordered.length) return
    const imgs = await Promise.all(ordered.map((p) => QRCode.toDataURL(participantLink(p.token), { margin: 1, width: 300 })))
    setCards(ordered.map((p, i) => ({ p, img: imgs[i] })))
  }

  useEffect(() => {
    if (!cards) return
    document.body.classList.add('printing-cards')
    const done = () => { document.body.classList.remove('printing-cards'); setCards(null) }
    window.addEventListener('afterprint', done, { once: true })
    const t = setTimeout(() => window.print(), 250)
    return () => { clearTimeout(t); window.removeEventListener('afterprint', done); document.body.classList.remove('printing-cards') }
  }, [cards])

  function exportLinks() {
    downloadCsv(`link-peserta-${safeName(activity.name)}`, [
      ['Peran', 'Nama Lengkap & Gelar', 'NIP', 'Pangkat/Gol. Ruang', 'Jabatan', 'Satuan Kerja', 'No. WhatsApp', 'Link'],
      ...ordered.map((p) => [ROLE_LABEL[p.role], p.name, p.identifier, p.grade, p.job_title, p.institution, p.phone, participantLink(p.token)]),
    ])
  }

  const cols = grouped ? 5 : 6
  const renderRow = (p: Participant, i: number) => (
    <tr key={p.id}>
                    <td className="muted">{i + 1}</td>
                    <td style={{ minWidth: 220 }}><b>{p.name}</b><RoleBadge role={p.role} /><div className="mono muted">{p.identifier ? `NIP ${p.identifier}` : '—'}</div></td>
                    <td style={{ minWidth: 170 }}>
                      {p.job_title ? <div>{p.job_title}</div> : <div className="muted">—</div>}
                      {p.grade && <div className="muted small">{p.grade}</div>}
                    </td>
                    {!grouped && <td style={{ minWidth: 140 }}>{p.institution ?? <span className="muted">—</span>}</td>}
                    <td className="nowrap mono">{p.phone ?? <span className="muted">—</span>}</td>
                    <td className="actions">
                      <div className="row tight" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                        <button className="btn sm" onClick={async () => toast((await copy(participantLink(p.token))) ? 'Link disalin.' : 'Gagal menyalin.', 'success')} aria-label="Salin link" title="Salin link"><Link2 size={15} /></button>
                        <button className="btn sm" onClick={() => setQr(p)} aria-label="Tampilkan QR" title="Tampilkan QR"><QrCode size={15} /></button>
                        <a className="btn sm" target="_blank" rel="noreferrer" aria-label="Kirim lewat WhatsApp"
                          href={`https://wa.me/${waNumber(p.phone) ?? ''}?text=${encodeURIComponent(waText(p))}`}
                          title={waNumber(p.phone) ? 'Kirim lewat WhatsApp' : 'No. WhatsApp kosong, pilih kontak sendiri'}><MessageCircle size={15} /></a>
                        <a className="btn sm" href={`/p/${p.token}`} target="_blank" rel="noreferrer" aria-label="Buka halaman peserta" title="Buka halaman peserta"><ExternalLink size={15} /></a>
                        <span style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} aria-hidden />
                        <button className="icon-btn" onClick={() => setEditing(p)} aria-label="Ubah" title="Ubah"><Pencil size={16} /></button>
                        <button className="icon-btn" onClick={() => void regenerate(p)} aria-label="Buat ulang link" title="Buat ulang link"><RefreshCcw size={16} /></button>
                        <button className="icon-btn danger" onClick={() => void remove(p)} aria-label="Hapus" title="Hapus"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
  )

  return (
    <>
      <div className="card flush no-print">
        <div className="toolbar">
          <div className="row">
            <label className="search"><Search size={16} /><input className="input" placeholder="Cari nama, NIP, jabatan, atau satuan kerja" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari peserta" /></label>
            <div className="pills" role="group" aria-label="Filter peran">
              {(['semua', ...ROLES] as const).map((r) => (
                <button key={r} className={`pill ${roleFilter === r ? 'active' : ''}`} onClick={() => setRoleFilter(r)}>
                  {r === 'semua' ? 'Semua' : ROLE_LABEL[r]} <span className="muted">{counts[r]}</span>
                </button>
              ))}
            </div>
            <SatkerControls groups={allGroups} total={data?.length ?? 0} unit={unit} setUnit={setUnit} grouped={grouped} setGrouped={setGrouped} />
            {grouped && groups.length > 1 && (
              <button className="btn ghost sm" onClick={() => setAll(collapsed.size ? null : groups.map((g) => g.key))}>
                {collapsed.size ? 'Buka semua' : 'Lipat semua'}
              </button>
            )}
          </div>
          <div className="row tight">
            <button className="btn sm" onClick={() => setOrdering(true)} disabled={!data?.length}><ArrowUpDown size={15} /> Atur urutan</button>
            <button className="btn sm" onClick={() => setExporting(true)} disabled={!data?.length}><FileDown size={15} /> Ekspor Word / PDF</button>
            <button className="btn sm" onClick={exportLinks} disabled={!data?.length}><Download size={15} /> Link (CSV)</button>
            <button className="btn sm" onClick={() => void printCards()} disabled={!data?.length}><Printer size={15} /> Kartu QR</button>
            <button className="btn sm" onClick={() => setBulk(true)}><ClipboardPaste size={15} /> Impor banyak</button>
            <button className="btn primary sm" onClick={() => setEditing({ ...EMPTY, role: roleFilter === 'semua' ? 'peserta' : roleFilter })}><Plus size={16} /> Tambah</button>
          </div>
        </div>

        {loading && <Loading />}
        {error && <div style={{ padding: 16 }}><ErrorBox error={error} onRetry={() => void reload()} /></div>}
        {!loading && !error && !data?.length && (
          <Empty icon={<Users size={26} />} title="Belum ada peserta, narasumber, atau panitia">Tambahkan satu per satu atau tempel daftar dari Excel.</Empty>
        )}
        {!!data?.length && (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>#</th><th>Nama &amp; NIP</th><th>Pangkat/Gol. &amp; jabatan</th>{!grouped && <th>Satuan kerja</th>}<th>WhatsApp</th><th className="actions">Link pribadi &amp; aksi</th></tr></thead>
              <tbody>
                {grouped
                  ? groups.map((g) => {
                      const full = allGroups.find((x) => x.key === g.key)
                      const isCollapsed = collapsed.has(g.key)
                      return (
                        <Fragment key={g.key || '__none__'}>
                          <SatkerGroupRow label={g.label} colSpan={cols} collapsed={isCollapsed} onToggle={() => toggle(g.key)}
                            meta={`${g.items.length} orang · ${roleSummary(g.items)}`}
                            actions={full && (
                              <button className="btn ghost sm" onClick={() => setRenaming({ label: g.label, ids: full.items.map((p) => p.id), none: g.key === '' })}>
                                <Building2 size={14} /> {g.key === '' ? 'Isi satuan kerja' : 'Ubah nama'}
                              </button>
                            )} />
                          {!isCollapsed && g.items.map((p, i) => renderRow(p, i))}
                        </Fragment>
                      )
                    })
                  : list.map((p, i) => renderRow(p, i))}
                {list.length === 0 && <tr><td colSpan={cols} className="center muted">Tidak ada hasil{q ? <> untuk "{q}"</> : ''}.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && <ParticipantForm institutions={[...new Set((data ?? []).map((p) => p.institution).filter((v): v is string => !!v))]} value={editing} activityId={activity.id} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(true) }} />}
      {ordering && data && <OrderModal activity={activity} people={data} onClose={() => setOrdering(false)}
        onSaved={() => { setOrdering(false); void reloadActivity(); void reload(true) }} />}
      {exporting && data && <ExportModal activity={activity} people={ordered} onClose={() => setExporting(false)}
        onOrder={() => { setExporting(false); setOrdering(true) }} />}
      {renaming && <RenameSatker target={renaming} others={allGroups.map((g) => g.label).filter((l) => l !== renaming.label)}
        onClose={() => setRenaming(null)} onSaved={() => { setRenaming(null); void reload(true) }} />}
      {bulk && <BulkImport activityId={activity.id} existing={data ?? []} onClose={() => setBulk(false)} onSaved={() => { setBulk(false); void reload(true) }} />}
      {qr && <QrModal p={qr} activityName={activity.name} onClose={() => setQr(null)} />}

      <div className="print-cards-wrap">
        {cards && (
          <div className="print-cards">
            {cards.map(({ p, img }) => (
              <div className="print-card" key={p.id}>
                <div style={{ fontWeight: 700 }}>{activity.name}</div>
                <img src={img} alt={`QR ${p.name}`} />
                <div style={{ fontSize: 15, fontWeight: 700 }}>{p.name}</div>
                {isStaff(p.role) && <div style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>{ROLE_LABEL[p.role]}</div>}
                <div>{[p.identifier && `NIP ${p.identifier}`, p.grade].filter(Boolean).join(' · ')}</div>
                <div>{roleLine(p)}</div>
                <div style={{ fontSize: 10, marginTop: 4 }}>{isStaff(p.role) ? 'Scan untuk absen' : 'Scan untuk absen & mengerjakan kuis'}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function ParticipantForm({ value, activityId, institutions, onClose, onSaved }: {
  value: Partial<Participant>; activityId: string; institutions: string[]; onClose: () => void; onSaved: () => void
}) {
  const toast = useToast()
  const [f, setF] = useState({
    name: value.name ?? '', identifier: value.identifier ?? '', grade: value.grade ?? '',
    job_title: value.job_title ?? '', institution: value.institution ?? '', phone: value.phone ?? '',
    role: (value.role ?? 'peserta') as PersonRole,
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
      institution: f.institution.trim() || null,
      phone: f.phone.trim() || null,
      role: f.role,
    }
    const { error } = value.id
      ? await supabase.from('participants').update(payload).eq('id', value.id)
      : await supabase.from('participants').insert({ ...payload, activity_id: activityId })
    setBusy(false)
    if (error) return toast(errMsg(error), 'error')
    toast(value.id ? 'Data diperbarui.' : `${ROLE_LABEL[f.role]} ditambahkan.`, 'success')
    onSaved()
  }

  return (
    <Modal wide title={value.id ? 'Ubah data' : 'Tambah peserta / narasumber / panitia'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Batal</button><button className="btn primary" form="pform" disabled={busy}>Simpan</button></>}>
      <form id="pform" onSubmit={submit}>
        <Field label="Peran" hint={ROLE_HINT[f.role]}>
          <div className="pills" role="radiogroup" aria-label="Peran">
            {ROLES.map((r) => (
              <button type="button" key={r} role="radio" aria-checked={f.role === r} className={`pill ${f.role === r ? 'active' : ''}`} onClick={() => setF({ ...f, role: r })}>{ROLE_LABEL[r]}</button>
            ))}
          </div>
        </Field>
        <Field label="Nama lengkap beserta gelar *" hint="Tulis lengkap dengan gelar, mis. Dr. Budi Santoso, S.Pd., M.Si.">
          <input className="input" required autoFocus value={f.name} onChange={set('name')} />
        </Field>
        <div className="form-grid">
          <Field label="NIP" hint="Spasi otomatis dihapus. Kosongkan jika tidak ada.">
            <input className="input mono" inputMode="numeric" value={f.identifier} onChange={set('identifier')} placeholder="18 digit" />
          </Field>
          <Field label="Pangkat / Gol. Ruang" hint="Pilih dari saran atau ketik sendiri (mis. golongan PPPK)">
            <input className="input" list="grade-list" value={f.grade} onChange={set('grade')} placeholder="mis. Penata Muda (III/a)" />
          </Field>
          <Field label="Jabatan"><input className="input" value={f.job_title} onChange={set('job_title')} placeholder="mis. Kepala Seksi Perencanaan" /></Field>
          <Field label="Satuan kerja"><input className="input" list="unit-list" value={f.institution} onChange={set('institution')} placeholder="mis. Dinas Pendidikan" /></Field>
          <Field label="No. WhatsApp" hint="Dipakai untuk tombol kirim link lewat WhatsApp">
            <input className="input" type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} placeholder="08xxxxxxxxxx" />
          </Field>
        </div>
        <datalist id="grade-list">{GRADE_SUGGESTIONS.map((g) => <option key={g} value={g} />)}</datalist>
        <datalist id="unit-list">{institutions.map((g) => <option key={g} value={g} />)}</datalist>
      </form>
    </Modal>
  )
}

function BulkImport({ activityId, existing, onClose, onSaved }: {
  activityId: string; existing: Participant[]; onClose: () => void; onSaved: () => void
}) {
  const toast = useToast()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [role, setRole] = useState<PersonRole>('peserta')
  const parsed = useMemo(() => parseParticipants(text, role), [text, role])
  const known = new Set(existing.map((p) => (p.identifier || p.name).toLowerCase()))
  const fresh = parsed.items.filter((i) => !known.has((i.identifier || i.name).toLowerCase()))
  const skipped = parsed.items.length - fresh.length

  async function save() {
    setBusy(true)
    const { error } = await supabase.from('participants').insert(fresh.map((i) => ({ ...i, activity_id: activityId })))
    setBusy(false)
    if (error) return toast(errMsg(error), 'error')
    toast(`${fresh.length} data ditambahkan.`, 'success')
    onSaved()
  }

  function downloadTemplate() {
    downloadCsv('templat-peserta', [
      ['Nama Lengkap & Gelar', 'NIP', 'Pangkat/Gol. Ruang', 'Jabatan', 'Satuan Kerja', 'No. WhatsApp', 'Peran'],
      ['Dr. Budi Santoso, M.Si.', '198001012005011001', 'Pembina (IV/a)', 'Kepala Bidang', 'Dinas Pendidikan', '081234567890', 'Peserta'],
      ['Prof. Dr. Ahmad Fauzi, M.A.', '', '', 'Guru Besar', 'Universitas Negeri', '081200000000', 'Narasumber'],
      ['Rina Marlina, S.E.', '199001012015012001', 'Penata Muda (III/a)', 'Staf Sekretariat', 'Dinas Pendidikan', '081211111111', 'Panitia'],
    ])
  }

  return (
    <Modal wide title="Impor banyak peserta / narasumber / panitia" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Batal</button>
        <button className="btn primary" disabled={busy || fresh.length === 0} onClick={() => void save()}>{busy ? 'Menyimpan…' : `Tambahkan ${fresh.length} orang`}</button></>}>
      <p className="muted small" style={{ whiteSpace: 'pre-line' }}>{PARTICIPANT_FORMAT_HELP}</p>
      <div className="row" style={{ marginBottom: 12 }}>
        <span className="label">Impor sebagai:</span>
        <div className="pills" role="radiogroup" aria-label="Peran bawaan impor">
          {ROLES.map((r) => (
            <button type="button" key={r} role="radio" aria-checked={role === r} className={`pill ${role === r ? 'active' : ''}`} onClick={() => setRole(r)}>{ROLE_LABEL[r]}</button>
          ))}
        </div>
        <span className="spacer" />
        <button className="btn sm" onClick={downloadTemplate}><Download size={14} /> Unduh templat (CSV)</button>
      </div>
      <textarea className="input mono" style={{ minHeight: 160, whiteSpace: 'pre' }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Tempel data dari Excel di sini…" autoFocus />
      {text.trim() && (
        <div style={{ marginTop: 14 }}>
          <div className="row tight">
            <span className="badge success">{fresh.length} siap diimpor</span>
            {skipped > 0 && <span className="badge warn">{skipped} sudah ada, dilewati</span>}
            {parsed.errors.length > 0 && <span className="badge danger">{parsed.errors.length} baris bermasalah</span>}
          </div>
          {parsed.errors.length > 0 && <ul className="small" style={{ color: 'var(--danger)', paddingLeft: 18 }}>{parsed.errors.slice(0, 8).map((e) => <li key={e}>{e}</li>)}</ul>}
          {fresh.length > 0 && (
            <div className="table-wrap" style={{ marginTop: 10, border: '1px solid var(--border)', borderRadius: 10 }}>
              <table className="table">
                <thead><tr><th>Nama</th><th>Peran</th><th>NIP</th><th>Pangkat/Gol.</th><th>Jabatan</th><th>Satuan kerja</th><th>WhatsApp</th></tr></thead>
                <tbody>{fresh.slice(0, 5).map((i, n) => (
                  <tr key={n}><td>{i.name}</td><td>{i.role === 'peserta' ? 'Peserta' : <RoleBadge role={i.role} style={{ marginLeft: 0 }} />}</td><td className="mono">{i.identifier ?? '—'}</td><td>{i.grade ?? '—'}</td><td>{i.job_title ?? '—'}</td><td>{i.institution ?? '—'}</td><td className="mono">{i.phone ?? '—'}</td></tr>
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
    const { error } = await supabase.from('participants').update({ institution: normSatker(name) || null }).in('id', target.ids)
    setBusy(false)
    if (error) return toast(errMsg(error), 'error')
    toast(`${target.ids.length} orang dipindahkan ke "${normSatker(name)}".`, 'success')
    onSaved()
  }

  return (
    <Modal title={target.none ? 'Isi satuan kerja' : 'Ubah nama satuan kerja'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Batal</button>
        <button className="btn primary" disabled={busy || !normSatker(name)} onClick={() => void save()}>{busy ? 'Menyimpan…' : 'Simpan'}</button></>}>
      <p className="muted">Berlaku untuk <b>{target.ids.length} orang</b> di kelompok <b>{target.label}</b>.</p>
      <Field label="Nama satuan kerja" hint="Ketik nama satuan kerja lain yang sudah ada untuk menggabungkan kelompok, atau pilih dari saran.">
        <input className="input" list="satker-others" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <datalist id="satker-others">{others.map((o) => <option key={o} value={o} />)}</datalist>
      {merging && <div className="alert info"><span>Nama ini sudah dipakai kelompok lain, jadi kedua kelompok akan <b>digabung</b>.</span></div>}
    </Modal>
  )
}

function QrModal({ p, activityName, onClose }: { p: Participant; activityName: string; onClose: () => void }) {
  const toast = useToast()
  const link = participantLink(p.token)
  const [img, setImg] = useState('')
  useEffect(() => { void QRCode.toDataURL(link, { margin: 2, width: 480 }).then(setImg) }, [link])
  return (
    <Modal title="QR link peserta" onClose={onClose}
      footer={<>
        <button className="btn" onClick={async () => toast((await copy(link)) ? 'Link disalin.' : 'Gagal menyalin.', 'success')}><Link2 size={16} /> Salin link</button>
        {img && <a className="btn primary" href={img} download={`qr-${safeName(p.name)}.png`}><Download size={16} /> Unduh PNG</a>}
      </>}>
      <div className="qr-card">
        <div className="muted small">{activityName}</div>
        <h3>{p.name}</h3>
        {img ? <img src={img} alt={`QR untuk ${p.name}`} /> : <Loading />}
        <p className="mono small" style={{ wordBreak: 'break-all' }}>{link}</p>
      </div>
    </Modal>
  )
}
