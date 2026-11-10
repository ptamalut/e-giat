import { ArrowLeft, FileDown, FileText, Trash2, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useBrand } from './brand'
import NoteSections from './NoteSections'
import { Field, PageHeader, useAsync, useConfirm, useToast } from './ui'
import { fromLocalInput, toLocalInput } from '../lib/format'
import { attendeesText, cleanFollowUps, cleanSections, newItem, newSection, noteSections, sectionLetter } from '../lib/notes'
import { downloadNote, type NoteFormat } from '../lib/noteExport'
import { appendLines } from '../lib/transcript'
import NoteRecorder from '../pages/admin/NoteRecorder'
import { errMsg } from '../lib/supabase'
import type { FollowUp, MeetingNote, NoteSection } from '../lib/types'

export type NoteDraft = Omit<MeetingNote, 'id' | 'activity_id' | 'created_at' | 'updated_at'> & { id?: string }

/** Isian notula yang disimpan (sama untuk panitia di halaman admin maupun petugas lewat link pribadi). */
export interface NotePayload {
  title: string; held_at: string | null; location: string | null; leader: string | null; notetaker: string | null; attendees: string | null
  agenda: string | null; discussion: string | null; decisions: string | null; follow_ups: FollowUp[]; status: 'draft' | 'final'
  basis: string | null; held_until: string | null; leader_role: string | null; leader_nip: string | null; notetaker_nip: string | null; sections: NoteSection[]
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
const orNull = (v: string) => v.trim() || null

/**
 * Editor notula berformat resmi: Dasar, waktu, tempat, acara, pimpinan, notulis, peserta; lalu "Jalannya Rapat"
 * (bagian A, B, C …, tabel rencana tindak lanjut); tanda tangan. Hasilnya dapat diunduh sebagai Word dan PDF.
 */
export default function NoteEditor({ draft, activityId, api, backLabel = 'Daftar notula', onBack }: {
  draft: NoteDraft; activityId: string; activityName?: string; api: NoteApi; backLabel?: string; onBack: () => void
}) {
  const toast = useToast()
  const confirm = useConfirm()
  const { settings } = useBrand()
  const [id, setId] = useState(draft.id)
  const [f, setF] = useState({
    title: draft.title, basis: draft.basis ?? '', held: toLocalInput(draft.held_at), until: draft.held_until ?? '', location: draft.location ?? '',
    agenda: draft.agenda ?? '', leader: draft.leader ?? '', leaderRole: draft.leader_role ?? '', leaderNip: draft.leader_nip ?? '',
    notetaker: draft.notetaker ?? '', notetakerNip: draft.notetaker_nip ?? '', attendees: draft.attendees ?? '', status: draft.status,
  })
  const [secs, setSecs] = useState<NoteSection[]>(() => noteSections(draft))
  const [fus, setFus] = useState<FollowUp[]>(draft.follow_ups)
  const [saved, setSaved] = useState(JSON.stringify({ f, secs, fus }))
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState<NoteFormat | null>(null)
  const [session, setSession] = useState('')
  const [target, setTarget] = useState('')
  const dirty = JSON.stringify({ f, secs, fus }) !== saved
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
    location: orNull(f.location), leader: orNull(f.leader), notetaker: orNull(f.notetaker), attendees: orNull(f.attendees),
    agenda: orNull(f.agenda), discussion: null, decisions: null,
    basis: orNull(f.basis), held_until: orNull(f.until), leader_role: orNull(f.leaderRole), leader_nip: orNull(f.leaderNip), notetaker_nip: orNull(f.notetakerNip),
    sections: cleanSections(secs), follow_ups: cleanFollowUps(fus), status: f.status, created_at: '', updated_at: '',
  })

  async function save(): Promise<boolean> {
    if (!f.title.trim()) { toast('Isi judul notula.', 'error'); return false }
    setBusy(true)
    const n = current()
    let newId: string
    try {
      newId = await api.save({
        title: n.title, held_at: n.held_at, location: n.location, leader: n.leader, notetaker: n.notetaker, attendees: n.attendees,
        agenda: n.agenda, discussion: null, decisions: null, follow_ups: n.follow_ups, status: n.status,
        basis: n.basis, held_until: n.held_until, leader_role: n.leader_role, leader_nip: n.leader_nip, notetaker_nip: n.notetaker_nip, sections: n.sections,
      }, id)
    } catch (e) { setBusy(false); toast(errMsg(e), 'error'); return false }
    setBusy(false)
    setId(newId)
    setSecs(n.sections); setFus(n.follow_ups)
    setSaved(JSON.stringify({ f, secs: n.sections, fus: n.follow_ups }))
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

  async function download(format: NoteFormat) {
    setExporting(format)
    try { await downloadNote(format, current(), settings) } catch (e) { toast(errMsg(e), 'error') } finally { setExporting(null) }
  }

  // hasil rekaman suara masuk sebagai butir pada bagian terpilih (bawaan: bagian pembahasan pertama)
  const textSecs = secs.map((s, i) => ({ s, i })).filter((x) => x.s.type === 'teks')
  const defaultTarget = (textSecs.length > 2 ? textSecs[1] : textSecs[0])?.s.id ?? ''
  const targetId = textSecs.some((x) => x.s.id === target) ? target : defaultTarget
  function addToTarget(texts: string[]) {
    const items = texts.map((t) => newItem('', t))
    setSecs((cur) => {
      const at = cur.findIndex((s) => s.id === targetId)
      if (at < 0) return [...cur, newSection('teks', 'Pembahasan', '', items)]
      return cur.map((s, i) => (i === at ? { ...s, items: [...s.items, ...items] } : s))
    })
  }

  const pr = useMemo(() => ({ done: fus.filter((x) => x.done).length, total: fus.length }), [fus])
  const titleOk = !!f.title.trim()

  return (
    <div className="stack">
      <PageHeader
        back={<button className="crumb" style={{ background: 'none', border: 0, cursor: 'pointer' }} onClick={() => void back()}><ArrowLeft size={15} /> {backLabel}</button>}
        title={id ? 'Ubah notula' : 'Notula baru'}
        subtitle={dirty ? <span className="badge warn">Belum disimpan</span> : id ? <span className="badge success">Tersimpan</span> : undefined}
        actions={<>
          <button className="btn" onClick={() => void download('docx')} disabled={!titleOk || !!exporting} title="Unduh notula sesuai format resmi (Word)"><FileDown size={16} /> {exporting === 'docx' ? 'Menyiapkan…' : 'Word'}</button>
          <button className="btn" onClick={() => void download('pdf')} disabled={!titleOk || !!exporting} title="Unduh notula sesuai format resmi (PDF)"><FileText size={16} /> {exporting === 'pdf' ? 'Menyiapkan…' : 'PDF'}</button>
          <button className="btn primary" onClick={() => void save()} disabled={busy || !dirty}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
        </>} />

      <div className="card">
        <Field label="Judul *" hint="Nama notula pada daftar dan nama berkas unduhan. Pada dokumen, judulnya tetap “NOTULA”.">
          <input className="input" value={f.title} onChange={set('title')} placeholder="mis. Rapat Panitia Bimtek CPP" autoFocus={!id} />
        </Field>
        <Field label="Status" hint="Tandai Final bila notula sudah disahkan.">
          <div className="pills" role="radiogroup" aria-label="Status">
            {(['draft', 'final'] as const).map((st) => (
              <button type="button" key={st} role="radio" aria-checked={f.status === st} className={`pill ${f.status === st ? 'active' : ''}`} onClick={() => setF({ ...f, status: st })}>{st === 'draft' ? 'Draft' : 'Final'}</button>
            ))}
          </div>
        </Field>
      </div>

      <div className="card">
        <div className="card-head"><h2>Keterangan rapat</h2><span className="muted small">Bagian atas dokumen notula</span></div>
        <Field label="Dasar" hint="Surat undangan atau dasar pelaksanaan rapat."><textarea className="input" rows={2} value={f.basis} onChange={set('basis')} placeholder="mis. Undangan Nomor 1598/KPTA.W29-A/UND.OT1.6/X/2026 tanggal 23 Oktober 2026" /></Field>
        <div className="form-grid">
          <Field label="Hari dan tanggal, pukul mulai" hint="Hari dan tanggal diisi otomatis pada dokumen."><input className="input" type="datetime-local" value={f.held} onChange={set('held')} /></Field>
          <Field label="Pukul selesai" hint="Kosongkan untuk “s.d. selesai”, atau isi jam, mis. 12.00."><input className="input" value={f.until} onChange={set('until')} placeholder="selesai" /></Field>
        </div>
        <Field label="Tempat"><input className="input" value={f.location} onChange={set('location')} /></Field>
        <Field label="Acara"><textarea className="input" rows={3} value={f.agenda} onChange={set('agenda')} placeholder="mis. Rapat Steering Committee dan Organizing Committee …" /></Field>
        <div className="form-grid">
          <Field label="Pimpinan rapat"><input className="input" value={f.leader} onChange={set('leader')} placeholder="Nama beserta gelar" /></Field>
          <Field label="Jabatan pimpinan rapat" hint="Tampil di dokumen dan pada tanda tangan “Mengetahui”."><input className="input" value={f.leaderRole} onChange={set('leaderRole')} placeholder="mis. Ketua Organizing Committee" /></Field>
          <Field label="NIP pimpinan rapat"><input className="input" inputMode="numeric" value={f.leaderNip} onChange={set('leaderNip')} /></Field>
          <span />
          <Field label="Notulis"><input className="input" value={f.notetaker} onChange={set('notetaker')} placeholder="Nama beserta gelar" /></Field>
          <Field label="NIP notulis"><input className="input" inputMode="numeric" value={f.notetakerNip} onChange={set('notetakerNip')} /></Field>
        </div>
        <div className="card-head" style={{ marginTop: 6 }}><h3 style={{ margin: 0 }}>Peserta rapat</h3><span className="spacer" />
          {sessions.data && (
            <div className="row tight">
              <select className="input" style={{ width: 220 }} value={session} onChange={(e) => setSession(e.target.value)} aria-label="Sumber nama peserta">
                <option value="">Isi nama dari…</option>
                <option value="__all">Semua orang di kegiatan</option>
                {sessions.data.map((x) => <option key={x.id} value={x.id}>Hadir: {x.title}</option>)}
              </select>
              <button className="btn sm" disabled={!session} onClick={() => void fillAttendees()}><Users size={14} /> Isi</button>
            </div>
          )}
        </div>
        <textarea className="input" rows={4} value={f.attendees} onChange={set('attendees')} placeholder="Ditulis seperti pada notula, mis. Ketua dan Wakil Ketua, Steering Committee, serta Anggota Organizing Committee; atau satu nama per baris" aria-label="Peserta rapat" />
      </div>

      <NoteRecorder refDate={f.held ? new Date(f.held) : new Date()}
        onDiscussion={(t) => addToTarget(t.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean))}
        onApply={(a) => {
          setF((c) => ({ ...c, agenda: a.agenda.length ? appendLines(c.agenda, a.agenda) : c.agenda }))
          if (a.decisions.length) addToTarget(a.decisions)
          if (a.followUps.length) setFus((c) => [...c, ...a.followUps.map((x) => ({ id: crypto.randomUUID(), done: false, ...x }))])
        }} />
      {textSecs.length > 1 && (
        <div className="row tight muted small" style={{ marginTop: -8 }}>
          <label htmlFor="rec-target">Hasil rekaman dimasukkan sebagai butir pada bagian</label>
          <select id="rec-target" className="input" style={{ width: 260, minHeight: 30, padding: '2px 8px' }} value={targetId} onChange={(e) => setTarget(e.target.value)}>
            {textSecs.map((x) => <option key={x.s.id} value={x.s.id}>{sectionLetter(x.i)}. {x.s.title || '(tanpa judul)'}</option>)}
          </select>
        </div>
      )}

      <NoteSections sections={secs} onChange={setSecs} followUps={fus} onFollowUps={setFus} today={today()} />
      {pr.total > 0 && <p className="muted small" style={{ margin: 0 }}>Rencana tindak lanjut: {pr.done}/{pr.total} selesai.</p>}

      {id && <div className="row"><button className="btn danger" onClick={() => void remove()}><Trash2 size={16} /> Hapus notula</button></div>}
    </div>
  )
}
