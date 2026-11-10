import {
  AlignmentType, BorderStyle, Document, ImageRun, Packer, Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun, VerticalAlign, WidthType,
  type ParagraphChild,
} from 'docx'
import type { Block, NoteDoc, Run, SignBlock } from './noteDoc'

/** Logo kop: PNG (byte) beserta ukuran aslinya. */
export interface NoteLogo { data: Uint8Array; w: number; h: number }

const FONT = 'Times New Roman'
const SIZE = 24          // 12 pt (satuan setengah poin)
const PAGE_W = 11906, PAGE_H = 16838                       // A4 (twip)
const M = { top: 1134, bottom: 1134, left: 1418, right: 1134 }
const CONTENT_W = PAGE_W - M.left - M.right
const INDENT = 567       // 1 cm
const HANG = 425

const run = (r: Run, size = SIZE) => new TextRun({ text: r.text, bold: r.bold, font: FONT, size })
const txt = (text: string, o: { bold?: boolean; size?: number } = {}) => new TextRun({ text, bold: o.bold, font: FONT, size: o.size ?? SIZE })

const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const noBorders = { top: none, bottom: none, left: none, right: none }
const line = { style: BorderStyle.SINGLE, size: 4, color: '000000' }
const box = { top: line, bottom: line, left: line, right: line }

/** Kop: logo di kiri, judul tebal dan alamat di tengah, garis ganda di bawahnya. `font` dan `contentW` (twip) menyesuaikan dokumen lain yang memakai kop yang sama. */
export function kopBlocks(kop: { title: string[]; address: string[] }, logo: NoteLogo | null, opts: { font?: string; contentW?: number } = {}): (Paragraph | Table)[] {
  const { title, address } = kop
  const font = opts.font ?? FONT, contentW = opts.contentW ?? CONTENT_W
  if (!title.length && !address.length && !logo) return []
  const t = (text: string, o: { bold?: boolean; size?: number }) => new TextRun({ text, bold: o.bold, font, size: o.size ?? SIZE })
  const center = (children: ParagraphChild[], after = 0) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after }, children })
  const text = [...title.map((x) => center([t(x.toUpperCase(), { bold: true, size: 28 })])), ...address.map((x, i) => center([t(x, { size: 18 })], i === address.length - 1 ? 60 : 0))]
  let body: (Paragraph | Table)[] = text
  if (logo) {
    const h = 84, w = Math.max(1, Math.round((logo.w / logo.h) * h))
    const LOGO_COL = 1500
    body = [new Table({
      width: { size: contentW, type: WidthType.DXA }, columnWidths: [LOGO_COL, contentW - LOGO_COL], layout: TableLayoutType.FIXED,
      borders: { ...noBorders, insideHorizontal: none, insideVertical: none },
      rows: [new TableRow({ children: [
        new TableCell({ width: { size: LOGO_COL, type: WidthType.DXA }, borders: noBorders, verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ children: [new ImageRun({ type: 'png', data: logo.data, transformation: { width: w, height: h } })] })] }),
        new TableCell({ width: { size: contentW - LOGO_COL, type: WidthType.DXA }, borders: noBorders, verticalAlign: VerticalAlign.CENTER, children: text.length ? text : [new Paragraph({})] }),
      ] })],
    })]
  }
  return [
    ...body,
    new Paragraph({ spacing: { before: 40, after: 240 }, border: { bottom: { style: BorderStyle.THICK_THIN_SMALL_GAP, size: 12, color: '000000', space: 1 } }, children: [] }),
  ]
}

const kop = (d: NoteDoc, logo: NoteLogo | null) => kopBlocks(d.kop, logo)

function headerTable(d: NoteDoc): Table | null {
  if (!d.header.length) return null
  const L = 2100, C = 300, V = CONTENT_W - L - C
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [L, C, V], layout: TableLayoutType.FIXED,
    borders: { ...noBorders, insideHorizontal: none, insideVertical: none },
    rows: d.header.map((h) => new TableRow({ cantSplit: true, children: [
      new TableCell({ width: { size: L, type: WidthType.DXA }, borders: noBorders, children: [new Paragraph({ spacing: { after: 100 }, children: [txt(h.label)] })] }),
      new TableCell({ width: { size: C, type: WidthType.DXA }, borders: noBorders, children: [new Paragraph({ spacing: { after: 100 }, children: [txt(':')] })] }),
      new TableCell({ width: { size: V, type: WidthType.DXA }, borders: noBorders,
        children: h.value.split('\n').map((l) => new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 100 }, children: [txt(l)] })) }),
    ] })),
  })
}

