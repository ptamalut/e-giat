import { describe, expect, it } from 'vitest'
import { attendeesText, cleanFollowUps, followUpProgress, overdue } from './notes'

const F = (task: string, over: Partial<{ done: boolean; due: string; pic: string }> = {}) => ({ id: task, task, pic: '', due: '', done: false, ...over })

describe('notula', () => {
  it('cleanFollowUps membuang baris tanpa tugas dan merapikan spasi', () => {
    expect(cleanFollowUps([F('  Kirim laporan '), F('   '), F('', {})])).toEqual([{ id: '  Kirim laporan ', task: 'Kirim laporan', pic: '', due: '', done: false }])
  })
  it('followUpProgress menghitung yang selesai', () => {
    expect(followUpProgress([F('a', { done: true }), F('b')])).toEqual({ done: 1, total: 2, label: '1/2 selesai' })
    expect(followUpProgress([]).label).toBe('tanpa tindak lanjut')
  })
  it('overdue hanya untuk yang belum selesai dan lewat tenggat', () => {
    expect(overdue(F('a', { due: '2026-01-01' }), '2026-02-01')).toBe(true)
    expect(overdue(F('a', { due: '2026-01-01', done: true }), '2026-02-01')).toBe(false)
    expect(overdue(F('a', { due: '2026-03-01' }), '2026-02-01')).toBe(false)
    expect(overdue(F('a'), '2026-02-01')).toBe(false)
  })
  it('attendeesText memberi nomor dan satker', () => {
    expect(attendeesText([{ name: 'Budi', institution: 'Dinas A' }, { name: 'Siti' }])).toBe('1. Budi (Dinas A)\n2. Siti')
  })
})
