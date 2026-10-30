import { Award, CheckCircle2, Download, ExternalLink, FileImage, FileText, Lock, LockOpen, Replace, Search, Trash2, Upload, UploadCloud, X } from 'lucide-react'
import { useMemo, useRef, useState, type DragEvent } from 'react'
import { RoleBadges } from '../../components/RoleBadge'
import { rolesOf } from '../../lib/people'
import { Empty, ErrorBox, Loading, Stat, useAsync, useConfirm, useToast } from '../../components/ui'
import { certPublicUrl, deleteCertificate, uploadCertificate } from '../../lib/certificateApi'
import { CERT_ACCEPT, CERT_MAX_BYTES, certDownloadName, fmtBytes, matchFiles, sniffType, type CertMime, type Confidence } from '../../lib/certificates'
import { downloadCsv, safeName } from '../../lib/csv'
import { fmtDateTime } from '../../lib/format'
import { groupBySatker, sortPeople } from '../../lib/satker'
import { errMsg, fetchAll, supabase } from '../../lib/supabase'
import type { Certificate, Participant } from '../../lib/types'
import { useActivity } from './ActivityLayout'

interface QueueItem {
  key: string
  file: File
  mime: CertMime | null
  /** alasan berkas tidak bisa diunggah (tipe/ukuran) */
  invalid: string | null
  personId: string
  confidence: Confidence | null
  ambiguous: boolean
  duplicate: boolean
  state: 'idle' | 'uploading' | 'done' | 'error'
  error?: string
}

const CONF_LABEL: Record<Confidence, string> = { nip: 'Cocok (NIP)', nama: 'Cocok (nama)', mirip: 'Mirip, periksa' }

