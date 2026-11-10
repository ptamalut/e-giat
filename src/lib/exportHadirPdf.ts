import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { NoteLogo } from './exportNote'
import { pdfSafe } from './exportPdf'
import { PAPER_MM, type HadirDoc } from './hadirDoc'
import { qrMap } from './signQr'

const ML = 18, MR = 18, MT = 16, MB = 14
type Doc = jsPDF

const font = (doc: Doc, style: 'normal' | 'bold' | 'italic', size: number) => { doc.setFont('helvetica', style); doc.setFontSize(size) }

/** Kop: logo kiri, judul tebal dan alamat di tengah, garis ganda. Mengembalikan posisi y berikutnya. */
function drawKop(doc: Doc, d: HadirDoc, logo: NoteLogo | null, W: number): number {
  const { title, address } = d.kop
  const top = MT
  if (!title.length && !address.length && !logo) return top
  const lh = 24, lw = logo ? (logo.w / logo.h) * lh : 0
  if (logo) { try { doc.addImage(logo.data, 'PNG', ML, top, lw, lh) } catch { /* logo rusak: kop tanpa gambar */ } }
  const tx = logo ? ML + lw + 3 : ML, tw = W - MR - tx, cx = tx + tw / 2
  const lines = [
    ...title.map((t) => ({ t: pdfSafe(t.toUpperCase()), size: 12.5, bold: true, step: 5.2 })),
    ...address.map((t) => ({ t: pdfSafe(t), size: 8.5, bold: false, step: 3.8 })),
  ]
  for (const bold of [true, false]) {            // ukuran sama untuk baris sejenis, diperkecil bila tidak muat
    const group = lines.filter((l) => l.bold === bold)
    while (group.length && group[0].size > 7 && group.some((l) => { font(doc, bold ? 'bold' : 'normal', group[0].size); return doc.getTextWidth(l.t) > tw })) group.forEach((l) => { l.size -= 0.5 })
  }
  const total = lines.reduce((a, l) => a + l.step, 0)
  let y = top + Math.max(0, (lh - total) / 2)
  for (const l of lines) { font(doc, l.bold ? 'bold' : 'normal', l.size); doc.text(l.t, cx, y + l.step - 1, { align: 'center' }); y += l.step }
  const bottom = Math.max(top + (logo ? lh : 0), y) + 2
  doc.setDrawColor(0)
  doc.setLineWidth(0.9); doc.line(ML, bottom, W - MR, bottom)
  doc.setLineWidth(0.25); doc.line(ML, bottom + 1.2, W - MR, bottom + 1.2)
  return bottom + 7
}

/** Daftar hadir resmi dalam PDF; tiap dokumen (sesi) mulai di halaman baru. */
export async function exportHadirPdf(docs: readonly HadirDoc[], logo: NoteLogo | null = null, title = 'Daftar Hadir'): Promise<Blob> {
  const qrs = await qrMap(docs.flatMap((d) => d.rows.map((r) => r.sign)))
  const first = PAPER_MM[docs[0]?.paper ?? 'F4']
  const pdf = new jsPDF({ unit: 'mm', format: [first.w, first.h], orientation: 'portrait' })
  pdf.setProperties({ title: pdfSafe(title), creator: 'LAKSANA' })

  docs.forEach((d, di) => {
    const paper = PAPER_MM[d.paper]
    if (di > 0) pdf.addPage([paper.w, paper.h], 'portrait')
    const W = paper.w, H = paper.h, bottom = H - MB
    const withQr = d.rows.some((r) => r.sign)
    let y = drawKop(pdf, d, logo, W)

    // judul bergaris bawah
    font(pdf, 'bold', 11)
    const t = pdfSafe(d.title)
    pdf.text(t, W / 2, y + 3, { align: 'center' })
    const tw = pdf.getTextWidth(t)
    pdf.setLineWidth(0.3); pdf.line(W / 2 - tw / 2, y + 4, W / 2 + tw / 2, y + 4)
    y += 11

    // keterangan
    const LBL = 34
    font(pdf, 'normal', 10)
    for (const r of d.info) {
      const lines = pdf.splitTextToSize(pdfSafe(r.value), W - MR - ML - LBL - 5) as string[]
      pdf.text(pdfSafe(r.label), ML, y + 3.5); pdf.text(':', ML + LBL, y + 3.5)
      lines.forEach((l, i) => pdf.text(l, ML + LBL + 5, y + 3.5 + i * 4.6))
      y += Math.max(1, lines.length) * 4.6 + 0.4
    }
    y += 3

    const widths = d.widths.map((w) => w * (W - ML - MR))
    const last = d.head.length - 1
    autoTable(pdf, {
      startY: y, margin: { left: ML, right: MR, top: MT, bottom: MB },
      head: [d.head], body: d.rows.map((r) => [...r.cells.map(pdfSafe), '']),
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 9.5, cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.25, textColor: 0, valign: 'middle', minCellHeight: withQr ? 13 : 10 },
      headStyles: { fillColor: [255, 255, 255], textColor: 0, fontStyle: 'bold', halign: 'center', minCellHeight: 10 },
      columnStyles: Object.fromEntries(widths.map((w, i) => [i, { cellWidth: w, halign: i === 0 || d.head[i] === 'JABATAN' ? 'center' : 'left' }])) as Record<number, { cellWidth: number; halign: 'center' | 'left' }>,
      showHead: 'everyPage', rowPageBreak: 'avoid',
      didDrawCell: (h) => {
        if (h.section !== 'body' || h.column.index !== last) return
        const url = d.rows[h.row.index]?.sign
        const img = url ? qrs.get(url) : null
        if (!img) return
        const size = Math.min(h.cell.height - 1.5, h.cell.width - 2, 11.5)
        if (size > 4) h.doc.addImage(img, 'PNG', h.cell.x + (h.cell.width - size) / 2, h.cell.y + (h.cell.height - size) / 2, size, size)
      },
    })
    y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4

    if (d.footnote) {
      if (y + 5 > bottom) { pdf.addPage([paper.w, paper.h], 'portrait'); y = MT }
      font(pdf, 'italic', 7.5); pdf.setTextColor(71, 85, 105); pdf.text(pdfSafe(d.footnote), ML, y + 2); pdf.setTextColor(0)
      y += 6
    }

    // Mengetahui; Koordinator Absen (kiri), Petugas Absen (kanan)
    const need = 8 + 6 + 22 + 6
    if (y + need > bottom) { pdf.addPage([paper.w, paper.h], 'portrait'); y = MT + 2 }
    font(pdf, 'normal', 10)
    pdf.text(pdfSafe(d.sign.caption), ML, y + 6)
    const cy = y + 13, rx = ML + (W - ML - MR) / 2 + 8
    pdf.text(pdfSafe(d.sign.left.caption), ML, cy); pdf.text(pdfSafe(d.sign.right.caption), rx, cy)
    const ny = cy + 21
    ;([[d.sign.left.name, ML], [d.sign.right.name, rx]] as const).forEach(([name, x]) => {
      if (name) { font(pdf, 'bold', 10); pdf.text(pdfSafe(name), x, ny) } else { font(pdf, 'normal', 10); pdf.text('.'.repeat(38), x, ny) }
    })
  })
  return pdf.output('blob')
}
