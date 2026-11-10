import { ArrowLeft, FileDown, FileText, Trash2, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useBrand } from './brand'
import { FollowField, PersonSelect } from './NoteFields'
import { FollowUpsCard, NoteBody } from './NoteBody'
import { Field, useAsync, useConfirm, useToast } from './ui'
import { fromLocalInput, toLocalInput } from '../lib/format'
import { attendeesText, bodyToSections, cleanFollowUps, cleanSections, newItem, noteBody, type NoteBody as Body } from '../lib/notes'
import { activityDays, basisFromLetters, dayLabel, joinLocal, splitLocal } from '../lib/noteDefaults'
import { attendeeLines } from '../lib/noteDoc'
import { downloadNote, type NoteFormat } from '../lib/noteExport'
import NoteRecorder from '../pages/admin/NoteRecorder'
import { appendBlock } from '../lib/transcript'
import { errMsg } from '../lib/supabase'
import type { AttendeeRef, FollowUp, LetterBrief, MeetingNote, NoteContext, NoteSection } from '../lib/types'

export type NoteDraft = Omit<MeetingNote, 'id' | 'activity_id' | 'created_at' | 'updated_at'> & { id?: string }

/** Isian notula yang disimpan (sama untuk panitia di halaman admin maupun petugas lewat link pribadi). */
export interface NotePayload {
  title: string; held_at: string | null; location: string | null; leader: string | null; notetaker: string | null; attendees: string | null
  agenda: string | null; discussion: string | null; decisions: string | null; follow_ups: FollowUp[]; status: 'draft' | 'final'
  basis: string | null; held_until: string | null; leader_role: string | null; leader_nip: string | null; notetaker_nip: string | null; sections: NoteSection[]
  attendee_list: AttendeeRef[]
}

/** Penyimpanan notula: admin memakai tabel langsung, petugas memakai fungsi server berbasis token. */
export interface NoteApi {
  save: (payload: NotePayload, id?: string) => Promise<string>
  remove: (id: string) => Promise<void>
  /** sesi absensi untuk "Hadir pada sesi" (kosong bila tidak tersedia) */
  sessions: () => Promise<{ id: string; title: string }[]>
  /** orang di kegiatan (sessionId null) atau yang hadir pada sebuah sesi, dengan NIP dan jabatan */
  people: (sessionId: string | null) => Promise<AttendeeRef[]>
  /** dasar surat kegiatan, untuk mengisi "Dasar" */
  letters: () => Promise<LetterBrief[]>
}

const today = () => new Date().toISOString().slice(0, 10)
const orNull = (v: string) => v.trim() || null

/**
 * Editor notula berformat resmi untuk seluruh kegiatan. Dasar, tanggal, tempat, dan acara mengikuti data kegiatan (bisa diubah manual);
 * peserta ditulis sebagai teks (nama bisa diisi dari peserta kegiatan atau yang hadir pada sesi), sedangkan pimpinan dan notulis
 * dipilih dari peserta kegiatan. Hasilnya dapat diunduh sebagai Word dan PDF.
 */
