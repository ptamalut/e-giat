import { ArrowLeft, FileDown, Plus, Printer, Trash2, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Field, PageHeader, useAsync, useConfirm, useToast } from './ui'
import { safeName } from '../lib/csv'
import { downloadBlob } from '../lib/exportModel'
import { fmtDate, fmtDateTime, fromLocalInput, toLocalInput } from '../lib/format'
import { attendeesText, cleanFollowUps, followUpProgress, newFollowUp, overdue } from '../lib/notes'
import { appendBlock, appendLines } from '../lib/transcript'
import NoteRecorder from '../pages/admin/NoteRecorder'
import { errMsg } from '../lib/supabase'
import type { FollowUp, MeetingNote } from '../lib/types'

export type NoteDraft = Omit<MeetingNote, 'id' | 'activity_id' | 'created_at' | 'updated_at'> & { id?: string }

/** Isian notula yang disimpan (sama untuk panitia di halaman admin maupun petugas lewat link pribadi). */
export interface NotePayload {
  title: string; held_at: string | null; location: string | null; leader: string | null; notetaker: string | null; attendees: string | null
  agenda: string | null; discussion: string | null; decisions: string | null; follow_ups: FollowUp[]; status: 'draft' | 'final'
}

/** Penyimpanan notula: admin memakai tabel langsung, petugas memakai fungsi server berbasis token. */
export interface NoteApi {
  save: (payload: NotePayload, id?: string) => Promise<string>
  remove: (id: string) => Promise<void>
  /** sesi absensi untuk "Isi dari absensi" (kosong bila tidak tersedia) */
  sessions: () => Promise<{ id: string; title: string }[]>
  /** nama untuk daftar peserta rapat: yang hadir pada sebuah sesi, atau semua orang di kegiatan bila sessionId null */
  people: (sessionId: string | null) => Promise<{ name: string; institution: string | null }[]>
}

const today = () => new Date().toISOString().slice(0, 10)

