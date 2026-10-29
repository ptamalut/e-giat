import { describe, expect, it } from 'vitest'
import { fitSize, fmtAccuracy, fmtCoord, mapsUrl } from './capture'

describe('capture helpers', () => {
  it('fitSize mengecilkan sisi terpanjang dan menjaga rasio, tidak memperbesar', () => {
    expect(fitSize(1280, 960, 720)).toEqual({ w: 720, h: 540 })
    expect(fitSize(960, 1280, 720)).toEqual({ w: 540, h: 720 })
    expect(fitSize(400, 300, 720)).toEqual({ w: 400, h: 300 })
    expect(fitSize(0, 0, 720).w).toBeGreaterThanOrEqual(1)
  })
  it('format lokasi', () => {
    expect(mapsUrl(-7.1234567, 110.4)).toBe('https://www.google.com/maps?q=-7.123457,110.400000')
    expect(fmtCoord(-7.123456, 110.456789)).toBe('-7.12346, 110.45679')
    expect(fmtAccuracy(12.4)).toBe('±12 m')
    expect(fmtAccuracy(2500)).toBe('±2.5 km')
    expect(fmtAccuracy(null)).toBe('')
  })
})
