import { describe, expect, it } from 'vitest'
import { codeFromUrl, dataUrlBytes, qrDataUrl, qrMap, signUrl } from './signQr'

const CODE = '0123456789abcdef0123456789abcdef'

describe('QR tanda tangan elektronik', () => {
  it('alamat verifikasi dan kodenya', () => {
    expect(signUrl('https://x.id/', CODE)).toBe(`https://x.id/v/${CODE}`)
    expect(signUrl('https://x.id', CODE)).toBe(`https://x.id/v/${CODE}`)
    expect(codeFromUrl(`https://x.id/v/${CODE}`)).toBe(CODE)
    expect(codeFromUrl('https://x.id/v/abc')).toBeNull()
    expect(codeFromUrl('https://x.id/p/token')).toBeNull()
  })
  it('QR berupa PNG; qrMap membuang duplikat', async () => {
    const u = await qrDataUrl(`https://x.id/v/${CODE}`)
    expect(u.startsWith('data:image/png;base64,')).toBe(true)
    const b = dataUrlBytes(u)
    expect([...b.slice(0, 4)]).toEqual([137, 80, 78, 71])
    const m = await qrMap([`https://x.id/v/${CODE}`, `https://x.id/v/${CODE}`, null, undefined])
    expect(m.size).toBe(1)
  })
})
