/**
 * Susunan dokumen notula sesuai format resmi (kop surat, "NOTULA", Dasar/Hari/Tanggal/Pukul/Tempat/Acara/Pimpinan/Notulis/Peserta,
 * "Jalannya Rapat" A–I, tabel Rencana Tindak Lanjut, tanda tangan). Bagian murni: hasilnya (NoteDoc) dipakai oleh
 * penulis Word (exportNote.ts) dan PDF (exportNotePdf.ts) sehingga keduanya sama persis.
 */
import type { AppSettings } from './branding'
import { noteSections, sectionLetter } from './notes'
import type { FollowUp, NoteItem, NoteSection } from './types'

export interface Run { text: string; bold?: boolean }

export type Block =
  | { t: 'heading'; text: string }
  | { t: 'para'; runs: Run[] }
  /** butir bernomor/berhuruf dengan tanda di kiri (menggantung); level 1 = anak butir (a, b, c) */
  | { t: 'item'; marker: string; runs: Run[]; level: 0 | 1 }
  | { t: 'table'; head: string[]; /** lebar kolom (jumlah = 1) */ widths: number[]; rows: string[][]; /** kolom yang rata tengah */ center: number[] }

export interface SignBlock { caption: string[]; name: string; nip: string }

export interface NoteDoc {
  kop: { title: string[]; address: string[] }
  title: string
  header: { label: string; value: string }[]
  blocks: Block[]
  signature: { left: SignBlock; right: SignBlock } | null
}

/** Isian notula yang dibutuhkan untuk dokumen (cocok untuk MeetingNote maupun PortalNote). */
export interface NoteDocInput {
  held_at?: string | null
  held_until?: string | null
  location?: string | null
  basis?: string | null
  agenda?: string | null
  leader?: string | null
  leader_role?: string | null
  leader_nip?: string | null
  notetaker?: string | null
  notetaker_nip?: string | null
  attendees?: string | null
  sections?: NoteSection[] | null
  discussion?: string | null
  decisions?: string | null
  follow_ups: FollowUp[]
}

const ZONES: Record<string, string> = { 'Asia/Jayapura': 'WIT', 'Asia/Makassar': 'WITA', 'Asia/Jakarta': 'WIB', 'Asia/Pontianak': 'WIB' }

/** Singkatan zona waktu Indonesia (WIT/WITA/WIB) untuk zona `tz` (bawaan: zona perangkat); kosong bila bukan zona Indonesia. */
export function zoneLabel(tz: string | undefined, at: Date): string {
  if (tz) return ZONES[tz] ?? ''
  const off = -at.getTimezoneOffset()
  return off === 540 ? 'WIT' : off === 480 ? 'WITA' : off === 420 ? 'WIB' : ''
}

/** Hari, tanggal, dan jam (dengan titik: 10.00) dari sebuah waktu, pada zona `tz` (bawaan: zona perangkat). */
export function whenParts(iso: string, tz?: string): { day: string; date: string; time: string; zone: string } {
  const d = new Date(iso)
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('id-ID', { timeZone: tz, ...o })
  const parts = fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return {
    day: fmt({ weekday: 'long' }).format(d),
    date: fmt({ day: 'numeric', month: 'long', year: 'numeric' }).format(d),
    time: `${get('hour')}.${get('minute')}`,
    zone: zoneLabel(tz, d),
  }
}

/** "10.00 WIT s.d. selesai" (atau s.d. jam yang diisi). */
export function timeRange(iso: string, until: string | null | undefined, tz?: string): string {
  const w = whenParts(iso, tz)
  const zone = w.zone ? ` ${w.zone}` : ''
  const u = (until ?? '').trim()
  const end = !u ? 'selesai' : /^\d{1,2}[.:]\d{2}$/.test(u) ? `${u.replace(':', '.').padStart(5, '0')}${zone}` : u
  return `${w.time}${zone} s.d. ${end}`
}

