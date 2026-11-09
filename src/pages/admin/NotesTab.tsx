import { CheckCircle2, NotebookPen, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import NoteEditor, { type NoteApi, type NoteDraft } from '../../components/NoteEditor'
import { Empty, ErrorBox, Loading, PageHeader, useAsync } from '../../components/ui'
import { fmtDateTime } from '../../lib/format'
import { emptyNote, followUpProgress, overdue } from '../../lib/notes'
import { errMsg, fetchAll, supabase } from '../../lib/supabase'
import type { AttendanceSession, MeetingNote } from '../../lib/types'
import { useActivity } from './ActivityLayout'

type Draft = NoteDraft
const today = () => new Date().toISOString().slice(0, 10)

export default function NotesTab() {
  const { activity } = useActivity()
  const [editing, setEditing] = useState<Draft | null>(null)

  const { data, error, loading, reload } = useAsync(
    () => fetchAll<MeetingNote>((a, b) => supabase.from('meeting_notes').select('*').eq('activity_id', activity.id).order('held_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).order('id').range(a, b)),
    [activity.id])
  const notes = data ?? []
  // penyimpanan langsung ke tabel (pemilik kegiatan); petugas memakai fungsi server lewat link pribadinya
  const api = useMemo<NoteApi>(() => ({
    save: async (payload, id) => {
      const res = id
        ? await supabase.from('meeting_notes').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id).select('id').single()
        : await supabase.from('meeting_notes').insert({ ...payload, activity_id: activity.id }).select('id').single()
      if (res.error) throw new Error(errMsg(res.error))
      return res.data.id as string
    },
    remove: async (id) => { const { error } = await supabase.from('meeting_notes').delete().eq('id', id); if (error) throw new Error(errMsg(error)) },
    sessions: async () => activity.enable_attendance
      ? (await fetchAll<AttendanceSession>((a, b) => supabase.from('attendance_sessions').select('*').eq('activity_id', activity.id).order('start_at').order('id').range(a, b))).map((s) => ({ id: s.id, title: s.title }))
      : [],
    people: async (sessionId) => {
      const people = await fetchAll<{ id: string; name: string; institution: string | null }>((a, b) => supabase.from('participants').select('id, name, institution').eq('activity_id', activity.id).order('name').order('id').range(a, b))
      if (!sessionId) return people
      const att = await fetchAll<{ participant_id: string }>((a, b) => supabase.from('attendances').select('participant_id').eq('session_id', sessionId).in('status', ['hadir', 'terlambat']).order('id').range(a, b))
      const here = new Set(att.map((x) => x.participant_id))
      return people.filter((p) => here.has(p.id))
    },
  }), [activity.id, activity.enable_attendance])

  if (editing) {
    return <NoteEditor key={editing.id ?? 'baru'} draft={editing} activityId={activity.id} activityName={activity.name} api={api}
      onBack={() => { setEditing(null); void reload(true) }} />
  }

  return (
    <div className="stack">
      <PageHeader title="Notula" subtitle="Catatan hasil rapat atau sesi kegiatan: pembahasan, keputusan, dan tindak lanjut. Peserta yang diberi hak akses Notula hanya melihat notula berstatus Final."
        actions={<button className="btn primary" onClick={() => setEditing(emptyNote(activity.location))}><Plus size={17} /> Notula baru</button>} />
      {loading && !data && <Loading />}
      {error && <ErrorBox error={error} onRetry={() => void reload()} />}
      {data && !notes.length && (
        <div className="card"><Empty icon={<NotebookPen size={26} />} title="Belum ada notula">
          Catat jalannya rapat atau sesi: peserta, agenda, pembahasan, keputusan, dan tindak lanjut beserta penanggung jawabnya.
          <div style={{ marginTop: 12 }}><button className="btn primary" onClick={() => setEditing(emptyNote(activity.location))}><Plus size={16} /> Buat notula pertama</button></div>
        </Empty></div>
      )}
      <div className="grid cols-2">
        {notes.map((n) => {
          const pr = followUpProgress(n.follow_ups)
          const late = n.follow_ups.filter((f) => overdue(f, today())).length
          return (
            <button key={n.id} className="card link note-card" onClick={() => setEditing(n)} aria-label={`Buka notula ${n.title}`}>
              <div className="row tight" style={{ marginBottom: 8 }}>
                <span className={`badge dot ${n.status === 'final' ? 'success' : 'warn'}`}>{n.status === 'final' ? 'Final' : 'Draft'}</span>
                {n.added_by && <span className="badge primary" title="Dibuat lewat link pribadi petugas/panitia">Dari petugas</span>}
                {late > 0 && <span className="badge danger">{late} tindak lanjut lewat tenggat</span>}
              </div>
              <h3 style={{ margin: '0 0 4px' }}>{n.title}</h3>
              <div className="muted small">{n.held_at ? fmtDateTime(n.held_at) : 'Waktu belum diisi'}{n.location ? ` · ${n.location}` : ''}</div>
              {n.decisions && <p className="small" style={{ margin: '10px 0 0', color: 'var(--text-2)' }}>{n.decisions.length > 140 ? n.decisions.slice(0, 140) + '…' : n.decisions}</p>}
              <div className="muted small" style={{ marginTop: 10 }}><CheckCircle2 size={13} /> {pr.label}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

