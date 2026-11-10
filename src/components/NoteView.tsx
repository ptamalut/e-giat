import { Fragment, type ReactNode } from 'react'
import type { Block, NoteDoc, Run } from '../lib/noteDoc'

const runs = (rs: Run[]): ReactNode => rs.map((r, i) => (r.bold ? <b key={i}>{r.text}</b> : <Fragment key={i}>{r.text}</Fragment>))

/** Tampilan baca notula (sesuai susunan dokumen Word/PDF): keterangan, jalannya kegiatan, tabel tindak lanjut, tanda tangan. */
export default function NoteView({ doc }: { doc: NoteDoc }) {
  const body = (b: Block, i: number) => {
    switch (b.t) {
      case 'heading': return <h4 key={i} className="nv-h">{b.text}</h4>
      case 'para': return <p key={i} className="nv-p">{runs(b.runs)}</p>
      case 'item': return <p key={i} className={`nv-item ${b.level ? 'sub' : ''}`}><span className="nv-mark">{b.marker}</span><span>{runs(b.runs)}</span></p>
      case 'table': return (
        <div key={i} className="table-wrap"><table className="nv-table">
          <thead><tr>{b.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>{b.rows.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j} style={b.center.includes(j) ? { textAlign: 'center' } : undefined}>{c}</td>)}</tr>)}</tbody>
        </table></div>
      )
    }
  }
  return (
    <div className="nv">
      {doc.header.length > 0 && (
        <dl className="nv-meta">
          {doc.header.map((h) => <Fragment key={h.label}><dt>{h.label}</dt><dd style={{ whiteSpace: 'pre-line' }}>{h.value}</dd></Fragment>)}
        </dl>
      )}
      {doc.blocks.map(body)}
      {doc.signature && (
        <div className="nv-sign">
          {[doc.signature.left, doc.signature.right].map((s, i) => (
            <div key={i}>{[...s.caption, ...Array<string>(Math.max(doc.signature!.left.caption.length, doc.signature!.right.caption.length) - s.caption.length).fill('\u00a0')].map((c, k) => <div key={k}>{c}</div>)}<div className="nv-name"><b>{s.name}</b></div>{s.nip && <div>{s.nip}</div>}</div>
          ))}
        </div>
      )}
    </div>
  )
}
