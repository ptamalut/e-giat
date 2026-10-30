import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { columnWidthsMm, type ExportModel } from './exportModel'

/** Font bawaan PDF hanya mendukung Latin-1 + tanda baca umum; karakter lain diganti agar tidak menjadi sampah. */
export const pdfSafe = (s: string) => s.normalize('NFC').replace(/[^\x20-\x7E\xA0-\xFF‘’“”–—…•]/g, '?')

const INDIGO: [number, number, number] = [79, 70, 229]

/** Dokumen PDF (A4) dari satu atau beberapa model ekspor (tiap model mulai di halaman baru). */
export async function exportPdf(models: ExportModel | readonly ExportModel[], printedAt = new Date()): Promise<Blob> {
  const list: readonly ExportModel[] = 'headers' in models ? [models] : models
  const doc = new jsPDF({ orientation: list[0].landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 14
  const bottom = H - 16
  const contentW = W - 2 * M

  list.forEach((model, mi) => {
    if (mi > 0) doc.addPage('a4', model.landscape ? 'landscape' : 'portrait')
    const columnStyles = Object.fromEntries(columnWidthsMm(model.keys, contentW).map((w, i) => [i, { cellWidth: w, halign: i === 0 ? 'center' : 'left' }])) as Record<number, { cellWidth: number; halign: 'center' | 'left' }>
    const rowMin = model.hasSignature ? 11 : 0

    // judul
    let y = 16
    doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(15, 23, 42)
    doc.text(pdfSafe(model.title.toUpperCase()), W / 2, y, { align: 'center' })
    y += 6
    model.subtitle.forEach((t, i) => {
      doc.setFont('helvetica', i === 0 ? 'bold' : 'normal').setFontSize(i === 0 ? 11.5 : 9.5).setTextColor(i === 0 ? 30 : 71, i === 0 ? 41 : 85, i === 0 ? 59 : 105)
      doc.text(pdfSafe(t), W / 2, y, { align: 'center' })
      y += i === 0 ? 5 : 4.6
    })
    y += 4

    model.groups.forEach((g, gi) => {
      // jangan biarkan judul kelompok tertinggal sendirian di dasar halaman
      const need = (g.label ? 9 : 0) + 8 + Math.max(7, rowMin)
      if (y + need > bottom) { doc.addPage(); y = 16 }
      if (g.label) {
        doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(49, 46, 129)
        doc.text(pdfSafe(`${gi + 1}. ${g.label}`), M, y + 3)
        y += 6
      }
      autoTable(doc, {
        startY: y,
        margin: { left: M, right: M, top: 16, bottom: 16 },
        head: [model.headers.map(pdfSafe)],
        body: g.rows.map((r) => r.map(pdfSafe)),
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.8, lineColor: [154, 163, 184], lineWidth: 0.1, valign: 'middle', textColor: [15, 23, 42], minCellHeight: rowMin },
        headStyles: { fillColor: INDIGO, textColor: 255, fontStyle: 'bold', halign: 'left' },
        columnStyles,
        didParseCell: (h) => { if (h.section === 'head' && h.column.index === 0) h.cell.styles.halign = 'center' },
        rowPageBreak: 'avoid',
      })
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7
    })
  })

  // nomor halaman
  const pages = doc.getNumberOfPages()
  const stamp = printedAt.toLocaleDateString('id-ID', { dateStyle: 'long' })
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(100, 116, 139)
    doc.text(pdfSafe(`Dicetak ${stamp}`), M, H - 8)
    doc.text(`Halaman ${i} dari ${pages}`, W - M, H - 8, { align: 'right' })
  }
  return doc.output('blob')
}
