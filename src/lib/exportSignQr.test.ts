// @vitest-environment node
import { writeFileSync } from 'node:fs'
import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { exportDocx } from './exportDocx'
import { exportPdf } from './exportPdf'
import type { ExportModel } from './exportModel'

const code = (c: string) => c.repeat(32)
const model = (signs: (string | null)[] | undefined): ExportModel => ({
  title: 'Daftar Hadir', subtitle: ['Diklat', 'Hari 1'],
  headers: ['No', 'Nama Lengkap & Gelar', 'Tanda Tangan'], keys: ['no', 'name', 'signature'],
  groups: [{ label: null, rows: [['1', 'Budi', ''], ['2', 'Siti', ''], ['3', 'Andi', '']], signs }],
  total: 3, landscape: false, hasSignature: true, footnote: signs?.some(Boolean) ? 'Tanda tangan elektronik: pindai kode QR.' : undefined,
})
const OUT = process.env.NOTE_OUT

describe('ekspor daftar hadir dengan QR', () => {
  const signs = [`https://x.id/v/${code('a')}`, null, `https://x.id/v/${code('b')}`]
  it('Word: gambar QR tertanam sebanyak yang hadir + catatan kaki', async () => {
    const bytes = new Uint8Array(await (await exportDocx(model(signs))).arrayBuffer())
    if (OUT) writeFileSync(`${OUT}/hadir-qr.docx`, bytes)
    const zip = unzipSync(bytes)
    expect(Object.keys(zip).filter((f) => f.startsWith('word/media/'))).toHaveLength(2)
    expect(strFromU8(zip['word/document.xml'])).toContain('Tanda tangan elektronik')
  })
  it('Word tanpa QR: tidak ada gambar', async () => {
    const zip = unzipSync(new Uint8Array(await (await exportDocx(model(undefined))).arrayBuffer()))
    expect(Object.keys(zip).some((f) => f.startsWith('word/media/'))).toBe(false)
  })
  it('PDF: dokumen jadi dan memuat gambar QR', async () => {
    const bytes = new Uint8Array(await (await exportPdf(model(signs))).arrayBuffer())
    if (OUT) writeFileSync(`${OUT}/hadir-qr.pdf`, bytes)
    const text = new TextDecoder('latin1').decode(bytes)
    expect(text.startsWith('%PDF-')).toBe(true)
    expect((text.match(/\/Subtype\s*\/Image/g) ?? []).length).toBeGreaterThanOrEqual(2)
    const plain = new TextDecoder('latin1').decode(new Uint8Array(await (await exportPdf(model(undefined))).arrayBuffer()))
    expect((plain.match(/\/Subtype\s*\/Image/g) ?? []).length).toBe(0)
  })
})