function blockParagraphs(b: Block): (Paragraph | Table)[] {
  switch (b.t) {
    case 'heading':
      return [new Paragraph({ keepNext: true, spacing: { before: 200, after: 100 }, children: [txt(b.text, { bold: true })] })]
    case 'para':
      return [new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 100, line: 276 }, indent: { left: INDENT }, children: b.runs.map((r) => run(r)) })]
    case 'item': {
      const left = INDENT + HANG + (b.level ? INDENT : 0)
      return [new Paragraph({
        alignment: AlignmentType.JUSTIFIED, spacing: { after: 80, line: 276 }, indent: { left, hanging: HANG },
        children: [txt(`${b.marker}\t`, { bold: b.level === 0 && b.runs.length === 1 && !!b.runs[0].bold }), ...b.runs.map((r) => run(r))],
      })]
    }
    case 'table': {
      const widths = b.widths.map((w) => Math.round(w * CONTENT_W))
      const cell = (text: string, i: number, bold = false, head = false) => new TableCell({
        width: { size: widths[i], type: WidthType.DXA }, borders: box, verticalAlign: head ? VerticalAlign.CENTER : VerticalAlign.TOP,
        margins: { top: 50, bottom: 50, left: 90, right: 90 },
        children: text.split('\n').map((l) => new Paragraph({ alignment: head || b.center.includes(i) ? AlignmentType.CENTER : AlignmentType.LEFT, children: [txt(l, { bold, size: 22 })] })),
      })
      return [
        new Table({
          width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED,
          rows: [
            new TableRow({ tableHeader: true, cantSplit: true, children: b.head.map((h, i) => cell(h, i, true, true)) }),
            ...b.rows.map((r) => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, i)) })),
          ],
        }),
        new Paragraph({ spacing: { after: 100 }, children: [] }),
      ]
    }
  }
}

function signature(s: NonNullable<NoteDoc['signature']>): Table {
  const half = Math.floor(CONTENT_W / 2)
  const rows = Math.max(s.left.caption.length, s.right.caption.length)
  const pad = (c: string[]) => [...c, ...Array<string>(rows - c.length).fill('')]
  const col = (b: SignBlock, left: boolean) => new TableCell({
    width: { size: half, type: WidthType.DXA }, borders: noBorders,
    children: [
      ...pad(b.caption).map((c) => new Paragraph({ keepNext: true, indent: left ? undefined : { left: 400 }, children: [txt(c)] })),
      new Paragraph({ keepNext: true, spacing: { before: 1100 }, indent: left ? undefined : { left: 400 }, children: [txt(b.name, { bold: true })] }),
      ...(b.nip ? [new Paragraph({ indent: left ? undefined : { left: 400 }, children: [txt(b.nip)] })] : []),
    ],
  })
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [half, CONTENT_W - half], layout: TableLayoutType.FIXED,
    borders: { ...noBorders, insideHorizontal: none, insideVertical: none },
    rows: [new TableRow({ cantSplit: true, children: [col(s.left, true), col(s.right, false)] })],
  })
}

/** Notula dalam format Word (.docx) sesuai format resmi. */
export async function exportNoteDocx(d: NoteDoc, logo: NoteLogo | null = null, title = 'Notula'): Promise<Blob> {
  const head = headerTable(d)
  const children: (Paragraph | Table)[] = [
    ...kop(d, logo),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [txt(d.title)] }),
    ...(head ? [head] : []),
    ...d.blocks.flatMap(blockParagraphs),
    ...(d.signature ? [new Paragraph({ spacing: { before: 360 }, keepNext: true, children: [] }), signature(d.signature)] : []),
  ]
  const doc = new Document({
    creator: 'LAKSANA',
    title,
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: [{ properties: { page: { size: { width: PAGE_W, height: PAGE_H }, margin: M } }, children }],
  })
  return Packer.toBlob(doc)
}
