import { ArrowDown, ArrowUp, ClipboardPaste, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { newFollowUp, newItem, newSub, outlineText, parseOutline, type NoteBody as Body } from '../lib/notes'
import { Field } from './ui'
import type { FollowUp, NoteItem, NoteSub } from '../lib/types'

const move = <T,>(list: readonly T[], i: number, d: -1 | 1): T[] => {
  const j = i + d
  if (j < 0 || j >= list.length) return [...list]
  const out = [...list]; [out[i], out[j]] = [out[j], out[i]]
  return out
}

function Arrows({ i, n, onMove, label }: { i: number; n: number; onMove: (d: -1 | 1) => void; label: string }) {
  return <>
    <button type="button" className="icon-btn" disabled={i === 0} aria-label={`${label} naik`} onClick={() => onMove(-1)}><ArrowUp size={15} /></button>
    <button type="button" className="icon-btn" disabled={i === n - 1} aria-label={`${label} turun`} onClick={() => onMove(1)}><ArrowDown size={15} /></button>
  </>
}

function SubRow({ s, j, n, onChange, onRemove, onMove, label }: {
  s: NoteSub; j: number; n: number; onChange: (s: NoteSub) => void; onRemove: () => void; onMove: (d: -1 | 1) => void; label: string
}) {
  return (
    <div className="ns-sub">
      <b className="ns-mark">{String.fromCharCode(97 + j)}.</b>
      <div className="ns-body">
        <input className="input" placeholder="Judul tebal (opsional)" aria-label={`Judul ${label} ${String.fromCharCode(97 + j)}`} value={s.lead} onChange={(e) => onChange({ ...s, lead: e.target.value })} />
        <textarea className="input" rows={2} placeholder="Isi anak butir" aria-label={`Isi ${label} ${String.fromCharCode(97 + j)}`} value={s.text} onChange={(e) => onChange({ ...s, text: e.target.value })} />
      </div>
      <Arrows i={j} n={n} onMove={onMove} label={`${label} ${String.fromCharCode(97 + j)}`} />
      <button type="button" className="icon-btn danger" aria-label={`Hapus ${label} ${String.fromCharCode(97 + j)}`} onClick={onRemove}><Trash2 size={15} /></button>
    </div>
  )
}

function ItemRow({ it, k, n, onChange, onRemove, onMove }: {
  it: NoteItem; k: number; n: number; onChange: (it: NoteItem) => void; onRemove: () => void; onMove: (d: -1 | 1) => void
}) {
  const label = `butir ${k + 1}`
  const setSub = (j: number, s: NoteSub) => onChange({ ...it, subs: it.subs.map((x, y) => (y === j ? s : x)) })
  return (
    <div className="ns-item">
      <div className="ns-row">
        <b className="ns-mark">{k + 1}.</b>
        <div className="ns-body">
          <input className="input" placeholder="Judul tebal (opsional), mis. Struktur kepanitiaan" aria-label={`Judul ${label}`} value={it.lead} onChange={(e) => onChange({ ...it, lead: e.target.value })} />
          <textarea className="input" rows={2} placeholder="Isi butir. Gunakan **teks** untuk menebalkan sebagian kalimat." aria-label={`Isi ${label}`} value={it.text} onChange={(e) => onChange({ ...it, text: e.target.value })} />
        </div>
        <Arrows i={k} n={n} onMove={onMove} label={`Butir ${k + 1}`} />
        <button type="button" className="icon-btn danger" aria-label={`Hapus ${label}`} onClick={onRemove}><Trash2 size={15} /></button>
      </div>
      {it.subs.map((s, j) => (
        <SubRow key={s.id} s={s} j={j} n={it.subs.length} label={`anak butir dari ${label}`}
          onChange={(x) => setSub(j, x)} onRemove={() => onChange({ ...it, subs: it.subs.filter((_, y) => y !== j) })} onMove={(d) => onChange({ ...it, subs: move(it.subs, j, d) })} />
      ))}
      <button type="button" className="btn ghost sm ns-addsub" onClick={() => onChange({ ...it, subs: [...it.subs, newSub()] })}><Plus size={13} /> Anak butir (a, b, c)</button>
    </div>
  )
}

function FollowUps({ list, onChange, today }: { list: FollowUp[]; onChange: (l: FollowUp[]) => void; today: string }) {
  const set = (id: string, patch: Partial<FollowUp>) => onChange(list.map((y) => (y.id === id ? { ...y, ...patch } : y)))
  return (
    <div className="ns-fu">
      <div className="muted small" style={{ marginBottom: 6 }}>Tampil sebagai tabel “Rencana Tindak Lanjut” dan “Penanggung Jawab” (kolom Tenggat muncul bila diisi).</div>
      {!list.length && <p className="muted">Belum ada rencana tindak lanjut.</p>}
      {list.map((x, i) => (
        <div className="fu-row" key={x.id}>
          <input type="checkbox" className="rowcheck" checked={x.done} aria-label={`Selesai: ${x.task || `tindak lanjut ${i + 1}`}`} onChange={(e) => set(x.id, { done: e.target.checked })} />
          <input className="input" style={{ flex: 3 }} placeholder="Rencana tindak lanjut" aria-label={`Tindak lanjut ${i + 1}`} value={x.task} onChange={(e) => set(x.id, { task: e.target.value })} />
          <input className="input" style={{ flex: 2 }} placeholder="Penanggung jawab" aria-label={`Penanggung jawab ${i + 1}`} value={x.pic} onChange={(e) => set(x.id, { pic: e.target.value })} />
          <input className="input" style={{ flex: 1.3, minWidth: 140, ...(!x.done && x.due && x.due < today ? { borderColor: 'var(--danger)' } : {}) }} type="date" aria-label={`Tenggat ${i + 1}`} value={x.due} onChange={(e) => set(x.id, { due: e.target.value })} />
          <Arrows i={i} n={list.length} label={`Tindak lanjut ${i + 1}`} onMove={(d) => onChange(move(list, i, d))} />
          <button type="button" className="icon-btn danger" aria-label={`Hapus tindak lanjut ${i + 1}`} onClick={() => onChange(list.filter((y) => y.id !== x.id))}><Trash2 size={16} /></button>
        </div>
      ))}
      <button type="button" className="btn sm" onClick={() => onChange([...list, newFollowUp()])}><Plus size={14} /> Tambah tindak lanjut</button>
    </div>
  )
}

/** Isi notula: satu narasi, lalu butir-butir (opsional) yang bisa ditambah, diurutkan, dan ditempel sekaligus. */
export function NoteBody({ body, onChange }: { body: Body; onChange: (b: Body) => void }) {
  const [paste, setPaste] = useState<string | null>(null)
  const setItem = (k: number, it: NoteItem) => onChange({ ...body, items: body.items.map((x, y) => (y === k ? it : x)) })
  function applyPaste(mode: 'append' | 'replace') {
    const items = parseOutline(paste ?? '')
    if (!items.length) return setPaste(null)
    onChange({ ...body, items: mode === 'replace' ? items : [...body.items, ...items] })
    setPaste(null)
  }
  return (
    <section className="card" aria-label="Isi notula">
      <div className="card-head"><h2>Isi notula</h2><span className="muted small">Tulis sebagai satu narasi; tambahkan butir-butir bila perlu</span></div>
      <Field label="Narasi" hint="Satu baris = satu paragraf. Gunakan **teks** untuk menebalkan sebagian kalimat. Hasil rekaman suara masuk ke sini.">
        <textarea className="input" rows={12} value={body.text} onChange={(e) => onChange({ ...body, text: e.target.value })} aria-label="Narasi"
          placeholder="Tulis jalannya kegiatan: pembukaan, pembahasan, kesimpulan, dan penutup dalam satu uraian." />
      </Field>

      <div className="form-section-title">Butir-butir (opsional)</div>
      {body.items.map((it, k) => (
        <ItemRow key={it.id} it={it} k={k} n={body.items.length} onChange={(x) => setItem(k, x)}
          onRemove={() => onChange({ ...body, items: body.items.filter((_, y) => y !== k) })} onMove={(d) => onChange({ ...body, items: move(body.items, k, d) })} />
      ))}
      <div className="row tight" style={{ marginTop: 8 }}>
        <button type="button" className="btn sm" onClick={() => onChange({ ...body, items: [...body.items, newItem()] })}><Plus size={14} /> Tambah butir</button>
        <button type="button" className="btn ghost sm" onClick={() => setPaste(paste === null ? '' : null)} aria-expanded={paste !== null}><ClipboardPaste size={14} /> Tempel daftar</button>
        {body.items.length > 0 && <button type="button" className="btn ghost sm" onClick={() => setPaste(outlineText(body.items))}>Ubah sebagai teks</button>}
      </div>
      {paste !== null && (
        <div className="ns-paste">
          <textarea className="input" rows={7} value={paste} onChange={(e) => setPaste(e.target.value)} aria-label="Teks daftar butir"
            placeholder={'1. **Struktur kepanitiaan.** Panitia terdiri atas SC dan OC;\n2. Perbaikan SK Panitia:\n   a. Klarifikasi nama rangkap;\n   b. Hapus jabatan Bendahara;'} />
          <div className="muted small">Nomor 1., 2. = butir; huruf a., b. = anak butir; <b>**teks**</b> = tebal. Baris tanpa nomor menyambung butir di atasnya.</div>
          <div className="row tight" style={{ marginTop: 6 }}>
            <button type="button" className="btn sm primary" onClick={() => applyPaste('append')}>Tambahkan sebagai butir</button>
            {body.items.length > 0 && <button type="button" className="btn sm" onClick={() => applyPaste('replace')}>Ganti semua butir</button>}
            <button type="button" className="btn ghost sm" onClick={() => setPaste(null)}>Batal</button>
          </div>
        </div>
      )}
    </section>
  )
}

/** Rencana tindak lanjut (tabel); tampil di dokumen bila ada isinya. */
export function FollowUpsCard({ list, onChange, today }: { list: FollowUp[]; onChange: (l: FollowUp[]) => void; today: string }) {
  return (
    <section className="card" aria-label="Rencana tindak lanjut">
      <div className="card-head"><h2>Rencana tindak lanjut</h2><span className="muted small">Opsional · {list.filter((x) => x.done).length}/{list.length} selesai</span></div>
      <FollowUps list={list} onChange={onChange} today={today} />
    </section>
  )
}
