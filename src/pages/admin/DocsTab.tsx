import { ChevronLeft, ChevronRight, Download, ExternalLink, ImagePlus, Images, Link2, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Empty, ErrorBox, Field, Loading, Modal, PageHeader, useAsync, useConfirm, useToast } from '../../components/ui'
import { compressImage, DEFAULT_ALBUM, groupByAlbum, normalizeUrl, randomDocPath } from '../../lib/docs'
import { removeDocFiles, signedDocUrls, uploadDoc } from '../../lib/docsApi'
import { fmtDate } from '../../lib/format'
import { safeName } from '../../lib/csv'
import { errMsg, fetchAll, supabase } from '../../lib/supabase'
import type { DocItem } from '../../lib/types'
import { useActivity } from './ActivityLayout'

const today = () => new Date().toISOString().slice(0, 10)

export default function DocsTab() {
  const { activity } = useActivity()
  const toast = useToast()
  const confirm = useConfirm()
  const fileInput = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[] | null>(null)
  const [linking, setLinking] = useState<Partial<DocItem> | null>(null)
  const [viewing, setViewing] = useState<string | null>(null)
  const [album, setAlbum] = useState('')
  const [urls, setUrls] = useState<Record<string, string>>({})

  const { data, error, loading, reload } = useAsync(
    () => fetchAll<DocItem>((a, b) => supabase.from('documentation').select('*').eq('activity_id', activity.id).order('uploaded_at', { ascending: false }).order('id').range(a, b)),
    [activity.id])
  const items = data ?? []
  const albums = useMemo(() => groupByAlbum(items), [items])
  const shown = album ? albums.filter((g) => g.album === album) : albums

  // foto bersifat privat: dimuat lewat tautan bertanda tangan, diperbarui sebelum kedaluwarsa
  const photoPaths = useMemo(() => items.map((d) => d.storage_path).filter((x): x is string => !!x), [items])
  const key = photoPaths.join('|')
  useEffect(() => {
    if (!photoPaths.length) { setUrls({}); return }
    let alive = true
    const load = () => signedDocUrls(photoPaths).then((u) => { if (alive) setUrls(u) }).catch(() => { /* thumbnail kosong */ })
    void load()
    const t = setInterval(() => void load(), 45 * 60000)
    return () => { alive = false; clearInterval(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const photos = shown.flatMap((g) => g.items).filter((d) => d.kind === 'foto')
  const current = viewing ? items.find((d) => d.id === viewing) : null

  async function remove(d: DocItem) {
    const ok = await confirm({ title: d.kind === 'foto' ? 'Hapus foto ini?' : 'Hapus tautan ini?', danger: true, confirmText: 'Hapus',
      message: d.kind === 'foto' ? 'Berkas foto dihapus permanen dari penyimpanan.' : 'Hanya tautannya yang dihapus; berkas di situs asal tidak terpengaruh.' })
    if (!ok) return
    const { error } = await supabase.from('documentation').delete().eq('id', d.id)
    if (error) return toast(errMsg(error), 'error')
    if (d.storage_path) await removeDocFiles([d.storage_path])
    setViewing(null); toast('Dihapus.', 'success'); void reload(true)
  }

  return (
    <div className="stack">
      <PageHeader title="Dokumentasi" subtitle="Foto kegiatan dan tautan video/dokumen, dikelompokkan per album. Hanya dapat dilihat panitia."
        actions={<>
          <button className="btn" onClick={() => setLinking({ album: album || null, taken_on: today() })}><Link2 size={16} /> Tambah tautan</button>
          <button className="btn primary" onClick={() => fileInput.current?.click()}><ImagePlus size={17} /> Unggah foto</button>
          <input ref={fileInput} type="file" accept="image/*" multiple hidden aria-label="Pilih foto dokumentasi"
            onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) setFiles(f) }} />
        </>} />

      {loading && !data && <Loading />}
      {error && <ErrorBox error={error} onRetry={() => void reload()} />}
      {data && !items.length && (
        <div className="card"><Empty icon={<Images size={26} />} title="Belum ada dokumentasi">
          Unggah foto kegiatan (dikompres otomatis) atau tambahkan tautan video/folder Drive. Kelompokkan per album, mis. "Hari 1" atau "Pembukaan".
        </Empty></div>
      )}

      {items.length > 0 && (
        <>
          <div className="pills" role="group" aria-label="Filter album">
            <button className={`pill ${album === '' ? 'active' : ''}`} onClick={() => setAlbum('')}>Semua <span className="muted">{items.length}</span></button>
            {albums.map((g) => (
              <button key={g.album} className={`pill ${album === g.album ? 'active' : ''}`} onClick={() => setAlbum(g.album)}>{g.album} <span className="muted">{g.items.length}</span></button>
            ))}
          </div>

          {shown.map((g) => (
            <section className="card" key={g.album} aria-label={`Album ${g.album}`}>
              <div className="card-head"><h2>{g.album}</h2><span className="muted small">{g.items.length} item</span></div>
              <div className="gallery">
                {g.items.map((d) => d.kind === 'foto' ? (
                  <button key={d.id} type="button" className="gallery-item" onClick={() => setViewing(d.id)} aria-label={`Lihat ${d.caption || d.file_name || 'foto'}`}>
                    {d.storage_path && urls[d.storage_path] ? <img src={urls[d.storage_path]} alt={d.caption || d.file_name || 'Foto kegiatan'} loading="lazy" /> : <span className="muted small">Memuat…</span>}
                    {d.caption && <span className="gallery-cap">{d.caption}</span>}
                  </button>
                ) : (
                  <div key={d.id} className="gallery-link">
                    <Link2 size={20} />
                    <b>{d.title || d.url}</b>
                    {d.caption && <span className="muted small">{d.caption}</span>}
                    <div className="row tight">
                      <a className="btn sm" href={d.url!} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Buka</a>
                      <button className="icon-btn" aria-label="Ubah tautan" onClick={() => setLinking(d)}><Pencil size={15} /></button>
                      <button className="icon-btn danger" aria-label="Hapus tautan" onClick={() => void remove(d)}><Trash2 size={15} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </>
      )}

      {files && <UploadModal activityId={activity.id} files={files} albums={albums.map((g) => g.album)} defaultAlbum={album}
        onClose={() => setFiles(null)} onDone={() => { setFiles(null); void reload(true) }} />}
      {linking && <LinkModal value={linking} activityId={activity.id} albums={albums.map((g) => g.album)} onClose={() => setLinking(null)} onSaved={() => { setLinking(null); void reload(true) }} />}
      {current && current.kind === 'foto' && (
        <Viewer item={current} url={current.storage_path ? urls[current.storage_path] : undefined}
          index={photos.findIndex((p) => p.id === current.id)} total={photos.length}
          onPrev={() => { const i = photos.findIndex((p) => p.id === current.id); setViewing(photos[(i - 1 + photos.length) % photos.length].id) }}
          onNext={() => { const i = photos.findIndex((p) => p.id === current.id); setViewing(photos[(i + 1) % photos.length].id) }}
          albums={albums.map((g) => g.album)} onClose={() => setViewing(null)} onDelete={() => void remove(current)} onSaved={() => void reload(true)} />
      )}
    </div>
  )
}

function UploadModal({ activityId, files, albums, defaultAlbum, onClose, onDone }: {
  activityId: string; files: File[]; albums: string[]; defaultAlbum: string; onClose: () => void; onDone: () => void
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
        await uploadDoc({ activityId, path: randomDocPath(activityId), blob, fileName: f.name, album: album.trim() || null, takenOn: takenOn || null })
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

function LinkModal({ value, activityId, albums, onClose, onSaved }: {
  value: Partial<DocItem>; activityId: string; albums: string[]; onClose: () => void; onSaved: () => void
}) {
  const toast = useToast()
  const [f, setF] = useState({ title: value.title ?? '', url: value.url ?? '', album: value.album ?? '', caption: value.caption ?? '', taken_on: value.taken_on ?? today() })
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const url = normalizeUrl(f.url)
    if (!url) return toast('Tautan harus berupa alamat http(s) yang valid.', 'error')
    setBusy(true)
    const payload = { title: f.title.trim() || null, url, album: f.album.trim() || null, caption: f.caption.trim() || null, taken_on: f.taken_on || null }
    const { error } = value.id
      ? await supabase.from('documentation').update(payload).eq('id', value.id)
      : await supabase.from('documentation').insert({ ...payload, activity_id: activityId, kind: 'tautan' })
    setBusy(false)
    if (error) return toast(errMsg(error), 'error')
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

function Viewer({ item, url, index, total, albums, onPrev, onNext, onClose, onDelete, onSaved }: {
  item: DocItem; url?: string; index: number; total: number; albums: string[]
  onPrev: () => void; onNext: () => void; onClose: () => void; onDelete: () => void; onSaved: () => void
}) {
  const toast = useToast()
  const [caption, setCaption] = useState(item.caption ?? '')
  const [album, setAlbum] = useState(item.album ?? '')
  const [takenOn, setTakenOn] = useState(item.taken_on ?? '')
  const [busy, setBusy] = useState(false)
  useEffect(() => { setCaption(item.caption ?? ''); setAlbum(item.album ?? ''); setTakenOn(item.taken_on ?? '') }, [item.id, item.caption, item.album, item.taken_on])
  const dirty = caption !== (item.caption ?? '') || album !== (item.album ?? '') || takenOn !== (item.taken_on ?? '')

  async function save() {
    setBusy(true)
    const { error } = await supabase.from('documentation').update({ caption: caption.trim() || null, album: album.trim() || null, taken_on: takenOn || null }).eq('id', item.id)
    setBusy(false)
    if (error) return toast(errMsg(error), 'error')
    toast('Disimpan.', 'success'); onSaved()
  }

  return (
    <Modal wide title={`Foto ${index + 1} dari ${total}`} onClose={onClose}
      footer={<>
        <button className="btn danger" onClick={onDelete}><Trash2 size={15} /> Hapus</button><span className="spacer" />
        {url && <a className="btn" href={url} download={`${safeName(item.file_name ?? 'foto')}.jpg`} target="_blank" rel="noreferrer"><Download size={15} /> Unduh</a>}
        <button className="btn primary" disabled={!dirty || busy} onClick={() => void save()}>Simpan</button>
      </>}>
      <div className="viewer">
        <button className="icon-btn" onClick={onPrev} aria-label="Foto sebelumnya" disabled={total < 2}><ChevronLeft size={22} /></button>
        {url ? <img className="photo-view" src={url} alt={item.caption || item.file_name || 'Foto kegiatan'} /> : <Loading />}
        <button className="icon-btn" onClick={onNext} aria-label="Foto berikutnya" disabled={total < 2}><ChevronRight size={22} /></button>
      </div>
      <div className="form-grid" style={{ marginTop: 14 }}>
        <Field label="Album"><input className="input" list="doc-albums3" value={album} onChange={(e) => setAlbum(e.target.value)} placeholder={DEFAULT_ALBUM} /></Field>
        <Field label="Tanggal"><input className="input" type="date" value={takenOn} onChange={(e) => setTakenOn(e.target.value)} /></Field>
      </div>
      <datalist id="doc-albums3">{albums.filter((a) => a !== DEFAULT_ALBUM).map((a) => <option key={a} value={a} />)}</datalist>
      <Field label="Keterangan" hint={`${item.file_name ?? ''}${item.size_bytes ? ` · ${(item.size_bytes / 1024).toFixed(0)} KB` : ''} · diunggah ${fmtDate(item.uploaded_at)}`}>
        <textarea className="input" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Tulis keterangan foto" />
      </Field>
    </Modal>
  )
}
