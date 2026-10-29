import { ArrowDownAZ, Building2, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { RoleBadge } from '../../components/RoleBadge'
import { SortableList } from '../../components/SortableList'
import { Modal, useConfirm, useToast } from '../../components/ui'
import { roleLine } from '../../lib/people'
import { groupBySatker, type SatkerGroup } from '../../lib/satker'
import { errMsg, supabase } from '../../lib/supabase'
import type { Activity, Participant } from '../../lib/types'

const byName = (a: Participant, b: Participant) => a.name.localeCompare(b.name, 'id', { sensitivity: 'base' })

/** Atur urutan satuan kerja dan urutan orang di dalam tiap satuan kerja. Disimpan ke database. */
export default function OrderModal({ activity, people, onClose, onSaved }: {
  activity: Pick<Activity, 'id' | 'satker_order'>; people: Participant[]; onClose: () => void; onSaved: () => void
}) {
  const toast = useToast()
  const confirm = useConfirm()
  const initial = useMemo(() => groupBySatker(people, (p) => p.institution, activity.satker_order), [people, activity.satker_order])
  const [groups, setGroups] = useState<SatkerGroup<Participant>[]>(initial)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)

  const movable = groups.filter((g) => g.key !== '')
  const fixed = groups.find((g) => g.key === '') // "tanpa satuan kerja" selalu terakhir

  const change = (next: SatkerGroup<Participant>[]) => { setGroups(next); setDirty(true) }
  const setMovable = (list: SatkerGroup<Participant>[]) => change(fixed ? [...list, fixed] : list)
  const setPeople = (key: string, items: Participant[]) => change(groups.map((g) => (g.key === key ? { ...g, items } : g)))
  const toggle = (key: string) => setOpen((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n })

  async function save() {
    setBusy(true)
    const { error } = await supabase.rpc('save_activity_order', {
      p_activity: activity.id,
      p_satker_order: movable.map((g) => g.key),
      p_participants: groups.flatMap((g) => g.items.map((p) => p.id)),
    })
    setBusy(false)
    if (error) return toast(errMsg(error), 'error')
    toast('Urutan disimpan.', 'success')
    onSaved()
  }

  /** Kembali ke urutan otomatis (abjad): hapus urutan khusus di database. */
  async function resetAuto() {
    const ok = await confirm({ title: 'Kembali ke urutan otomatis?', confirmText: 'Ya, kembalikan',
      message: 'Urutan satuan kerja dan urutan orang yang pernah Anda atur dihapus; semuanya diurutkan abjad lagi.' })
    if (!ok) return
    setBusy(true)
    const [a, p] = await Promise.all([
      supabase.from('activities').update({ satker_order: null }).eq('id', activity.id),
      supabase.from('participants').update({ sort_order: null }).eq('activity_id', activity.id),
    ])
    setBusy(false)
    const err = a.error ?? p.error
    if (err) return toast(errMsg(err), 'error')
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
    <Modal wide title="Atur urutan satuan kerja dan orang" onClose={() => void close()}
      footer={<>
        <button className="btn ghost" style={{ marginRight: 'auto' }} onClick={() => void resetAuto()} disabled={busy}><RotateCcw size={15} /> Kembali ke abjad</button>
        <button className="btn" onClick={() => void close()}>Batal</button>
        <button className="btn primary" onClick={() => void save()} disabled={busy || !dirty}>{busy ? 'Menyimpan…' : 'Simpan urutan'}</button>
      </>}>
      <p className="muted small" style={{ marginTop: 0 }}>
        Seret ikon <b>⋮⋮</b> atau pakai tombol panah untuk memindahkan. Buka satuan kerja untuk mengatur urutan orang di dalamnya.
        Urutan ini dipakai di tampilan, kartu QR, CSV, serta ekspor Word dan PDF.
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
              <button type="button" className="icon-btn" onClick={() => toggle(g.key)} aria-expanded={open.has(g.key)} aria-label={`${open.has(g.key) ? 'Tutup' : 'Buka'} urutan orang di ${g.label}`}>
                {open.has(g.key) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
              <Building2 size={15} className="muted" />
              <b style={{ flex: 1, minWidth: 0 }}>{g.label} <span className="muted small" style={{ fontWeight: 400 }}>· {g.items.length} orang</span></b>
              {c.buttons}
            </div>
            {open.has(g.key) && <PeopleOrder items={g.items} onChange={(items) => setPeople(g.key, items)} />}
          </div>
        )} />

      {fixed && (
        <div className="sort-row" style={{ marginTop: 6, background: 'var(--surface-2)' }}>
          <div style={{ flex: 1 }}>
            <div className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
              <span style={{ width: 20 }} /><span className="sort-num" />
              <button type="button" className="icon-btn" onClick={() => toggle('')} aria-expanded={open.has('')} aria-label="Buka urutan orang tanpa satuan kerja">
                {open.has('') ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
              <Building2 size={15} className="muted" />
              <b style={{ flex: 1 }}>{fixed.label} <span className="muted small" style={{ fontWeight: 400 }}>· {fixed.items.length} orang · selalu di akhir</span></b>
            </div>
            {open.has('') && <PeopleOrder items={fixed.items} onChange={(items) => setPeople('', items)} />}
          </div>
        </div>
      )}
    </Modal>
  )
}

function PeopleOrder({ items, onChange }: { items: Participant[]; onChange: (items: Participant[]) => void }) {
  return (
    <div className="sort-sub">
      <div className="row between" style={{ marginBottom: 6 }}>
        <span className="muted small">Urutan orang</span>
        <button className="btn ghost sm" onClick={() => onChange([...items].sort(byName))}><ArrowDownAZ size={14} /> A–Z</button>
      </div>
      <SortableList label="Urutan orang" items={items} getKey={(p) => p.id} onChange={onChange}
        renderItem={(p, c) => (
          <>
            {c.handle}
            <span className="sort-num">{c.index + 1}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>{p.name}</b><RoleBadge role={p.role} />
              {roleLine({ job_title: p.job_title }) && <div className="muted small">{p.job_title}</div>}
            </div>
            {c.buttons}
          </>
        )} />
    </div>
  )
}
