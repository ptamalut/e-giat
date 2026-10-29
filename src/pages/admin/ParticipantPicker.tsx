import { Contact, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Empty, ErrorBox, Field, Loading, Modal, useAsync, useToast } from '../../components/ui'
import { menuOn, type MenuKey } from '../../lib/menus'
import { ACCESS_KEYS, ACCESS_LABEL, defaultAccess, ROLE_HINT, ROLE_LABEL, ROLES, type Access } from '../../lib/people'
import { groupBySatker, matchesUnit, NONE_KEY } from '../../lib/satker'
import { errMsg, fetchAll, supabase } from '../../lib/supabase'
import type { Activity, Employee, Participant, PersonRole } from '../../lib/types'

const ACCESS_MENU: Record<keyof Access, MenuKey> = { access_attendance: 'attendance', access_quiz: 'quiz', access_certificate: 'certificate' }

/** Pilihan jenis (peserta/narasumber/panitia). */
function RolePills({ value, onChange }: { value: PersonRole; onChange: (r: PersonRole) => void }) {
  return (
    <div className="pills" role="radiogroup" aria-label="Jenis">
      {ROLES.map((r) => (
        <button type="button" key={r} role="radio" aria-checked={value === r} className={`pill ${value === r ? 'active' : ''}`} onClick={() => onChange(r)}>{ROLE_LABEL[r]}</button>
      ))}
    </div>
  )
}

/** Tiga kotak hak akses menu; menu yang dinonaktifkan di kegiatan ditandai. */
function AccessChecks({ activity, value, onChange }: { activity: Activity; value: Access; onChange: (a: Access) => void }) {
  return (
    <div>
      {ACCESS_KEYS.map((k) => {
        const on = menuOn(activity, ACCESS_MENU[k])
        return (
          <Check key={k} label={ACCESS_LABEL[k]} checked={value[k]} onChange={(v) => onChange({ ...value, [k]: v })}
            hint={on ? undefined : `Menu ${ACCESS_LABEL[k]} sedang dinonaktifkan untuk kegiatan ini, jadi belum berlaku.`} />
        )
      })}
    </div>
  )
}

/** Tambah peserta kegiatan dengan memilih dari data pegawai. */
export function PickEmployees({ activity, taken, onClose, onSaved }: {
  activity: Activity; taken: Set<string>; onClose: () => void; onSaved: () => void
}) {
  const toast = useToast()
  const [q, setQ] = useState('')
  const [unit, setUnit] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [role, setRole] = useState<PersonRole>('peserta')
  const [access, setAccess] = useState<Access>(defaultAccess('peserta'))
  const [busy, setBusy] = useState(false)

  const { data, error, loading, reload } = useAsync(
    () => fetchAll<Employee>((a, b) => supabase.from('employees').select('*').order('name').order('id').range(a, b)), [])
  const all = data ?? []
  const allGroups = useMemo(() => groupBySatker(all, (e) => e.institution), [all])
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return all.filter((e) => matchesUnit(unit, e.institution) && (!s || [e.name, e.identifier, e.job_title, e.institution].some((v) => v?.toLowerCase().includes(s))))
  }, [all, q, unit])
  const groups = useMemo(() => groupBySatker(list, (e) => e.institution), [list])

  const selectable = (e: Employee) => !taken.has(e.id)
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const toggleGroup = (items: Employee[]) => setPicked((s) => {
    const ids = items.filter(selectable).map((e) => e.id)
    const n = new Set(s)
    if (ids.every((id) => n.has(id))) ids.forEach((id) => n.delete(id)); else ids.forEach((id) => n.add(id))
    return n
  })

  async function save() {
    const chosen = all.filter((e) => picked.has(e.id) && selectable(e))
    if (!chosen.length) return
    setBusy(true)
    const { error } = await supabase.from('participants').insert(chosen.map((e) => ({
      activity_id: activity.id, employee_id: e.id, name: e.name, identifier: e.identifier, grade: e.grade,
      job_title: e.job_title, institution: e.institution, phone: e.phone, role, ...access,
    })))
    setBusy(false)
    if (error) return toast(errMsg(error), 'error')
    toast(`${chosen.length} orang ditambahkan sebagai ${ROLE_LABEL[role].toLowerCase()}.`, 'success')
    onSaved()
  }

  const n = [...picked].filter((id) => all.some((e) => e.id === id && selectable(e))).length

  return (
    <Modal wide title="Tambah dari data pegawai" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Batal</button>
        <button className="btn primary" disabled={busy || n === 0} onClick={() => void save()}>{busy ? 'Menyimpan…' : `Tambahkan ${n} orang`}</button></>}>
      {loading && !data && <Loading />}
      {error && <ErrorBox error={error} onRetry={() => void reload()} />}
      {data && !all.length && (
        <Empty icon={<Contact size={26} />} title="Data pegawai masih kosong">
          Peserta kegiatan dipilih dari data pegawai. <Link to="/admin/pegawai">Isi data pegawai</Link> terlebih dahulu.
        </Empty>
      )}
      {!!all.length && (
        <>
          <div className="row" style={{ marginBottom: 10 }}>
            <label className="search"><Search size={16} /><input className="input" placeholder="Cari nama, NIP, atau jabatan" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari pegawai" autoFocus /></label>
            <select className="input" style={{ width: 240 }} value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Filter satuan kerja">
              <option value="">Semua satuan kerja ({all.length})</option>
              {allGroups.map((g) => <option key={g.key || NONE_KEY} value={g.key || NONE_KEY}>{g.label} ({g.items.length})</option>)}
            </select>
          </div>

          <div className="picker" role="group" aria-label="Daftar pegawai">
            {groups.map((g) => {
              const free = g.items.filter(selectable)
              const allOn = free.length > 0 && free.every((e) => picked.has(e.id))
              return (
                <div key={g.key || '__none__'}>
                  <label className="picker-head">
                    <input type="checkbox" checked={allOn} disabled={!free.length} onChange={() => toggleGroup(g.items)} aria-label={`Pilih semua di ${g.label}`} />
                    <b>{g.label}</b><span className="muted small">{g.items.length} pegawai{free.length < g.items.length ? ` · ${g.items.length - free.length} sudah di kegiatan ini` : ''}</span>
                  </label>
                  {g.items.map((e) => (
                    <label key={e.id} className={`picker-row ${selectable(e) ? '' : 'off'}`}>
                      <input type="checkbox" checked={picked.has(e.id) || !selectable(e)} disabled={!selectable(e)} onChange={() => toggle(e.id)} aria-label={e.name} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <b>{e.name}</b>
                        <span className="muted small" style={{ display: 'block' }}>{[e.identifier && `NIP ${e.identifier}`, e.job_title].filter(Boolean).join(' · ') || '—'}</span>
                      </span>
                      {!selectable(e) && <span className="badge">sudah menjadi peserta</span>}
                    </label>
                  ))}
                </div>
              )
            })}
            {list.length === 0 && <p className="muted center" style={{ padding: 16 }}>Tidak ada hasil.</p>}
          </div>

          <div className="picker-settings">
            <Field label={`Jenis untuk ${n || 'yang dipilih'} orang`} hint={ROLE_HINT[role]}>
              <RolePills value={role} onChange={(r) => { setRole(r); setAccess(defaultAccess(r)) }} />
            </Field>
            <Field label="Hak akses menu" hint="Menu yang boleh dipakai orang-orang ini lewat link pribadinya. Bisa diubah lagi per orang.">
              <AccessChecks activity={activity} value={access} onChange={setAccess} />
            </Field>
          </div>
        </>
      )}
    </Modal>
  )
}