export default function NoteEditor({ draft, activityId, context, api, backLabel = 'Daftar notula', onBack }: {
  draft: NoteDraft; activityId: string; context: NoteContext; api: NoteApi; backLabel?: string; onBack: () => void
}) {
  const toast = useToast()
  const confirm = useConfirm()
  const { settings } = useBrand()
  const [id, setId] = useState(draft.id)

  const days = useMemo(() => activityDays(context.start_date, context.end_date), [context.start_date, context.end_date])
  const heldLocal = splitLocal(toLocalInput(draft.held_at))
  const [f, setF] = useState({
    title: draft.title, until: draft.held_until ?? '', status: draft.status,
    basis: draft.basis ?? '', location: draft.location ?? '', agenda: draft.agenda ?? '',
    day: heldLocal.day || days[0] || today(), time: heldLocal.time || '09:00',
    leader: draft.leader ?? '', leaderRole: draft.leader_role ?? '', leaderNip: draft.leader_nip ?? '',
    notetaker: draft.notetaker ?? '', notetakerNip: draft.notetaker_nip ?? '',
    attendees: draft.attendees || attendeeLines(draft.attendee_list) || '',   // notula lama dengan daftar peserta: ditampilkan sebagai teks
  })
  // mode isian yang mengikuti kegiatan: null = belum ditentukan (diputuskan dari isi tersimpan setelah data dasar surat dimuat)
  const [mode, setMode] = useState<{ basis: boolean | null; location: boolean | null; agenda: boolean | null }>({ basis: null, location: null, agenda: null })
  const [otherDay, setOtherDay] = useState(!!heldLocal.day && days.length > 0 && !days.includes(heldLocal.day))
  const [body, setBody] = useState<Body>(() => noteBody(draft))   // satu narasi + butir (notula lama berbagian diratakan)
  const [fus, setFus] = useState<FollowUp[]>(draft.follow_ups)
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState<NoteFormat | null>(null)

  const sessions = useAsync(() => api.sessions().catch(() => []), [activityId])
  const letters = useAsync(() => api.letters().catch(() => []), [activityId])

  // nilai otomatis dari kegiatan
  const auto = { basis: basisFromLetters(letters.data ?? []), location: (context.location ?? '').trim(), agenda: context.name.trim() }
  const isManual = (k: 'basis' | 'location' | 'agenda') => {
    if (mode[k] !== null) return mode[k] as boolean
    const saved = k === 'basis' ? draft.basis : k === 'location' ? draft.location : draft.agenda
    return !!saved && saved !== auto[k]       // tersimpan dan berbeda dari kegiatan = isian manual
  }
  const val = (k: 'basis' | 'location' | 'agenda') => (isManual(k) ? f[k] : auto[k])
  const setManual = (k: 'basis' | 'location' | 'agenda') => (m: boolean) => setMode((c) => ({ ...c, [k]: m }))

  const snapshot = () => JSON.stringify({ f, mode, otherDay, body, fus })
  const [saved, setSaved] = useState(snapshot)
  const dirty = snapshot() !== saved
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  // peringatan bila meninggalkan halaman dengan perubahan yang belum disimpan
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  const current = (): MeetingNote => ({
    id: id ?? '', activity_id: activityId, title: f.title.trim(), held_at: fromLocalInput(joinLocal(f.day, f.time)) || null,
    location: orNull(val('location')), leader: orNull(f.leader), notetaker: orNull(f.notetaker), attendees: orNull(f.attendees), attendee_list: [],
    agenda: orNull(val('agenda')), discussion: null, decisions: null,
    basis: orNull(val('basis')), held_until: orNull(f.until), leader_role: orNull(f.leaderRole), leader_nip: orNull(f.leaderNip), notetaker_nip: orNull(f.notetakerNip),
    sections: cleanSections(bodyToSections(body)), follow_ups: cleanFollowUps(fus), status: f.status, created_at: '', updated_at: '',
  })

  async function save(): Promise<boolean> {
    if (!f.title.trim()) { toast('Isi judul notula.', 'error'); return false }
    setBusy(true)
    const n = current()
    let newId: string
    try {
      newId = await api.save({
        title: n.title, held_at: n.held_at, location: n.location, leader: n.leader, notetaker: n.notetaker, attendees: n.attendees, attendee_list: n.attendee_list,
        agenda: n.agenda, discussion: null, decisions: null, follow_ups: n.follow_ups, status: n.status,
        basis: n.basis, held_until: n.held_until, leader_role: n.leader_role, leader_nip: n.leader_nip, notetaker_nip: n.notetaker_nip, sections: n.sections,
      }, id)
    } catch (e) { setBusy(false); toast(errMsg(e), 'error'); return false }
    setBusy(false)
    setId(newId)
    setFus(n.follow_ups)
    setSaved(JSON.stringify({ f, mode, otherDay, body, fus: n.follow_ups }))
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

  async function download(format: NoteFormat) {
    setExporting(format)
    try { await downloadNote(format, current(), settings) } catch (e) { toast(errMsg(e), 'error') } finally { setExporting(null) }
  }

  // pimpinan dan notulis dipilih dari peserta kegiatan (dimuat sekali)
  const pool = useAsync(() => api.people(null).catch(() => [] as AttendeeRef[]), [activityId])
  const [src, setSrc] = useState('')
  async function fillAttendees() {
    if (!src) return
    let list: AttendeeRef[]
    try { list = await api.people(src === '__all' ? null : src) } catch (e) { return toast(errMsg(e), 'error') }
    if (!list.length) return toast(src === '__all' ? 'Belum ada orang di kegiatan ini.' : 'Belum ada yang hadir pada sesi itu.', 'info')
    if (f.attendees.trim() && !(await confirm({ title: 'Ganti isi peserta?', confirmText: 'Ganti', message: 'Isi peserta yang sudah ditulis akan diganti dengan daftar nama dari sumber yang dipilih.' }))) return
    setF((c) => ({ ...c, attendees: attendeesText(list) }))
    toast(`${list.length} nama diisi.`, 'success')
  }

  const titleOk = !!f.title.trim()
  const dayValue = !otherDay && days.includes(f.day) ? f.day : '__other'

  return (
    <div className="note-editor">
      <div className="note-head">
        <button type="button" className="btn ghost sm" onClick={() => void back()}><ArrowLeft size={15} /> {backLabel}</button>
        <div className="row tight" style={{ flexWrap: 'nowrap' }}>
          <h1>{id ? 'Ubah notula' : 'Notula baru'}</h1>
          {dirty ? <span className="badge warn">Belum disimpan</span> : id ? <span className="badge success">Tersimpan</span> : null}
        </div>
      </div>

      <div className="stack">
        <div className="card">
          <Field label="Judul *" hint="Nama notula pada daftar dan nama berkas unduhan. Pada dokumen, judulnya tetap “NOTULA”.">
            <input className="input" value={f.title} onChange={set('title')} placeholder="mis. Notula Pembukaan Bimtek CPP" autoFocus={!id} />
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
          <div className="card-head"><h2>Keterangan</h2><span className="muted small">Diisi otomatis dari data kegiatan</span></div>
          <FollowField label="Dasar" auto={auto.basis} manual={isManual('basis')} value={f.basis} onChange={(v) => setF((c) => ({ ...c, basis: v }))} onManual={setManual('basis')} lines={2}
            hint="Surat undangan atau dasar pelaksanaan kegiatan." empty="Belum ada dasar surat pada kegiatan; isi manual di sini atau tambahkan di Ringkasan kegiatan." />
          <div className="form-grid when-grid">
            <Field label="Hari dan tanggal" hint={days.length ? 'Mengikuti tanggal pelaksanaan kegiatan.' : 'Kegiatan belum punya tanggal; isi tanggal pelaksanaan.'}>
              {days.length > 0 ? (
                <div className="stack" style={{ gap: 6 }}>
                  <select className="input" value={dayValue} aria-label="Hari dan tanggal"
                    onChange={(e) => { if (e.target.value === '__other') setOtherDay(true); else { setOtherDay(false); setF((c) => ({ ...c, day: e.target.value })) } }}>
                    {days.map((d) => <option key={d} value={d}>{dayLabel(d)}</option>)}
                    <option value="__other">Tanggal lain…</option>
                  </select>
                  {dayValue === '__other' && <input className="input" type="date" value={f.day} onChange={set('day')} aria-label="Tanggal lain" />}
                </div>
              ) : <input className="input" type="date" value={f.day} onChange={set('day')} aria-label="Tanggal pelaksanaan" />}
            </Field>
            <Field label="Pukul mulai"><input className="input" type="time" value={f.time} onChange={set('time')} /></Field>
            <Field label="Pukul selesai" hint="Kosong = “selesai”."><input className="input" value={f.until} onChange={set('until')} placeholder="selesai" aria-label="Pukul selesai" /></Field>
          </div>
          <FollowField label="Tempat" auto={auto.location} manual={isManual('location')} value={f.location} onChange={(v) => setF((c) => ({ ...c, location: v }))} onManual={setManual('location')}
            empty="Kegiatan belum punya tempat; isi manual di sini." />
          <FollowField label="Acara" auto={auto.agenda} manual={isManual('agenda')} value={f.agenda} onChange={(v) => setF((c) => ({ ...c, agenda: v }))} onManual={setManual('agenda')} lines={2}
            empty="Isi nama acara." />
        </div>

        <div className="card">
          <div className="card-head"><h2>Peserta</h2>
            <div className="row tight" style={{ marginLeft: 'auto' }}>
                <select className="input" style={{ width: 230 }} value={src} onChange={(e) => setSrc(e.target.value)} aria-label="Sumber nama peserta">
                  <option value="">Isi nama dari…</option>
                  <option value="__all">Semua peserta kegiatan</option>
                  {(sessions.data ?? []).map((x) => <option key={x.id} value={x.id}>Hadir: {x.title}</option>)}
                </select>
                <button type="button" className="btn sm" disabled={!src} onClick={() => void fillAttendees()}><Users size={14} /> Isi</button>
            </div>
          </div>
          <textarea className="input" rows={4} value={f.attendees} onChange={set('attendees')} aria-label="Peserta"
            placeholder="Tulis bebas, mis. Ketua dan Wakil Ketua, Steering Committee, serta Anggota Organizing Committee; atau satu nama per baris. Bisa juga diisi otomatis dari peserta kegiatan di atas." />
        </div>

        <div className="card">
          <div className="card-head"><h2>Pimpinan dan notulis</h2><span className="muted small">Dipilih dari peserta kegiatan</span></div>
          <div className="form-grid">
            <PersonSelect label="Pimpinan" people={pool.data ?? []} name={f.leader} nip={f.leaderNip} disabledHint={pool.loading ? 'Memuat peserta kegiatan…' : 'Belum ada peserta kegiatan. Tambahkan di menu Peserta.'}
              onPick={(p) => setF((c) => ({ ...c, leader: p.name, leaderNip: p.nip ?? '', leaderRole: p.job_title ?? '' }))}
              onClear={() => setF((c) => ({ ...c, leader: '', leaderNip: '', leaderRole: '' }))} />
            <Field label="Jabatan pimpinan" hint="Tampil di dokumen dan pada tanda tangan “Mengetahui”; diisi dari jabatan, boleh disesuaikan (mis. Ketua Panitia).">
              <input className="input" value={f.leaderRole} onChange={set('leaderRole')} disabled={!f.leader} aria-label="Jabatan pimpinan" />
            </Field>
            <Field label="NIP pimpinan"><input className="input" inputMode="numeric" value={f.leaderNip} onChange={set('leaderNip')} disabled={!f.leader} aria-label="NIP pimpinan" /></Field>
          </div>
          <div className="form-grid">
            <PersonSelect label="Notulis" people={pool.data ?? []} name={f.notetaker} nip={f.notetakerNip} disabledHint={pool.loading ? 'Memuat peserta kegiatan…' : 'Belum ada peserta kegiatan. Tambahkan di menu Peserta.'}
              onPick={(p) => setF((c) => ({ ...c, notetaker: p.name, notetakerNip: p.nip ?? '' }))}
              onClear={() => setF((c) => ({ ...c, notetaker: '', notetakerNip: '' }))} />
            <Field label="NIP notulis"><input className="input" inputMode="numeric" value={f.notetakerNip} onChange={set('notetakerNip')} disabled={!f.notetaker} aria-label="NIP notulis" /></Field>
          </div>
        </div>

        <NoteRecorder refDate={new Date(`${f.day}T12:00:00`)}
          onDiscussion={(t) => setBody((b) => ({ ...b, text: appendBlock(b.text, t) }))}
          onApply={(a) => {
            const more = [...a.agenda, ...a.decisions]
            if (more.length) setBody((b) => ({ ...b, items: [...b.items, ...more.map((t) => newItem('', t))] }))
            if (a.followUps.length) setFus((c) => [...c, ...a.followUps.map((x) => ({ id: crypto.randomUUID(), done: false, ...x }))])
          }} />

        <NoteBody body={body} onChange={setBody} />
        <FollowUpsCard list={fus} onChange={setFus} today={today()} />

        {id && <div className="row"><button className="btn danger" onClick={() => void remove()}><Trash2 size={16} /> Hapus notula</button></div>}
      </div>

      <div className="note-bar" role="toolbar" aria-label="Aksi notula">
        <button className="btn" onClick={() => void download('docx')} disabled={!titleOk || !!exporting} title="Unduh notula sesuai format resmi (Word)"><FileDown size={16} /> <span>{exporting === 'docx' ? 'Menyiapkan…' : 'Word'}</span></button>
        <button className="btn" onClick={() => void download('pdf')} disabled={!titleOk || !!exporting} title="Unduh notula sesuai format resmi (PDF)"><FileText size={16} /> <span>{exporting === 'pdf' ? 'Menyiapkan…' : 'PDF'}</span></button>
        <span className="spacer" />
        <span className="muted small hide-sm">{dirty ? 'Ada perubahan yang belum disimpan' : id ? 'Semua perubahan tersimpan' : ''}</span>
        <button className="btn primary" onClick={() => void save()} disabled={busy || (!dirty && !!id)}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
      </div>
    </div>
  )
}
