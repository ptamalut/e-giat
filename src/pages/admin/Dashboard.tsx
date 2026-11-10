import { CalendarCheck, CalendarDays, CheckCircle2, ClipboardList, MapPin, Plus, RotateCcw, Users } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Empty, ErrorBox, Field, Loading, Modal, PageHeader, Stat, useAsync, useConfirm, useToast } from '../../components/ui'
import { fmtDateRange } from '../../lib/format'
import { MENUS } from '../../lib/menus'
import { activityPhase, PHASE_LABEL, PHASE_TONE, type Phase } from '../../lib/phase'
import LetterFields from '../../components/LetterFields'
import { checkLetterFile, emptyLetter, hasLetterText, saveLetter, type LetterInput } from '../../lib/lettersApi'
import { JENIS_HINT, JENIS_LABEL } from '../../lib/people'
import { errMsg, supabase } from '../../lib/supabase'
import type { Activity, ActivityJenis } from '../../lib/types'

type Row = Activity & {
  participants: { count: number }[]
  attendance_sessions: { count: number }[]
  quizzes: { count: number }[]
}

export default function Dashboard() {
  const toast = useToast()
  const confirm = useConfirm()
  const nav = useNavigate()
  const [adding, setAdding] = useState(false)
  const [newJenis, setNewJenis] = useState<ActivityJenis>('diklat')
  const [letter, setLetter] = useState<LetterInput>(emptyLetter())
  const [letterFile, setLetterFile] = useState<File | null>(null)
  const [creating, setCreating] = useState(false)
  const [filter, setFilter] = useState<'semua' | Phase>('semua')
  const { data, error, loading, reload } = useAsync(async () => {
    const { data, error } = await supabase
      .from('activities')
      .select('*, participants(count), attendance_sessions(count), quizzes(count)')
      .filter('participants.roles', 'cs', '{peserta}') // hitung yang berjenis peserta (termasuk yang merangkap)
      .order('created_at', { ascending: false })
    if (error) throw new Error(errMsg(error))
    return data as Row[]
  }, [])

  const list = (data ?? []).filter((a) => filter === 'semua' || activityPhase(a) === filter)

  /** Ubah status dari daftar kegiatan: selesai (pindah ke Riwayat) atau dibuka kembali (Berjalan). */
  async function setStatus(a: Row, status: 'selesai' | 'aktif') {
    if (status === 'selesai') {
      const ok = await confirm({
        title: 'Tandai kegiatan selesai?', confirmText: 'Ya, tandai selesai',
        message: <>Kegiatan <b>{a.name}</b> tidak lagi tampil di <i>Kegiatan berjalan</i> pada halaman depan dan pindah ke <i>Riwayat</i>. Semua data tetap tersimpan dan statusnya bisa dikembalikan kapan saja.</>,
      })
      if (!ok) return
    }
    const { error } = await supabase.from('activities').update({ status }).eq('id', a.id)
    if (error) return toast(errMsg(error), 'error')
    toast(status === 'selesai' ? `"${a.name}" ditandai selesai.` : `"${a.name}" dibuka kembali.`, 'success')
    void reload(true)
  }

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    // berkas surat diperiksa dulu agar kegiatan tidak terbentuk setengah jadi
    const badFile = letterFile ? checkLetterFile(letterFile) : null
    if (badFile) return toast(badFile, 'error')
    setCreating(true)
    const f = new FormData(e.currentTarget)
    const { data, error } = await supabase.from('activities').insert({
      name: String(f.get('name')).trim(),
      jenis: newJenis,
      location: String(f.get('location') || '').trim() || null,
      start_date: String(f.get('start_date') || '') || null,
      end_date: String(f.get('end_date') || '') || null,
      ...Object.fromEntries(MENUS.map((m) => [m.flag, f.get(m.flag) === 'on'])), // menu yang dicentang
    }).select('id').single()
    if (error) { setCreating(false); return toast(errMsg(error), 'error') }
    // dasar surat (opsional diisi saat membuat kegiatan; berkas bisa menyusul di Ringkasan)
    let letterFailed = ''
    if (hasLetterText(letter) || letterFile) {
      try { await saveLetter(data.id, letter, letterFile) } catch (err) { letterFailed = errMsg(err) }
    }
    setCreating(false); setAdding(false); setLetter(emptyLetter()); setLetterFile(null)
    if (letterFailed) toast(`Kegiatan dibuat, tetapi dasar surat belum tersimpan (${letterFailed}). Tambahkan lagi di Ringkasan kegiatan.`, 'error')
    else toast('Kegiatan dibuat. Lanjut tambahkan peserta.', 'success')
    nav(`/admin/kegiatan/${data.id}/peserta`)
  }

  const all = data ?? []
  const upcoming = all.filter((a) => activityPhase(a) === 'mendatang').length
  const totalParticipants = all.reduce((s, a) => s + (a.participants[0]?.count ?? 0), 0)

  return (
    <>
      <PageHeader
        title="Kegiatan"
        subtitle="Kelola semua kegiatan, peserta, absensi, dan kuis Anda."
        actions={<button className="btn primary" onClick={() => setAdding(true)}><Plus size={17} /> Tambah kegiatan</button>}
      />

      {!loading && all.length > 0 && (
        <div className="grid cols-4" style={{ marginBottom: 24 }}>
          <Stat icon={<CalendarDays size={20} />} value={all.length} label="Total kegiatan" />
          <Stat icon={<CalendarCheck size={20} />} tone="success" value={all.filter((a) => activityPhase(a) === 'berjalan').length} label="Sedang berjalan" sub={upcoming ? `${upcoming} mendatang` : undefined} />
          <Stat icon={<Users size={20} />} tone="info" value={totalParticipants} label="Total peserta" />
          <Stat icon={<ClipboardList size={20} />} tone="warn" value={all.reduce((s, a) => s + (a.quizzes[0]?.count ?? 0), 0)} label="Total kuis" />
        </div>
      )}

      <div className="pills" style={{ marginBottom: 20 }}>
        {(['semua', 'berjalan', 'mendatang', 'draft', 'selesai'] as const).map((s) => (
          <button key={s} className={`pill ${filter === s ? 'active' : ''}`} onClick={() => setFilter(s)}>
            {s === 'semua' ? 'Semua' : PHASE_LABEL[s]}
          </button>
        ))}
      </div>

      {loading && <Loading />}
      {error && <ErrorBox error={error} onRetry={() => void reload()} />}
      {!loading && !error && list.length === 0 && (
        <div className="card"><Empty icon={<CalendarDays size={26} />} title={data?.length ? 'Tidak ada kegiatan dengan status ini' : 'Belum ada kegiatan'}>
          {!data?.length && <button className="btn primary" onClick={() => setAdding(true)}><Plus size={17} /> Buat kegiatan pertama</button>}
        </Empty></div>
      )}

      <div className="grid cols-3">
        {list.map((a) => (
          <div key={a.id} className="card link act-card">
            <Link to={`/admin/kegiatan/${a.id}`} className="act-link" aria-label={`Buka kegiatan ${a.name}`}>
              <div className="row between" style={{ marginBottom: 12 }}>
                <span className="row tight"><span className={`badge dot ${PHASE_TONE[activityPhase(a)]}`}>{PHASE_LABEL[activityPhase(a)]}</span><span className="badge primary">{JENIS_LABEL[a.jenis ?? 'diklat']}</span></span>
                <span className="muted small">{fmtDateRange(a.start_date, a.end_date)}</span>
              </div>
              <h3 style={{ fontSize: '1.08rem', marginBottom: 4 }}>{a.name}</h3>
              <p className="muted small" style={{ margin: 0, minHeight: 20, display: 'flex', gap: 6, alignItems: 'center' }}>
                {a.location ? <><MapPin size={14} /> {a.location}</> : <span>&nbsp;</span>}
              </p>
              <div className="row" style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)', gap: 20 }}>
                <span className="muted small row tight" title="Peserta"><Users size={15} /> <b style={{ color: 'var(--text)' }}>{a.participants[0]?.count ?? 0}</b> peserta</span>
                <span className="muted small row tight" title="Sesi absensi"><CalendarCheck size={15} /> <b style={{ color: 'var(--text)' }}>{a.attendance_sessions[0]?.count ?? 0}</b></span>
                <span className="muted small row tight" title="Kuis"><ClipboardList size={15} /> <b style={{ color: 'var(--text)' }}>{a.quizzes[0]?.count ?? 0}</b></span>
              </div>
            </Link>
            <div className="act-actions">
              {a.status !== 'selesai'
                ? <button className="btn sm" onClick={() => void setStatus(a, 'selesai')} aria-label={`Tandai selesai: ${a.name}`}><CheckCircle2 size={14} /> Tandai selesai</button>
                : <button className="btn sm ghost" onClick={() => void setStatus(a, 'aktif')} aria-label={`Buka kembali: ${a.name}`}><RotateCcw size={14} /> Buka kembali</button>}
            </div>
          </div>
        ))}
      </div>

      {adding && (
        <Modal title="Kegiatan baru" onClose={() => setAdding(false)}
          footer={<><button className="btn" onClick={() => setAdding(false)}>Batal</button><button className="btn primary" form="new-act" disabled={creating}>{creating ? 'Menyimpan…' : 'Simpan & lanjut'}</button></>}>
          <form id="new-act" onSubmit={create}>
            <Field label="Jenis *" hint={JENIS_HINT[newJenis]}>
              <div className="pills" role="radiogroup" aria-label="Jenis kegiatan">
                {(['diklat', 'kegiatan'] as const).map((j) => (
                  <button type="button" key={j} role="radio" aria-checked={newJenis === j} className={`pill ${newJenis === j ? 'active' : ''}`} onClick={() => setNewJenis(j)}>{JENIS_LABEL[j]}</button>
                ))}
              </div>
            </Field>
            <Field label="Nama kegiatan *"><input className="input" name="name" required autoFocus placeholder="mis. Pelatihan Manajemen Proyek Angkatan 3" /></Field>
            <Field label="Lokasi"><input className="input" name="location" placeholder="mis. Aula Kantor Pusat / Zoom" /></Field>
            <div className="form-grid">
              <Field label="Tanggal mulai"><input className="input" type="date" name="start_date" /></Field>
              <Field label="Tanggal selesai"><input className="input" type="date" name="end_date" /></Field>
            </div>
            <div className="label" style={{ margin: '4px 0 8px' }}>Dasar surat</div>
            <p className="muted small" style={{ marginTop: 0 }}>Surat yang menjadi dasar pelaksanaan kegiatan. Boleh diisi sekarang atau nanti di Ringkasan kegiatan.</p>
            <LetterFields value={letter} onChange={setLetter} file={letterFile} onFile={setLetterFile} idPrefix="new" />
            <Field label="Menu yang dipakai" hint="Bisa diubah kapan saja di Ringkasan kegiatan. Menu nonaktif tidak tampil bagi panitia maupun peserta.">
              <div className="menu-grid">
                {MENUS.map((m) => (
                  <label key={`${newJenis}-${m.key}`} className="menu-opt on"><input type="checkbox" name={m.flag} defaultChecked={!(newJenis === 'kegiatan' && m.key === 'quiz')} /><span><b>{m.label}</b></span></label>
                ))}
              </div>
            </Field>
          </form>
        </Modal>
      )}
    </>
  )
}
