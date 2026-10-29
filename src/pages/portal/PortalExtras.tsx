import { ChevronDown, ChevronRight, ExternalLink, Images, Link2, NotebookPen } from 'lucide-react'
import { useEffect, useState } from 'react'
import { CardTitle, Empty, Loading, Modal } from '../../components/ui'
import { DEFAULT_ALBUM, DOC_BUCKET } from '../../lib/docs'
import { fmtDate, fmtDateTime } from '../../lib/format'
import { rpc, supabase } from '../../lib/supabase'
import type { PortalDoc, PortalNote } from '../../lib/types'

/** Muat data portal sekali; galat ditampilkan sebagai pesan. */
function useRpc<T>(fn: string, token: string) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    rpc<T>(fn, { p_token: token }).then((d) => alive && setData(d)).catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
    return () => { alive = false }
  }, [fn, token])
  return { data, error }
}

const Block = ({ title, text }: { title: string; text: string | null }) =>
  text ? <div style={{ marginTop: 12 }}><div className="label">{title}</div><p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap', color: 'var(--text-2)' }}>{text}</p></div> : null

/** Notula yang sudah Final. */
export function NotesSection({ token }: { token: string }) {
  const { data, error } = useRpc<PortalNote[]>('portal_notes', token)
  const [open, setOpen] = useState<string | null>(null)
  return (
    <section className="card" aria-label="Notula">
      <div className="card-head"><CardTitle icon={<NotebookPen size={18} />}>Notula</CardTitle></div>
      {error && <div className="alert warn"><span>{error}</span></div>}
      {!data && !error && <Loading />}
      {data && !data.length && <Empty icon={<NotebookPen size={26} />} title="Belum ada notula">Notula akan tampil di sini setelah disahkan panitia.</Empty>}
      {data?.map((n) => {
        const isOpen = open === n.id
        return (
          <div className="item" key={n.id} style={{ display: 'block' }}>
            <button type="button" className="row" style={{ width: '100%', textAlign: 'left', background: 'none', border: 0, cursor: 'pointer', flexWrap: 'nowrap', color: 'inherit', font: 'inherit' }}
              aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : n.id)}>
              {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <span style={{ flex: 1 }}>
                <b>{n.title}</b>
                <span className="muted small" style={{ display: 'block' }}>{n.held_at ? fmtDateTime(n.held_at) : ''}{n.location ? ` · ${n.location}` : ''}</span>
              </span>
            </button>
            {isOpen && (
              <div style={{ padding: '4px 0 4px 24px' }}>
                {(n.leader || n.notetaker) && <div className="muted small">{[n.leader && `Pimpinan: ${n.leader}`, n.notetaker && `Pencatat: ${n.notetaker}`].filter(Boolean).join(' · ')}</div>}
                <Block title="Agenda" text={n.agenda} />
                <Block title="Pembahasan" text={n.discussion} />
                <Block title="Keputusan / kesimpulan" text={n.decisions} />
                {n.follow_ups.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div className="label">Tindak lanjut</div>
                    <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                      {n.follow_ups.map((f) => (
                        <li key={f.id} style={{ color: 'var(--text-2)' }}>
                          {f.done ? '✓ ' : ''}{f.task}{f.pic ? ` — ${f.pic}` : ''}{f.due ? ` (tenggat ${fmtDate(f.due)})` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}

const photoUrl = (path: string) => supabase.storage.from(DOC_BUCKET).getPublicUrl(path).data.publicUrl

/** Dokumentasi kegiatan: foto dan tautan, dikelompokkan per album. */
export function DocsSection({ token }: { token: string }) {
  const { data, error } = useRpc<PortalDoc[]>('portal_docs', token)
  const [view, setView] = useState<PortalDoc | null>(null)
  const albums = new Map<string, PortalDoc[]>()
  for (const d of data ?? []) { const a = (d.album ?? '').trim() || DEFAULT_ALBUM; albums.set(a, [...(albums.get(a) ?? []), d]) }
  const ordered = [...albums.entries()].sort((a, b) => (a[0] === DEFAULT_ALBUM ? 1 : b[0] === DEFAULT_ALBUM ? -1 : a[0].localeCompare(b[0], 'id')))
  return (
    <section className="card" aria-label="Dokumentasi">
      <div className="card-head"><CardTitle icon={<Images size={18} />}>Dokumentasi</CardTitle></div>
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
      {view?.path && (
        <Modal title={view.caption || 'Foto kegiatan'} onClose={() => setView(null)}
          footer={<a className="btn" href={photoUrl(view.path)} target="_blank" rel="noreferrer noopener"><ExternalLink size={15} /> Ukuran penuh</a>}>
          <img className="photo-view" src={photoUrl(view.path)} alt={view.caption || 'Foto kegiatan'} />
        </Modal>
      )}
    </section>
  )
}
