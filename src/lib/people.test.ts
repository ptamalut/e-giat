import { describe, expect, it } from 'vitest'
import { defaultAccess, defaultAccessFor, hasRole, rolesForJenis, rolesLabel, rolesOf, sortRoles } from './people'

describe('jenis merangkap', () => {
  it('rolesOf memakai roles bila ada, selain itu role tunggal, urut menurut urutan baku', () => {
    expect(rolesOf({ role: 'peserta' })).toEqual(['peserta'])
    expect(rolesOf({ role: 'peserta', roles: [] })).toEqual(['peserta'])
    expect(rolesOf({ role: 'moderator', roles: ['panitia', 'moderator'] })).toEqual(['moderator', 'panitia'])
  })
  it('hasRole dan rolesLabel memperhitungkan semua jenis', () => {
    const p = { role: 'peserta' as const, roles: ['peserta' as const, 'narasumber' as const] }
    expect(hasRole(p, 'narasumber')).toBe(true)
    expect(hasRole(p, 'panitia')).toBe(false)
    expect(rolesLabel(p)).toBe('Peserta / Narasumber')
    expect(rolesLabel(p, ', ')).toBe('Peserta, Narasumber')
  })
  it('sortRoles membuang duplikat dan mengurutkan', () => {
    expect(sortRoles(['panitia', 'peserta', 'panitia'])).toEqual(['peserta', 'panitia'])
  })
  it('defaultAccessFor menggabungkan isian awal tiap jenis (atau)', () => {
    expect(defaultAccessFor(['peserta'])).toEqual(defaultAccess('peserta'))
    const both = defaultAccessFor(['peserta', 'panitia'])
    expect(both.access_quiz).toBe(true)          // dari peserta
    expect(both.access_notes).toBe(true)         // dari panitia
    expect(both.access_documentation).toBe(true) // dari panitia
    expect(defaultAccessFor(['narasumber', 'moderator']).access_quiz).toBe(false)
    expect(defaultAccessFor([])).toEqual(defaultAccess('peserta'))
  })
})

describe('jenis kegiatan', () => {
  it('rolesForJenis: diklat 4 jenis, kegiatan hanya peserta dan petugas, bawaan diklat', () => {
    expect(rolesForJenis('diklat')).toEqual(['peserta', 'narasumber', 'moderator', 'panitia'])
    expect(rolesForJenis('kegiatan')).toEqual(['peserta', 'petugas'])
    expect(rolesForJenis(undefined)).toEqual(['peserta', 'narasumber', 'moderator', 'panitia'])
  })
  it('petugas: urutan baku setelah panitia, hak akses awal = semua menu kecuali kuis', () => {
    expect(sortRoles(['petugas', 'peserta'])).toEqual(['peserta', 'petugas'])
    expect(defaultAccess('petugas')).toEqual({ access_attendance: true, access_notes: true, access_quiz: false, access_certificate: true, access_documentation: true })
    expect(rolesLabel({ role: 'peserta', roles: ['peserta', 'petugas'] })).toBe('Peserta / Petugas')
  })
})
