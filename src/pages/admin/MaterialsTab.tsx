import { BookOpen, Download, ExternalLink, Eye, EyeOff, Link2, Pencil, Search, Trash2, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'
import FileDrop from '../../components/FileDrop'
import { EditModal, LinkModal, UploadModal, type MaterialWriter } from '../../components/MaterialForms'
import FileIcon from '../../components/FileIcon'
import { Empty, ErrorBox, Loading, PageHeader, useAsync, useConfirm, useToast } from '../../components/ui'
import { fmtDate } from '../../lib/format'
import { checkMaterialFile, fmtSize, hostOf, MATERIAL_ACCEPT, MATERIAL_TYPES_TEXT } from '../../lib/materials'
import {
  addMaterialLink, deleteMaterial, fetchMaterials, materialUrl, setMaterialPublished, updateMaterial, uploadMaterialFile,
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

  const writer = useMemo<MaterialWriter>(() => ({
    upload: (file, meta, onProgress) => uploadMaterialFile(activity.id, file, meta, onProgress),
    addLink: (url, meta) => addMaterialLink(activity.id, url, meta),
    update: (m, meta, opts) => updateMaterial(m as Material, meta, opts),
    replaceFile: true,
  }), [activity.id])
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
                <div className="mat-title">{m.title} {!m.published && <span className="badge dot warn">Draf</span>} {m.added_by && <span className="badge primary" title="Ditambahkan lewat link pribadi petugas/panitia">Dari petugas</span>}</div>
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

      {uploading && <UploadModal writer={writer} initial={uploading} speakers={speakers.data ?? []} onClose={() => setUploading(null)} onDone={() => { setUploading(null); void reload(true) }} />}
      {linking && <LinkModal writer={writer} speakers={speakers.data ?? []} onClose={() => setLinking(false)} onDone={() => { setLinking(false); void reload(true) }} />}
      {editing && <EditModal m={editing} writer={writer} speakers={speakers.data ?? []} onClose={() => setEditing(null)} onDone={() => { setEditing(null); void reload(true) }} />}
    </div>
  )
}
