import type { AppSettings } from './branding'
import { downloadBlob } from './exportModel'
import type { HadirDoc } from './hadirDoc'
import { loadLogo } from './noteExport'

export type HadirFormat = 'docx' | 'pdf'

/** Muat logo kop dari Pengaturan aplikasi lalu buat dan unduh daftar hadir resmi sebagai Word atau PDF. */
export async function downloadHadir(format: HadirFormat, docs: readonly HadirDoc[], settings: AppSettings, title: string, filename: string): Promise<void> {
  const logo = await loadLogo(settings)
  const blob = format === 'docx'
    ? await (await import('./exportHadir')).exportHadirDocx(docs, logo, title)
    : await (await import('./exportHadirPdf')).exportHadirPdf(docs, logo, title)
  downloadBlob(filename, blob)
}
