import { ArrowLeft, ArrowRight, CalendarCheck, CalendarDays, CheckCircle2, ClipboardList, GraduationCap, MapPin, Plus, RotateCcw, Users } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { MenuCards } from '../../components/MenuToggles'
import Stepper from '../../components/Stepper'
import { Empty, ErrorBox, Field, Loading, Modal, PageHeader, Stat, useAsync, useConfirm, useToast } from '../../components/ui'
import { fmtDateRange } from '../../lib/format'
import { MENUS, type MenuKey } from '../../lib/menus'
import { activityPhase, PHASE_LABEL, PHASE_TONE, type Phase } from '../../lib/phase'
import { PickEmployees } from './ParticipantPicker'
import LetterFields from '../../components/LetterFields'
import { checkLetterFile, emptyLetter, hasLetterText, saveLetter, type LetterInput } from '../../lib/lettersApi'
import { JENIS_LABEL } from '../../lib/people'
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
  const [step, setStep] = useState(0)
  const [newJenis, setNewJenis] = useState<ActivityJenis>('diklat')
  const [nf, setNf] = useState({ name: '', location: '', start_date: '', end_date: '' })
  const [menuOn, setMenuOn] = useState<Record<MenuKey, boolean>>({ attendance: true, materials: true, notes: true, quiz: true, certificate: true, documentation: true })
  const [letter, setLetter] = useState<LetterInput>(emptyLetter())
  const [letterFile, setLetterFile] = useState<File | null>(null)
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<Activity | null>(null)   // kegiatan yang baru dibuat: langkah terakhir, memilih peserta
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

  function openAdd() {
    setNf({ name: '', location: '', start_date: '', end_date: '' }); setStep(0); setNewJenis('diklat')
    setMenuOn({ attendance: true, materials: true, notes: true, quiz: true, certificate: true, documentation: true })
    setLetter(emptyLetter()); setLetterFile(null); setAdding(true)
  }
  const pickJenis = (j: ActivityJenis) => { setNewJenis(j); setMenuOn((m) => ({ ...m, quiz: j === 'diklat' })) }   // jenis Kegiatan tanpa kuis (bawaan)
  const STEPS = ['Informasi', 'Dasar surat', 'Menu', 'Peserta'] as const

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (step === 0) {
      if (!nf.name.trim()) return toast('Isi nama kegiatan.', 'error')
      if (nf.start_date && nf.end_date && nf.end_date < nf.start_date) return toast('Tanggal selesai tidak boleh sebelum tanggal mulai.', 'error')
      return setStep(1)
    }
    if (step === 1) {
      const badFile = letterFile ? checkLetterFile(letterFile) : null   // berkas surat diperiksa dulu agar kegiatan tidak terbentuk setengah jadi
      if (badFile) return toast(badFile, 'error')
      return setStep(2)
    }
    setCreating(true)
    const { data, error } = await supabase.from('activities').insert({
      name: nf.name.trim(),
      jenis: newJenis,
      location: nf.location.trim() || null,
      start_date: nf.start_date || null,
      end_date: nf.end_date || null,
      ...Object.fromEntries(MENUS.map((m) => [m.flag, menuOn[m.key]])), // menu yang dinyalakan
    }).select('*').single()
    if (error) { setCreating(false); return toast(errMsg(error), 'error') }
    // dasar surat (opsional diisi saat membuat kegiatan; berkas bisa menyusul di Ringkasan)
    let letterFailed = ''
    if (hasLetterText(letter) || letterFile) {
      try { await saveLetter(data.id, letter, letterFile) } catch (err) { letterFailed = errMsg(err) }
    }
    setCreating(false); setAdding(false); setLetter(emptyLetter()); setLetterFile(null)
    if (letterFailed) toast(`Kegiatan dibuat, tetapi dasar surat belum tersimpan (${letterFailed}). Tambahkan lagi di Ringkasan kegiatan.`, 'error')
    else toast('Kegiatan dibuat. Sekarang pilih pesertanya.', 'success')
    setCreated(data as Activity)     // langsung lanjut ke langkah terakhir: memilih peserta dari data pegawai
  }

  const all = data ?? []
  const upcoming = all.filter((a) => activityPhase(a) === 'mendatang').length
  const totalParticipants = all.reduce((s, a) => s + (a.participants[0]?.count ?? 0), 0)

  return (
    <>
      <PageHeader
        title="Kegiatan"
        subtitle="Kelola semua kegiatan, peserta, absensi, dan kuis Anda."
        actions={<button className="btn primary" onClick={openAdd}><Plus size={17} /> Tambah kegiatan</button>}
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
          {!data?.length && <button className="btn primary" onClick={openAdd}><Plus size={17} /> Buat kegiatan pertama</button>}
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

      {created && (
        <PickEmployees activity={created} taken={new Set()}
          onClose={() => { const id = created.id; setCreated(null); nav(`/admin/kegiatan/${id}/peserta`) }}
          onSaved={() => { const id = created.id; setCreated(null); nav(`/admin/kegiatan/${id}/peserta`) }} />
      )}

      {adding && (
        <Modal title="Kegiatan baru" onClose={() => setAdding(false)}
          footer={<>
            <button type="button" className="btn ghost" onClick={() => setAdding(false)}>Batal</button>
            <span className="spacer" />
            {step > 0 && <button type="button" className="btn" onClick={() => setStep(step - 1)} disabled={creating}><ArrowLeft size={15} /> Kembali</button>}
            <button className="btn primary" form="new-act" disabled={creating}>
              {step < 2 ? <>{step === 1 && !hasLetterText(letter) && !letterFile ? 'Lewati' : 'Lanjut'} <ArrowRight size={15} /></> : creating ? 'Menyimpan…' : <>Buat &amp; pilih peserta <ArrowRight size={15} /></>}
            </button>
          </>}>
          <Stepper steps={STEPS} current={step} />
          <form id="new-act" onSubmit={submit} noValidate>
            {step === 0 && <>
              <Field label="Jenis kegiatan">
                <div className="choice-cards" role="radiogroup" aria-label="Jenis kegiatan">
                  {([['diklat', GraduationCap, 'Nilai akhir dan peringkat, kuis pre/post test. Untuk peserta, narasumber, moderator, dan panitia.'],
                    ['kegiatan', CalendarDays, 'Rapat, sosialisasi, dan sejenisnya: tanpa peringkat; hanya peserta dan petugas. Absensi otomatis tanpa sesi.']] as const).map(([j, Icon, hint]) => (
                    <button type="button" key={j} role="radio" aria-checked={newJenis === j} className={`choice-card ${newJenis === j ? 'on' : ''}`} onClick={() => pickJenis(j)}>
                      <span className="cc-ico"><Icon size={18} /></span>
                      <span><b>{JENIS_LABEL[j]}</b><small>{hint}</small></span>
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Nama kegiatan *"><input className="input" value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} autoFocus placeholder="mis. Pelatihan Manajemen Proyek Angkatan 3" aria-label="Nama kegiatan" /></Field>
              <Field label="Lokasi"><input className="input" value={nf.location} onChange={(e) => setNf({ ...nf, location: e.target.value })} placeholder="mis. Aula Kantor Pusat / Zoom" aria-label="Lokasi" /></Field>
              <div className="form-grid">
                <Field label="Tanggal mulai" hint="Sebelum tanggal ini kegiatan tampil Mendatang."><input className="input" type="date" value={nf.start_date} onChange={(e) => setNf({ ...nf, start_date: e.target.value })} aria-label="Tanggal mulai" /></Field>
                <Field label="Tanggal selesai"><input className="input" type="date" min={nf.start_date || undefined} value={nf.end_date} onChange={(e) => setNf({ ...nf, end_date: e.target.value })} aria-label="Tanggal selesai" /></Field>
              </div>
            </>}

            {step === 1 && <>
              <p className="muted small" style={{ marginTop: 0 }}>Surat yang menjadi dasar pelaksanaan kegiatan. Isian ini opsional: boleh dilewati dan ditambahkan nanti di Ringkasan kegiatan. Dasar surat dipakai otomatis pada notula.</p>
              <LetterFields value={letter} onChange={setLetter} file={letterFile} onFile={setLetterFile} idPrefix="new" />
            </>}

            {step === 2 && <>
              <p className="muted small" style={{ marginTop: 0 }}>Nyalakan menu yang dipakai pada kegiatan ini. Menu yang dimatikan tidak tampil bagi panitia maupun peserta, dan bisa diubah kapan saja di Ringkasan kegiatan.</p>
              <MenuCards menus={MENUS} isOn={(m) => menuOn[m.key]} onToggle={(m, on) => setMenuOn((cur) => ({ ...cur, [m.key]: on }))} />
              <div className="callout" style={{ marginTop: 14 }}>
                <b>{nf.name.trim() || 'Kegiatan baru'}</b>
                <span className="muted small">{JENIS_LABEL[newJenis]}{nf.start_date ? ` · ${fmtDateRange(nf.start_date, nf.end_date || nf.start_date)}` : ''}{nf.location.trim() ? ` · ${nf.location.trim()}` : ''}</span>
                <span className="muted small">{MENUS.filter((m) => menuOn[m.key]).map((m) => m.label).join(', ') || 'Tanpa menu tambahan'}</span>
              </div>
            </>}
          </form>
        </Modal>
      )}
    </>
  )
}
