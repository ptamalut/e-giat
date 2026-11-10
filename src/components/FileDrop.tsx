import { UploadCloud } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'

/** Area seret-dan-lepas berkas (juga bisa diklik untuk memilih berkas). */
export default function FileDrop({ onFiles, accept, multiple = true, children, compact = false }: {
  onFiles: (files: File[]) => void; accept?: string; multiple?: boolean; children?: ReactNode; compact?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const take = (list: FileList | null) => { const f = [...(list ?? [])]; if (f.length) onFiles(multiple ? f : f.slice(0, 1)) }
  return (
    <div className={`filedrop ${over ? 'over' : ''} ${compact ? 'compact' : ''}`} role="button" tabIndex={0}
      onClick={() => input.current?.click()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click() } }}
      onDragEnter={(e) => { e.preventDefault(); setOver(true) }} onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setOver(false) }}
      onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files) }}>
      <UploadCloud size={compact ? 22 : 30} />
      <div className="fd-text">{children ?? <><b>Seret berkas ke sini</b> atau klik untuk memilih</>}</div>
      <input ref={input} type="file" hidden multiple={multiple} accept={accept} aria-label="Pilih berkas" onChange={(e) => { take(e.target.files); e.target.value = '' }} />
    </div>
  )
}
