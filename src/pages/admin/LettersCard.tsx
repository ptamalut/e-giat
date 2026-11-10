import { ExternalLink, FileText, Pencil, Plus, ScrollText, Trash2 } from 'lucide-react'
import { useState } from 'react'
import LetterFields from '../../components/LetterFields'
import { CardTitle, Empty, ErrorBox, Loading, Modal, useAsync, useConfirm, useToast } from '../../components/ui'
import { fmtDate } from '../../lib/format'
import { checkLetterFile, deleteLetter, emptyLetter, fetchLetters, hasLetterText, saveLetter, signedLetterUrl, type LetterInput } from '../../lib/lettersApi'
import { errMsg } from '../../lib/supabase'
import type { ActivityLetter } from '../../lib/types'

const fmtSize = (n: number | null) => (n == null ? '' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)

/** Dasar surat kegiatan: daftar surat, tambah/ubah/hapus, dan lihat berkasnya. */
export default function LettersCard({ activityId }: { activityId: string }) {
  const toast = useToast()
  const confirm = useConfirm()
  const { data, error, loading, reload } = useAsync(() => fetchLetters(activityId), [activityId])
  const [editing, setEditing] = useState<ActivityLetter | 'new' | null>(null)

  async function open(l: ActivityLetter) {
    if (!l.storage_path) return
    // jendela dibuka dulu (saat klik) agar tidak diblokir browser, lalu diarahkan ke alamat bertanda tangan
    const w = window.open('about:blank', '_blank')
    try {
      const url = await signedLetterUrl(l.storage_path)
      if (w) { w.opener = null; w.location.href = url } else window.location.href = url
    } catch (e) { w?.close(); toast(errMsg(e), 'error') }
  }
  async function remove(l: ActivityLetter) {
    const ok = await confirm({ title: 'Hapus dasar surat ini?', danger: true, confirmText: 'Hapus', message: l.file_name ? 'Berkas suratnya juga ikut dihapus.' : undefined })
    if (!ok) return
    try { await deleteLetter(l); toast('Dasar surat dihapus.', 'success'); void reload(true) } catch (e) { toast(errMsg(e), 'error') }
  }

  return (
    <div className="card" aria-label="Dasar surat">
      <div className="card-head"><CardTitle icon={<ScrollText size={18} />}>Dasar surat</CardTitle><span className="spacer" />
        <button className="btn sm primary" onClick={() => setEditing('new')}><Plus size={14} /> Tambah dasar surat</button></div>
      <p className="muted small" style={{ marginTop: -6 }}>Surat yang menjadi dasar pelaksanaan kegiatan (undangan, surat tugas, SK, dll.). Berkasnya tersimpan privat dan hanya bisa dibuka oleh Anda.</p>
      {loading && !data && <Loading />}
      {error && <ErrorBox error={/activity_letters|schema cache/i.test(error) ? 'Fitur dasar surat belum aktif di database. Jalankan supabase/migrations/018_dasar_surat.sql di Supabase SQL Editor.' : error} onRetry={() => void reload()} />}
      {data && !data.length && <Empty icon={<ScrollText size={26} />} title="Belum ada dasar surat">Tambahkan nomor, tanggal, perihal, dan unggah berkas suratnya.</Empty>}
      {data?.map((l) => (
        <div className="item" key={l.id}>
          <div className="grow">
            <div className="title">{l.number || l.subject || l.issuer || 'Surat'}</div>
            <div className="muted small">{[l.issuer, l.letter_date && fmtDate(l.letter_date), l.subject && l.number ? `Perihal: ${l.subject}` : null].filter(Boolean).join(' · ')}</div>
            {l.file_name && <div className="small" style={{ marginTop: 4 }}><FileText size={13} style={{ verticalAlign: '-0.15em' }} /> {l.file_name} <span className="muted">{fmtSize(l.size_bytes)}</span></div>}
          </div>
          <div className="row tight">
            {l.storage_path && <button className="btn sm" onClick={() => void open(l)}><ExternalLink size={14} /> Lihat berkas</button>}
            <button className="icon-btn" aria-label="Ubah dasar surat" onClick={() => setEditing(l)}><Pencil size={15} /></button>
            <button className="icon-btn danger" aria-label="Hapus dasar surat" onClick={() => void remove(l)}><Trash2 size={15} /></button>
          </div>
        </div>
      ))}
      {editing && <LetterModal activityId={activityId} letter={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(true) }} />}
    </div>
  )
}

function LetterModal({ activityId, letter, onClose, onSaved }: { activityId: string; letter?: ActivityLetter; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [v, setV] = useState<LetterInput>(letter ? { issuer: letter.issuer ?? '', number: letter.number ?? '', letter_date: letter.letter_date ?? '', subject: letter.subject ?? '' } : emptyLetter())
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  async function submit() {
    if (!hasLetterText(v) && !file && !letter?.storage_path) return toast('Isi minimal nomor, perihal, asal surat, atau pilih berkas.', 'error')
    if (file) { const bad = checkLetterFile(file); if (bad) return toast(bad, 'error') }
    setBusy(true)
    try { await saveLetter(activityId, v, file, letter); toast('Dasar surat disimpan.', 'success'); onSaved() } catch (e) { setBusy(false); toast(errMsg(e), 'error') }
  }
  return (
    <Modal title={letter ? 'Ubah dasar surat' : 'Tambah dasar surat'} onClose={() => !busy && onClose()}
      footer={<><button className="btn" onClick={onClose} disabled={busy}>Batal</button><button className="btn primary" onClick={() => void submit()} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button></>}>
      <LetterFields value={v} onChange={setV} file={file} onFile={setFile} existingFileName={letter?.file_name} idPrefix="edit" />
    </Modal>
  )
}
