import { downloadBlob } from './exportModel'
import { assetUrl, type AppSettings } from './branding'
import { publicBrandUrl, rasterizeLogo } from './brandApi'
import type { NoteLogo } from './exportNote'
import { buildNoteDoc, kopFromSettings, noteFileName, type NoteDocInput } from './noteDoc'

/** Logo kop surat dari Pengaturan aplikasi (unggahan khusus kop, bukan logo aplikasi). Bila tidak ada atau gagal dimuat, notula tetap dibuat tanpa logo. */
export async function loadLogo(s: Pick<AppSettings, 'kop_logo_path'>): Promise<NoteLogo | null> {
  try {
    const url = assetUrl(s.kop_logo_path, publicBrandUrl)
    if (!url) return null
    const res = await fetch(url)
    if (!res.ok) return null
    const png = await rasterizeLogo(await res.blob())
    const bmp = await createImageBitmap(png)
    const logo = { data: new Uint8Array(await png.arrayBuffer()), w: bmp.width, h: bmp.height }
    bmp.close()
    return logo.w > 0 && logo.h > 0 ? logo : null
  } catch { return null }
}

export type NoteFormat = 'docx' | 'pdf'

/** Susun notula sesuai format resmi lalu unduh sebagai Word atau PDF. */
export async function downloadNote(format: NoteFormat, note: NoteDocInput & { title: string }, settings: AppSettings): Promise<void> {
  const [logo, doc] = [await loadLogo(settings), buildNoteDoc(note, kopFromSettings(settings))]
  const blob = format === 'docx'
    ? await (await import('./exportNote')).exportNoteDocx(doc, logo, note.title)
    : await (await import('./exportNotePdf')).exportNotePdf(doc, logo, note.title)
  downloadBlob(noteFileName(note.title, format), blob)
}