export default function NoteEditor({ draft, activityId, activityName, api, backLabel = 'Daftar notula', onBack }: {
  draft: NoteDraft; activityId: string; activityName: string; api: NoteApi; backLabel?: string; onBack: () => void
}) {
  const toast = useToast()
  const confirm = useConfirm()
  const [id, setId] = useState(draft.id)
  const [f, setF] = useState({
    title: draft.title, held: toLocalInput(draft.held_at), location: draft.location ?? '', leader: draft.leader ?? '', notetaker: draft.notetaker ?? '',
    attendees: draft.attendees ?? '', agenda: draft.agenda ?? '', discussion: draft.discussion ?? '', decisions: draft.decisions ?? '',
    status: draft.status,
  })
  const [fus, setFus] = useState<FollowUp[]>(draft.follow_ups)
  const [saved, setSaved] = useState(JSON.stringify({ f, fus }))
  const [busy, setBusy] = useState(false)
  const [session, setSession] = useState('')
  const dirty = JSON.stringify({ f, fus }) !== saved
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  const sessions = useAsync(() => api.sessions().catch(() => []), [activityId])

  // peringatan bila meninggalkan halaman dengan perubahan yang belum disimpan
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  const current = (): MeetingNote => ({
    id: id ?? '', activity_id: activityId, title: f.title.trim(), held_at: fromLocalInput(f.held) || null,
    location: f.location.trim() || null, leader: f.leader.trim() || null, notetaker: f.notetaker.trim() || null,
    attendees: f.attendees.trim() || null, agenda: f.agenda.trim() || null, discussion: f.discussion.trim() || null, decisions: f.decisions.trim() || null,
    follow_ups: cleanFollowUps(fus), status: f.status, created_at: '', updated_at: '',
  })

  async function save(): Promise<boolean> {
    if (!f.title.trim()) { toast('Isi judul notula.', 'error'); return false }
    setBusy(true)
    const n = current()
    let newId: string
    try {
      newId = await api.save({ title: n.title, held_at: n.held_at, location: n.location, leader: n.leader, notetaker: n.notetaker, attendees: n.attendees,
        agenda: n.agenda, discussion: n.discussion, decisions: n.decisions, follow_ups: n.follow_ups, status: n.status }, id)
    } catch (e) { setBusy(false); toast(errMsg(e), 'error'); return false }
    setBusy(false)
    setId(newId)
    setFus(n.follow_ups)
    setSaved(JSON.stringify({ f, fus: n.follow_ups }))
    toast('Notula disimpan.', 'success')
    return true
  }

  async function back() {
    if (dirty) {
      const ok = await confirm({ title: 'Buang perubahan?', confirmText: 'Buang', danger: true, message: 'Ada perubahan yang belum disimpan.' })
      if (!ok) return
    }
    onBack()
  }

  async function remove() {
    if (!id) return onBack()
    const ok = await confirm({ title: 'Hapus notula ini?', danger: true, confirmText: 'Hapus' })
    if (!ok) return
    try { await api.remove(id) } catch (e) { return toast(errMsg(e), 'error') }
    toast('Notula dihapus.', 'success'); onBack()
  }

  async function fillAttendees() {
    if (!session) return
    let list: { name: string; institution: string | null }[]
    try { list = await api.people(session === '__all' ? null : session) } catch (e) { return toast(errMsg(e), 'error') }
    if (!list.length) return toast(session === '__all' ? 'Belum ada orang di kegiatan ini.' : 'Belum ada yang hadir pada sesi itu.', 'info')
    setF((cur) => ({ ...cur, attendees: attendeesText(list) }))
    toast(`${list.length} nama diisi.`, 'success')
  }

  async function word() {
    const blob = await (await import('../lib/exportNote')).exportNoteDocx(current(), activityName)
    downloadBlob(`notula-${safeName(f.title || 'rapat')}.docx`, blob)
  }

  function print() {
    document.body.classList.add('printing-note')
    const done = () => document.body.classList.remove('printing-note')
    window.addEventListener('afterprint', done, { once: true })
    setTimeout(() => window.print(), 100)
  }

  const note = useMemo(current, [f, fus, id]) // eslint-disable-line react-hooks/exhaustive-deps
  const pr = followUpProgress(note.follow_ups)

  return (
    <div className="stack">
      <div className="no-print">
        <PageHeader
          back={<button className="crumb" style={{ background: 'none', border: 0, cursor: 'pointer' }} onClick={() => void back()}><ArrowLeft size={15} /> {backLabel}</button>}
          title={id ? 'Ubah notula' : 'Notula baru'}
          subtitle={dirty ? <span className="badge warn">Belum disimpan</span> : id ? <span className="badge success">Tersimpan</span> : undefined}
          actions={<>
            <button className="btn" onClick={() => void word()} disabled={!f.title.trim()}><FileDown size={16} /> Word</button>
            <button className="btn" onClick={print} disabled={!f.title.trim()}><Printer size={16} /> Cetak / PDF</button>
            <button className="btn primary" onClick={() => void save()} disabled={busy || !dirty}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
          </>} />

        <div className="card">
          <Field label="Judul *"><input className="input" value={f.title} onChange={set('title')} placeholder="mis. Rapat Persiapan Hari Pertama" autoFocus={!id} /></Field>
          <div className="form-grid">
            <Field label="Waktu pelaksanaan"><input className="input" type="datetime-local" value={f.held} onChange={set('held')} /></Field>
            <Field label="Tempat"><input className="input" value={f.location} onChange={set('location')} /></Field>
            <Field label="Pimpinan rapat"><input className="input" value={f.leader} onChange={set('leader')} /></Field>
            <Field label="Pencatat"><input className="input" value={f.notetaker} onChange={set('notetaker')} /></Field>
          </div>
          <Field label="Status" hint="Tandai Final bila notula sudah disahkan.">
            <div className="pills" role="radiogroup" aria-label="Status">
              {(['draft', 'final'] as const).map((s) => (
                <button type="button" key={s} role="radio" aria-checked={f.status === s} className={`pill ${f.status === s ? 'active' : ''}`} onClick={() => setF({ ...f, status: s })}>{s === 'draft' ? 'Draft' : 'Final'}</button>
              ))}
            </div>
          </Field>
        </div>

        <NoteRecorder refDate={f.held ? new Date(f.held) : new Date()}
          onDiscussion={(t) => setF((c) => ({ ...c, discussion: appendBlock(c.discussion, t) }))}
          onApply={(a) => {
            setF((c) => ({ ...c, agenda: a.agenda.length ? appendLines(c.agenda, a.agenda) : c.agenda, decisions: a.decisions.length ? appendLines(c.decisions, a.decisions) : c.decisions }))
            if (a.followUps.length) setFus((c) => [...c, ...a.followUps.map((x) => ({ ...newFollowUp(), ...x }))])
          }} />

        <div className="card">
          <div className="card-head"><h2>Peserta rapat</h2><span className="spacer" />
            {sessions.data && (
              <div className="row tight">
                <select className="input" style={{ width: 220 }} value={session} onChange={(e) => setSession(e.target.value)} aria-label="Sumber nama peserta">
                  <option value="">Isi nama dari…</option>
                  <option value="__all">Semua orang di kegiatan</option>
                  {sessions.data.map((s) => <option key={s.id} value={s.id}>Hadir: {s.title}</option>)}
                </select>
                <button className="btn sm" disabled={!session} onClick={() => void fillAttendees()}><Users size={14} /> Isi</button>
              </div>
            )}
          </div>
          <textarea className="input" rows={5} value={f.attendees} onChange={set('attendees')} placeholder="Satu nama per baris" aria-label="Peserta rapat" />
        </div>

        <div className="card">
          <Field label="Agenda"><textarea className="input" rows={3} value={f.agenda} onChange={set('agenda')} /></Field>
          <Field label="Pembahasan"><textarea className="input" rows={8} value={f.discussion} onChange={set('discussion')} placeholder="Ringkasan jalannya pembahasan" /></Field>
          <Field label="Keputusan / kesimpulan"><textarea className="input" rows={4} value={f.decisions} onChange={set('decisions')} /></Field>
        </div>

        <div className="card">
          <div className="card-head"><h2>Tindak lanjut</h2><span className="muted small">{pr.label}</span><span className="spacer" />
            <button className="btn sm" onClick={() => setFus([...fus, newFollowUp()])}><Plus size={14} /> Tambah</button></div>
          {!fus.length && <p className="muted">Belum ada tindak lanjut.</p>}
          {fus.map((x, i) => (
            <div className="fu-row" key={x.id}>
              <input type="checkbox" className="rowcheck" checked={x.done} aria-label={`Selesai: ${x.task || `tindak lanjut ${i + 1}`}`}
                onChange={(e) => setFus(fus.map((y) => (y.id === x.id ? { ...y, done: e.target.checked } : y)))} />
              <input className="input" style={{ flex: 3 }} placeholder="Tindak lanjut" aria-label={`Tindak lanjut ${i + 1}`} value={x.task}
                onChange={(e) => setFus(fus.map((y) => (y.id === x.id ? { ...y, task: e.target.value } : y)))} />
              <input className="input" style={{ flex: 2 }} placeholder="Penanggung jawab" aria-label={`Penanggung jawab ${i + 1}`} value={x.pic}
                onChange={(e) => setFus(fus.map((y) => (y.id === x.id ? { ...y, pic: e.target.value } : y)))} />
              <input className="input" style={{ flex: 1.3, minWidth: 140, ...(overdue(x, today()) ? { borderColor: 'var(--danger)' } : {}) }} type="date" aria-label={`Tenggat ${i + 1}`} value={x.due}
                onChange={(e) => setFus(fus.map((y) => (y.id === x.id ? { ...y, due: e.target.value } : y)))} />
              <button className="icon-btn danger" aria-label={`Hapus tindak lanjut ${i + 1}`} onClick={() => setFus(fus.filter((y) => y.id !== x.id))}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>

        {id && <div className="row"><button className="btn danger" onClick={() => void remove()}><Trash2 size={16} /> Hapus notula</button></div>}
      </div>

      <div className="print-note-wrap"><PrintNote note={note} activityName={activityName} /></div>
    </div>
  )
}

function PrintNote({ note, activityName }: { note: MeetingNote; activityName: string }) {
  const block = (title: string, body: string | null) => body ? <><h3>{title}</h3><p style={{ whiteSpace: 'pre-wrap' }}>{body}</p></> : null
  return (
    <div className="note-print">
      <h2 style={{ textAlign: 'center', marginBottom: 2 }}>NOTULA</h2>
      <h3 style={{ textAlign: 'center', marginTop: 0 }}>{note.title}</h3>
      <table><tbody>
        <tr><td>Kegiatan</td><td>: {activityName}</td></tr>
        {note.held_at && <tr><td>Hari/tanggal</td><td>: {fmtDateTime(note.held_at)}</td></tr>}
        {note.location && <tr><td>Tempat</td><td>: {note.location}</td></tr>}
        {note.leader && <tr><td>Pimpinan</td><td>: {note.leader}</td></tr>}
        {note.notetaker && <tr><td>Pencatat</td><td>: {note.notetaker}</td></tr>}
      </tbody></table>
      {block('Peserta rapat', note.attendees)}
      {block('Agenda', note.agenda)}
      {block('Pembahasan', note.discussion)}
      {block('Keputusan / kesimpulan', note.decisions)}
      {note.follow_ups.length > 0 && (
        <>
          <h3>Tindak lanjut</h3>
          <table className="grid-table"><thead><tr><th>No</th><th>Tindak lanjut</th><th>Penanggung jawab</th><th>Tenggat</th><th>Status</th></tr></thead>
            <tbody>{note.follow_ups.map((x, i) => (
              <tr key={x.id}><td>{i + 1}</td><td>{x.task}</td><td>{x.pic || '-'}</td><td>{x.due ? fmtDate(x.due) : '-'}</td><td>{x.done ? 'Selesai' : 'Belum'}</td></tr>
            ))}</tbody></table>
        </>
      )}
    </div>
  )
}
