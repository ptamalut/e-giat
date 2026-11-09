import { describe, expect, it } from 'vitest'
import { currentPage, nextScrollLeft, slidePages } from './slider'

describe('slider', () => {
  it('slidePages: jumlah halaman dari lebar isi', () => {
    expect(slidePages(1000, 1000)).toBe(1)
    expect(slidePages(2500, 1000)).toBe(3)
    expect(slidePages(2000, 1000)).toBe(2)
    expect(slidePages(500, 0)).toBe(1)
  })
  it('currentPage: halaman terdekat dan halaman terakhir di ujung kanan', () => {
    expect(currentPage(0, 1000, 2500)).toBe(0)
    expect(currentPage(900, 1000, 2500)).toBe(1)
    expect(currentPage(1500, 1000, 2500)).toBe(2) // ujung kanan (maks gulir = 1500)
  })
  it('nextScrollLeft: maju 90% lebar, berhenti di ujung, atau kembali ke awal bila wrap', () => {
    expect(nextScrollLeft(0, 1000, 2500, 1)).toBe(900)
    expect(nextScrollLeft(900, 1000, 2500, 1)).toBe(1500)
    expect(nextScrollLeft(1500, 1000, 2500, 1)).toBeNull()
    expect(nextScrollLeft(1500, 1000, 2500, 1, true)).toBe(0)
    expect(nextScrollLeft(1500, 1000, 2500, -1)).toBe(600)
    expect(nextScrollLeft(0, 1000, 2500, -1)).toBeNull()
    expect(nextScrollLeft(0, 1000, 2500, -1, true)).toBe(1500)
    expect(nextScrollLeft(0, 1000, 800, 1, true)).toBeNull() // tidak ada yang bisa digulir
  })
})
