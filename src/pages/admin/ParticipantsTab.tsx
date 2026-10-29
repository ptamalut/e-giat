import { ClipboardPaste, Download, ExternalLink, Link2, MessageCircle, Pencil, Plus, Printer, QrCode, RefreshCcw, Search, Trash2, Users } from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Empty, ErrorBox, Field, Loading, Modal, useAsync, useConfirm, useToast } from '../../components/ui'
import { downloadCsv, safeName } from '../../lib/csv'
import { participantLink } from '../../lib/format'
import { PARTICIPANT_FORMAT_HELP, parseParticipants, waNumber } from '../../lib/parsers'
import { errMsg, fetchAll, supabase } from '../../lib/supabase'
import type { Participant } from '../../lib/types'
import { useActivity } from './ActivityLayout'

const EMPTY = { name: '', identifier: '', institution: '', email: '', phone: '' }

async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true } catch {
    const t = document.createElement('textarea')
    t.value = text; document.body.appendChild(t); t.select()
    const ok = document.execCommand('copy'); t.remove(); return ok
  }
}

export default function ParticipantsTab() {
  const { activity } = useActivity()
  const toast = useToast()
  const confirm = useConfirm()
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Partial<Participant> | null>(null)
  const [bulk, setBulk] = useState(false)
  const [qr, setQr] = useState<Participant | null>(null)
  const [cards, setCards] = useState<{ p: Participant; img: string }[] | null>(null)

  const { data, error, loading, reload } = useAsync(async () => {
    return fetchAll<Participant>((a, b) => supabase.from('participants').select('*').eq('activity_id', activity.id).order('name').order('id').range(a, b))
  }, [activity.id])

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (data ?? []).filter((p) => !s || [p.name, p.identifier, p.institution].some((v) => v?.toLowerCase().includes(s)))
  }, [data, q])

  const waText = (p: Participant) =>
    `Halo ${p.name}, berikut link pribadi Anda untuk absensi & kuis kegiatan "${activity.name}":\n${participantLink(p.token)}\n\nJangan dibagikan ke orang lain.`

  async function remove(p: Participant) {
    const ok = await confirm({ title: `Hapus ${p.name}?`, danger: true, confirmText: 'Hapus',
      message: 'Data absensi dan hasil kuis peserta ini juga akan terhapus. Link pribadinya tidak berlaku lagi.' })
    if (!ok) return
    const { error } = await supabase.from('participants').delete().eq('id', p.id)
    if (error) return toast(errMsg(error), 'error')
    toast('Peserta dihapus.', 'success'); void reload(true)
  }

  async function regenerate(p: Participant) {
    const ok = await confirm({ title: 'Buat ulang link?', confirmText: 'Buat link baru',
      message: <>Link lama milik <b>{p.name}</b> akan berhenti berfungsi. Gunakan jika link bocor/salah kirim. Data absensi & kuis tetap aman.</> })
    if (!ok) return
    const token = crypto.randomUUID().replace(/-/g, '')
    const { error } = await supabase.from('participants').update({ token }).eq('id', p.id)
    if (error) return toast(errMsg(error), 'error')
    toast('Link baru dibuat.', 'success'); void reload(true)
  }

  async function printCards() {
    if (!data?.length) return
    const imgs = await Promise.all(data.map((p) => QRCode.toDataURL(participantLink(p.token), { margin: 1, width: 300 })))
    setCards(data.map((p, i) => ({ p, img: imgs[i] })))
  }

  useEffect(() => {
    if (!cards) return
    document.body.classList.add('printing-cards')
    const done = () => { document.body.classList.remove('printing-cards'); setCards(null) }
    window.addEventListener('afterprint', done, { once: true })
    const t = setTimeout(() => window.print(), 250)
    return () => { clearTimeout(t); window.removeEventListener('afterprint', done); document.body.classList.remove('printing-cards') }
  }, [cards])

  function exportLinks() {
    downloadCsv(`link-peserta-${safeName(activity.name)}`, [
      ['Nama', 'ID', 'Instansi', 'Email', 'No. HP', 'Link'],
      ...(data ?? []).map((p) => [p.name, p.identifier, p.institution, p.email, p.phone, participantLink(p.token)]),
    ])
  }

  return (
    <>
      <div className="card flush no-print">
        <div className="toolbar">
          <div className="row">
            <label className="search"><Search size={16} /><input className="input" placeholder="Cari nama, ID, atau instansi" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari peserta" /></label>
            <span className="muted small">{data?.length ?? 0} peserta</span>
          </div>
          <div className="row tight">
            <button className="btn sm" onClick={exportLinks} disabled={!data?.length}><Download size={15} /> Link (CSV)</button>
            <button className="btn sm" onClick={() => void printCards()} disabled={!data?.length}><Printer size={15} /> Kartu QR</button>
            <button className="btn sm" onClick={() => setBulk(true)}><ClipboardPaste size={15} /> Impor banyak</button>
            <button className="btn primary sm" onClick={() => setEditing({ ...EMPTY })}><Plus size={16} /> Peserta</button>
          </div>
        </div>

        {loading && <Loading />}
        {error && <div style={{ padding: 16 }}><ErrorBox error={error} onRetry={() => void reload()} /></div>}
        {!loading && !error && !data?.length && (
          <Empty icon={<Users size={26} />} title="Belum ada peserta">Tambahkan satu per satu atau tempel daftar dari Excel.</Empty>
        )}
        {!!data?.length && (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>#</th><th>Nama</th><th>ID</th><th>Instansi</th><th className="actions">Link pribadi</th><th></th></tr></thead>
              <tbody>
                {list.map((p, i) => (
                  <tr key={p.id}>
                    <td className="muted">{i + 1}</td>
                    <td><b>{p.name}</b>{p.email && <div className="muted small">{p.email}</div>}</td>
                    <td className="mono">{p.identifier ?? '—'}</td>
                    <td>{p.institution ?? '—'}</td>
                    <td className="actions">
                      <div className="row tight" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                        <button className="btn sm" onClick={async () => toast((await copy(participantLink(p.token))) ? 'Link disalin.' : 'Gagal menyalin.', 'success')}><Link2 size={14} /> Salin</button>
                        <button className="btn sm" onClick={() => setQr(p)}><QrCode size={14} /> QR</button>
                        <a className="btn sm" target="_blank" rel="noreferrer"
                          href={`https://wa.me/${waNumber(p.phone) ?? ''}?text=${encodeURIComponent(waText(p))}`}
                          title={waNumber(p.phone) ? 'Kirim lewat WhatsApp' : 'Nomor HP kosong, pilih kontak sendiri'}><MessageCircle size={14} /> WhatsApp</a>
                        <a className="icon-btn" href={`/p/${p.token}`} target="_blank" rel="noreferrer" aria-label="Buka halaman peserta" title="Buka halaman peserta"><ExternalLink size={16} /></a>
                      </div>
                    </td>
                    <td className="actions">
                      <div className="row tight" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                        <button className="icon-btn" onClick={() => setEditing(p)} aria-label="Ubah" title="Ubah"><Pencil size={16} /></button>
                        <button className="icon-btn" onClick={() => void regenerate(p)} aria-label="Buat ulang link" title="Buat ulang link"><RefreshCcw size={16} /></button>
                        <button className="icon-btn danger" onClick={() => void remove(p)} aria-label="Hapus" title="Hapus"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {list.length === 0 && <tr><td colSpan={6} className="center muted">Tidak ada hasil untuk "{q}".</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && <ParticipantForm value={editing} activityId={activity.id} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(true) }} />}
      {bulk && <BulkImport activityId={activity.id} existing={data ?? []} onClose={() => setBulk(false)} onSaved={() => { setBulk(false); void reload(true) }} />}
      {qr && <QrModal p={qr} activityName={activity.name} onClose={() => setQr(null)} />}

      <div className="print-cards-wrap">
        {cards && (
          <div className="print-cards">
            {cards.map(({ p, img }) => (
              <div className="print-card" key={p.id}>
                <div style={{ fontWeight: 700 }}>{activity.name}</div>
                <img src={img} alt={`QR ${p.name}`} />
                <div style={{ fontSize: 15, fontWeight: 700 }}>{p.name}</div>
                <div>{[p.identifier, p.institution].filter(Boolean).join(' · ')}</div>
                <div style={{ fontSize: 10, marginTop: 4 }}>Scan untuk absen &amp; mengerjakan kuis</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function ParticipantForm({ value, activityId, onClose, onSaved }: {
  value: Partial<Participant>; activityId: string; onClose: () => void; onSaved: () => void
}) {
  const toast = useToast()
  const [f, setF] = useState({
    name: value.name ?? '', identifier: value.identifier ?? '', institution: value.institution ?? '',
    email: value.email ?? '', phone: value.phone ?? '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const payload = {
      name: f.name.trim(), identifier: f.identifier.trim() || null, institution: f.institution.trim() || null,
      email: f.email.trim() || null, phone: f.phone.trim() || null,
    }
    const { error } = value.id
      ? await supabase.from('participants').update(payload).eq('id', value.id)
      : await supabase.from('participants').insert({ ...payload, activity_id: activityId })
    setBusy(false)
    if (error) return toast(errMsg(error), 'error')
    toast(value.id ? 'Peserta diperbarui.' : 'Peserta ditambahkan.', 'success')
    onSaved()
  }

  return (
    <Modal title={value.id ? 'Ubah peserta' : 'Tambah peserta'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Batal</button><button className="btn primary" form="pform" disabled={busy}>Simpan</button></>}>
      <form id="pform" onSubmit={submit}>
        <Field label="Nama lengkap *"><input className="input" required autoFocus value={f.name} onChange={set('name')} /></Field>
        <div className="form-grid">
          <Field label="NIP / NIK / NIM / No. peserta"><input className="input" value={f.identifier} onChange={set('identifier')} /></Field>
          <Field label="Instansi / unit / kelas"><input className="input" value={f.institution} onChange={set('institution')} /></Field>
          <Field label="Email"><input className="input" type="email" value={f.email} onChange={set('email')} /></Field>
          <Field label="No. HP / WhatsApp" hint="Dipakai untuk tombol kirim WhatsApp"><input className="input" inputMode="tel" value={f.phone} onChange={set('phone')} /></Field>
        </div>
      </form>
    </Modal>
  )
}

function BulkImport({ activityId, existing, onClose, onSaved }: {
  activityId: string; existing: Participant[]; onClose: () => void; onSaved: () => void
}) {
  const toast = useToast()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const parsed = useMemo(() => parseParticipants(text), [text])
  const known = new Set(existing.map((p) => (p.identifier || p.name).toLowerCase()))
  const fresh = parsed.items.filter((i) => !known.has((i.identifier || i.name).toLowerCase()))
  const skipped = parsed.items.length - fresh.length

  async function save() {
    setBusy(true)
    const { error } = await supabase.from('participants').insert(fresh.map((i) => ({ ...i, activity_id: activityId })))
    setBusy(false)
    if (error) return toast(errMsg(error), 'error')
    toast(`${fresh.length} peserta ditambahkan.`, 'success')
    onSaved()
  }

  return (
    <Modal wide title="Impor banyak peserta" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Batal</button>
        <button className="btn primary" disabled={busy || fresh.length === 0} onClick={() => void save()}>{busy ? 'Menyimpan…' : `Tambahkan ${fresh.length} peserta`}</button></>}>
      <p className="muted small" style={{ whiteSpace: 'pre-line' }}>{PARTICIPANT_FORMAT_HELP}</p>
      <textarea className="input" style={{ minHeight: 180 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Tempel di sini…" autoFocus />
      {text.trim() && (
        <div style={{ marginTop: 12 }}>
          <span className="badge success">{fresh.length} siap diimpor</span>{' '}
          {skipped > 0 && <span className="badge warn">{skipped} sudah ada — dilewati</span>}{' '}
          {parsed.errors.length > 0 && <span className="badge danger">{parsed.errors.length} baris bermasalah</span>}
          {parsed.errors.length > 0 && <ul className="small" style={{ color: 'var(--danger)' }}>{parsed.errors.slice(0, 8).map((e) => <li key={e}>{e}</li>)}</ul>}
        </div>
      )}
    </Modal>
  )
}

function QrModal({ p, activityName, onClose }: { p: Participant; activityName: string; onClose: () => void }) {
  const toast = useToast()
  const link = participantLink(p.token)
  const [img, setImg] = useState('')
  useEffect(() => { void QRCode.toDataURL(link, { margin: 2, width: 480 }).then(setImg) }, [link])
  return (
    <Modal title="QR link peserta" onClose={onClose}
      footer={<>
        <button className="btn" onClick={async () => toast((await copy(link)) ? 'Link disalin.' : 'Gagal menyalin.', 'success')}><Link2 size={16} /> Salin link</button>
        {img && <a className="btn primary" href={img} download={`qr-${safeName(p.name)}.png`}><Download size={16} /> Unduh PNG</a>}
      </>}>
      <div className="qr-card">
        <div className="muted small">{activityName}</div>
        <h3>{p.name}</h3>
        {img ? <img src={img} alt={`QR untuk ${p.name}`} /> : <Loading />}
        <p className="mono small" style={{ wordBreak: 'break-all' }}>{link}</p>
      </div>
    </Modal>
  )
}
