import { BookOpen, Download, ExternalLink, Eye, EyeOff, Link2, Pencil, Search, Trash2, Upload, X } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import FileDrop from '../../components/FileDrop'
import FileIcon from '../../components/FileIcon'
import { Check, Empty, ErrorBox, Field, Loading, Modal, PageHeader, useAsync, useConfirm, useToast } from '../../components/ui'
import { fmtDate } from '../../lib/format'
import { checkMaterialFile, cleanUrl, fmtSize, hostOf, MATERIAL_ACCEPT, MATERIAL_TYPES_TEXT, titleFromFileName } from '../../lib/materials'
import {
  addMaterialLink, deleteMaterial, fetchMaterials, materialUrl, setMaterialPublished, updateMaterial, uploadMaterialFile, type MaterialMeta,
} from '../../lib/materialsApi'
import { errMsg, supabase } from '../../lib/supabase'
import type { Material } from '../../lib/types'
import { useActivity } from './ActivityLayout'

type Filter = 'semua' | 'terbit' | 'draf'

/** Nama narasumber kegiatan, untuk saran isian pemateri. */
async function fetchSpeakers(activityId: string): Promise<string[]> {
  const { data } = await supabase.from('participants').select('name').eq('activity_id', activityId).filter('roles', 'cs', '{narasumber}').order('name')
  return ((data ?? []) as { name: string }[]).map((r) => r.name)
}

