import { X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import FileDrop from './FileDrop'
import FileIcon from './FileIcon'
import { Check, Field, Modal, useToast } from './ui'
import { checkMaterialFile, cleanUrl, fmtSize, MATERIAL_ACCEPT, MATERIAL_TYPES_TEXT, titleFromFileName } from '../lib/materials'
import type { MaterialMeta } from '../lib/materialsApi'
import { errMsg } from '../lib/supabase'

/** Penyimpanan materi: admin memakai tabel langsung, petugas/panitia memakai fungsi server berbasis token. */
export interface MaterialWriter {
  upload: (file: File, meta: MaterialMeta, onProgress?: () => void) => Promise<void>
  addLink: (url: string, meta: MaterialMeta) => Promise<void>
  update: (m: EditTarget, meta: MaterialMeta, opts: { file?: File | null; url?: string }) => Promise<void>
  /** boleh mengganti berkas saat mengubah materi (petugas: hapus lalu unggah ulang) */
  replaceFile: boolean
}

/** Materi yang bisa diubah di dialog Ubah. */
export interface EditTarget {
  id: string; kind: 'berkas' | 'tautan'; title: string; speaker: string | null; description: string | null; published: boolean
  url: string | null; file_name: string | null; size_bytes: number | null
}

export const SpeakerInput = ({ value, onChange, speakers, id }: { value: string; onChange: (v: string) => void; speakers: string[]; id: string }) => (
  <>
    <input className="input" list={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder="mis. Dr. Budi Santoso, M.Si." maxLength={200} aria-label="Pemateri" />
    <datalist id={id}>{speakers.map((s) => <option key={s} value={s} />)}</datalist>
  </>
)

/** Unggah banyak berkas sekaligus: tiap berkas menjadi satu materi dengan judul yang bisa disunting. */
export function UploadModal({ writer, initial, speakers, onClose, onDone }: {
  writer: MaterialWriter; initial: File[]; speakers: string[]; onClose: () => void; onDone: () => void
}) {
  const toast = useToast()
  const [rows, setRows] = useState(() => initial.map((f) => ({ f, title: titleFromFileName(f.name) })))
  const [speaker, setSpeaker] = useState('')
  const [description, setDescription] = useState('')
  const [published, setPublished] = useState(true)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(0)

  const add = (files: File[]) => {
    const bad = files.map(checkMaterialFile).filter((x): x is string => !!x)
    if (bad.length) toast(bad[0], 'error')
    setRows((cur) => [...cur, ...files.filter((f) => !checkMaterialFile(f)).map((f) => ({ f, title: titleFromFileName(f.name) }))])
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!rows.length) return toast('Pilih minimal satu berkas.', 'error')
    if (rows.some((r) => !r.title.trim())) return toast('Setiap materi perlu judul.', 'error')
    setBusy(true); setDone(0)
    const failed: string[] = []
    for (const r of rows) {
      try { await writer.upload(r.f, { title: r.title, speaker, description, published }, () => setDone((n) => n + 1)) } catch (err) { failed.push(`${r.f.name}: ${errMsg(err)}`) }
    }
    setBusy(false)
    if (failed.length) {
      toast(`${rows.length - failed.length} berkas terunggah, ${failed.length} gagal. ${failed[0]}`, 'error')
      setRows((cur) => cur.filter((r) => failed.some((x) => x.startsWith(`${r.f.name}:`))))   // yang gagal tetap di daftar untuk dicoba lagi
      if (failed.length < rows.length) return
      return
    }
    toast(`${rows.length} materi diunggah.`, 'success'); onDone()
  }

  return (
    <Modal wide title="Unggah materi" onClose={() => !busy && onClose()}
      footer={<>
        <button className="btn ghost" onClick={onClose} disabled={busy}>Batal</button>
        <span className="spacer" />
        <button className="btn primary" form="upl" disabled={busy || !rows.length}>{busy ? `Mengunggah ${done}/${rows.length}…` : `Unggah ${rows.length || ''} materi`}</button>
      </>}>
      <form id="upl" onSubmit={submit}>
        <FileDrop onFiles={add} accept={MATERIAL_ACCEPT} compact={rows.length > 0}>
          <b>Seret berkas ke sini</b> atau klik untuk memilih<br /><span className="muted small">{MATERIAL_TYPES_TEXT} · maksimal 50 MB per berkas</span>
        </FileDrop>

        {rows.length > 0 && (
          <div className="upl-list" aria-label="Berkas yang akan diunggah">
            {rows.map((r, i) => (
              <div className="upl-row" key={`${r.f.name}-${i}`}>
                <FileIcon kind="berkas" mime={r.f.type} size={18} />
                <input className="input" value={r.title} maxLength={200} onChange={(e) => setRows((cur) => cur.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))} aria-label={`Judul untuk ${r.f.name}`} disabled={busy} />
                <span className="upl-meta">{fmtSize(r.f.size)}</span>
                <button type="button" className="icon-btn" onClick={() => setRows((cur) => cur.filter((_, k) => k !== i))} aria-label={`Batalkan ${r.f.name}`} disabled={busy}><X size={15} /></button>
              </div>
            ))}
          </div>
        )}

        <div className="form-grid" style={{ marginTop: 12 }}>
          <Field label="Pemateri" hint="Opsional; berlaku untuk semua berkas di atas. Saran diambil dari narasumber kegiatan."><SpeakerInput id="spk-up" value={speaker} onChange={setSpeaker} speakers={speakers} /></Field>
          <Field label="Deskripsi" hint="Opsional."><textarea className="input" rows={2} value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} /></Field>
        </div>
        <Check label="Langsung terbit untuk peserta" hint="Matikan untuk menyimpan sebagai draf; terbitkan nanti dari daftar materi." checked={published} onChange={setPublished} />
      </form>
    </Modal>
  )
}