const lines = (t: string | null | undefined) => (t ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
const endsPunct = (s: string) => /[.:;!?]$/.test(s)

/** Teks dengan **tebal** di tengah kalimat -> potongan bergaya. Tanda ** yang tidak berpasangan dibiarkan apa adanya. */
export function inlineRuns(text: string, bold = false): Run[] {
  const parts = text.split('**')
  const pairs = Math.floor((parts.length - 1) / 2)
  const mk = (t: string, b: boolean): Run => (b ? { text: t, bold: true } : { text: t })
  if (!pairs) return [mk(text, bold)]
  const out: Run[] = []
  for (let i = 0; i < pairs * 2; i++) if (parts[i]) out.push(mk(parts[i], bold || i % 2 === 1))
  const rest = parts.slice(pairs * 2).join('**')
  if (rest) out.push(mk(rest, bold))
  return out
}

/** Butir: judul tebal + isi; butir berjudul tanpa isi dan beranak menjadi baris judul tebal. */
function itemRuns(x: { lead: string; text: string }): Run[] {
  const lead = x.lead.trim(), text = x.text.trim()
  if (lead && text) return [{ text: endsPunct(lead) ? lead : `${lead}.`, bold: true }, { text: ' ' }, ...inlineRuns(text)]
  if (lead) return [{ text: lead, bold: true }]
  return inlineRuns(text)
}

function sectionBlocks(s: NoteSection, i: number, fu: readonly FollowUp[], tableDone: { v: boolean }): Block[] {
  const out: Block[] = [{ t: 'heading', text: s.title ? `${sectionLetter(i)}. ${s.title}` : `${sectionLetter(i)}.` }]
  if (s.intro.trim()) out.push({ t: 'para', runs: inlineRuns(s.intro.trim()) })
  if (s.type === 'tindak_lanjut') {
    if (!tableDone.v && fu.length) {
      tableDone.v = true
      const due = fu.some((f) => f.due)
      const fmt = (d: string) => new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${d}T00:00:00`))
      out.push({
        t: 'table',
        head: due ? ['No', 'Rencana Tindak Lanjut', 'Penanggung Jawab', 'Tenggat'] : ['No', 'Rencana Tindak Lanjut', 'Penanggung Jawab'],
        widths: due ? [0.07, 0.5, 0.25, 0.18] : [0.08, 0.6, 0.32],
        rows: fu.map((f, k) => [String(k + 1), f.task, f.pic || '-', ...(due ? [f.due ? fmt(f.due) : '-'] : [])]),
        center: [0],
      })
    }
    return out
  }
  s.items.forEach((it: NoteItem, k) => {
    out.push({ t: 'item', marker: `${k + 1}.`, runs: itemRuns(it), level: 0 })
    it.subs.forEach((sub, j) => out.push({ t: 'item', marker: `${String.fromCharCode(97 + j)}.`, runs: itemRuns(sub), level: 1 }))
  })
  return out
}

/** Kop dari Pengaturan aplikasi: judul kop (tebal) dan alamat/kontak; bila belum diisi, memakai nama instansi dan kontak umum. */
export function kopFromSettings(s: Pick<AppSettings, 'kop_title' | 'kop_address' | 'org_name' | 'address' | 'phone' | 'email' | 'website'>): { title: string[]; address: string[] } {
  const title = lines(s.kop_title)
  const address = lines(s.kop_address)
  if (title.length || address.length) return { title, address }
  return {
    title: s.org_name ? [s.org_name] : [],
    address: [s.address, [s.phone && `Telp. ${s.phone}`, s.email].filter(Boolean).join(', '), s.website].filter((x): x is string => !!x),
  }
}

/** Susun dokumen notula dari isian notula dan kop. `tz` = zona waktu untuk hari/tanggal/pukul (bawaan: perangkat). */
export function buildNoteDoc(note: NoteDocInput, kop: { title: string[]; address: string[] }, tz?: string): NoteDoc {
  const header: { label: string; value: string }[] = []
  const add = (label: string, v: string | null | undefined) => { const t = (v ?? '').trim(); if (t) header.push({ label, value: t }) }
  add('Dasar', note.basis)
  if (note.held_at) {
    const w = whenParts(note.held_at, tz)
    add('Hari', w.day.charAt(0).toLocaleUpperCase('id-ID') + w.day.slice(1))
    add('Tanggal', w.date)
    add('Pukul', timeRange(note.held_at, note.held_until, tz))
  }
  add('Tempat', note.location)
  add('Acara', note.agenda)
  const leader = (note.leader ?? '').trim()
  add('Pimpinan Rapat', leader && note.leader_role?.trim() ? `${leader} (${note.leader_role.trim()})` : leader)
  add('Notulis', note.notetaker)
  add('Peserta Rapat', note.attendees)

  const sections = noteSections({ sections: note.sections ?? [], discussion: note.discussion ?? null, decisions: note.decisions ?? null, follow_ups: note.follow_ups }, false)
  const blocks: Block[] = []
  if (sections.length) blocks.push({ t: 'heading', text: 'Jalannya Rapat:' })
  const tableDone = { v: false }
  sections.forEach((s, i) => blocks.push(...sectionBlocks(s, i, note.follow_ups, tableDone)))

  const nip = (v: string | null | undefined) => ((v ?? '').trim() ? `NIP. ${(v ?? '').trim()}` : '')
  const role = (note.leader_role ?? '').trim()
  const signature = leader || (note.notetaker ?? '').trim()
    ? {
        left: { caption: ['Notulis'], name: (note.notetaker ?? '').trim(), nip: nip(note.notetaker_nip) },
        right: { caption: ['Mengetahui,', role ? `${role},` : 'Pimpinan Rapat,'], name: leader, nip: nip(note.leader_nip) },
      }
    : null
  return { kop, title: 'NOTULA', header, blocks, signature }
}

/** Nama berkas unduhan, mis. "notula-rapat-persiapan.docx". */
export const noteFileName = (title: string, ext: 'docx' | 'pdf') => {
  const base = title.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 60)
  return `notula-${base || 'rapat'}.${ext}`
}
