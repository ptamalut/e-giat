import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { NoteLogo } from './exportNote'
import { pdfSafe } from './exportPdf'
import type { Block, NoteDoc, Run } from './noteDoc'

// A4, satuan milimeter
const W = 210, H = 297
const ML = 25, MR = 20, MT = 20, MB = 20
const CW = W - ML - MR
const BOTTOM = H - MB
const FS = 12                 // ukuran huruf isi (pt)
const LH = 5.5                // tinggi baris (mm)
const INDENT = 10             // 1 cm
const HANG = 7.5

interface Word { text: string; bold: boolean; w: number }

type Doc = jsPDF

const setFont = (doc: Doc, bold: boolean, size = FS) => { doc.setFont('times', bold ? 'bold' : 'normal'); doc.setFontSize(size) }

/** Pecah rangkaian teks bergaya menjadi kata-kata beserta lebarnya. */
function words(doc: Doc, runs: readonly Run[]): Word[] {
  const out: Word[] = []
  for (const r of runs) {
    setFont(doc, !!r.bold)
    for (const t of pdfSafe(r.text).split(/\s+/)) if (t) out.push({ text: t, bold: !!r.bold, w: doc.getTextWidth(t) })
  }
  return out
}

/** Susun kata menjadi baris yang muat dalam `width` (greedy). */
function wrap(doc: Doc, ws: readonly Word[], width: number): Word[][] {
  setFont(doc, false)
  const space = doc.getTextWidth(' ')
  const lines: Word[][] = []
  let cur: Word[] = [], curW = 0
  for (const w of ws) {
    const add = cur.length ? space + w.w : w.w
    if (cur.length && curW + add > width) { lines.push(cur); cur = [w]; curW = w.w } else { cur.push(w); curW += add }
  }
  if (cur.length) lines.push(cur)
  return lines
}

/** Penulis halaman: melacak posisi y dan pindah halaman otomatis. */
class Pen {
  y = MT
  constructor(readonly doc: Doc) {}
  need(h: number) { if (this.y + h > BOTTOM) { this.doc.addPage('a4', 'portrait'); this.y = MT } }
  /** Tulis paragraf; `justify` = rata kiri-kanan kecuali baris terakhir. */
  para(runs: readonly Run[], x: number, width: number, opt: { justify?: boolean; after?: number } = {}) {
    const lines = wrap(this.doc, words(this.doc, runs), width)
    this.lines(lines, x, width, opt.justify ?? true)
    this.y += opt.after ?? 1.2
  }
  lines(lines: Word[][], x: number, width: number, justify: boolean) {
    const { doc } = this
    lines.forEach((ln, i) => {
      this.need(LH)
      setFont(doc, false)
      const space = doc.getTextWidth(' ')
      const sum = ln.reduce((a, w) => a + w.w, 0)
      const gap = justify && i < lines.length - 1 && ln.length > 1 ? (width - sum) / (ln.length - 1) : space
      let cx = x
      for (const w of ln) { setFont(doc, w.bold); doc.text(w.text, cx, this.y + 4); cx += w.w + gap }
      this.y += LH
    })
  }
}

/** Kop: logo kiri, judul tebal dan alamat di tengah, garis ganda. */
function drawKop(pen: Pen, d: NoteDoc, logo: NoteLogo | null) {
  const { doc } = pen
  const { title, address } = d.kop
  if (!title.length && !address.length && !logo) return
  const top = pen.y
  const lh = 22, lw = logo ? (logo.w / logo.h) * lh : 0
  if (logo) { try { doc.addImage(logo.data, 'PNG', ML, top, lw, lh) } catch { /* logo rusak: kop tetap dibuat tanpa gambar */ } }
  const tx = logo ? ML + lw + 3 : ML, tw = W - MR - tx, cx = tx + tw / 2
  const lines: { t: string; size: number; bold: boolean; step: number }[] = [
    ...title.map((t) => ({ t: pdfSafe(t.toUpperCase()), size: 14, bold: true, step: 5.6 })),
    ...address.map((t) => ({ t: pdfSafe(t), size: 9, bold: false, step: 4 })),
  ]
  // ukuran huruf sama untuk semua baris sejenis (judul / alamat); diperkecil seperlunya agar muat dalam lebar kop
  for (const bold of [true, false]) {
    const group = lines.filter((l) => l.bold === bold)
    while (group.length && group[0].size > 8 && group.some((l) => { setFont(doc, l.bold, group[0].size); return doc.getTextWidth(l.t) > tw })) group.forEach((l) => { l.size -= 0.5 })
  }
  const total = lines.reduce((a, l) => a + l.step, 0)
  let y = top + Math.max(0, (lh - total) / 2)
  for (const l of lines) {
    setFont(doc, l.bold, l.size)
    doc.text(l.t, cx, y + l.step - 1.2, { align: 'center' })
    y += l.step
  }
  const bottom = Math.max(top + (logo ? lh : 0), y) + 2
  doc.setDrawColor(0)
  doc.setLineWidth(0.9); doc.line(ML, bottom, W - MR, bottom)
  doc.setLineWidth(0.25); doc.line(ML, bottom + 1.3, W - MR, bottom + 1.3)
  pen.y = bottom + 7
}

