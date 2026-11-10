import { File, FileArchive, FileSpreadsheet, FileText, Film, Image as ImageIcon, Link2, Music, Presentation, type LucideIcon } from 'lucide-react'
import { fileKind, FILE_KIND_LABEL, type FileKind } from '../lib/materials'

const ICONS: Record<FileKind, LucideIcon> = {
  pdf: FileText, word: FileText, slide: Presentation, sheet: FileSpreadsheet, image: ImageIcon, video: Film, audio: Music, arsip: FileArchive, teks: FileText, tautan: Link2, lain: File,
}

/** Ikon berwarna menurut golongan berkas materi (PDF, Word, presentasi, tautan, dst.). */
export default function FileIcon({ kind, mime, size = 20 }: { kind: 'berkas' | 'tautan'; mime?: string | null; size?: number }) {
  const k = fileKind(kind, mime)
  const Icon = ICONS[k]
  return <span className={`file-ico fk-${k}`} title={FILE_KIND_LABEL[k]} aria-hidden><Icon size={size} /></span>
}
