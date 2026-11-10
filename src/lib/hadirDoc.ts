/**
 * Daftar hadir resmi (format "DAFTAR HADIR PEGAWAI"): kop surat dari Pengaturan aplikasi, judul bergaris bawah, keterangan
 * (Hari/Tanggal, Jam, Agenda, Tempat), tabel NO / NAMA / JABATAN / TANDA TANGAN, lalu Mengetahui dengan Koordinator Absen
 * dan Petugas Absen. Bagian murni; penulis Word (exportHadir.ts) dan PDF (exportHadirPdf.ts) memakai hasil ini.
 */
import { sessionRoster } from './exportAttendance'
import { whenParts, zoneLabel } from './noteDoc'
import { groupBySatker } from './satker'
import { SIGN_NOTE, signUrl } from './signQr'
import type { Activity, Attendance, AttendanceSession, Participant, PersonRole, SessionMember } from './types'

export type Paper = 'F4' | 'A4'
/** Ukuran kertas (mm): F4/Folio 215 × 330 seperti contoh, atau A4. */
export const PAPER_MM: Record<Paper, { w: number; h: number }> = { F4: { w: 215, h: 330 }, A4: { w: 210, h: 297 } }

export interface HadirOptions {
  title: string
  sessionIds: string[]
  roles: PersonRole[]
  /** kunci satuan kerja (lihat matchesUnit); '' = semua */
  unit: string
  agenda: string
  place: string
  coordinator: string
  officer: string
  showNip: boolean
  paper: Paper
  /** alamat aplikasi: bila diisi, kolom Tanda Tangan berisi QR tanda tangan elektronik bagi yang hadir/terlambat */
  qrBase?: string
}

export interface HadirRow { cells: string[]; /** alamat verifikasi untuk QR; null = dikosongkan untuk tanda tangan basah */ sign: string | null }

export interface HadirDoc {
  kop: { title: string[]; address: string[] }
  title: string
  info: { label: string; value: string }[]
  head: string[]
  /** lebar kolom (jumlah = 1) */
  widths: number[]
  rows: HadirRow[]
  footnote?: string
  sign: { caption: string; left: { caption: string; name: string }; right: { caption: string; name: string } }
  paper: Paper
}

const MIDNIGHT = /^00\.00$/

/** "Rabu, 14 Januari 2026" */
const dayDate = (iso: string, tz?: string) => { const w = whenParts(iso, tz); return `${w.day.charAt(0).toLocaleUpperCase('id-ID')}${w.day.slice(1)}, ${w.date}` }

/** Hari/tanggal sesi; sesi yang melewati beberapa hari ditulis "… s.d. …" (akhir tepat tengah malam dihitung hari sebelumnya). */
export function sessionDateText(s: Pick<AttendanceSession, 'start_at' | 'end_at'>, tz?: string): string {
  const start = dayDate(s.start_at, tz)
  const endRef = whenParts(s.end_at, tz).time === '00.00' ? new Date(new Date(s.end_at).getTime() - 60000).toISOString() : s.end_at
  const end = dayDate(endRef, tz)
  return start === end ? start : `${start} s.d. ${end}`
}

/** "14.00 WIT s.d. Selesai"; null untuk sesi otomatis yang dimulai tengah malam (tidak ada jam khusus). */
export function sessionTimeText(s: Pick<AttendanceSession, 'start_at' | 'auto'>, tz?: string): string | null {
  const w = whenParts(s.start_at, tz)
  if (s.auto && MIDNIGHT.test(w.time)) return null
  const zone = zoneLabel(tz, new Date(s.start_at))
  return `${w.time}${zone ? ` ${zone}` : ''} s.d. Selesai`
}

/** Satu dokumen per sesi terpilih. `people` harus sudah berurutan dan hanya berisi orang yang berhak absen. */
export function buildHadirDocs(
  activity: Pick<Activity, 'name' | 'location'>,
  people: readonly Participant[],
  sessions: readonly AttendanceSession[],
  attendances: readonly Attendance[],
  members: readonly SessionMember[],
  satkerOrder: readonly string[] | null,
  kop: { title: string[]; address: string[] },
  opts: HadirOptions,
  tz?: string,
): HadirDoc[] {
  const byKey = new Map(attendances.map((a) => [`${a.participant_id}:${a.session_id}`, a]))
  return opts.sessionIds.flatMap((sid) => {
    const s = sessions.find((x) => x.id === sid)
    if (!s) return []
    const roster = sessionRoster(s, people, members, opts)
    const ordered = groupBySatker(roster.map((r) => r.p), (p) => p.institution, satkerOrder).flatMap((g) => g.items)
    const sign = (p: Participant): string | null => {
      const a = byKey.get(`${p.id}:${s.id}`)
      return opts.qrBase && a?.sign_code && (a.status === 'hadir' || a.status === 'terlambat') ? signUrl(opts.qrBase, a.sign_code) : null
    }
    const time = sessionTimeText(s, tz)
    const info = [
      { label: 'Hari/ Tanggal', value: sessionDateText(s, tz) },
      ...(time ? [{ label: 'Jam', value: time }] : []),
      { label: 'Agenda', value: opts.agenda.trim() || activity.name },
      { label: 'Tempat', value: opts.place.trim() || activity.location || '' },
    ].filter((r) => r.value)
    const rows: HadirRow[] = ordered.map((p, i) => ({
      cells: [String(i + 1), p.name, ...(opts.showNip ? [p.identifier ?? ''] : []), p.job_title ?? ''],
      sign: sign(p),
    }))
    return [{
      kop,
      title: (opts.title.trim() || 'Daftar Hadir').toUpperCase(),
      info,
      head: ['NO', 'NAMA', ...(opts.showNip ? ['NIP'] : []), 'JABATAN', 'TANDA TANGAN'],
      widths: opts.showNip ? [0.06, 0.29, 0.2, 0.25, 0.2] : [0.07, 0.38, 0.30, 0.25],
      rows,
      footnote: rows.some((r) => r.sign) ? SIGN_NOTE : undefined,
      sign: { caption: 'Mengetahui', left: { caption: 'Koordinator Absen,', name: opts.coordinator.trim() }, right: { caption: 'Petugas Absen', name: opts.officer.trim() } },
      paper: opts.paper,
    }]
  })
}
