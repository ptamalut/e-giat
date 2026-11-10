import {
  AlignmentType, BorderStyle, Document, HeightRule, ImageRun, Packer, Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun, VerticalAlign, WidthType,
} from 'docx'
import { kopBlocks, type NoteLogo } from './exportNote'
import { PAPER_MM, type HadirDoc } from './hadirDoc'
import { dataUrlBytes, qrMap } from './signQr'

const FONT = 'Arial'
const MM = 56.7                       // twip per mm
const SIZE = 22                       // 11 pt
const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const noBorders = { top: none, bottom: none, left: none, right: none }
const line = { style: BorderStyle.SINGLE, size: 6, color: '000000' }
const box = { top: line, bottom: line, left: line, right: line }

const txt = (text: string, o: { bold?: boolean; size?: number; underline?: boolean; italics?: boolean } = {}) =>
  new TextRun({ text, bold: o.bold, italics: o.italics, size: o.size ?? SIZE, font: FONT, underline: o.underline ? {} : undefined })

function section(d: HadirDoc, logo: NoteLogo | null, qrs: Map<string, string>) {
  const paper = PAPER_MM[d.paper]
  const pageW = Math.round(paper.w * MM), pageH = Math.round(paper.h * MM)
  const margin = { top: Math.round(14 * MM), bottom: Math.round(10 * MM), left: Math.round(18 * MM), right: Math.round(18 * MM) }
  const contentW = pageW - margin.left - margin.right
  const withQr = d.rows.some((r) => r.sign)
  const widths = d.widths.map((w) => Math.round(w * contentW))
  widths[widths.length - 1] += contentW - widths.reduce((a, b) => a + b, 0)
  const last = widths.length - 1

  // keterangan: label : nilai
  const L = Math.round(34 * MM), C = Math.round(5 * MM)
  const info = new Table({
    width: { size: contentW, type: WidthType.DXA }, columnWidths: [L, C, contentW - L - C], layout: TableLayoutType.FIXED,
    borders: { ...noBorders, insideHorizontal: none, insideVertical: none },
    rows: d.info.map((r) => new TableRow({ cantSplit: true, children: [
      new TableCell({ width: { size: L, type: WidthType.DXA }, borders: noBorders, children: [new Paragraph({ spacing: { after: 20 }, children: [txt(r.label)] })] }),
      new TableCell({ width: { size: C, type: WidthType.DXA }, borders: noBorders, children: [new Paragraph({ spacing: { after: 20 }, children: [txt(':')] })] }),
      new TableCell({ width: { size: contentW - L - C, type: WidthType.DXA }, borders: noBorders, children: [new Paragraph({ spacing: { after: 20 }, children: [txt(r.value)] })] }),
    ] })),
  })

  const cell = (text: string, i: number, o: { head?: boolean; qr?: string | null } = {}) => new TableCell({
    width: { size: widths[i], type: WidthType.DXA }, borders: box, verticalAlign: VerticalAlign.CENTER, margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: [o.qr && qrs.has(o.qr)
      ? new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: 'png', data: dataUrlBytes(qrs.get(o.qr)!), transformation: { width: 44, height: 44 } })] })
      : new Paragraph({ alignment: o.head || i === 0 || (i === last - 1 && d.head[i] === 'JABATAN') ? AlignmentType.CENTER : AlignmentType.LEFT, children: [txt(text, { bold: o.head, size: o.head ? 21 : 21 })] })],
  })
  const table = new Table({
    width: { size: contentW, type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, height: { value: Math.round(10 * MM), rule: HeightRule.ATLEAST }, children: d.head.map((h, i) => cell(h, i, { head: true })) }),
      ...d.rows.map((r) => new TableRow({
        cantSplit: true, height: { value: Math.round((withQr ? 12.5 : 10) * MM), rule: HeightRule.ATLEAST },
        children: r.cells.map((c, i) => cell(c, i)).concat([cell('', last, { qr: r.sign })]),
      })),
    ],
  })

  // Mengetahui, Koordinator Absen (kiri) dan Petugas Absen (kanan)
  const half = Math.floor(contentW / 2)
  const sigCol = (caption: string, name: string, indent: number) => new TableCell({
    width: { size: half, type: WidthType.DXA }, borders: noBorders,
    children: [
      new Paragraph({ keepNext: true, indent: { left: indent }, children: [txt(caption)] }),
      new Paragraph({ keepNext: true, spacing: { before: Math.round(18 * MM) }, indent: { left: indent }, children: [txt(name || '.'.repeat(36), { bold: !!name })] }),
    ],
  })
  const signTable = new Table({
    width: { size: contentW, type: WidthType.DXA }, columnWidths: [half, contentW - half], layout: TableLayoutType.FIXED,
    borders: { ...noBorders, insideHorizontal: none, insideVertical: none },
    rows: [new TableRow({ cantSplit: true, children: [sigCol(d.sign.left.caption, d.sign.left.name, 0), sigCol(d.sign.right.caption, d.sign.right.name, Math.round(8 * MM))] })],
  })

  return {
    properties: { page: { size: { width: pageW, height: pageH }, margin } },
    children: [
      ...kopBlocks(d.kop, logo, { font: FONT, contentW }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 200 }, children: [txt(d.title, { bold: true, underline: true })] }),
      info,
      new Paragraph({ spacing: { after: 120 }, children: [] }),
      table,
      ...(d.footnote ? [new Paragraph({ spacing: { before: 80 }, children: [txt(d.footnote, { italics: true, size: 16 })] })] : []),
      new Paragraph({ keepNext: true, spacing: { before: 140, after: 40 }, children: [txt(d.sign.caption)] }),
      signTable,
    ],
  }
}

/** Daftar hadir resmi dalam Word (.docx); tiap dokumen (sesi) menjadi bagian tersendiri. */
export async function exportHadirDocx(docs: readonly HadirDoc[], logo: NoteLogo | null = null, title = 'Daftar Hadir'): Promise<Blob> {
  const qrs = await qrMap(docs.flatMap((d) => d.rows.map((r) => r.sign)))
  const doc = new Document({
    creator: 'LAKSANA', title,
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: docs.map((d) => section(d, logo, qrs)),
  })
  return Packer.toBlob(doc)
}
