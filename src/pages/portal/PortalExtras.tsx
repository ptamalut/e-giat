import { ChevronDown, ChevronRight, ExternalLink, FileDown, FileText, ImagePlus, Images, Link2, NotebookPen, Pencil, Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useBrand } from '../../components/brand'
import { LinkModal, UploadModal } from '../../components/DocForms'
import NoteEditor, { type NoteDraft } from '../../components/NoteEditor'
import NoteView from '../../components/NoteView'
import { CardTitle, Empty, Loading, Modal, useToast } from '../../components/ui'
import { DEFAULT_ALBUM, DOC_BUCKET } from '../../lib/docs'
import { fmtDateTime } from '../../lib/format'
import { emptyNote } from '../../lib/notes'
import { buildNoteDoc, kopFromSettings } from '../../lib/noteDoc'
import { downloadNote, type NoteFormat } from '../../lib/noteExport'
import { portalDocWriter, portalNoteApi } from '../../lib/portalStaffApi'
import { errMsg, rpc, supabase } from '../../lib/supabase'
import type { NoteContext, PortalDoc, PortalNote } from '../../lib/types'

/** Muat data portal sekali; galat ditampilkan sebagai pesan. */
function useRpc<T>(fn: string, token: string, version = 0) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    rpc<T>(fn, { p_token: token }).then((d) => alive && setData(d)).catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
    return () => { alive = false }
  }, [fn, token, version])
  return { data, error }
}

