import { describe, expect, it } from 'vitest'
import { activityPhase, todayStr } from './phase'

describe('tahap kegiatan', () => {
  const T = '2026-11-10'
  it('aktif sebelum tanggal mulai = mendatang; hari H dan sesudahnya = berjalan', () => {
    expect(activityPhase({ status: 'aktif', start_date: '2026-11-11' }, T)).toBe('mendatang')
    expect(activityPhase({ status: 'aktif', start_date: '2026-11-10' }, T)).toBe('berjalan')
    expect(activityPhase({ status: 'aktif', start_date: '2026-11-01' }, T)).toBe('berjalan')
  })
  it('tanpa tanggal mulai dianggap berjalan', () => {
    expect(activityPhase({ status: 'aktif', start_date: null }, T)).toBe('berjalan')
  })
  it('draft dan selesai mengikuti statusnya, apa pun tanggalnya', () => {
    expect(activityPhase({ status: 'draft', start_date: '2026-12-01' }, T)).toBe('draft')
    expect(activityPhase({ status: 'selesai', start_date: '2026-12-01' }, T)).toBe('selesai')
  })
  it('todayStr memakai tanggal lokal perangkat', () => {
    expect(todayStr(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(todayStr(new Date(2026, 10, 10, 0, 1))).toBe('2026-11-10')
  })
})
