import { describe, expect, it } from 'vitest'
import { buildAttendanceModels, type AttExportOptions } from './exportAttendance'
import type { Attendance, AttendanceSession, Participant, PersonRole, SessionMember } from './types'

const P = (id: string, institution: string, role: PersonRole = 'peserta', roles: PersonRole[] = [role]): Participant => ({
  id, activity_id: 'a', name: id.toUpperCase(), identifier: `nip-${id}`, grade: null, job_title: `Jabatan ${id}`, institution, email: null, phone: null, role, roles,
  employee_id: null, access_attendance: true, access_quiz: true, access_certificate: true, access_notes: false, access_documentation: false, sort_order: null, token: id, created_at: '',
})
const S = (id: string, title: string, custom = false): AttendanceSession => ({
  id, activity_id: 'a', title, start_at: '2026-10-30T01:00:00Z', end_at: '2026-10-30T04:00:00Z', late_minutes: 15, require_selfie: false, require_location: false, custom_members: custom, created_at: '',
} as AttendanceSession)
const A = (s: string, p: string, status: Attendance['status']): Attendance => ({ id: s + p, activity_id: 'a', session_id: s, participant_id: p, status, checked_in_at: '2026-10-30T01:05:00Z', note: null, manual: false } as Attendance)
const M = (s: string, p: string, role: PersonRole): SessionMember => ({ session_id: s, activity_id: 'a', participant_id: p, role } as SessionMember)

const people = [P('a', 'Dinas A'), P('b', 'Dinas A', 'narasumber'), P('c', 'Dinas B'), P('d', 'Dinas B', 'peserta', ['peserta', 'moderator'])]
const sessions = [S('s1', 'Hari 1'), S('s2', 'Hari 2', true)]
const atts = [A('s1', 'a', 'hadir'), A('s1', 'c', 'terlambat'), A('s1', 'd', 'izin'), A('s2', 'd', 'hadir')]
const members = [M('s2', 'd', 'moderator'), M('s2', 'a', 'peserta'), M('s2', 'b', 'narasumber')]
const base: AttExportOptions = { title: 'Daftar Hadir', sessionIds: ['s1'], roles: ['peserta', 'narasumber', 'moderator', 'panitia'], unit: '', group: 'satker', columns: ['identifier', 'role', 'status', 'time'], landscape: true }
const build = (o: Partial<AttExportOptions> = {}) => buildAttendanceModels({ name: 'Diklat' }, people, sessions, atts, members, null, { ...base, ...o })

describe('ekspor absensi', () => {
  it('satu model per sesi, dengan ringkasan status dan tabel per satker', () => {
    const [m] = build()
    expect(m.groups.map((g) => g.label)).toEqual(['Dinas A (2 orang · 1 hadir)', 'Dinas B (2 orang · 1 hadir)'])
    expect(m.subtitle[2]).toBe('4 orang · Hadir 1 · Terlambat 1 · Izin 1 · Belum absen 1')
    expect(m.headers).toEqual(['No', 'Nama Lengkap & Gelar', 'NIP', 'Kedudukan', 'Status', 'Jam Absen'])
    expect(m.groups[0].rows[0]).toEqual(['1', 'A', 'nip-a', 'Peserta', 'Hadir', expect.stringMatching(/\d/)])
    expect(m.groups[0].rows[1].slice(3, 5)).toEqual(['Narasumber', 'Belum absen'])
  })

  it('beberapa sesi menghasilkan beberapa model berurutan', () => {
    expect(build({ sessionIds: ['s1', 's2'] }).map((m) => m.subtitle[1].split(' · ')[0])).toEqual(['Hari 1', 'Hari 2'])
  })

  it('kedudukan mengikuti sesi: yang merangkap tampil sebagai moderator di sesi yang diatur per orang', () => {
    const [m] = build({ sessionIds: ['s2'], group: 'none' })
    const d = m.groups[0].rows.find((r) => r[1] === 'D')!
    expect(d).toContain('Moderator')
    expect(m.total).toBe(3) // c tidak ikut sesi 2
    const [m1] = build({ sessionIds: ['s1'], group: 'none' })
    expect(m1.groups[0].rows.find((r) => r[1] === 'D')).toContain('Peserta') // sesi bawaan: jenis utama
  })

  it('filter jenis dan satuan kerja', () => {
    const [m] = build({ sessionIds: ['s2'], roles: ['moderator', 'narasumber'], group: 'none' })
    expect(m.groups[0].rows.map((r) => r[1])).toEqual(['B', 'D'])
    const [u] = build({ unit: 'dinas b' })
    expect(u.groups).toHaveLength(1)
    expect(u.groups[0].rows.map((r) => r[1])).toEqual(['C', 'D'])
  })

  it('pengelompokan per jenis memberi kolom Satuan Kerja dan penomoran per tabel', () => {
    const [m] = build({ sessionIds: ['s2'], group: 'jenis' })
    expect(m.headers[2]).toBe('Satuan Kerja')
    expect(m.groups.map((g) => g.label)).toEqual(['Peserta (1 orang · 0 hadir)', 'Narasumber (1 orang · 0 hadir)', 'Moderator (1 orang · 1 hadir)'])
    expect(m.groups.every((g) => g.rows[0][0] === '1')).toBe(true)
  })

  it('satu tabel: penomoran berlanjut; kolom tanda tangan ditandai', () => {
    const [m] = build({ group: 'none', columns: ['signature'] })
    expect(m.groups).toHaveLength(1)
    expect(m.groups[0].rows.map((r) => r[0])).toEqual(['1', '2', '3', '4'])
    expect(m.hasSignature).toBe(true)
  })

  it('sesi tanpa anggota yang cocok tidak punya tabel', () => {
    const [m] = build({ roles: ['panitia'] })
    expect(m.total).toBe(0)
    expect(m.groups).toEqual([])
  })
})