export default function CertificatesTab() {
  const { activity, reload: reloadActivity } = useActivity()
  const toast = useToast()
  const confirm = useConfirm()
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [filter, setFilter] = useState<'semua' | 'ada' | 'belum'>('semua')
  const [q, setQ] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const pick = useRef<HTMLInputElement>(null)
  const replaceFor = useRef<Participant | null>(null)
  const replaceInput = useRef<HTMLInputElement>(null)

  const { data, error, loading, reload } = useAsync(async () => {
    const [people, certs] = await Promise.all([
      fetchAll<Participant>((a, b) => supabase.from('participants').select('*').eq('activity_id', activity.id).order('name').order('id').range(a, b)),
      fetchAll<Certificate>((a, b) => supabase.from('certificates').select('*').eq('activity_id', activity.id).order('id').range(a, b)),
    ])
    return { people: sortPeople(people.filter((p) => p.access_certificate)), certs } // hanya yang punya hak akses sertifikat
  }, [activity.id])

  // urutan mengikuti pengaturan satker & orang (tab Peserta -> Atur urutan)
  const ordered = useMemo(() => groupBySatker(data?.people ?? [], (p) => p.institution, activity.satker_order).flatMap((g) => g.items), [data, activity.satker_order])
  const certBy = useMemo(() => new Map((data?.certs ?? []).map((c) => [c.participant_id, c])), [data])
  const total = ordered.length
  const have = ordered.filter((p) => certBy.has(p.id)).length

  const rows = ordered.filter((p) => {
    const has = certBy.has(p.id)
    if (filter === 'ada' && !has) return false
    if (filter === 'belum' && has) return false
    const s = q.trim().toLowerCase()
    return !s || [p.name, p.identifier, p.institution, p.job_title].some((v) => v?.toLowerCase().includes(s))
  })

  /* ---------- buka / tutup unduhan ---------- */
  async function setOpen(open: boolean) {
    if (open && have < total) {
      const ok = await confirm({ title: 'Buka unduhan sekarang?', confirmText: 'Ya, buka',
        message: <>Baru <b>{have} dari {total}</b> orang yang punya sertifikat. Orang tanpa sertifikat akan melihat pesan "belum tersedia" di halaman mereka.</> })
      if (!ok) return
    }
    const { error } = await supabase.from('activities').update({ certificates_open: open }).eq('id', activity.id)
    if (error) return toast(errMsg(error), 'error')
    toast(open ? 'Unduhan sertifikat dibuka.' : 'Unduhan sertifikat ditutup.', 'success')
    await reloadActivity()
  }

  /* ---------- antrean unggahan massal ---------- */
  async function addFiles(files: FileList | File[]) {
    const list = [...files]
    if (!list.length) return
    const matches = matchFiles(list.map((f) => f.name), ordered.map((p) => ({ id: p.id, name: p.name, identifier: p.identifier })))
    const items: QueueItem[] = await Promise.all(list.map(async (file, i) => {
      const mime = await sniffType(file)
      const invalid = file.size > CERT_MAX_BYTES ? `Lebih dari ${fmtBytes(CERT_MAX_BYTES)}` : !mime ? 'Bukan PDF/PNG/JPG yang valid' : null
      const m = matches[i]
      return { key: `${Date.now()}-${i}-${file.name}`, file, mime, invalid, personId: invalid ? '' : m.personId ?? '', confidence: invalid ? null : m.confidence,
        ambiguous: m.ambiguous, duplicate: m.duplicate, state: 'idle' as const }
    }))
    setQueue((cur) => [...cur, ...items])
  }

  const onDrop = (e: DragEvent) => { e.preventDefault(); setDragging(false); void addFiles(e.dataTransfer.files) }
  const patch = (key: string, p: Partial<QueueItem>) => setQueue((cur) => cur.map((it) => (it.key === key ? { ...it, ...p } : it)))

  const takenBy = useMemo(() => {
    const m = new Map<string, number>()
    queue.filter((i) => !i.invalid && i.personId && i.state !== 'done').forEach((i) => m.set(i.personId, (m.get(i.personId) ?? 0) + 1))
    return m
  }, [queue])
  const ready = queue.filter((i) => !i.invalid && i.personId && i.state !== 'done' && (takenBy.get(i.personId) ?? 0) === 1)
  const conflicts = queue.filter((i) => !i.invalid && i.personId && i.state !== 'done' && (takenBy.get(i.personId) ?? 0) > 1)

  async function uploadAll() {
    setUploading(true)
    let ok = 0
    for (const it of ready) {
      patch(it.key, { state: 'uploading', error: undefined })
      try {
        await uploadCertificate({ activityId: activity.id, participantId: it.personId, file: it.file, mime: it.mime!, previous: certBy.get(it.personId) })
        patch(it.key, { state: 'done' }); ok++
      } catch (e) {
        patch(it.key, { state: 'error', error: e instanceof Error ? e.message : String(e) })
      }
    }
    setUploading(false)
    await reload(true)
    toast(`${ok} sertifikat terunggah${ok < ready.length ? `, ${ready.length - ok} gagal` : ''}.`, ok === ready.length ? 'success' : 'error')
    setQueue((cur) => cur.filter((i) => i.state !== 'done'))
  }

  /* ---------- per orang ---------- */
  async function replaceOne(file: File | undefined) {
    const person = replaceFor.current
    if (!file || !person) return
    const mime = await sniffType(file)
    if (!mime) return toast('Berkas harus PDF, PNG, atau JPG yang valid.', 'error')
    if (file.size > CERT_MAX_BYTES) return toast(`Ukuran maksimal ${fmtBytes(CERT_MAX_BYTES)}.`, 'error')
    setBusyId(person.id)
    try {
      await uploadCertificate({ activityId: activity.id, participantId: person.id, file, mime, previous: certBy.get(person.id) })
      toast(`Sertifikat ${person.name} disimpan.`, 'success')
      await reload(true)
    } catch (e) { toast(e instanceof Error ? e.message : String(e), 'error') } finally { setBusyId(null) }
  }

  async function removeOne(p: Participant) {
    const c = certBy.get(p.id)
    if (!c) return
    const ok = await confirm({ title: `Hapus sertifikat ${p.name}?`, danger: true, confirmText: 'Hapus', message: 'Berkasnya dihapus dan tidak lagi bisa diunduh dari link orang tersebut.' })
    if (!ok) return
    try { await deleteCertificate(c); toast('Sertifikat dihapus.', 'success'); await reload(true) }
    catch (e) { toast(e instanceof Error ? e.message : String(e), 'error') }
  }

  function exportMissing() {
    downloadCsv(`belum-punya-sertifikat-${safeName(activity.name)}`, [
      ['Nama Lengkap & Gelar', 'NIP', 'Jabatan', 'Satuan Kerja'],
      ...ordered.filter((p) => !certBy.has(p.id)).map((p) => [p.name, p.identifier, p.job_title, p.institution]),
    ])
  }

  if (loading && !data) return <Loading />
  if (error || !data) return <ErrorBox error={error ?? ''} onRetry={() => void reload()} />

  return (
    <div className="stack">
      <div className="grid cols-4">
        <Stat icon={<Award size={20} />} value={`${have}/${total}`} label="Sudah punya sertifikat" />
        <Stat icon={<CheckCircle2 size={20} />} tone="success" value={have} label="Siap diunduh" />
        <Stat icon={<X size={20} />} tone={total - have ? 'warn' : 'success'} value={total - have} label="Belum ada sertifikat" />
        <Stat icon={activity.certificates_open ? <LockOpen size={20} /> : <Lock size={20} />} tone={activity.certificates_open ? 'success' : 'info'} value={activity.certificates_open ? 'Dibuka' : 'Ditutup'} label="Unduhan oleh peserta" />
      </div>

      <div className="card">
        <div className="row between">
          <div style={{ flex: 1, minWidth: 240 }}>
            <h2 style={{ marginBottom: 4 }}>Unduhan sertifikat</h2>
            <p className="muted" style={{ margin: 0 }}>
              {activity.certificates_open
                ? 'Peserta, narasumber, dan panitia dapat mengunduh sertifikat dari link pribadi masing-masing.'
                : 'Unggah dulu semua sertifikat, lalu buka unduhan. Selama ditutup, mereka belum bisa mengunduh.'}
            </p>
          </div>
          <button className={`btn ${activity.certificates_open ? '' : 'primary'}`} onClick={() => void setOpen(!activity.certificates_open)}>
            {activity.certificates_open ? <><Lock size={16} /> Tutup unduhan</> : <><LockOpen size={16} /> Buka unduhan</>}
          </button>
        </div>
      </div>

      {/* ---------- unggah ---------- */}
      <div className="card">
        <div className="card-head"><h2>Unggah sertifikat</h2></div>
        <div
          className={`dropzone ${dragging ? 'over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={onDrop}
          role="button" tabIndex={0} onClick={() => pick.current?.click()} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && pick.current?.click()}
        >
          <UploadCloud size={30} />
          <b>Seret berkas ke sini atau klik untuk memilih</b>
          <span className="muted small">PDF, PNG, atau JPG · maks. {fmtBytes(CERT_MAX_BYTES)} per berkas · bisa banyak sekaligus</span>
          <span className="muted small">Berkas dicocokkan otomatis ke orangnya lewat <b>NIP</b> atau <b>nama</b> pada nama berkas (mis. <span className="mono">198001012005011001.pdf</span> atau <span className="mono">Budi Santoso.pdf</span>).</span>
        </div>
        <input ref={pick} type="file" multiple accept={CERT_ACCEPT} hidden aria-label="Pilih berkas sertifikat"
          onChange={(e) => { void addFiles(e.target.files ?? []); e.target.value = '' }} />

        {queue.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div className="table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 10 }}>
              <table className="table">
                <thead><tr><th>Berkas</th><th style={{ minWidth: 260 }}>Untuk</th><th>Status</th><th></th></tr></thead>
                <tbody>{queue.map((it) => {
                  const clash = !it.invalid && it.personId && (takenBy.get(it.personId) ?? 0) > 1
                  const replacing = it.personId && certBy.has(it.personId)
                  return (
                    <tr key={it.key}>
                      <td style={{ maxWidth: 260 }}>
                        <div className="row tight" style={{ flexWrap: 'nowrap' }}>
                          {it.mime === 'application/pdf' ? <FileText size={16} /> : <FileImage size={16} />}
                          <span style={{ overflowWrap: 'anywhere' }}>{it.file.name}</span>
                        </div>
                        <div className="muted small">{fmtBytes(it.file.size)}</div>
                      </td>
                      <td>
                        <select className="input" style={{ minHeight: 34, padding: '4px 8px' }} value={it.personId} disabled={!!it.invalid || it.state === 'uploading'}
                          onChange={(e) => patch(it.key, { personId: e.target.value, confidence: null, ambiguous: false, duplicate: false })} aria-label={`Penerima untuk ${it.file.name}`}>
                          <option value="">— pilih orang —</option>
                          {ordered.map((p) => <option key={p.id} value={p.id}>{p.name}{p.identifier ? ` · ${p.identifier}` : ''}{certBy.has(p.id) ? ' (sudah ada)' : ''}</option>)}
                        </select>
                      </td>
                      <td>
                        {it.invalid ? <span className="badge danger">{it.invalid}</span>
                          : it.state === 'done' ? <span className="badge success">Terunggah</span>
                          : it.state === 'uploading' ? <span className="badge info">Mengunggah…</span>
                          : it.state === 'error' ? <span className="badge danger" title={it.error}>Gagal</span>
                          : clash ? <span className="badge danger">Orang sama dipilih lebih dari sekali</span>
                          : !it.personId ? <span className="badge warn">{it.duplicate ? 'Duplikat, pilih orang' : it.ambiguous ? 'Nama kembar, pilih orang' : 'Tidak cocok, pilih orang'}</span>
                          : <><span className={`badge ${it.confidence === 'mirip' ? 'warn' : it.confidence ? 'success' : 'info'}`}>{it.confidence ? CONF_LABEL[it.confidence] : 'Dipilih manual'}</span>{replacing && <span className="badge" style={{ marginLeft: 6 }}>Mengganti</span>}</>}
                        {it.state === 'error' && it.error && <div className="small" style={{ color: 'var(--danger)' }}>{it.error}</div>}
                      </td>
                      <td className="actions"><button className="icon-btn" disabled={it.state === 'uploading'} onClick={() => setQueue((c) => c.filter((x) => x.key !== it.key))} aria-label={`Buang ${it.file.name}`}><X size={16} /></button></td>
                    </tr>
                  )
                })}</tbody>
              </table>
            </div>
            <div className="row between" style={{ marginTop: 12 }}>
              <span className="muted small">{ready.length} siap diunggah · {queue.filter((i) => !i.invalid && !i.personId && i.state !== 'done').length} perlu dipilih orangnya{conflicts.length ? ` · ${conflicts.length} bentrok` : ''}</span>
              <div className="row tight">
                <button className="btn" disabled={uploading} onClick={() => setQueue([])}>Kosongkan</button>
                <button className="btn primary" disabled={uploading || ready.length === 0 || conflicts.length > 0} onClick={() => void uploadAll()}>
                  <Upload size={16} /> {uploading ? 'Mengunggah…' : `Unggah ${ready.length} berkas`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ---------- daftar orang ---------- */}
      <div className="card flush">
        <div className="toolbar">
          <div className="row">
            <label className="search"><Search size={16} /><input className="input" placeholder="Cari nama, NIP, atau satuan kerja" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari orang" /></label>
            <div className="pills" role="group" aria-label="Filter status">
              {([['semua', 'Semua', total], ['ada', 'Sudah ada', have], ['belum', 'Belum ada', total - have]] as const).map(([id, label, n]) => (
                <button key={id} className={`pill ${filter === id ? 'active' : ''}`} onClick={() => setFilter(id)}>{label} <span className="muted">{n}</span></button>
              ))}
            </div>
          </div>
          <button className="btn sm" onClick={exportMissing} disabled={total - have === 0}><Download size={14} /> Yang belum punya (CSV)</button>
        </div>
        <input ref={replaceInput} type="file" accept={CERT_ACCEPT} hidden aria-label="Pilih berkas pengganti"
          onChange={(e) => { void replaceOne(e.target.files?.[0]); e.target.value = '' }} />

        {total === 0 ? <Empty icon={<Award size={26} />} title="Belum ada peserta">Tambahkan peserta, narasumber, atau panitia di tab Peserta.</Empty> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Nama</th><th>Satuan kerja</th><th>Sertifikat</th><th className="actions">Aksi</th></tr></thead>
            <tbody>
              {rows.map((p) => {
                const c = certBy.get(p.id)
                const name = certDownloadName(p.name, c?.mime_type ?? null, c?.file_name ?? 'sertifikat.pdf')
                return (
                  <tr key={p.id}>
                    <td style={{ minWidth: 220 }}><b>{p.name}</b><RoleBadges roles={rolesOf(p)} />{p.identifier && <div className="mono muted">NIP {p.identifier}</div>}</td>
                    <td>{p.institution ?? <span className="muted">—</span>}</td>
                    <td>{c
                      ? <><span className="badge success">Ada</span><div className="muted small" style={{ marginTop: 2, overflowWrap: 'anywhere' }}>{c.file_name} · {fmtBytes(c.size_bytes)} · {fmtDateTime(c.uploaded_at)}</div></>
                      : <span className="badge warn">Belum ada</span>}</td>
                    <td className="actions">
                      <div className="row tight" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                        {c && <a className="btn sm" href={certPublicUrl(c.storage_path)} target="_blank" rel="noreferrer" aria-label={`Lihat sertifikat ${p.name}`} title="Lihat"><ExternalLink size={14} /></a>}
                        {c && <a className="btn sm" href={certPublicUrl(c.storage_path, name)} aria-label={`Unduh sertifikat ${p.name}`} title="Unduh"><Download size={14} /></a>}
                        <button className="btn sm" disabled={busyId === p.id} onClick={() => { replaceFor.current = p; replaceInput.current?.click() }} aria-label={`${c ? 'Ganti' : 'Unggah'} sertifikat ${p.name}`}>
                          {c ? <Replace size={14} /> : <Upload size={14} />} {busyId === p.id ? '…' : c ? 'Ganti' : 'Unggah'}
                        </button>
                        {c && <button className="icon-btn danger" onClick={() => void removeOne(p)} aria-label={`Hapus sertifikat ${p.name}`} title="Hapus"><Trash2 size={16} /></button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && <tr><td colSpan={4} className="center muted">Tidak ada hasil.</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  )
}
