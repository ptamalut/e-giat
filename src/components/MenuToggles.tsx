import { Award, BookOpen, CalendarCheck, Check, ClipboardList, Images, NotebookPen, type LucideIcon } from 'lucide-react'
import type { MenuDef, MenuKey } from '../lib/menus'

export const MENU_ICONS: Record<MenuKey, LucideIcon> = {
  attendance: CalendarCheck, materials: BookOpen, notes: NotebookPen, quiz: ClipboardList, certificate: Award, documentation: Images,
}

/** Menu kegiatan sebagai kartu dengan sakelar (aktif/nonaktif). */
export function MenuCards({ menus, isOn, onToggle, busyKey }: {
  menus: readonly MenuDef[]; isOn: (m: MenuDef) => boolean; onToggle: (m: MenuDef, on: boolean) => void; busyKey?: string | null
}) {
  return (
    <div className="menu-cards" role="group" aria-label="Menu kegiatan">
      {menus.map((m) => {
        const Icon = MENU_ICONS[m.key]
        const on = isOn(m)
        return (
          <label key={m.key} className={`menu-card ${on ? 'on' : ''} ${busyKey === m.key ? 'busy' : ''}`} title={m.hint}>
            <input type="checkbox" role="switch" className="sr-only" name={m.flag} checked={on} onChange={(e) => onToggle(m, e.target.checked)} aria-label={m.label} />
            <span className="mc-ico"><Icon size={18} /></span>
            <span className="mc-body"><b>{m.label}</b><small>{m.short}</small></span>
            <span className="mc-switch" aria-hidden />
          </label>
        )
      })}
    </div>
  )
}

/** Hak akses menu per orang sebagai chip yang bisa dinyalakan/dimatikan. */
export function AccessChips<K extends string>({ menus, value, onChange }: {
  menus: readonly MenuDef[]; value: Record<K, boolean>; onChange: (v: Record<K, boolean>) => void
}) {
  return (
    <div className="chip-toggles" role="group" aria-label="Hak akses menu">
      {menus.map((m) => {
        const Icon = MENU_ICONS[m.key]
        const on = !!value[m.access as unknown as K]
        return (
          <label key={m.key} className={`chip-toggle ${on ? 'on' : ''}`} title={m.hint}>
            <input type="checkbox" className="sr-only" checked={on} onChange={(e) => onChange({ ...value, [m.access]: e.target.checked })} aria-label={m.label} />
            <Icon size={15} />{m.label}{on && <Check size={14} strokeWidth={3} />}
          </label>
        )
      })}
    </div>
  )
}
