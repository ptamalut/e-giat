import { ArrowDownAZ, Building2, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { RoleBadges } from '../../components/RoleBadge'
import { rolesOf } from '../../lib/people'
import { SortableList } from '../../components/SortableList'
import { Modal, useConfirm, useToast } from '../../components/ui'
import { groupBySatker, type SatkerGroup } from '../../lib/satker'
import type { PersonRole } from '../../lib/types'

/** Data minimal yang dibutuhkan untuk mengurutkan: peserta kegiatan maupun pegawai. */
export interface OrderPerson { id: string; name: string; institution: string | null; job_title: string | null; role?: PersonRole; roles?: PersonRole[] }

const byName = (a: OrderPerson, b: OrderPerson) => a.name.localeCompare(b.name, 'id', { sensitivity: 'base' })

/**
 * Atur urutan satuan kerja dan urutan orang di dalam tiap satuan kerja.
 * Penyimpanan diserahkan ke pemanggil (`save` dan `reset` mengembalikan pesan galat, atau null bila berhasil).
 */
export default function OrderModal<T extends OrderPerson>({ people, satkerOrder, noun = 'orang', hint, save: persist, reset, onClose, onSaved }: {
  people: T[]; satkerOrder: readonly string[] | null; noun?: string; hint?: string
  save: (satkerOrder: string[], ids: string[]) => Promise<string | null>
  reset: () => Promise<string | null>
  onClose: () => void; onSaved: () => void
}) {
  const toast = useToast()
  const confirm = useConfirm()
  const initial = useMemo(() => groupBySatker(people, (p) => p.institution, satkerOrder), [people, satkerOrder])
  const [groups, setGroups] = useState<SatkerGroup<T>[]>(initial)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)

  const movable = groups.filter((g) => g.key !== '')
  const fixed = groups.find((g) => g.key === '') // "tanpa satuan kerja" selalu terakhir

  const change = (next: SatkerGroup<T>[]) => { setGroups(next); setDirty(true) }
  const setMovable = (list: SatkerGroup<T>[]) => change(fixed ? [...list, fixed] : list)
  const setPeople = (key: string, items: T[]) => change(groups.map((g) => (g.key === key ? { ...g, items } : g)))
  const toggle = (key: string) => setOpen((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n })

  async function save() {
    setBusy(true)
    const error = await persist(movable.map((g) => g.key), groups.flatMap((g) => g.items.map((p) => p.id)))
    setBusy(false)
    if (error) return toast(error, 'error')
    toast('Urutan disimpan.', 'success')
    onSaved()
  }

  /** Kembali ke urutan otomatis (abjad): hapus urutan khusus di database. */
  async function resetAuto() {
    const ok = await confirm({ title: 'Kembali ke urutan otomatis?', confirmText: 'Ya, kembalikan',
      message: `Urutan satuan kerja dan urutan ${noun} yang pernah Anda atur dihapus; semuanya diurutkan abjad lagi.` })
    if (!ok) return
    setBusy(true)
    const err = await reset()
    setBusy(false)
    if (err) return toast(err, 'error')
    toast('Urutan dikembalikan ke abjad.', 'success')
    onSaved()
  }

  async function close() {
    if (dirty) {
      const ok = await confirm({ title: 'Buang perubahan urutan?', confirmText: 'Buang', danger: true, message: 'Perubahan urutan yang belum disimpan akan hilang.' })
      if (!ok) return
    }
    onClose()
  }

  return (
    <Modal wide title={`Atur urutan satuan kerja dan ${noun}`} onClose={() => void close()}
      footer={<>
        <button className="btn ghost" style={{ marginRight: 'auto' }} onClick={() => void resetAuto()} disabled={busy}><RotateCcw size={15} /> Kembali ke abjad</button>
        <button className="btn" onClick={() => void close()}>Batal</button>
        <button className="btn primary" onClick={() => void save()} disabled={busy || !dirty}>{busy ? 'Menyimpan…' : 'Simpan urutan'}</button>
      </>}>
      <p className="muted small" style={{ marginTop: 0 }}>
        Seret ikon <b>⋮⋮</b> atau pakai tombol panah untuk memindahkan. Buka satuan kerja untuk mengatur urutan {noun} di dalamnya.
        {' '}{hint ?? 'Urutan ini dipakai di tampilan, kartu QR, CSV, serta ekspor Word dan PDF.'}
      </p>

      <div className="row between" style={{ margin: '14px 0 8px' }}>
        <b>Satuan kerja ({movable.length})</b>
        <button className="btn sm" onClick={() => setMovable([...movable].sort((a, b) => a.label.localeCompare(b.label, 'id', { sensitivity: 'base' })))}>
          <ArrowDownAZ size={14} /> Urutkan A–Z
        </button>
      </div>

      <SortableList label="Urutan satuan kerja" items={movable} getKey={(g) => g.key} onChange={setMovable}
        renderItem={(g, c) => (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
              {c.handle}
              <span className="sort-num">{c.index + 1}</span>
              <button type="button" className="icon-btn" onClick={() => toggle(g.key)} aria-expanded={open.has(g.key)} aria-label={`${open.has(g.key) ? 'Tutup' : 'Buka'} urutan ${noun} di ${g.label}`}>
                {open.has(g.key) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
              <Building2 size={15} className="muted" />
              <b style={{ flex: 1, minWidth: 0 }}>{g.label} <span className="muted small" style={{ fontWeight: 400 }}>· {g.items.length} {noun}</span></b>
              {c.buttons}
            </div>
            {open.has(g.key) && <PeopleOrder items={g.items} noun={noun} onChange={(items) => setPeople(g.key, items)} />}
          </div>
        )} />

      {fixed && (
        <div className="sort-row" style={{ marginTop: 6, background: 'var(--surface-2)' }}>
          <div style={{ flex: 1 }}>
            <div className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
              <span style={{ width: 20 }} /><span className="sort-num" />
              <button type="button" className="icon-btn" onClick={() => toggle('')} aria-expanded={open.has('')} aria-label={`Buka urutan ${noun} tanpa satuan kerja`}>
                {open.has('') ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
              <Building2 size={15} className="muted" />
              <b style={{ flex: 1 }}>{fixed.label} <span className="muted small" style={{ fontWeight: 400 }}>· {fixed.items.length} {noun} · selalu di akhir</span></b>
            </div>
            {open.has('') && <PeopleOrder items={fixed.items} noun={noun} onChange={(items) => setPeople('', items)} />}
          </div>
        </div>
      )}
    </Modal>
  )
}

function PeopleOrder<T extends OrderPerson>({ items, noun, onChange }: { items: T[]; noun: string; onChange: (items: T[]) => void }) {
  return (
    <div className="sort-sub">
      <div className="row between" style={{ marginBottom: 6 }}>
        <span className="muted small">Urutan {noun}</span>
        <button className="btn ghost sm" onClick={() => onChange([...items].sort(byName))}><ArrowDownAZ size={14} /> A–Z</button>
      </div>
      <SortableList label={`Urutan ${noun}`} items={items} getKey={(p) => p.id} onChange={onChange}
        renderItem={(p, c) => (
          <>
            {c.handle}
            <span className="sort-num">{c.index + 1}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>{p.name}</b>{p.role && <RoleBadges roles={rolesOf({ role: p.role, roles: p.roles })} />}
              {p.job_title && <div className="muted small">{p.job_title}</div>}
            </div>
            {c.buttons}
          </>
        )} />
    </div>
  )
}
