import {
  AlignmentType, BorderStyle, Document, Footer, HeightRule, Packer, PageNumber, PageOrientation, Paragraph,
  ShadingType, Table, TableLayoutType, TableRow, TableCell, TextRun, VerticalAlign, WidthType,
} from 'docx'
import { columnWidthsMm, type ExportModel } from './exportModel'

const CM = 567 // twips per cm
const FONT = 'Calibri'

/** Dokumen Word (.docx) dari model ekspor. */
export async function exportDocx(model: ExportModel, printedAt = new Date()): Promise<Blob> {
  const margin = Math.round(1.5 * CM)
  const pageW = model.landscape ? 29.7 * CM : 21 * CM
  const contentW = Math.round(pageW - 2 * margin)

  const widths = columnWidthsMm(model.keys, contentW / CM * 10).map((mm) => Math.round((mm / 10) * CM))
  widths[widths.length - 1] += contentW - widths.reduce((a, b) => a + b, 0) // sisa pembulatan

  const line = { style: BorderStyle.SINGLE, size: 4, color: '9AA3B8' }
  const borders = { top: line, bottom: line, left: line, right: line }
  const run = (text: string, o: { bold?: boolean; size?: number; color?: string } = {}) =>
    new TextRun({ text, bold: o.bold, size: o.size ?? 19, color: o.color, font: FONT })

  const headCell = (text: string, i: number) => new TableCell({
    width: { size: widths[i], type: WidthType.DXA },
    borders,
    shading: { type: ShadingType.CLEAR, fill: '4F46E5', color: 'auto' },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 70, bottom: 70, left: 90, right: 90 },
    children: [new Paragraph({ alignment: i === 0 ? AlignmentType.CENTER : AlignmentType.LEFT, children: [run(text, { bold: true, color: 'FFFFFF', size: 18 })] })],
  })

  const bodyCell = (text: string, i: number) => new TableCell({
    width: { size: widths[i], type: WidthType.DXA },
    borders,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    children: [new Paragraph({ alignment: i === 0 ? AlignmentType.CENTER : AlignmentType.LEFT, children: [run(text)] })],
  })

  const children: (Paragraph | Table)[] = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [run(model.title.toUpperCase(), { bold: true, size: 30 })] }),
    ...model.subtitle.map((t, i) => new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: i === model.subtitle.length - 1 ? 240 : 20 },
      children: [run(t, { bold: i === 0, size: i === 0 ? 24 : 20, color: i === 0 ? undefined : '475569' })],
    })),
  ]

  model.groups.forEach((g, gi) => {
    if (g.label) {
      children.push(new Paragraph({
        keepNext: true, spacing: { before: gi === 0 ? 60 : 280, after: 100 },
        children: [run(`${gi + 1}. ${g.label}`, { bold: true, size: 22, color: '312E81' })],
      }))
    }
    children.push(new Table({
      width: { size: contentW, type: WidthType.DXA },
      columnWidths: widths,
      layout: TableLayoutType.FIXED,
      rows: [
        new TableRow({ tableHeader: true, cantSplit: true, children: model.headers.map((h, i) => headCell(h, i)) }),
        ...g.rows.map((r) => new TableRow({
          cantSplit: true,
          height: model.hasSignature ? { value: Math.round(1.0 * CM), rule: HeightRule.ATLEAST } : undefined,
          children: r.map((c, i) => bodyCell(c, i)),
        })),
      ],
    }))
  })

  const footer = new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        run(`Dicetak ${printedAt.toLocaleDateString('id-ID', { dateStyle: 'long' })} · Halaman `, { size: 16, color: '64748B' }),
        new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '64748B', font: FONT }),
        run(' dari ', { size: 16, color: '64748B' }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: '64748B', font: FONT }),
      ],
    })],
  })

  const doc = new Document({
    creator: 'LAKSANA',
    title: model.title,
    styles: { default: { document: { run: { font: FONT, size: 19 } } } },
    sections: [{
      properties: {
        page: {
          size: { width: Math.round(21 * CM), height: Math.round(29.7 * CM), orientation: model.landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
          margin: { top: margin, bottom: margin, left: margin, right: margin },
        },
      },
      footers: { default: footer },
      children,
    }],
  })
  return Packer.toBlob(doc)
}
