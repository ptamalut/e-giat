/** Isian otomatis notula dari data kegiatan (dasar surat, tanggal, tempat, acara) dan pengolah daftar peserta rapat. Bagian murni. */
import type { AttendeeRef, LetterBrief } from './types'

const dateLong = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
const dayLong = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const at = (ymd: string) => new Date(`${ymd}T12:00:00`)   // tengah hari: aman dari pergeseran zona waktu

/** "Surat {asal} Nomor {nomor} tanggal {tanggal} perihal {perihal}" (bagian yang kosong dilewati); null bila surat kosong. */
export function letterLine(l: LetterBrief): string | null {
  const parts = [
    l.issuer?.trim() ? `Surat ${l.issuer.trim()}` : 'Surat',
    l.number?.trim() ? `Nomor ${l.number.trim()}` : '',
    l.letter_date ? `tanggal ${dateLong.format(at(l.letter_date))}` : '',
    l.subject?.trim() ? `perihal ${l.subject.trim()}` : '',
  ].filter(Boolean)
  return parts.length > 1 ? parts.join(' ') : null
}

/** Isi "Dasar" dari surat-surat kegiatan: satu surat apa adanya; beberapa surat bernomor satu per baris. */
export function basisFromLetters(letters: readonly LetterBrief[]): string {
  const lines = letters.map(letterLine).filter((x): x is string => !!x)
  return lines.length > 1 ? lines.map((l, i) => `${i + 1}. ${l}`).join('\n') : lines[0] ?? ''
}

/** Tanggal-tanggal pelaksanaan kegiatan (yyyy-mm-dd) dari tanggal mulai sampai selesai; maksimal `max` hari. */
export function activityDays(start: string | null, end: string | null, max = 31): string[] {
  const s = start || end
  if (!s) return []
  const out: string[] = []
  const d = at(s)
  const last = at(end && end >= s ? end : s)
  for (let i = 0; i < max && d <= last; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
    d.setDate(d.getDate() + 1)
  }
  return out
}

/** "Senin, 26 Oktober 2026" */
export const dayLabel = (ymd: string) => dayLong.format(at(ymd))

/** Nilai <input type="datetime-local"> -> tanggal dan jam (kosong bila belum diisi). */
export function splitLocal(v: string): { day: string; time: string } {
  const [day = '', time = ''] = v.split('T')
  return { day, time: time.slice(0, 5) }
}
export const joinLocal = (day: string, time: string) => (day ? `${day}T${time || '09:00'}` : '')

/** Kunci unik orang pada daftar peserta rapat. */
export const personKey = (p: Pick<AttendeeRef, 'name' | 'nip'>) => `${p.name.trim().toLowerCase()}|${(p.nip ?? '').trim()}`

/** Gabungkan orang baru ke daftar tanpa duplikat (urutan daftar dipertahankan). */
export function mergePeople(list: readonly AttendeeRef[], add: readonly AttendeeRef[]): AttendeeRef[] {
  const seen = new Set(list.map(personKey))
  const out = [...list]
  for (const p of add) {
    const name = p.name.trim()
    if (!name || seen.has(personKey({ name, nip: p.nip }))) continue
    seen.add(personKey({ name, nip: p.nip }))
    out.push({ name, nip: p.nip?.trim() || null, job_title: p.job_title?.trim() || null, institution: p.institution?.trim() || null })
  }
  return out
}