function MetaFields({ m, onChange, speakers, idPrefix }: { m: MaterialMeta; onChange: (m: MaterialMeta) => void; speakers: string[]; idPrefix: string }) {
  return (
    <>
      <Field label="Judul *"><input className="input" value={m.title} maxLength={200} onChange={(e) => onChange({ ...m, title: e.target.value })} autoFocus aria-label="Judul" /></Field>
      <Field label="Pemateri" hint="Opsional. Saran diambil dari narasumber kegiatan."><SpeakerInput id={`${idPrefix}-spk`} value={m.speaker} onChange={(v) => onChange({ ...m, speaker: v })} speakers={speakers} /></Field>
      <Field label="Deskripsi" hint="Opsional: ringkasan atau petunjuk penggunaan materi."><textarea className="input" rows={3} value={m.description} maxLength={2000} onChange={(e) => onChange({ ...m, description: e.target.value })} aria-label="Deskripsi" /></Field>
      <Check label="Terbit untuk peserta" hint="Matikan untuk menyimpan sebagai draf." checked={m.published} onChange={(v) => onChange({ ...m, published: v })} />
    </>
  )
}

export function LinkModal({ writer, speakers, onClose, onDone }: { writer: MaterialWriter; speakers: string[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [meta, setMeta] = useState<MaterialMeta>({ title: '', speaker: '', description: '', published: true })
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    const clean = cleanUrl(url)
    if (!clean) return toast('Isi alamat tautan yang sah (diawali http:// atau https://).', 'error')
    if (!meta.title.trim()) return toast('Isi judul materi.', 'error')
    setBusy(true)
    try { await writer.addLink(clean, meta) } catch (err) { setBusy(false); return toast(errMsg(err), 'error') }
    toast('Tautan materi ditambahkan.', 'success'); onDone()
  }
  return (
    <Modal title="Tambah tautan materi" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Batal</button><span className="spacer" /><button className="btn primary" form="lnk" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button></>}>
      <form id="lnk" onSubmit={submit} noValidate>
        <Field label="Alamat tautan *" hint="Mis. Google Drive, YouTube, atau situs lain. Pastikan tautannya bisa dibuka peserta."><input className="input" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://drive.google.com/…" autoFocus aria-label="Alamat tautan" /></Field>
        <MetaFields m={meta} onChange={setMeta} speakers={speakers} idPrefix="lnk" />
      </form>
    </Modal>
  )
}

export function EditModal({ m, writer, speakers, onClose, onDone }: { m: EditTarget; writer: MaterialWriter; speakers: string[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [meta, setMeta] = useState<MaterialMeta>({ title: m.title, speaker: m.speaker ?? '', description: m.description ?? '', published: m.published })
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState(m.url ?? '')
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!meta.title.trim()) return toast('Isi judul materi.', 'error')
    let cleanedUrl: string | undefined
    if (m.kind === 'tautan') { cleanedUrl = cleanUrl(url) ?? undefined; if (!cleanedUrl) return toast('Isi alamat tautan yang sah.', 'error') }
    if (file && writer.replaceFile) { const bad = checkMaterialFile(file); if (bad) return toast(bad, 'error') }
    setBusy(true)
    try { await writer.update(m, meta, { file, url: cleanedUrl }) } catch (err) { setBusy(false); return toast(errMsg(err), 'error') }
    toast('Materi diperbarui.', 'success'); onDone()
  }
  return (
    <Modal title="Ubah materi" onClose={() => !busy && onClose()}
      footer={<><button className="btn ghost" onClick={onClose} disabled={busy}>Batal</button><span className="spacer" /><button className="btn primary" form="edt" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button></>}>
      <form id="edt" onSubmit={submit} noValidate>
        <MetaFields m={meta} onChange={setMeta} speakers={speakers} idPrefix="edt" />
        {m.kind === 'tautan'
          ? <Field label="Alamat tautan *"><input className="input" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Alamat tautan" /></Field>
          : !writer.replaceFile ? null : (
            <Field label="Berkas" hint={`${m.file_name ?? ''}${m.size_bytes ? ` · ${fmtSize(m.size_bytes)}` : ''}. Memilih berkas baru menggantikan berkas ini.`}>
              {file
                ? <div className="upl-row"><FileIcon kind="berkas" mime={file.type} size={18} /><span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{file.name}</span><span className="upl-meta">{fmtSize(file.size)}</span><button type="button" className="icon-btn" onClick={() => setFile(null)} aria-label="Batalkan berkas pengganti"><X size={15} /></button></div>
                : <FileDrop multiple={false} compact accept={MATERIAL_ACCEPT} onFiles={(f) => setFile(f[0])}>Pilih berkas pengganti</FileDrop>}
            </Field>
          )}
      </form>
    </Modal>
  )
}

