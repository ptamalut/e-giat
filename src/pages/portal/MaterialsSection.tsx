import { BookOpen, Download, ExternalLink, Link2, Pencil, Search, Trash2, Upload } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import FileDrop from '../../components/FileDrop'
import FileIcon from '../../components/FileIcon'
import { EditModal, LinkModal, UploadModal } from '../../components/MaterialForms'
import { CardTitle, useConfirm, useToast } from '../../components/ui'
import { fmtDate } from '../../lib/format'
import { checkMaterialFile, fmtSize, hostOf, MATERIAL_ACCEPT } from '../../lib/materials'
import { materialUrl } from '../../lib/materialsApi'
import { portalMaterialDelete, portalMaterialWriter } from '../../lib/portalStaffApi'
import { errMsg, rpc } from '../../lib/supabase'
import type { PortalMaterial } from '../../lib/types'

/**
 * Materi kegiatan di halaman pribadi: daftar yang diterbitkan panitia, untuk diunduh atau dibuka. Petugas/panitia juga bisa
 * menambah materi (berkas atau tautan) serta mengubah dan menghapus materi buatannya sendiri. Tidak tampil bila menu nonaktif,
 * tidak berhak, atau belum ada materi (kecuali bagi petugas/panitia, yang tetap melihat tombol tambah).
 */
export default function MaterialsSection({ token }: { token: string }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [items, setItems] = useState<PortalMaterial[] | null>(null)
  const [manage, setManage] = useState(false)
  const [version, setVersion] = useState(0)
  const [q, setQ] = useState('')
  const [uploading, setUploading] = useState<File[] | null>(null)
  const [linking, setLinking] = useState(false)
  const [editing, setEditing] = useState<PortalMaterial | null>(null)
  const writer = useMemo(() => portalMaterialWriter(token), [token])
  useEffect(() => {
    let alive = true
    rpc<{ enabled: boolean; manage?: boolean; items: PortalMaterial[] }>('portal_materials', { p_token: token })
      .then((d) => { if (!alive) return; setItems(d.enabled ? d.items : []); setManage(!!d.enabled && !!d.manage) })
      .catch(() => alive && setItems([]))      // migrasi belum dijalankan atau galat: bagian ini disembunyikan
    return () => { alive = false }
  }, [token, version])
  const reload = () => setVersion((v) => v + 1)

  function pickFiles(files: File[]) {
    const bad = files.map(checkMaterialFile).filter((x): x is string => !!x)
    const ok = files.filter((f) => !checkMaterialFile(f))
    if (bad.length) toast(bad.slice(0, 2).join(' ') + (bad.length > 2 ? ` (+${bad.length - 2} berkas lain ditolak)` : ''), 'error')
    if (ok.length) setUploading(ok)
  }

  async function remove(m: PortalMaterial) {
    const ok = await confirm({ title: `Hapus materi “${m.title}”?`, danger: true, confirmText: 'Hapus', message: 'Materi ini tidak lagi tampil bagi peserta.' })
    if (!ok) return
    try { await portalMaterialDelete(token, m.id) } catch (e) { return toast(errMsg(e), 'error') }
    toast('Materi dihapus.', 'success'); reload()
  }

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (items ?? []).filter((m) => !s || [m.title, m.speaker, m.description, m.file_name].some((v) => v?.toLowerCase().includes(s)))
  }, [items, q])

  if (!items?.length && !manage) return null
  const all = items ?? []
  return (
    <section className="card flush" aria-label="Materi">
      <div className="card-head" style={{ padding: '16px 16px 0' }}>
        <CardTitle icon={<BookOpen size={18} />}>Materi</CardTitle><span className="badge">{all.length}</span><span className="spacer" />
        {manage && <>
          <button type="button" className="btn sm" onClick={() => setLinking(true)}><Link2 size={14} /> Tambah tautan</button>
          <button type="button" className="btn sm primary" onClick={() => setUploading([])}><Upload size={14} /> Unggah materi</button>
        </>}
      </div>
      {manage && <p className="muted small" style={{ margin: '8px 16px 0' }}>Sebagai petugas/panitia, Anda bisa menambahkan materi. Materi buatan Anda bisa diubah atau dihapus; materi Draf hanya terlihat oleh Anda dan admin.</p>}
      {manage && !all.length && (
        <div style={{ padding: '12px 16px 16px' }}>
          <FileDrop onFiles={pickFiles} accept={MATERIAL_ACCEPT} compact>Seret berkas ke sini untuk menambah materi</FileDrop>
        </div>
      )}
      {all.length > 5 && (
        <div style={{ padding: '10px 16px 0' }}>
          <label className="search"><Search size={16} /><input className="input" placeholder="Cari materi" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari materi" /></label>
        </div>
      )}
      <div style={{ marginTop: 6 }}>
        {list.map((m) => {
          const file = m.kind === 'berkas' && m.path
          return (
            <div className="mat-row" key={m.id}>
              <FileIcon kind={m.kind} mime={m.mime_type} />
              <div className="mat-main">
                <div className="mat-title">{m.title} {m.published === false && <span className="badge dot warn">Draf</span>} {m.mine && manage && <span className="badge primary">Buatan Anda</span>}</div>
                <div className="mat-meta">
                  {m.speaker && <span>Pemateri: {m.speaker}</span>}
                  <span>{m.kind === 'tautan' ? hostOf(m.url ?? '') : fmtSize(m.size_bytes)}</span>
                  <span>{fmtDate(m.created_at)}</span>
                </div>
                {m.description && <div className="mat-desc">{m.description}</div>}
              </div>
              <div className="mat-act">
                {file
                  ? <a className="btn sm primary" href={materialUrl(m.path!, m.file_name ?? undefined)} aria-label={`Unduh ${m.title}`}><Download size={14} /> Unduh</a>
                  : <a className="btn sm primary" href={m.url ?? '#'} target="_blank" rel="noreferrer" aria-label={`Buka ${m.title}`}><ExternalLink size={14} /> Buka</a>}
                {manage && m.mine && <>
                  <button type="button" className="icon-btn" onClick={() => setEditing(m)} aria-label={`Ubah ${m.title}`} title="Ubah"><Pencil size={16} /></button>
                  <button type="button" className="icon-btn danger" onClick={() => void remove(m)} aria-label={`Hapus ${m.title}`} title="Hapus"><Trash2 size={16} /></button>
                </>}
              </div>
            </div>
          )
        })}
        {!list.length && all.length > 0 && <p className="muted center" style={{ padding: 20 }}>Tidak ada materi yang cocok.</p>}
      </div>
      {uploading && <UploadModal writer={writer} initial={uploading} speakers={[]} onClose={() => setUploading(null)} onDone={() => { setUploading(null); reload() }} />}
      {linking && <LinkModal writer={writer} speakers={[]} onClose={() => setLinking(false)} onDone={() => { setLinking(false); reload() }} />}
      {editing && <EditModal m={{ id: editing.id, kind: editing.kind, title: editing.title, speaker: editing.speaker, description: editing.description, published: editing.published !== false, url: editing.url, file_name: editing.file_name, size_bytes: editing.size_bytes }}
        writer={writer} speakers={[]} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload() }} />}
    </section>
  )
}
