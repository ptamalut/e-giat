// @vitest-environment node
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { exportNoteDocx, type NoteLogo } from './exportNote'
import { exportNotePdf } from './exportNotePdf'
import { buildNoteDoc } from './noteDoc'
import { SAMPLE_KOP, SAMPLE_NOTE } from './noteFixture'

// PNG 8x4 piksel hijau sebagai logo uji
function png(w: number, h: number): Uint8Array {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = (b: Uint8Array) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const u32 = (n: number) => Uint8Array.of(n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255)
  const chunk = (type: string, data: Uint8Array) => {
    const body = Uint8Array.from([...Array.from(type, (c) => c.charCodeAt(0)), ...data])
    return Uint8Array.from([...u32(data.length), ...body, ...u32(crc(body))])
  }
  const raw = new Uint8Array(h * (1 + w * 3))
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (1 + w * 3) + 1 + x * 3; raw[o] = 14; raw[o + 1] = 122; raw[o + 2] = 69 }
  return Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, ...chunk('IHDR', Uint8Array.from([...u32(w), ...u32(h), 8, 2, 0, 0, 0])), ...chunk('IDAT', deflateSync(raw)), ...chunk('IEND', new Uint8Array())])
}
const LOGO: NoteLogo = { w: 8, h: 4, data: png(8, 4) }
const doc = buildNoteDoc(SAMPLE_NOTE, SAMPLE_KOP, 'Asia/Jayapura')
const buf = async (b: Blob) => new Uint8Array(await b.arrayBuffer())
const OUT = process.env.NOTE_OUT

describe('ekspor notula', () => {
  it('Word: berkas .docx berisi kop, header, bagian, tabel, dan tanda tangan', async () => {
    const blob = await exportNoteDocx(doc, LOGO, 'Rapat')
    const bytes = await buf(blob)
    expect(String.fromCharCode(...bytes.slice(0, 2))).toBe('PK')
    if (OUT) writeFileSync(`${OUT}/notula.docx`, bytes)
    const zip = unzipSync(bytes)
    const xml = strFromU8(zip['word/document.xml'])
    for (const s of ['MAHKAMAH AGUNG REPUBLIK INDONESIA', 'NOTULA', 'Dasar', '10.00 WIT s.d. selesai', 'Jalannya Rapat:', 'A. Pembukaan', 'Struktur kepanitiaan.', 'Rencana Tindak Lanjut', 'Penanggung Jawab', 'Mengetahui,', 'NIP. 196806051992031004']) {
      expect(xml, s).toContain(s)
    }
    expect(Object.keys(zip).some((f) => f.startsWith('word/media/'))).toBe(true)   // logo tertanam
  })
  it('Word tanpa logo dan tanpa kop tetap dibuat', async () => {
    const bare = buildNoteDoc({ follow_ups: [], held_at: null }, { title: [], address: [] })
    const bytes = await buf(await exportNoteDocx(bare, null))
    const zip = unzipSync(bytes)
    expect(Object.keys(zip).some((f) => f.startsWith('word/media/'))).toBe(false)
  })
  it('PDF: dokumen A4 beberapa halaman', async () => {
    const bytes = await buf(await exportNotePdf(doc, LOGO, 'Rapat'))
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-')
    if (OUT) writeFileSync(`${OUT}/notula.pdf`, bytes)
    const pages = (new TextDecoder('latin1').decode(bytes).match(/\/Type\s*\/Page\b/g) ?? []).length
    expect(pages).toBeGreaterThanOrEqual(2)
  })
  it('PDF: logo rusak dilewati, dokumen tetap jadi', async () => {
    const bytes = await buf(await exportNotePdf(doc, { w: 8, h: 4, data: Uint8Array.of(1, 2, 3) }))
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-')
  })
  it('PDF kosong tidak gagal', async () => {
    const bytes = await buf(await exportNotePdf(buildNoteDoc({ follow_ups: [], held_at: null }, { title: [], address: [] }), null))
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-')
  })
})
