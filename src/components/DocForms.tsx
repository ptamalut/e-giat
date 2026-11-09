import { useState, type FormEvent } from 'react'
import { Field, Modal, useToast } from './ui'
import { compressImage, DEFAULT_ALBUM, normalizeUrl } from '../lib/docs'
import { errMsg } from '../lib/supabase'

const today = () => new Date().toISOString().slice(0, 10)

export interface PhotoMeta { fileName: string; album: string | null; takenOn: string | null }
export interface LinkInput { title: string | null; url: string; album: string | null; caption: string | null; takenOn: string | null }

/** Unggah beberapa foto (dikompres di perangkat); penyimpanannya diserahkan ke `upload` (admin atau petugas). */
export function UploadModal({ files, albums, defaultAlbum, upload, onClose, onDone }: {
  files: File[]; albums: string[]; defaultAlbum: string; upload: (blob: Blob, meta: PhotoMeta) => Promise<void>; onClose: () => void; onDone: () => void
}) {
  const toast = useToast()
  const [album, setAlbum] = useState(defaultAlbum || '')
  const [takenOn, setTakenOn] = useState(today())
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(0)
  const [failed, setFailed] = useState<string[]>([])
  const bad = files.filter((f) => !f.type.startsWith('image/'))
  const ok = files.filter((f) => f.type.startsWith('image/'))

  async function go() {
    setBusy(true); setDone(0); setFailed([])
    const fails: string[] = []
    for (const f of ok) {
      try {
        const blob = await compressImage(f)
        if (!blob) throw new Error('Berkas tidak dapat dibaca sebagai gambar.')
        await upload(blob, { fileName: f.name, album: album.trim() || null, takenOn: takenOn || null })
      } catch (e) { fails.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`) }
      setDone((n) => n + 1)
    }
    setBusy(false)
    if (fails.length) { setFailed(fails); toast(`${ok.length - fails.length} foto terunggah, ${fails.length} gagal.`, 'error'); return }
    toast(`${ok.length} foto diunggah.`, 'success')
    onDone()
  }

  return (
    <Modal title={`Unggah ${ok.length} foto`} onClose={() => !busy && onClose()}
      footer={<><button className="btn" onClick={onClose} disabled={busy}>{failed.length ? 'Tutup' : 'Batal'}</button>
        <button className="btn primary" disabled={busy || !ok.length} onClick={() => void go()}>{busy ? `Mengunggah ${done}/${ok.length}…` : failed.length ? 'Coba lagi semua' : 'Unggah'}</button></>}>
      <div className="form-grid">
        <Field label="Album" hint={`Kosongkan untuk "${DEFAULT_ALBUM}".`}>
          <input className="input" list="doc-albums" value={album} onChange={(e) => setAlbum(e.target.value)} placeholder="mis. Hari 1" autoFocus />
        </Field>
        <Field label="Tanggal"><input className="input" type="date" value={takenOn} onChange={(e) => setTakenOn(e.target.value)} /></Field>
      </div>
      <datalist id="doc-albums">{albums.filter((a) => a !== DEFAULT_ALBUM).map((a) => <option key={a} value={a} />)}</datalist>
      <p className="muted small">Foto dikompres otomatis (sisi terpanjang 1600 px) sebelum diunggah. Caption bisa diisi setelahnya dengan membuka fotonya.</p>
      {bad.length > 0 && <div className="alert warn"><span>{bad.length} berkas bukan gambar dan dilewati: {bad.map((b) => b.name).join(', ')}</span></div>}
      {failed.length > 0 && <div className="alert error"><span>{failed.join(' · ')}</span></div>}
    </Modal>
  )
}

/** Tambah/ubah tautan dokumentasi; penyimpanannya diserahkan ke `save`. */
export function LinkModal({ value, albums, save, onClose, onSaved }: {
  value: { id?: string; title?: string | null; url?: string | null; album?: string | null; caption?: string | null; taken_on?: string | null }
  albums: string[]; save: (input: LinkInput) => Promise<void>; onClose: () => void; onSaved: () => void
}) {
  const toast = useToast()
  const [f, setF] = useState({ title: value.title ?? '', url: value.url ?? '', album: value.album ?? '', caption: value.caption ?? '', taken_on: value.taken_on ?? today() })
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const url = normalizeUrl(f.url)
    if (!url) return toast('Tautan harus berupa alamat http(s) yang valid.', 'error')
    setBusy(true)
    try {
      await save({ title: f.title.trim() || null, url, album: f.album.trim() || null, caption: f.caption.trim() || null, takenOn: f.taken_on || null })
    } catch (err) { setBusy(false); return toast(errMsg(err), 'error') }
    setBusy(false)
    toast('Tautan disimpan.', 'success'); onSaved()
  }

  return (
    <Modal title={value.id ? 'Ubah tautan' : 'Tambah tautan dokumentasi'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Batal</button><button className="btn primary" form="docform" disabled={busy}>Simpan</button></>}>
      <form id="docform" onSubmit={submit}>
        <Field label="Judul"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="mis. Video pembukaan" autoFocus /></Field>
        <Field label="Tautan *" hint="Video, folder Drive, atau dokumen di situs lain."><input className="input" required value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://…" /></Field>
        <div className="form-grid">
          <Field label="Album"><input className="input" list="doc-albums2" value={f.album} onChange={(e) => setF({ ...f, album: e.target.value })} /></Field>
          <Field label="Tanggal"><input className="input" type="date" value={f.taken_on} onChange={(e) => setF({ ...f, taken_on: e.target.value })} /></Field>
        </div>
        <datalist id="doc-albums2">{albums.filter((a) => a !== DEFAULT_ALBUM).map((a) => <option key={a} value={a} />)}</datalist>
        <Field label="Keterangan"><textarea className="input" value={f.caption} onChange={(e) => setF({ ...f, caption: e.target.value })} /></Field>
      </form>
    </Modal>
  )
}

