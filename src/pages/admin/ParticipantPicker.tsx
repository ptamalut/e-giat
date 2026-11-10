import { ArrowLeft, ArrowRight, Contact, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AccessChips, MENU_ICONS } from '../../components/MenuToggles'
import Stepper from '../../components/Stepper'
import { Empty, ErrorBox, Field, Loading, Modal, useAsync, useToast } from '../../components/ui'
import { activeMenus, type MenuDef } from '../../lib/menus'
import { employeeRanks } from '../../lib/employeeOrder'
import { ACCESS_KEYS, defaultAccessFor, rolesForJenis, rolesOf, ROLE_HINT, ROLE_LABEL, sortRoles, type Access } from '../../lib/people'
import { groupBySatker, matchesUnit, NONE_KEY, sortPeople } from '../../lib/satker'
import { errMsg, fetchAll, supabase } from '../../lib/supabase'
import type { Activity, Employee, Participant, PersonRole } from '../../lib/types'

/** Pilihan jenis menurut jenis kegiatan. Boleh lebih dari satu (merangkap); minimal satu. */
function RolePills({ roles, value, onChange, keep }: { roles: readonly PersonRole[]; value: PersonRole[]; onChange: (r: PersonRole[]) => void; keep?: { active: boolean; onSelect: () => void } }) {
  const toggle = (r: PersonRole) => {
    if (value.includes(r)) { if (value.length > 1) onChange(sortRoles(value.filter((x) => x !== r))) } else onChange(sortRoles([...value, r]))
  }
  return (
    <div className="pills" role="group" aria-label="Jenis">
      {keep && <button type="button" aria-pressed={keep.active} className={`pill ${keep.active ? 'active' : ''}`} onClick={keep.onSelect}>Tidak diubah</button>}
      {roles.map((r) => (
        <button type="button" key={r} aria-pressed={value.includes(r)} className={`pill ${value.includes(r) ? 'active' : ''}`} onClick={() => toggle(r)}>{ROLE_LABEL[r]}</button>
      ))}
    </div>
  )
}

const roleHint = (rs: PersonRole[]) => (rs.length > 1
  ? 'Merangkap: bisa dipilih berperan sebagai apa pada tiap sesi absensi. Hak akses menu menggabungkan bawaan tiap jenis.'
  : ROLE_HINT[rs[0]])

/** Hak akses menu: hanya menu yang aktif pada kegiatan (sama dengan daftar di Ringkasan → Menu kegiatan). */
function AccessChecks({ activity, value, onChange }: { activity: Activity; value: Access; onChange: (a: Access) => void }) {
  const menus = activeMenus(activity)
  if (!menus.length) return <p className="muted small">Belum ada menu yang diaktifkan untuk kegiatan ini.</p>
  return <AccessChips menus={menus} value={value} onChange={onChange} />
}