/** Materi kegiatan: unggah berkas (banyak sekaligus) atau tautan; peserta mengunduhnya lewat link pribadi. */
export default function MaterialsTab() {
  const { activity } = useActivity()
  const toast = useToast()
  const confirm = useConfirm()
  const [uploading, setUploading] = useState<File[] | null>(null)
  const [linking, setLinking] = useState(false)
  const [editing, setEditing] = useState<Material | null>(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('semua')

  const { data, error, loading, reload } = useAsync(() => fetchMaterials(activity.id), [activity.id])
  const speakers = useAsync(() => fetchSpeakers(activity.id), [activity.id])
  const all = data ?? []
  const list = useMemo(() => all.filter((m) => {
    if (filter === 'terbit' && !m.published) return false
    if (filter === 'draf' && m.published) return false
    const s = q.trim().toLowerCase()
    return !s || [m.title, m.speaker, m.description, m.file_name].some((v) => v?.toLowerCase().includes(s))
  }), [all, q, filter])
  const published = all.filter((m) => m.published).length
  const totalBytes = all.reduce((n, m) => n + (m.size_bytes ?? 0), 0)

  function pickFiles(files: File[]) {
    const bad = files.map(checkMaterialFile).filter((x): x is string => !!x)
    const ok = files.filter((f) => !checkMaterialFile(f))
    if (bad.length) toast(bad.slice(0, 2).join(' ') + (bad.length > 2 ? ` (+${bad.length - 2} berkas lain ditolak)` : ''), 'error')
    if (ok.length) setUploading(ok)
  }

  async function togglePublish(m: Material) {
    try { await setMaterialPublished(m.id, !m.published) } catch (e) { return toast(errMsg(e), 'error') }
    toast(m.published ? 'Materi disembunyikan dari peserta.' : 'Materi diterbitkan untuk peserta.', 'success')
    void reload(true)
  }

  async function remove(m: Material) {
    const ok = await confirm({ title: `Hapus materi “${m.title}”?`, danger: true, confirmText: 'Hapus', message: 'Berkasnya dihapus permanen dan tidak lagi bisa diunduh peserta.' })
    if (!ok) return
    try { await deleteMaterial(m) } catch (e) { return toast(errMsg(e), 'error') }
    toast('Materi dihapus.', 'success'); void reload(true)
  }

  if (loading && !data) return <Loading />
  if (error || !data) {
    const missing = /materials|schema cache|does not exist/i.test(error ?? '')
    return <ErrorBox error={missing ? 'Modul Materi belum aktif di database. Jalankan supabase/migrations/024_materi.sql di Supabase SQL Editor, lalu muat ulang halaman ini.' : (error ?? '')} onRetry={() => void reload()} />
  }

  return (
    <div className="stack">
      <PageHeader title="Materi" subtitle="Unggah materi dari pemateri; peserta mengunduhnya lewat link pribadi."
        actions={<>
          <button className="btn" onClick={() => setLinking(true)}><Link2 size={16} /> Tambah tautan</button>
          <button className="btn primary" onClick={() => setUploading([])}><Upload size={16} /> Unggah materi</button>
        </>} />

      {all.length === 0 ? (
        <div className="card">
          <FileDrop onFiles={pickFiles} accept={MATERIAL_ACCEPT}>
            <b>Seret materi ke sini</b> atau klik untuk memilih berkas<br />
            <span className="muted small">{MATERIAL_TYPES_TEXT} · maksimal 50 MB per berkas · boleh banyak berkas sekaligus</span>
          </FileDrop>
          <Empty icon={<BookOpen size={26} />} title="Belum ada materi">Unggah slide, modul, atau tautan materi agar peserta bisa mengunduhnya kapan saja.</Empty>
        </div>
      ) : (
        <div className="card flush">
          <div className="toolbar">
            <div className="row">
              <label className="search"><Search size={16} /><input className="input" placeholder="Cari judul, pemateri, atau nama berkas" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari materi" /></label>
              <div className="pills" role="group" aria-label="Filter status">
                {([['semua', `Semua ${all.length}`], ['terbit', `Terbit ${published}`], ['draf', `Draf ${all.length - published}`]] as const).map(([k, l]) => (
                  <button key={k} className={`pill ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>{l}</button>
                ))}
              </div>
            </div>
            <span className="muted small">{fmtSize(totalBytes) ? `Total ${fmtSize(totalBytes)}` : ''}</span>
          </div>

          <div style={{ padding: '0 16px 14px' }}>
            <FileDrop onFiles={pickFiles} accept={MATERIAL_ACCEPT} compact>Seret berkas ke sini untuk menambah materi</FileDrop>
          </div>

          {list.length === 0 && <p className="muted center" style={{ padding: 24 }}>Tidak ada materi yang cocok.</p>}
          {list.map((m) => (
            <div className={`mat-row ${m.published ? '' : 'draft'}`} key={m.id}>
              <FileIcon kind={m.kind} mime={m.mime_type} />
              <div className="mat-main">
                <div className="mat-title">{m.title} {!m.published && <span className="badge dot warn">Draf</span>}</div>
                <div className="mat-meta">
                  {m.speaker && <span>Pemateri: {m.speaker}</span>}
                  <span>{m.kind === 'tautan' ? hostOf(m.url ?? '') : [m.file_name, fmtSize(m.size_bytes)].filter(Boolean).join(' · ')}</span>
                  <span>{fmtDate(m.created_at)}</span>
                </div>
                {m.description && <div className="mat-desc">{m.description}</div>}
              </div>
              <div className="mat-act">
                {m.kind === 'berkas' && m.storage_path
                  ? <a className="icon-btn" href={materialUrl(m.storage_path, m.file_name ?? undefined)} aria-label={`Unduh ${m.title}`} title="Unduh"><Download size={16} /></a>
                  : <a className="icon-btn" href={m.url ?? '#'} target="_blank" rel="noreferrer" aria-label={`Buka tautan ${m.title}`} title="Buka tautan"><ExternalLink size={16} /></a>}
                <button className="icon-btn" onClick={() => void togglePublish(m)} aria-label={m.published ? `Sembunyikan ${m.title}` : `Terbitkan ${m.title}`} title={m.published ? 'Sembunyikan dari peserta' : 'Terbitkan untuk peserta'}>{m.published ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                <button className="icon-btn" onClick={() => setEditing(m)} aria-label={`Ubah ${m.title}`} title="Ubah"><Pencil size={16} /></button>
                <button className="icon-btn danger" onClick={() => void remove(m)} aria-label={`Hapus ${m.title}`} title="Hapus"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {uploading && <UploadModal activityId={activity.id} initial={uploading} speakers={speakers.data ?? []} onClose={() => setUploading(null)} onDone={() => { setUploading(null); void reload(true) }} />}
      {linking && <LinkModal activityId={activity.id} speakers={speakers.data ?? []} onClose={() => setLinking(false)} onDone={() => { setLinking(false); void reload(true) }} />}
      {editing && <EditModal m={editing} speakers={speakers.data ?? []} onClose={() => setEditing(null)} onDone={() => { setEditing(null); void reload(true) }} />}
    </div>
  )
}

const SpeakerInput = ({ value, onChange, speakers, id }: { value: string; onChange: (v: string) => void; speakers: string[]; id: string }) => (
  <>
    <input className="input" list={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder="mis. Dr. Budi Santoso, M.Si." maxLength={200} aria-label="Pemateri" />
    <datalist id={id}>{speakers.map((s) => <option key={s} value={s} />)}</datalist>
  </>
)

/** Unggah banyak berkas sekaligus: tiap berkas menjadi satu materi dengan judul yang bisa disunting. */
function UploadModal({ activityId, initial, speakers, onClose, onDone }: {
  activityId: string; initial: File[]; speakers: string[]; onClose: () => void; onDone: () => void
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
      try { await uploadMaterialFile(activityId, r.f, { title: r.title, speaker, description, published }, () => setDone((n) => n + 1)) } catch (err) { failed.push(`${r.f.name}: ${errMsg(err)}`) }
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

function LinkModal({ activityId, speakers, onClose, onDone }: { activityId: string; speakers: string[]; onClose: () => void; onDone: () => void }) {
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
    try { await addMaterialLink(activityId, clean, meta) } catch (err) { setBusy(false); return toast(errMsg(err), 'error') }
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

function EditModal({ m, speakers, onClose, onDone }: { m: Material; speakers: string[]; onClose: () => void; onDone: () => void }) {
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
    if (file) { const bad = checkMaterialFile(file); if (bad) return toast(bad, 'error') }
    setBusy(true)
    try { await updateMaterial(m, meta, { file, url: cleanedUrl }) } catch (err) { setBusy(false); return toast(errMsg(err), 'error') }
    toast('Materi diperbarui.', 'success'); onDone()
  }
  return (
    <Modal title="Ubah materi" onClose={() => !busy && onClose()}
      footer={<><button className="btn ghost" onClick={onClose} disabled={busy}>Batal</button><span className="spacer" /><button className="btn primary" form="edt" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button></>}>
      <form id="edt" onSubmit={submit} noValidate>
        <MetaFields m={meta} onChange={setMeta} speakers={speakers} idPrefix="edt" />
        {m.kind === 'tautan'
          ? <Field label="Alamat tautan *"><input className="input" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Alamat tautan" /></Field>
          : (
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