/** Notula yang sudah Final. Petugas/panitia juga bisa menambah notula dan mengubah buatannya sendiri. */
export function NotesSection({ token, canManage = false, activityId, context, sessions, onEditing }: {
  token: string; canManage?: boolean; activityId: string; context: NoteContext; sessions: { id: string; title: string }[]
  /** dipanggil saat editor notula dibuka/ditutup (halaman menyembunyikan bagian lain) */
  onEditing?: (editing: boolean) => void
}) {
  const [version, setVersion] = useState(0)
  const { data, error } = useRpc<PortalNote[]>('portal_notes', token, version)
  const [open, setOpen] = useState<string | null>(null)
  const [editing, setEditing] = useState<NoteDraft | null>(null)
  const api = useMemo(() => portalNoteApi(token, sessions), [token, sessions])
  useEffect(() => { onEditing?.(!!editing) }, [editing, onEditing])
  const { settings } = useBrand()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  async function download(format: NoteFormat, n: PortalNote) {
    setBusy(`${n.id}:${format}`)
    try { await downloadNote(format, n, settings) } catch (e) { toast(errMsg(e), 'error') } finally { setBusy(null) }
  }
  const toDraft = (n: PortalNote): NoteDraft => ({ id: n.id, title: n.title, held_at: n.held_at, location: n.location, leader: n.leader, notetaker: n.notetaker, attendees: n.attendees,
    agenda: n.agenda, discussion: n.discussion, decisions: n.decisions, follow_ups: n.follow_ups, status: n.status ?? 'draft',
    basis: n.basis ?? null, held_until: n.held_until ?? null, leader_role: n.leader_role ?? null, leader_nip: n.leader_nip ?? null, notetaker_nip: n.notetaker_nip ?? null, sections: n.sections ?? [], attendee_list: n.attendee_list ?? [], recordings: n.recordings ?? [] })

  if (editing) {
    return <div className="keep"><NoteEditor key={editing.id ?? 'baru'} draft={editing} activityId={activityId} context={context} api={api} backLabel="Kembali ke halaman saya"
      onBack={() => { setEditing(null); setVersion((v) => v + 1) }} /></div>
  }
  return (
    <section className="card" aria-label="Notula">
      <div className="card-head"><CardTitle icon={<NotebookPen size={18} />}>Notula</CardTitle><span className="spacer" />
        {canManage && <button className="btn sm primary" onClick={() => setEditing(emptyNote(context.location))}><Plus size={14} /> Tambah notula</button>}</div>
      {canManage && <p className="muted small" style={{ marginTop: -6 }}>Sebagai petugas/panitia, Anda bisa mencatat notula; notula Draft hanya terlihat oleh Anda dan admin sampai Anda menandainya Final.</p>}
      {error && <div className="alert warn"><span>{error}</span></div>}
      {!data && !error && <Loading />}
      {data && !data.length && <Empty icon={<NotebookPen size={26} />} title="Belum ada notula">Notula akan tampil di sini setelah disahkan panitia.</Empty>}
      {data?.map((n) => {
        const isOpen = open === n.id
        return (
          <div className="item" key={n.id} style={{ display: 'block' }}>
            <div className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
              <button type="button" className="row" style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 0, cursor: 'pointer', flexWrap: 'nowrap', color: 'inherit', font: 'inherit' }}
                aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : n.id)}>
                {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span style={{ flex: 1 }}>
                  <b>{n.title}</b>{n.status === 'draft' && <span className="badge warn" style={{ marginLeft: 8 }}>Draft</span>}{n.mine && <span className="badge primary" style={{ marginLeft: 6 }}>Buatan Anda</span>}
                  <span className="muted small" style={{ display: 'block' }}>{n.held_at ? fmtDateTime(n.held_at) : ''}{n.location ? ` · ${n.location}` : ''}</span>
                </span>
              </button>
              {n.mine && canManage && <button type="button" className="btn sm" onClick={() => setEditing(toDraft(n))} aria-label={`Ubah notula ${n.title}`}><Pencil size={13} /> Ubah</button>}
            </div>
            {isOpen && (
              <div style={{ padding: '4px 0 4px 24px' }}>
                <NoteView doc={buildNoteDoc(n, kopFromSettings(settings))} />
                <div className="row tight" style={{ marginTop: 12 }}>
                  {(['docx', 'pdf'] as const).map((fmt) => (
                    <button key={fmt} type="button" className="btn sm" disabled={!!busy} onClick={() => void download(fmt, n)} aria-label={`Unduh notula ${n.title} (${fmt === 'docx' ? 'Word' : 'PDF'})`}>
                      {fmt === 'docx' ? <FileDown size={14} /> : <FileText size={14} />} {busy === `${n.id}:${fmt}` ? 'Menyiapkan…' : fmt === 'docx' ? 'Word' : 'PDF'}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}

const photoUrl = (path: string) => supabase.storage.from(DOC_BUCKET).getPublicUrl(path).data.publicUrl

/** Dokumentasi kegiatan: foto dan tautan, dikelompokkan per album. Petugas/panitia bisa menambah foto dan tautan. */
export function DocsSection({ token, canManage = false }: { token: string; canManage?: boolean }) {
  const [version, setVersion] = useState(0)
  const { data, error } = useRpc<PortalDoc[]>('portal_docs', token, version)
  const [view, setView] = useState<PortalDoc | null>(null)
  const [files, setFiles] = useState<File[] | null>(null)
  const [linking, setLinking] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const writer = useMemo(() => portalDocWriter(token), [token])
  const albums = new Map<string, PortalDoc[]>()
  for (const d of data ?? []) { const a = (d.album ?? '').trim() || DEFAULT_ALBUM; albums.set(a, [...(albums.get(a) ?? []), d]) }
  const ordered = [...albums.entries()].sort((a, b) => (a[0] === DEFAULT_ALBUM ? 1 : b[0] === DEFAULT_ALBUM ? -1 : a[0].localeCompare(b[0], 'id')))
  return (
    <section className="card" aria-label="Dokumentasi">
      <div className="card-head"><CardTitle icon={<Images size={18} />}>Dokumentasi</CardTitle><span className="spacer" />
        {canManage && <>
          <button className="btn sm" onClick={() => setLinking(true)}><Link2 size={14} /> Tambah tautan</button>
          <button className="btn sm primary" onClick={() => fileInput.current?.click()}><ImagePlus size={14} /> Tambah foto</button>
          <input ref={fileInput} type="file" accept="image/*" multiple hidden aria-label="Pilih foto dokumentasi"
            onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) setFiles(f) }} />
        </>}
      </div>
      {error && <div className="alert warn"><span>{error}</span></div>}
      {!data && !error && <Loading />}
      {data && !data.length && <Empty icon={<Images size={26} />} title="Belum ada dokumentasi" />}
      {ordered.map(([album, items]) => (
        <div key={album} style={{ marginBottom: 14 }}>
          <div className="label" style={{ marginBottom: 8 }}>{album}</div>
          <div className="gallery">
            {items.map((d) => d.kind === 'foto' && d.path ? (
              <button key={d.id} type="button" className="gallery-item" onClick={() => setView(d)} aria-label={`Lihat ${d.caption || 'foto'}`}>
                <img src={photoUrl(d.path)} alt={d.caption || 'Foto kegiatan'} loading="lazy" />
                {d.caption && <span className="gallery-cap">{d.caption}</span>}
              </button>
            ) : (
              <div key={d.id} className="gallery-link">
                <Link2 size={20} /><b>{d.title || d.url}</b>
                {d.caption && <span className="muted small">{d.caption}</span>}
                <a className="btn sm" href={d.url!} target="_blank" rel="noreferrer noopener"><ExternalLink size={14} /> Buka</a>
              </div>
            ))}
          </div>
        </div>
      ))}
      {files && <UploadModal files={files} albums={ordered.map(([a]) => a)} defaultAlbum="" upload={writer.upload}
        onClose={() => setFiles(null)} onDone={() => { setFiles(null); setVersion((v) => v + 1) }} />}
      {linking && <LinkModal value={{}} albums={ordered.map(([a]) => a)} save={writer.addLink}
        onClose={() => setLinking(false)} onSaved={() => { setLinking(false); setVersion((v) => v + 1) }} />}
      {view?.path && (
        <Modal title={view.caption || 'Foto kegiatan'} onClose={() => setView(null)}
          footer={<a className="btn" href={photoUrl(view.path)} target="_blank" rel="noreferrer noopener"><ExternalLink size={15} /> Ukuran penuh</a>}>
          <img className="photo-view" src={photoUrl(view.path)} alt={view.caption || 'Foto kegiatan'} />
        </Modal>
      )}
    </section>
  )
}