function drawHeader(pen: Pen, d: NoteDoc) {
  const LBL = 38
  for (const h of d.header) {
    const lines = h.value.split('\n').flatMap((l) => wrap(pen.doc, words(pen.doc, [{ text: l }]), CW - LBL - 4))
    pen.need(LH)
    const y0 = pen.y
    setFont(pen.doc, false)
    pen.doc.text(pdfSafe(h.label), ML, y0 + 4)
    pen.doc.text(':', ML + LBL, y0 + 4)
    pen.lines(lines, ML + LBL + 4, CW - LBL - 4, true)
    pen.y += 1.4
  }
}

function drawBlock(pen: Pen, b: Block) {
  const { doc } = pen
  switch (b.t) {
    case 'heading':
      pen.need(LH * 3 + 4)
      pen.y += 3
      pen.para([{ text: b.text, bold: true }], ML, CW, { justify: false, after: 1.5 })
      break
    case 'para':
      pen.para(b.runs, ML + INDENT, CW - INDENT)
      break
    case 'item': {
      const mx = ML + INDENT + (b.level ? INDENT : 0)
      const tx = mx + HANG
      const lines = wrap(doc, words(doc, b.runs), W - MR - tx)
      pen.need(LH)
      const bold = b.level === 0 && b.runs.length === 1 && !!b.runs[0].bold
      setFont(doc, bold); doc.text(b.marker, mx, pen.y + 4)
      pen.lines(lines, tx, W - MR - tx, true)
      pen.y += 0.8
      break
    }
    case 'table': {
      pen.need(LH * 4)
      const widths = b.widths.map((w) => w * CW)
      autoTable(doc, {
        startY: pen.y,
        margin: { left: ML, right: MR, top: MT, bottom: MB },
        head: [b.head.map(pdfSafe)],
        body: b.rows.map((r) => r.map(pdfSafe)),
        theme: 'grid',
        styles: { font: 'times', fontSize: 11, cellPadding: 1.8, lineColor: [0, 0, 0], lineWidth: 0.2, textColor: 0, valign: 'top', overflow: 'linebreak' },
        headStyles: { fillColor: [255, 255, 255], textColor: 0, fontStyle: 'bold', halign: 'center', valign: 'middle' },
        columnStyles: Object.fromEntries(widths.map((w, i) => [i, { cellWidth: w, halign: b.center.includes(i) ? 'center' : 'left' }])) as Record<number, { cellWidth: number; halign: 'center' | 'left' }>,
        showHead: 'everyPage',
        rowPageBreak: 'avoid',
      })
      pen.y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4
      break
    }
  }
}

function drawSignature(pen: Pen, s: NonNullable<NoteDoc['signature']>) {
  const { doc } = pen
  const colW = CW / 2 - 4
  const rows = Math.max(s.left.caption.length, s.right.caption.length)
  const names = [s.left, s.right].map((b) => wrap(doc, words(doc, [{ text: b.name, bold: true }]), colW))
  const nameRows = Math.max(...names.map((n) => n.length), 1)
  pen.need(rows * LH + 24 + nameRows * LH + LH + 4)
  pen.y += 8
  const top = pen.y
  ;[s.left, s.right].forEach((b, ci) => {
    const x = ci === 0 ? ML : ML + CW / 2 + 4
    let y = top
    setFont(doc, false)
    const cap = [...b.caption, ...Array<string>(rows - b.caption.length).fill('')]
    for (const c of cap) { doc.text(pdfSafe(c), x, y + 4); y += LH }
    y += 20
    for (const ln of names[ci]) { setFont(doc, true); doc.text(ln.map((w) => w.text).join(' '), x, y + 4); y += LH }
    if (b.nip) { setFont(doc, false); doc.text(pdfSafe(b.nip), x, y + 4); y += LH }
    pen.y = Math.max(pen.y, y)
  })
}

/** Notula dalam format PDF (A4, huruf Times) sesuai format resmi. */
export async function exportNotePdf(d: NoteDoc, logo: NoteLogo | null = null, title = 'Notula'): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  doc.setProperties({ title: pdfSafe(title), creator: 'LAKSANA' })
  const pen = new Pen(doc)
  drawKop(pen, d, logo)
  setFont(doc, false)
  doc.text(pdfSafe(d.title), W / 2, pen.y + 4, { align: 'center' })
  pen.y += 11
  drawHeader(pen, d)
  d.blocks.forEach((b) => drawBlock(pen, b))
  if (d.signature) drawSignature(pen, d.signature)
  return doc.output('blob')
}
