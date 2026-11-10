import type { FollowUp, MeetingNote, NoteItem, NoteSection, NoteSub } from './types'

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

const uid = () => crypto.randomUUID()

export const newSub = (lead = '', text = ''): NoteSub => ({ id: uid(), lead, text })
export const newItem = (lead = '', text = '', subs: NoteSub[] = []): NoteItem => ({ id: uid(), lead, text, subs })
export const newSection = (type: NoteSection['type'] = 'teks', title = '', intro = '', items: NoteItem[] = []): NoteSection => ({ id: uid(), type, title, intro, items })

/** Huruf bagian: A, B, C … (setelah Z memakai angka). */
export const sectionLetter = (i: number) => (i >= 0 && i < 26 ? String.fromCharCode(65 + i) : String(i + 1))

/** Kerangka bagian untuk notula baru, mengikuti format notula: Pembukaan … Kesimpulan dan Rencana Tindak Lanjut … Penutup. */
export const defaultSections = (): NoteSection[] => [
  newSection('teks', 'Pembukaan', 'Rapat dibuka oleh … selaku pimpinan rapat, dengan menyampaikan hal-hal sebagai berikut:'),
  newSection('teks', 'Pembahasan'),
  newSection('tindak_lanjut', 'Kesimpulan dan Rencana Tindak Lanjut', 'Berdasarkan hasil pembahasan, rapat menyepakati rencana tindak lanjut sebagai berikut:'),
  newSection('teks', 'Penutup', 'Rapat ditutup oleh pimpinan rapat dengan ucapan terima kasih atas kehadiran dan masukan seluruh peserta rapat.'),
]

const subHasText = (x: { lead: string; text: string }) => !!(x.lead.trim() || x.text.trim())

/** Rapikan bagian sebelum disimpan: spasi dipangkas, butir/anak butir kosong dibuang. Bagian tanpa judul dan isi dibuang. */
export function cleanSections(list: readonly NoteSection[]): NoteSection[] {
  const out: NoteSection[] = []
  for (const s of list) {
    const items = s.items
      .map((it) => ({ ...it, lead: it.lead.trim(), text: it.text.trim(), subs: it.subs.map((x) => ({ ...x, lead: x.lead.trim(), text: x.text.trim() })).filter(subHasText) }))
      .filter((it) => subHasText(it) || it.subs.length)
    const sec = { ...s, title: s.title.trim(), intro: s.intro.trim(), items: s.type === 'tindak_lanjut' ? [] : items }
    if (sec.title || sec.intro || sec.items.length || sec.type === 'tindak_lanjut') out.push(sec)
  }
  return out
}

const paragraphs = (t: string | null | undefined) => (t ?? '').split(/\n\s*\n/).map((x) => x.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean)
const linesOf = (t: string | null | undefined) => (t ?? '').split('\n').map((x) => x.replace(/^\s*(?:\d+[.)]|[-•*])\s+/, '').trim()).filter(Boolean)

type Sectioned = Pick<MeetingNote, 'sections' | 'discussion' | 'decisions' | 'follow_ups'>

/**
 * Bagian yang ditampilkan/diedit: bagian tersimpan; bila kosong (notula lama sebelum format ini) diturunkan dari
 * pembahasan, keputusan, dan tindak lanjut lama; bila semuanya kosong memakai kerangka bawaan.
 */
export function noteSections(n: Sectioned | { sections?: NoteSection[] | null; discussion: string | null; decisions: string | null; follow_ups: FollowUp[] }, blank = true): NoteSection[] {
  if (n.sections?.length) return n.sections
  const out: NoteSection[] = []
  const disc = paragraphs(n.discussion)
  if (disc.length) out.push(newSection('teks', 'Pembahasan', '', disc.map((t) => newItem('', t))))
  const dec = linesOf(n.decisions)
  if (dec.length) out.push(newSection('teks', 'Keputusan dan Kesimpulan', '', dec.map((t) => newItem('', t))))
  if (n.follow_ups.length) out.push(newSection('tindak_lanjut', 'Rencana Tindak Lanjut', 'Berdasarkan hasil pembahasan, rapat menyepakati rencana tindak lanjut sebagai berikut:'))
  return out.length || !blank ? out : defaultSections()
}

const BOLD = /^\*\*(.+?)\*\*[\s.:]*(.*)$/
const NUM = /^\s*(\d{1,3})[.)]\s+(.*)$/
const ALPHA = /^\s{0,}([a-z])[.)]\s+(.*)$/i

/** `**Judul tebal.** isi` -> {lead, text}; tanpa tanda tebal seluruhnya dianggap isi. */
function leadText(raw: string): { lead: string; text: string } {
  const m = raw.trim().match(BOLD)
  return m ? { lead: m[1].replace(/[.:]$/, '').trim(), text: m[2].trim() } : { lead: '', text: raw.trim() }
}

/**
 * Ubah teks tempelan berbentuk kerangka menjadi butir: baris "1. …" = butir, "a. …" = anak butir,
 * baris lain menyambung butir sebelumnya. `**Judul.** isi` menandai bagian tebal. Butir yang diikuti
 * a., b., c. dan tanpa judul tebal menjadikan teksnya sebagai judul (seperti "Tanggapan … (nama)").
 */
export function parseOutline(text: string): NoteItem[] {
  const items: NoteItem[] = []
  const append = (cur: { lead: string; text: string }, more: string) => { cur.text = cur.text ? `${cur.text} ${more}` : more }
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const n = line.match(NUM)
    const a = line.match(ALPHA)
    const last = items[items.length - 1]
    if (n) { const { lead, text: t } = leadText(n[2]); items.push(newItem(lead, t)) }
    else if (a && last) { const { lead, text: t } = leadText(a[2]); last.subs.push(newSub(lead, t)) }
    else if (last) append(last.subs.length ? last.subs[last.subs.length - 1] : last, line)
    else { const { lead, text: t } = leadText(line); items.push(newItem(lead, t)) }
  }
  for (const it of items) if (it.subs.length && !it.lead && it.text) { it.lead = it.text; it.text = '' }
  return items
}

/** Kebalikan parseOutline: butir menjadi teks kerangka (untuk disalin/ditempel kembali). */
export function outlineText(items: readonly NoteItem[]): string {
  const part = (x: { lead: string; text: string }) => (x.lead ? `**${x.lead}** ${x.text}`.trim() : x.text)
  return items.map((it, i) => [`${i + 1}. ${part(it)}`, ...it.subs.map((s, j) => `   ${String.fromCharCode(97 + j)}. ${part(s)}`)].join('\n')).join('\n')
}

/** Catatan kosong untuk formulir baru. */
export const emptyNote = (location: string | null): Omit<MeetingNote, 'id' | 'activity_id' | 'created_at' | 'updated_at'> => ({
  title: '', held_at: null, location, leader: null, notetaker: null, attendees: null,
  agenda: null, discussion: null, decisions: null, follow_ups: [], status: 'draft',
  basis: null, held_until: null, leader_role: null, leader_nip: null, notetaker_nip: null, sections: defaultSections(),
})
