import { FileText, X } from 'lucide-react'
import { useRef } from 'react'
import { Field } from './ui'
import { LETTER_TYPES, type LetterInput } from '../lib/lettersApi'

/** Isian dasar surat (asal, nomor, tanggal, perihal) dan pilihan berkas surat. */
export default function LetterFields({ value, onChange, file, onFile, existingFileName, idPrefix = 'ls' }: {
  value: LetterInput; onChange: (v: LetterInput) => void
  file: File | null; onFile: (f: File | null) => void
  /** nama berkas yang sudah tersimpan (bila sedang mengubah) */
  existingFileName?: string | null
  idPrefix?: string
}) {
  const input = useRef<HTMLInputElement>(null)
  const set = (k: keyof LetterInput) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value })
  return (
    <>
      <Field label="Asal surat" hint="Penerbit surat, mis. Ketua Pengadilan Tinggi Agama atau Sekretaris Mahkamah Agung.">
        <input className="input" value={value.issuer} maxLength={200} onChange={set('issuer')} placeholder="mis. Ketua Pengadilan Tinggi Agama Maluku Utara" />
      </Field>
      <div className="form-grid">
        <Field label="Nomor surat"><input className="input" value={value.number} maxLength={120} onChange={set('number')} placeholder="mis. W29-A/123/HK.05/XI/2026" /></Field>
        <Field label="Tanggal surat"><input className="input" type="date" value={value.letter_date} onChange={set('letter_date')} /></Field>
      </div>
      <Field label="Perihal"><input className="input" value={value.subject} maxLength={500} onChange={set('subject')} placeholder="mis. Undangan Pelaksanaan Bimtek" /></Field>
      <Field label="Berkas surat" hint={`PDF atau gambar (JPG/PNG/WEBP), maksimal 10 MB. Boleh dikosongkan dan diunggah nanti di Ringkasan kegiatan.${existingFileName ? ' Memilih berkas baru menggantikan berkas yang tersimpan.' : ''}`}>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn sm" onClick={() => input.current?.click()}><FileText size={14} /> {file || existingFileName ? 'Ganti berkas' : 'Pilih berkas'}</button>
          <input ref={input} id={`${idPrefix}-file`} type="file" accept={LETTER_TYPES.join(',')} hidden aria-label="Berkas surat"
            onChange={(e) => { onFile(e.target.files?.[0] ?? null); e.target.value = '' }} />
          {file
            ? <span className="small">{file.name} <button type="button" className="icon-btn" aria-label="Batalkan berkas" onClick={() => onFile(null)}><X size={14} /></button></span>
            : existingFileName ? <span className="muted small">{existingFileName}</span> : <span className="muted small">Belum ada berkas</span>}
        </div>
      </Field>
    </>
  )
}