type Tri = 'keep' | 'on' | 'off'

/** Ubah jenis dan hak akses menu: satu orang (kotak centang) atau banyak orang (pilihan "tidak diubah"). */
export function AccessModal({ activity, people, onClose, onSaved }: {
  activity: Activity; people: Participant[]; onClose: () => void; onSaved: () => void
}) {
  const toast = useToast()
  const bulk = people.length > 1
  const one = people[0]
  const [role, setRole] = useState<PersonRole | 'keep'>(bulk ? 'keep' : one.role)
  const [access, setAccess] = useState<Access>({ access_attendance: one.access_attendance, access_quiz: one.access_quiz, access_certificate: one.access_certificate })
  const [tri, setTri] = useState<Record<keyof Access, Tri>>({ access_attendance: 'keep', access_quiz: 'keep', access_certificate: 'keep' })
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    const patch: Record<string, unknown> = {}
    if (role !== 'keep') patch.role = role
    for (const k of ACCESS_KEYS) {
      if (bulk) { if (tri[k] !== 'keep') patch[k] = tri[k] === 'on' } else patch[k] = access[k]
    }
    if (!Object.keys(patch).length) { setBusy(false); return onClose() }
    const { error } = await supabase.from('participants').update(patch).in('id', people.map((p) => p.id))
    setBusy(false)
    if (error) return toast(errMsg(error), 'error')
    toast(bulk ? `${people.length} orang diperbarui.` : 'Jenis dan hak akses disimpan.', 'success')
    onSaved()
  }

  return (
    <Modal title={bulk ? `Atur jenis & hak akses (${people.length} orang)` : `Jenis & hak akses: ${one.name}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Batal</button><button className="btn primary" disabled={busy} onClick={() => void save()}>{busy ? 'Menyimpan…' : 'Simpan'}</button></>}>
      {!bulk && <p className="muted small" style={{ marginTop: 0 }}>Data diri (nama, NIP, jabatan, satuan kerja) diubah di <Link to="/admin/pegawai">Data pegawai</Link>.</p>}
      <Field label="Jenis" hint={role === 'keep' ? 'Jenis tidak diubah.' : ROLE_HINT[role]}>
        {bulk && (
          <div className="pills" style={{ marginBottom: 8 }}>
            <button type="button" className={`pill ${role === 'keep' ? 'active' : ''}`} onClick={() => setRole('keep')}>Tidak diubah</button>
          </div>
        )}
        <RolePills value={role === 'keep' ? ('' as PersonRole) : role} onChange={(r) => {
          setRole(r)
          if (!bulk) setAccess(defaultAccess(r)) // jenis baru = isian awal baru (boleh diubah lagi)
        }} />
      </Field>
      <Field label="Hak akses menu" hint={bulk ? 'Pilih "Tidak diubah" untuk membiarkan pengaturan masing-masing orang.' : 'Menu yang boleh dipakai lewat link pribadinya.'}>
        {bulk
          ? ACCESS_KEYS.map((k) => (
            <div className="row between" key={k} style={{ marginBottom: 8 }}>
              <span>{ACCESS_LABEL[k]}{menuOn(activity, ACCESS_MENU[k]) ? '' : <span className="muted small"> (menu nonaktif)</span>}</span>
              <select className="input" style={{ width: 160 }} value={tri[k]} onChange={(e) => setTri({ ...tri, [k]: e.target.value as Tri })} aria-label={ACCESS_LABEL[k]}>
                <option value="keep">Tidak diubah</option><option value="on">Aktif</option><option value="off">Nonaktif</option>
              </select>
            </div>
          ))
          : <AccessChecks activity={activity} value={access} onChange={setAccess} />}
      </Field>
    </Modal>
  )
}
