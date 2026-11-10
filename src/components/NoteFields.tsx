import { RotateCcw } from 'lucide-react'
import { Field } from './ui'
import { personKey } from '../lib/noteDefaults'
import type { AttendeeRef } from '../lib/types'

/**
 * Isian yang mengikuti data kegiatan (dasar surat, tempat, acara): tampil sebagai teks bawaan dengan tombol Ubah;
 * setelah diubah menjadi isian biasa, dengan tombol untuk kembali mengikuti kegiatan.
 */
export function FollowField({ label, hint, auto, manual, value, onChange, onManual, lines = 1, empty }: {
  label: string; hint?: string; auto: string; manual: boolean; value: string
  onChange: (v: string) => void; onManual: (manual: boolean) => void; lines?: number; empty: string
}) {
  const following = !manual && !!auto
  return (
    <Field label={label} hint={following ? undefined : hint}>
      {following ? (
        <div className="follow">
          <div className="follow-val">{auto}</div>
          <div className="follow-act">
            <span className="badge info">Dari data kegiatan</span>
            <button type="button" className="btn ghost sm" onClick={() => { onChange(auto); onManual(true) }} aria-label={`Ubah ${label.toLowerCase()} secara manual`}>Ubah</button>
          </div>
        </div>
      ) : (
        <div>
          {lines > 1
            ? <textarea className="input" rows={lines} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
            : <input className="input" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />}
          <div className="follow-foot">
            {auto
              ? <button type="button" className="btn ghost sm" onClick={() => onManual(false)}><RotateCcw size={13} /> Ikuti data kegiatan</button>
              : <span className="hint">{empty}</span>}
          </div>
        </div>
      )}
    </Field>
  )
}

/** Pilih satu orang dari peserta kegiatan (pimpinan atau notulis). Nama lama yang tidak ada di daftar tetap tampil sebagai pilihan. */
export function PersonSelect({ label, people, name, nip, onPick, onClear, disabledHint }: {
  label: string; people: AttendeeRef[]; name: string; nip: string
  onPick: (p: AttendeeRef) => void; onClear: () => void; disabledHint: string
}) {
  const key = name ? personKey({ name, nip: nip || null }) : ''
  const inList = people.find((p) => personKey(p) === key) ?? people.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase())
  const value = !name ? '' : inList ? personKey(inList) : '__saved'
  return (
    <Field label={label} hint={!people.length && !name ? disabledHint : undefined}>
      <select className="input" value={value} disabled={!people.length && !name} aria-label={label}
        onChange={(e) => {
          if (e.target.value === '') return onClear()
          if (e.target.value === '__saved') return
          const p = people.find((x) => personKey(x) === e.target.value)
          if (p) onPick(p)
        }}>
        <option value="">— Pilih dari peserta kegiatan —</option>
        {!inList && name && <option value="__saved">{name} (tersimpan)</option>}
        {people.map((p) => <option key={personKey(p)} value={personKey(p)}>{p.name}{p.nip ? ` — ${p.nip}` : ''}</option>)}
      </select>
    </Field>
  )
}

