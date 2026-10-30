import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { RoleBadges } from '../../components/RoleBadge'
import { ROLE_LABEL, ROLES, rolesOf } from '../../lib/people'
import { groupBySatker, matchesUnit, NONE_KEY } from '../../lib/satker'
import type { Participant, PersonRole } from '../../lib/types'

/** Pilihan jenis pada sebuah sesi; '' = tidak ikut sesi ini. */
export type Assign = Record<string, PersonRole | ''>

/** Isian awal: semua orang ikut dengan jenisnya di kegiatan. */
export const defaultAssign = (people: readonly Pick<Participant, 'id' | 'role'>[]): Assign =>
  Object.fromEntries(people.map((p) => [p.id, p.role]))

/** Hitungan per jenis (dan yang tidak ikut) untuk ringkasan. */
export function assignSummary(people: readonly Pick<Participant, 'id'>[], a: Assign): { counts: Record<PersonRole, number>; out: number } {
  const counts: Record<PersonRole, number> = { peserta: 0, narasumber: 0, moderator: 0, panitia: 0 }
  let out = 0
  for (const p of people) { const r = a[p.id]; if (r) counts[r]++; else out++ }
  return { counts, out }
}

export const summaryText = (counts: Record<PersonRole, number>) =>
  ROLES.filter((r) => counts[r] > 0).map((r) => `${counts[r]} ${ROLE_LABEL[r].toLowerCase()}`).join(' · ')

const OPTIONS: { value: PersonRole | ''; label: string }[] = [...ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] })), { value: '', label: 'Tidak ikut' }]

/** Pilihan kedudukan satu orang: bila merangkap, jenis yang dipegangnya ditampilkan lebih dulu. */
function PersonOptions({ p }: { p: Participant }) {
  const own = rolesOf(p)
  if (own.length < 2) return <>{OPTIONS.map((o) => <option key={o.label} value={o.value}>{o.label}</option>)}</>
  return (
    <>
      <optgroup label="Merangkap sebagai">{own.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</optgroup>
      <optgroup label="Lainnya">
        {ROLES.filter((r) => !own.includes(r)).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        <option value="">Tidak ikut</option>
      </optgroup>
    </>
  )
}

/** Tentukan siapa yang ikut sebuah sesi dan sebagai apa (peserta, narasumber, moderator, panitia). */
export default function MembersEditor({ people, assign, onChange, satkerOrder }: {
  people: Participant[]; assign: Assign; onChange: (a: Assign) => void; satkerOrder: readonly string[] | null
}) {
  const [q, setQ] = useState('')
  const [unit, setUnit] = useState('')
  const allGroups = useMemo(() => groupBySatker(people, (p) => p.institution, satkerOrder), [people, satkerOrder])
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return people.filter((p) => matchesUnit(unit, p.institution) && (!s || [p.name, p.identifier, p.job_title, p.institution].some((v) => v?.toLowerCase().includes(s))))
  }, [people, q, unit])
  const groups = useMemo(() => groupBySatker(list, (p) => p.institution, satkerOrder), [list, satkerOrder])
  const { counts, out } = assignSummary(people, assign)

  const setMany = (items: readonly Participant[], v: PersonRole | '') => {
    const next = { ...assign }
    for (const p of items) next[p.id] = v
    onChange(next)
  }

  return (
    <div className="members-editor">
      <div className="row tight" style={{ marginBottom: 8 }}>
        {ROLES.map((r) => <span key={r} className="badge">{ROLE_LABEL[r]} {counts[r]}</span>)}
        <span className="badge">Tidak ikut {out}</span>
        <span className="spacer" />
        <button type="button" className="btn ghost sm" onClick={() => onChange(Object.fromEntries(people.map((p) => [p.id, p.role])))}>Samakan dengan jenis di kegiatan</button>
        <button type="button" className="btn ghost sm" onClick={() => setMany(people, '')}>Kosongkan semua</button>
      </div>
      <div className="row" style={{ marginBottom: 8 }}>
        <label className="search"><Search size={16} /><input className="input" placeholder="Cari nama, NIP, atau jabatan" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari orang" /></label>
        <select className="input" style={{ width: 220 }} value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Filter satuan kerja">
          <option value="">Semua satuan kerja ({people.length})</option>
          {allGroups.map((g) => <option key={g.key || NONE_KEY} value={g.key || NONE_KEY}>{g.label} ({g.items.length})</option>)}
        </select>
      </div>

      <div className="picker" role="group" aria-label="Anggota sesi">
        {groups.map((g) => (
          <div key={g.key || '__none__'}>
            <div className="picker-head">
              <b style={{ flex: 1 }}>{g.label} <span className="muted small" style={{ fontWeight: 400 }}>· {g.items.length} orang</span></b>
              <select className="input" style={{ width: 150, minHeight: 30, padding: '2px 8px' }} value="" aria-label={`Atur semua di ${g.label}`}
                onChange={(e) => { if (e.target.value !== '') setMany(g.items, e.target.value === '__out' ? '' : (e.target.value as PersonRole)) }}>
                <option value="">Atur semua…</option>
                {OPTIONS.map((o) => <option key={o.label} value={o.value === '' ? '__out' : o.value}>{o.label}</option>)}
              </select>
            </div>
            {g.items.map((p) => (
              <div key={p.id} className={`picker-row ${assign[p.id] ? '' : 'off'}`} style={{ cursor: 'default' }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b>{p.name}</b><RoleBadges roles={rolesOf(p)} />
                  <span className="muted small" style={{ display: 'block' }}>{[p.identifier && `NIP ${p.identifier}`, p.job_title].filter(Boolean).join(' · ') || '—'}</span>
                </span>
                <select className="input" style={{ width: 140, minHeight: 32, padding: '4px 8px' }} value={assign[p.id] ?? ''} aria-label={`Jenis ${p.name} pada sesi ini`}
                  onChange={(e) => onChange({ ...assign, [p.id]: e.target.value as PersonRole | '' })}>
                  <PersonOptions p={p} />
                </select>
              </div>
            ))}
          </div>
        ))}
        {list.length === 0 && <p className="muted center" style={{ padding: 16 }}>Tidak ada hasil.</p>}
      </div>
    </div>
  )
}
