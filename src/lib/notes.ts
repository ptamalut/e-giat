import type { FollowUp, MeetingNote } from './types'

export const newFollowUp = (): FollowUp => ({ id: crypto.randomUUID(), task: '', pic: '', due: '', done: false })

/** Rapikan tindak lanjut sebelum disimpan: baris tanpa tugas dibuang. */
export const cleanFollowUps = (list: FollowUp[]): FollowUp[] =>
  list.map((f) => ({ ...f, task: f.task.trim(), pic: f.pic.trim() })).filter((f) => f.task)

/** Ringkasan tindak lanjut: "2/5 selesai". */
export function followUpProgress(list: readonly FollowUp[]): { done: number; total: number; label: string } {
  const total = list.length, done = list.filter((f) => f.done).length
  return { done, total, label: total ? `${done}/${total} selesai` : 'tanpa tindak lanjut' }
}

/** Tindak lanjut belum selesai yang tenggatnya sudah lewat (tanggal yyyy-mm-dd). */
export const overdue = (f: FollowUp, today: string) => !f.done && !!f.due && f.due < today

/** Isi daftar peserta rapat dari nama-nama (bernomor). */
export const attendeesText = (people: readonly { name: string; institution?: string | null }[]) =>
  people.map((p, i) => `${i + 1}. ${p.name}${p.institution ? ` (${p.institution})` : ''}`).join('\n')

/** Catatan kosong untuk formulir baru. */
export const emptyNote = (location: string | null): Omit<MeetingNote, 'id' | 'activity_id' | 'created_at' | 'updated_at'> => ({
  title: '', held_at: null, location, leader: null, notetaker: null, attendees: null,
  agenda: null, discussion: null, decisions: null, follow_ups: [], status: 'draft',
})
