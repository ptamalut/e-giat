import type { ColumnKey, ExportModel } from './exportModel'
import { fmtDateTime, fmtTime } from './format'
import { ROLE_LABEL, ROLES } from './people'
import { ATT_LABEL, memberMapOf, sessionRole } from './reports'
import { groupBySatker, matchesUnit } from './satker'
import type { Activity, Attendance, AttendanceSession, Participant, PersonRole, SessionMember } from './types'

export type AttColumn = 'identifier' | 'grade' | 'job_title' | 'phone' | 'role' | 'status' | 'time' | 'signature'
/** Pengelompokan tabel: per satuan kerja, per jenis (kedudukan pada sesi), atau satu tabel. */
export type AttGroup = 'satker' | 'jenis' | 'none'

export interface AttExportOptions {
  title: string
  /** sesi yang diekspor (urut tampil); tiap sesi menjadi bagian tersendiri */
  sessionIds: string[]
  /** kedudukan pada sesi yang dimasukkan */
  roles: PersonRole[]
  /** kunci satuan kerja (lihat matchesUnit); '' = semua */
  unit: string
  group: AttGroup
  columns: AttColumn[]
  landscape: boolean
}

const LABEL: Record<AttColumn, string> = {
  identifier: 'NIP', grade: 'Pangkat/Gol. Ruang', job_title: 'Jabatan', phone: 'No. WhatsApp', role: 'Kedudukan', status: 'Status', time: 'Jam Absen', signature: 'Tanda Tangan',
}
const ORDER: AttColumn[] = ['identifier', 'grade', 'job_title', 'phone', 'role', 'status', 'time', 'signature']

/** Jam absen; bila berbeda hari dengan jam mulai sesi, sertakan tanggalnya. */
const clock = (a: Attendance, s: AttendanceSession) =>
  new Date(a.checked_in_at).toDateString() === new Date(s.start_at).toDateString() ? fmtTime(a.checked_in_at) : fmtDateTime(a.checked_in_at)

/** Orang yang ikut sebuah sesi beserta kedudukannya pada sesi itu, mengikuti filter jenis dan satuan kerja. */
export function sessionRoster(
  s: AttendanceSession, people: readonly Participant[], members: readonly SessionMember[], opts: Pick<AttExportOptions, 'roles' | 'unit'>,
): { p: Participant; role: PersonRole }[] {
  const mm = memberMapOf(members)
  return people.flatMap((p) => {
    const role = sessionRole(s, p, mm)
    return role && opts.roles.includes(role) && matchesUnit(opts.unit, p.institution) ? [{ p, role }] : []
  })
}

/**
 * Satu model ekspor per sesi. `people` harus sudah berurutan (sortPeople) dan hanya berisi orang yang berhak absen.
 * Penomoran diulang dari 1 di tiap tabel.
 */
export function buildAttendanceModels(
  activity: Pick<Activity, 'name'>,
  people: readonly Participant[],
  sessions: readonly AttendanceSession[],
  attendances: readonly Attendance[],
  members: readonly SessionMember[],
  satkerOrder: readonly string[] | null,
  opts: AttExportOptions,
): ExportModel[] {
  const cols = ORDER.filter((c) => opts.columns.includes(c))
  const byKey = new Map(attendances.map((a) => [`${a.participant_id}:${a.session_id}`, a]))
  const withUnit = opts.group !== 'satker'

  return opts.sessionIds.flatMap((sid) => {
    const s = sessions.find((x) => x.id === sid)
    if (!s) return []
    const roster = sessionRoster(s, people, members, opts)
    const roleOf = new Map(roster.map((r) => [r.p.id, r.role]))
    const att = (p: Participant) => byKey.get(`${p.id}:${s.id}`)
    const cell = (p: Participant, c: AttColumn): string => {
      const a = att(p)
      switch (c) {
        case 'identifier': return p.identifier ?? ''
        case 'grade': return p.grade ?? ''
        case 'job_title': return p.job_title ?? ''
        case 'phone': return p.phone ?? ''
        case 'role': return ROLE_LABEL[roleOf.get(p.id)!]
        case 'status': return a ? ATT_LABEL[a.status] : 'Belum absen'
        case 'time': return a ? clock(a, s) : ''
        case 'signature': return ''
      }
    }
    const row = (p: Participant, n: number) => [String(n), p.name, ...(withUnit ? [p.institution?.trim() ?? ''] : []), ...cols.map((c) => cell(p, c))]
    const attended = (items: readonly Participant[]) => items.filter((p) => { const st = att(p)?.status; return st === 'hadir' || st === 'terlambat' }).length

    const ordered = groupBySatker(roster.map((r) => r.p), (p) => p.institution, satkerOrder)
    const flat = ordered.flatMap((g) => g.items)
    const groups = opts.group === 'satker'
      ? ordered.map((g) => ({ label: `${g.label} (${g.items.length} orang · ${attended(g.items)} hadir)`, rows: g.items.map((p, i) => row(p, i + 1)) }))
      : opts.group === 'jenis'
        ? ROLES.filter((r) => opts.roles.includes(r)).map((r) => {
            const items = flat.filter((p) => roleOf.get(p.id) === r)
            return { label: `${ROLE_LABEL[r]} (${items.length} orang · ${attended(items)} hadir)`, rows: items.map((p, i) => row(p, i + 1)) }
          })
        : [{ label: null, rows: flat.map((p, i) => row(p, i + 1)) }]

    const count = (st: string) => flat.filter((p) => (att(p) ? ATT_LABEL[att(p)!.status] : 'Belum absen') === st).length
    const summary = [...Object.values(ATT_LABEL), 'Belum absen'].map((st) => [st, count(st)] as const).filter(([, n]) => n > 0).map(([st, n]) => `${st} ${n}`).join(' · ')
    const keys: ColumnKey[] = ['no', 'name', ...(withUnit ? (['unit'] as const) : []), ...cols]
    return [{
      title: opts.title.trim() || 'Daftar Hadir',
      subtitle: [activity.name, `${s.title} · ${fmtDateTime(s.start_at)} – ${fmtTime(s.end_at)}`, `${flat.length} orang${summary ? ` · ${summary}` : ''}`],
      headers: ['No', 'Nama Lengkap & Gelar', ...(withUnit ? ['Satuan Kerja'] : []), ...cols.map((c) => LABEL[c])],
      keys,
      groups: groups.filter((g) => g.rows.length > 0),
      total: flat.length,
      landscape: opts.landscape,
      hasSignature: cols.includes('signature'),
    }]
  })
}
