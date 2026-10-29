import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, BorderStyle } from 'docx'
import { fmtDate, fmtDateTime } from './format'
import type { MeetingNote } from './types'

const FONT = 'Calibri'
const t = (text: string, o: { bold?: boolean; size?: number } = {}) => new TextRun({ text, bold: o.bold, size: o.size ?? 22, font: FONT })

/** Paragraf per baris; baris kosong dipertahankan sebagai jarak. */
const lines = (text: string | null | undefined) => (text ?? '').split('\n').map((l) => new Paragraph({ spacing: { after: 60 }, children: [t(l)] }))
const heading = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 80 }, children: [t(text, { bold: true, size: 24 })] })

/** Notula dalam format Word (.docx). */
export async function exportNoteDocx(note: MeetingNote, activityName: string): Promise<Blob> {
  const meta: [string, string][] = ([
    ['Kegiatan', activityName],
    ['Hari/tanggal', note.held_at ? fmtDateTime(note.held_at) : ''],
    ['Tempat', note.location ?? ''],
    ['Pimpinan', note.leader ?? ''],
    ['Pencatat', note.notetaker ?? ''],
  ] as [string, string][]).filter(([, v]) => v)
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
  const noBorders = { top: none, bottom: none, left: none, right: none }
  const line = { style: BorderStyle.SINGLE, size: 4, color: '9AA3B8' }
  const box = { top: line, bottom: line, left: line, right: line }

  const metaTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: meta.map(([k, v]) => new TableRow({ children: [
      new TableCell({ width: { size: 22, type: WidthType.PERCENTAGE }, borders: noBorders, children: [new Paragraph({ children: [t(k, { bold: true })] })] }),
      new TableCell({ width: { size: 78, type: WidthType.PERCENTAGE }, borders: noBorders, children: [new Paragraph({ children: [t(`: ${v}`)] })] }),
    ] })),
  })

  const cell = (text: string, w: number, bold = false) => new TableCell({
    width: { size: w, type: WidthType.PERCENTAGE }, borders: box, margins: { top: 50, bottom: 50, left: 80, right: 80 },
    children: [new Paragraph({ children: [t(text, { bold, size: 20 })] })],
  })
  const fu = note.follow_ups.length ? [
    heading('Tindak lanjut'),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ tableHeader: true, children: [cell('No', 6, true), cell('Tindak lanjut', 46, true), cell('Penanggung jawab', 22, true), cell('Tenggat', 14, true), cell('Status', 12, true)] }),
        ...note.follow_ups.map((f, i) => new TableRow({ children: [
          cell(String(i + 1), 6), cell(f.task, 46), cell(f.pic || '-', 22), cell(f.due ? fmtDate(f.due) : '-', 14), cell(f.done ? 'Selesai' : 'Belum', 12),
        ] })),
      ],
    }),
  ] : []

  const sections: Paragraph[] = []
  const add = (title: string, body: string | null) => { if (body?.trim()) sections.push(heading(title), ...lines(body)) }
  add('Peserta rapat', note.attendees)
  add('Agenda', note.agenda)
  add('Pembahasan', note.discussion)
  add('Keputusan / kesimpulan', note.decisions)

  const doc = new Document({
    creator: 'LAKSANA',
    title: note.title,
    sections: [{
      properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [t('NOTULA', { bold: true, size: 30 })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [t(note.title, { bold: true, size: 26 })] }),
        metaTable,
        ...sections,
        ...fu,
      ],
    }],
  })
  return Packer.toBlob(doc)
}
