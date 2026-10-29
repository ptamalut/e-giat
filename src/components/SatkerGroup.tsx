import { Building2, ChevronDown, ChevronRight, ListFilter } from 'lucide-react'
import { useCallback, useState, type ReactNode } from 'react'
import { NONE_KEY, type SatkerGroup } from '../lib/satker'

/** Baris judul kelompok satuan kerja di dalam <tbody>. */
export function SatkerGroupRow({ label, colSpan, collapsed, onToggle, meta, actions }: {
  label: string; colSpan: number; collapsed: boolean; onToggle: () => void; meta?: ReactNode; actions?: ReactNode
}) {
  return (
    <tr className="group-row">
      <td colSpan={colSpan}>
        <div className="group-head">
          <button type="button" className="icon-btn" onClick={onToggle} aria-expanded={!collapsed} aria-label={`${collapsed ? 'Buka' : 'Lipat'} ${label}`}>
            {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          </button>
          <Building2 size={16} className="muted" />
          <b>{label}</b>
          {meta && <span className="muted small">{meta}</span>}
          <span className="spacer" />
          {actions}
        </div>
      </td>
    </tr>
  )
}

/** Himpunan kunci kelompok yang sedang dilipat. */
export function useCollapsed() {
  const [set, setSet] = useState<Set<string>>(new Set())
  const toggle = useCallback((key: string) => setSet((s) => {
    const n = new Set(s)
    if (n.has(key)) n.delete(key); else n.add(key)
    return n
  }), [])
  const setAll = useCallback((keys: string[] | null) => setSet(new Set(keys ?? [])), [])
  return { collapsed: set, toggle, setAll }
}

/** Filter satuan kerja + pilihan tampilan (per satker / daftar). */
export function SatkerControls<T>({ groups, total, unit, setUnit, grouped, setGrouped }: {
  groups: SatkerGroup<T>[]; total: number; unit: string; setUnit: (v: string) => void; grouped: boolean; setGrouped: (v: boolean) => void
}) {
  return (
    <>
      <label className="search" title="Filter satuan kerja">
        <ListFilter size={16} />
        <select className="input" style={{ paddingLeft: 34, width: 240 }} value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Filter satuan kerja">
          <option value="">Semua satuan kerja ({total})</option>
          {groups.map((g) => <option key={g.key || NONE_KEY} value={g.key || NONE_KEY}>{g.label} ({g.items.length})</option>)}
        </select>
      </label>
      <div className="pills" role="group" aria-label="Tampilan">
        <button className={`pill ${grouped ? 'active' : ''}`} onClick={() => setGrouped(true)}>Per satker</button>
        <button className={`pill ${!grouped ? 'active' : ''}`} onClick={() => setGrouped(false)}>Daftar</button>
      </div>
    </>
  )
}
