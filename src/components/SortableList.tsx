import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { moveItem } from '../lib/satker'

export interface SortCtx {
  index: number
  isFirst: boolean
  isLast: boolean
  /** ikon pegangan untuk menyeret (desktop) */
  handle: ReactNode
  /** tombol naik/turun untuk layar sentuh dan papan ketik */
  buttons: ReactNode
}

/**
 * Daftar yang urutannya bisa diubah dengan menyeret pegangan atau memakai tombol naik/turun.
 * Memakai drag-and-drop bawaan browser; tombol tetap tersedia untuk HP dan aksesibilitas.
 */
export function SortableList<T>({ items, getKey, onChange, renderItem, label }: {
  items: readonly T[]
  getKey: (t: T) => string
  onChange: (items: T[]) => void
  renderItem: (item: T, ctx: SortCtx) => ReactNode
  label: string
}) {
  const [drag, setDrag] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const end = () => { setDrag(null); setOver(null) }

  return (
    <div className="sort-list" role="list" aria-label={label}>
      {items.map((item, i) => {
        const key = getKey(item)
        const ctx: SortCtx = {
          index: i,
          isFirst: i === 0,
          isLast: i === items.length - 1,
          handle: (
            <span
              className="grip" draggable aria-hidden title="Seret untuk memindahkan"
              onDragStart={(e) => {
                setDrag(i)
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', key)
                const row = e.currentTarget.closest('[data-sort-row]')
                if (row) e.dataTransfer.setDragImage(row, 16, 16)
              }}
              onDragEnd={end}
            ><GripVertical size={16} /></span>
          ),
          buttons: (
            <span className="row tight" style={{ flexWrap: 'nowrap' }}>
              <button type="button" className="icon-btn" disabled={i === 0} onClick={() => onChange(moveItem(items, i, i - 1))} aria-label="Naikkan" title="Naikkan"><ArrowUp size={16} /></button>
              <button type="button" className="icon-btn" disabled={i === items.length - 1} onClick={() => onChange(moveItem(items, i, i + 1))} aria-label="Turunkan" title="Turunkan"><ArrowDown size={16} /></button>
            </span>
          ),
        }
        return (
          <div
            key={key} role="listitem" data-sort-row
            className={`sort-row ${drag === i ? 'dragging' : ''} ${over === i && drag !== null && drag !== i ? 'over' : ''}`}
            onDragOver={(e) => { if (drag !== null) { e.preventDefault(); setOver(i) } }}
            onDrop={(e) => { if (drag === null) return; e.preventDefault(); onChange(moveItem(items, drag, i)); end() }}
          >
            {renderItem(item, ctx)}
          </div>
        )
      })}
    </div>
  )
}
