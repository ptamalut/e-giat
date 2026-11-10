import { BookOpen, Download, ExternalLink, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import FileIcon from '../../components/FileIcon'
import { CardTitle } from '../../components/ui'
import { fmtDate } from '../../lib/format'
import { fmtSize, hostOf } from '../../lib/materials'
import { materialUrl } from '../../lib/materialsApi'
import { rpc } from '../../lib/supabase'
import type { PortalMaterial } from '../../lib/types'

/** Materi kegiatan di halaman pribadi: daftar yang diterbitkan panitia, untuk diunduh atau dibuka. Tidak tampil bila menu nonaktif, tidak berhak, atau belum ada materi. */
export default function MaterialsSection({ token }: { token: string }) {
  const [items, setItems] = useState<PortalMaterial[] | null>(null)
  const [q, setQ] = useState('')
  useEffect(() => {
    let alive = true
    rpc<{ enabled: boolean; items: PortalMaterial[] }>('portal_materials', { p_token: token })
      .then((d) => alive && setItems(d.enabled ? d.items : []))
      .catch(() => alive && setItems([]))      // migrasi belum dijalankan atau galat: bagian ini disembunyikan
    return () => { alive = false }
  }, [token])

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (items ?? []).filter((m) => !s || [m.title, m.speaker, m.description, m.file_name].some((v) => v?.toLowerCase().includes(s)))
  }, [items, q])

  if (!items?.length) return null
  return (
    <section className="card flush" aria-label="Materi">
      <div className="card-head" style={{ padding: '16px 16px 0' }}>
        <CardTitle icon={<BookOpen size={18} />}>Materi</CardTitle><span className="badge">{items.length}</span>
      </div>
      {items.length > 5 && (
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
                <div className="mat-title">{m.title}</div>
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
              </div>
            </div>
          )
        })}
        {!list.length && <p className="muted center" style={{ padding: 20 }}>Tidak ada materi yang cocok.</p>}
      </div>
    </section>
  )
}