/** Tambah peserta kegiatan dengan memilih dari data pegawai. */
export function PickEmployees({ activity, taken, onClose, onSaved }: {
  activity: Activity; taken: Set<string>; onClose: () => void; onSaved: () => void
}) {
  const toast = useToast()
  const [q, setQ] = useState('')
  const [unit, setUnit] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [roles, setRoles] = useState<PersonRole[]>(['peserta'])
  const [access, setAccess] = useState<Access>(defaultAccessFor(['peserta']))
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState(0)

  // urutan yang diatur di Data pegawai dipakai juga di sini
  const { data, error, loading, reload } = useAsync(async () => {
    const [employees, settings] = await Promise.all([
      fetchAll<Employee>((a, b) => supabase.from('employees').select('*').order('name').order('id').range(a, b)),
      supabase.from('employee_settings').select('satker_order').maybeSingle(),
    ])
    return { employees: sortPeople(employees), satkerOrder: (settings.data as { satker_order: string[] | null } | null)?.satker_order ?? null }
  }, [])
  const all = data?.employees ?? []
  const satkerOrder = data?.satkerOrder ?? null
  const allGroups = useMemo(() => groupBySatker(all, (e) => e.institution, satkerOrder), [all, satkerOrder])
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return all.filter((e) => matchesUnit(unit, e.institution) && (!s || [e.name, e.identifier, e.job_title, e.institution].some((v) => v?.toLowerCase().includes(s))))
  }, [all, q, unit])
  const groups = useMemo(() => groupBySatker(list, (e) => e.institution, satkerOrder), [list, satkerOrder])

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
    // urutan peserta mengikuti Data pegawai: sort_order = peringkat pegawai (urutan satker disalin bila kegiatan belum punya urutan sendiri)
    const ranks = employeeRanks(all)
    const { error } = await supabase.from('participants').insert(chosen.map((e) => ({
      activity_id: activity.id, employee_id: e.id, name: e.name, identifier: e.identifier, grade: e.grade,
      job_title: e.job_title, institution: e.institution, phone: e.phone, role: roles[0], roles, ...access,
      sort_order: ranks.get(e.id) ?? null,
    })))
    if (!error && !activity.satker_order && satkerOrder) {
      await supabase.from('activities').update({ satker_order: satkerOrder }).eq('id', activity.id)
    }
    setBusy(false)
    if (error) return toast(errMsg(error), 'error')
    toast(`${chosen.length} orang ditambahkan sebagai ${roles.map((r) => ROLE_LABEL[r].toLowerCase()).join(' + ')}.`, 'success')
    onSaved()
  }

  const n = [...picked].filter((id) => all.some((e) => e.id === id && selectable(e))).length
  const chosenList = all.filter((e) => picked.has(e.id) && selectable(e))
  const visibleFree = list.filter(selectable)
  const allVisiblePicked = visibleFree.length > 0 && visibleFree.every((e) => picked.has(e.id))
  const toggleVisible = () => setPicked((cur) => { const nx = new Set(cur); if (allVisiblePicked) visibleFree.forEach((e) => nx.delete(e.id)); else visibleFree.forEach((e) => nx.add(e.id)); return nx })

  return (
    <Modal wide title="Tambah dari data pegawai" onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Batal</button>
        <span className="spacer" />
        {step === 1 && <button className="btn" onClick={() => setStep(0)} disabled={busy}><ArrowLeft size={15} /> Kembali</button>}
        {step === 0
          ? <button className="btn primary" disabled={n === 0} onClick={() => setStep(1)}>{n ? `Lanjut: atur ${n} orang` : 'Pilih pegawai dulu'} {n > 0 && <ArrowRight size={15} />}</button>
          : <button className="btn primary" disabled={busy || n === 0} onClick={() => void save()}>{busy ? 'Menyimpan…' : `Tambahkan ${n} orang`}</button>}
      </>}>
      {loading && !data && <Loading />}
      {error && <ErrorBox error={error} onRetry={() => void reload()} />}
      {data && !all.length && (
        <Empty icon={<Contact size={26} />} title="Data pegawai masih kosong">
          Peserta kegiatan dipilih dari data pegawai. <Link to="/admin/pegawai">Isi data pegawai</Link> terlebih dahulu.
        </Empty>
      )}
      {!!all.length && (
        <>
          <Stepper steps={['Pilih pegawai', 'Jenis & hak akses']} current={step} />

          {step === 0 && <>
            <div className="row" style={{ marginBottom: 10 }}>
              <label className="search"><Search size={16} /><input className="input" placeholder="Cari nama, NIP, atau jabatan" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari pegawai" autoFocus /></label>
              <select className="input" style={{ width: 240 }} value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Filter satuan kerja">
                <option value="">Semua satuan kerja ({all.length})</option>
                {allGroups.map((g) => <option key={g.key || NONE_KEY} value={g.key || NONE_KEY}>{g.label} ({g.items.length})</option>)}
              </select>
            </div>
            <div className="pick-bar">
              <span className={`badge ${n ? 'primary' : ''}`} aria-live="polite">{n} dipilih</span>
              <button type="button" className="btn ghost sm" disabled={!visibleFree.length} onClick={toggleVisible}>{allVisiblePicked ? 'Batalkan pilihan hasil ini' : `Pilih semua hasil (${visibleFree.length})`}</button>
              {n > 0 && <button type="button" className="btn ghost sm" onClick={() => setPicked(new Set())}>Kosongkan</button>}
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
          </>}

          {step === 1 && <>
            <div className="callout" style={{ marginBottom: 16 }}>
              <b>{n} orang akan ditambahkan</b>
              <span className="muted small">{chosenList.slice(0, 4).map((e) => e.name).join(', ')}{chosenList.length > 4 ? `, dan ${chosenList.length - 4} lainnya` : ''}</span>
              <button type="button" className="btn ghost sm" style={{ justifySelf: 'start', marginTop: 4 }} onClick={() => setStep(0)}>Ubah pilihan</button>
            </div>
            <Field label="Jenis" hint={roleHint(roles)}>
              <RolePills roles={rolesForJenis(activity.jenis)} value={roles} onChange={(r) => { setRoles(r); setAccess(defaultAccessFor(r)) }} />
            </Field>
            <Field label="Hak akses menu" hint="Menu yang boleh dipakai lewat link pribadinya. Terisi otomatis menurut jenis; bisa diubah di sini dan lagi per orang nanti.">
              <AccessChecks activity={activity} value={access} onChange={setAccess} />
            </Field>
          </>}
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
  const [roles, setRoles] = useState<PersonRole[] | 'keep'>(bulk ? 'keep' : rolesOf(one))
  const menus = activeMenus(activity)
  const [access, setAccess] = useState<Access>(() => Object.fromEntries(ACCESS_KEYS.map((k) => [k, one[k]])) as unknown as Access)
  const [tri, setTri] = useState<Record<string, Tri>>({})
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    const patch: Record<string, unknown> = {}
    if (roles !== 'keep') { patch.roles = roles; patch.role = roles[0] }
    // hanya menu yang aktif di kegiatan yang diatur; menu nonaktif dibiarkan seperti semula
    for (const m of menus) {
      const t = tri[m.access] ?? 'keep'
      if (bulk) { if (t !== 'keep') patch[m.access] = t === 'on' } else patch[m.access] = access[m.access]
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
      <Field label="Jenis" hint={roles === 'keep' ? 'Jenis tidak diubah.' : roleHint(roles)}>
        <RolePills roles={rolesForJenis(activity.jenis)} value={roles === 'keep' ? [] : roles} keep={bulk ? { active: roles === 'keep', onSelect: () => setRoles('keep') } : undefined} onChange={(r) => {
          setRoles(r)
          if (!bulk) setAccess((cur) => ({ ...cur, ...Object.fromEntries(menus.map((m) => [m.access, defaultAccessFor(r)[m.access]])) })) // jenis baru = isian awal baru untuk menu aktif (boleh diubah lagi)
        }} />
      </Field>
      <Field label="Hak akses menu" hint={bulk ? 'Pilih "Tidak diubah" untuk membiarkan pengaturan masing-masing orang.' : 'Menu yang boleh dipakai lewat link pribadinya.'}>
        {bulk
          ? <div className="tri-list">{menus.map((m: MenuDef) => {
            const Icon = MENU_ICONS[m.key]
            const cur = tri[m.access] ?? 'keep'
            return (
              <div className="tri-row" key={m.key}>
                <span className="tri-name"><Icon size={16} /> {m.label}</span>
                <div className="pills" role="radiogroup" aria-label={m.label}>
                  {([['keep', 'Tidak diubah'], ['on', 'Aktif'], ['off', 'Nonaktif']] as const).map(([v, l]) => (
                    <button type="button" key={v} role="radio" aria-checked={cur === v} className={`pill ${cur === v ? 'active' : ''}`} onClick={() => setTri({ ...tri, [m.access]: v })}>{l}</button>
                  ))}
                </div>
              </div>
            )
          })}</div>
          : <AccessChecks activity={activity} value={access} onChange={setAccess} />}
      </Field>
    </Modal>
  )
}
