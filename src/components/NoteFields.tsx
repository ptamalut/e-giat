import { RotateCcw, Search, UserPlus, Users, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Field } from './ui'
import { mergePeople, personKey } from '../lib/noteDefaults'
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

/** Daftar peserta rapat: dipilih dari orang di kegiatan (atau yang hadir pada sebuah sesi) atau ditambah manual. */
export function PeoplePicker({ people, onChange, loadPool, sessions, legacy, onLegacy }: {
  people: AttendeeRef[]
  onChange: (list: AttendeeRef[]) => void
  /** orang di kegiatan; sessionId null = semua, selain itu yang hadir pada sesi itu */
  loadPool: (sessionId: string | null) => Promise<AttendeeRef[]>
  sessions: { id: string; title: string }[]
  /** teks peserta lama (notula sebelum daftar ini ada); null = tidak ditampilkan */
  legacy: string | null
  onLegacy: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [pool, setPool] = useState<AttendeeRef[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [session, setSession] = useState('')
  const [name, setName] = useState('')
  const [nip, setNip] = useState('')
  const picked = useMemo(() => new Set(people.map(personKey)), [people])

  async function openPanel() {
    setOpen(true)
    if (pool) return
    setLoading(true); setErr('')
    try { setPool(await loadPool(null)) } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setLoading(false) }
  }
  const shown = (pool ?? []).filter((p) => { const s = q.trim().toLowerCase(); return !s || [p.name, p.nip, p.job_title, p.institution].some((v) => v?.toLowerCase().includes(s)) })
  const toggle = (p: AttendeeRef) => onChange(picked.has(personKey(p)) ? people.filter((x) => personKey(x) !== personKey(p)) : mergePeople(people, [p]))
  async function fromSession() {
    if (!session) return
    setErr('')
    try {
      const list = await loadPool(session)
      if (!list.length) return setErr('Belum ada yang hadir pada sesi itu.')
      onChange(mergePeople(people, list))
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }
  function addManual() {
    if (!name.trim()) return
    onChange(mergePeople(people, [{ name, nip: nip || null, job_title: null, institution: null }]))
    setName(''); setNip('')
  }

  return (
    <div className="card">
      <div className="card-head">
        <h2>Peserta rapat</h2><span className="badge">{people.length} orang</span><span className="spacer" />
        <button type="button" className="btn sm" onClick={() => (open ? setOpen(false) : void openPanel())} aria-expanded={open}><Users size={14} /> {open ? 'Tutup pilihan' : 'Pilih dari peserta kegiatan'}</button>
      </div>

      {people.length === 0 && <p className="muted" style={{ margin: '0 0 8px' }}>Belum ada peserta rapat. Pilih dari peserta kegiatan atau tambahkan nama secara manual; pimpinan rapat dan notulis dipilih dari daftar ini.</p>}
      {people.length > 0 && (
        <ol className="np-list" aria-label="Peserta rapat terpilih">
          {people.map((p, i) => (
            <li key={personKey(p)}>
              <span className="np-no">{i + 1}.</span>
              <span className="np-who"><b>{p.name}</b><span className="muted small">{[p.nip && `NIP ${p.nip}`, p.job_title, p.institution].filter(Boolean).join(' · ')}</span></span>
              <button type="button" className="icon-btn danger" aria-label={`Keluarkan ${p.name} dari peserta rapat`} onClick={() => onChange(people.filter((x) => personKey(x) !== personKey(p)))}><X size={15} /></button>
            </li>
          ))}
        </ol>
      )}

      {open && (
        <div className="np-panel">
          <div className="row" style={{ marginBottom: 8 }}>
            <label className="search"><Search size={16} /><input className="input" placeholder="Cari nama, NIP, atau jabatan" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari orang" /></label>
            <button type="button" className="btn sm" disabled={!pool?.length} onClick={() => onChange(mergePeople(people, pool ?? []))}>Pilih semua</button>
            <button type="button" className="btn ghost sm" disabled={!people.length} onClick={() => onChange([])}>Kosongkan</button>
          </div>
          {sessions.length > 0 && (
            <div className="row tight" style={{ marginBottom: 8 }}>
              <select className="input" style={{ width: 240 }} value={session} onChange={(e) => setSession(e.target.value)} aria-label="Sumber nama dari absensi">
                <option value="">Tambah yang hadir pada sesi…</option>
                {sessions.map((s) => <option key={s.id} value={s.id}>Hadir: {s.title}</option>)}
              </select>
              <button type="button" className="btn sm" disabled={!session} onClick={() => void fromSession()}>Tambahkan</button>
            </div>
          )}
          {err && <div className="alert warn"><span>{err}</span></div>}
          {loading && <p className="muted">Memuat…</p>}
          {pool && (
            <div className="np-pool" role="group" aria-label="Orang di kegiatan">
              {shown.map((p) => (
                <label key={personKey(p)} className="np-opt">
                  <input type="checkbox" checked={picked.has(personKey(p))} onChange={() => toggle(p)} />
                  <span><b>{p.name}</b><span className="muted small">{[p.nip && `NIP ${p.nip}`, p.job_title].filter(Boolean).join(' · ')}</span></span>
                </label>
              ))}
              {!shown.length && <p className="muted center" style={{ padding: 12 }}>{pool.length ? 'Tidak ada hasil.' : 'Belum ada orang di kegiatan ini.'}</p>}
            </div>
          )}
        </div>
      )}

      <div className="np-add">
        <input className="input" placeholder="Tambah nama lain (tamu/undangan)" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nama peserta lain"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addManual() } }} />
        <input className="input np-nip" inputMode="numeric" placeholder="NIP (opsional)" value={nip} onChange={(e) => setNip(e.target.value)} aria-label="NIP peserta lain"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addManual() } }} />
        <button type="button" className="btn sm" disabled={!name.trim()} onClick={addManual}><UserPlus size={14} /> Tambah</button>
      </div>

      {legacy !== null && (
        <Field label="Keterangan peserta (teks)" hint="Dari notula lama. Dipakai pada dokumen hanya bila daftar peserta di atas kosong.">
          <textarea className="input" rows={3} value={legacy} onChange={(e) => onLegacy(e.target.value)} />
        </Field>
      )}
    </div>
  )
}

/** Pilih satu orang dari peserta rapat (pimpinan rapat atau notulis). Nama lama yang tidak ada di daftar tetap tampil sebagai pilihan. */
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
        <option value="">— Pilih dari peserta rapat —</option>
        {!inList && name && <option value="__saved">{name} (tersimpan)</option>}
        {people.map((p) => <option key={personKey(p)} value={personKey(p)}>{p.name}{p.nip ? ` — ${p.nip}` : ''}</option>)}
      </select>
    </Field>
  )
}

