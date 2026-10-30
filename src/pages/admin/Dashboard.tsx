import { CalendarCheck, CalendarDays, ClipboardList, MapPin, Plus, Users } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Empty, ErrorBox, Field, Loading, Modal, PageHeader, Stat, useAsync, useToast } from '../../components/ui'
import { fmtDateRange } from '../../lib/format'
import { MENUS } from '../../lib/menus'
import { errMsg, supabase } from '../../lib/supabase'
import type { Activity, ActivityStatus } from '../../lib/types'

type Row = Activity & {
  participants: { count: number }[]
  attendance_sessions: { count: number }[]
  quizzes: { count: number }[]
}

export const STATUS_LABEL: Record<ActivityStatus, string> = { draft: 'Draft', aktif: 'Berjalan', selesai: 'Selesai' }
export const STATUS_TONE: Record<ActivityStatus, string> = { draft: '', aktif: 'success', selesai: 'info' }

export default function Dashboard() {
  const toast = useToast()
  const nav = useNavigate()
  const [adding, setAdding] = useState(false)
  const [filter, setFilter] = useState<'semua' | ActivityStatus>('semua')
  const { data, error, loading, reload } = useAsync(async () => {
    const { data, error } = await supabase
      .from('activities')
      .select('*, participants(count), attendance_sessions(count), quizzes(count)')
      .filter('participants.roles', 'cs', '{peserta}') // hitung yang berjenis peserta (termasuk yang merangkap)
      .order('created_at', { ascending: false })
    if (error) throw new Error(errMsg(error))
    return data as Row[]
  }, [])

  const list = (data ?? []).filter((a) => filter === 'semua' || a.status === filter)

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const { data, error } = await supabase.from('activities').insert({
      name: String(f.get('name')).trim(),
      location: String(f.get('location') || '').trim() || null,
      start_date: String(f.get('start_date') || '') || null,
      end_date: String(f.get('end_date') || '') || null,
      ...Object.fromEntries(MENUS.map((m) => [m.flag, f.get(m.flag) === 'on'])), // menu yang dicentang
    }).select('id').single()
    if (error) return toast(errMsg(error), 'error')
    toast('Kegiatan dibuat. Lanjut tambahkan peserta.', 'success')
    nav(`/admin/kegiatan/${data.id}/peserta`)
  }

  const all = data ?? []
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
          <Stat icon={<CalendarCheck size={20} />} tone="success" value={all.filter((a) => a.status === 'aktif').length} label="Sedang berjalan" />
          <Stat icon={<Users size={20} />} tone="info" value={totalParticipants} label="Total peserta" />
          <Stat icon={<ClipboardList size={20} />} tone="warn" value={all.reduce((s, a) => s + (a.quizzes[0]?.count ?? 0), 0)} label="Total kuis" />
        </div>
      )}

      <div className="pills" style={{ marginBottom: 20 }}>
        {(['semua', 'aktif', 'draft', 'selesai'] as const).map((s) => (
          <button key={s} className={`pill ${filter === s ? 'active' : ''}`} onClick={() => setFilter(s)}>
            {s === 'semua' ? 'Semua' : STATUS_LABEL[s]}
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
          <Link key={a.id} to={`/admin/kegiatan/${a.id}`} className="card link">
            <div className="row between" style={{ marginBottom: 12 }}>
              <span className={`badge dot ${STATUS_TONE[a.status]}`}>{STATUS_LABEL[a.status]}</span>
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
        ))}
      </div>

      {adding && (
        <Modal title="Kegiatan baru" onClose={() => setAdding(false)}
          footer={<><button className="btn" onClick={() => setAdding(false)}>Batal</button><button className="btn primary" form="new-act">Simpan &amp; lanjut</button></>}>
          <form id="new-act" onSubmit={create}>
            <Field label="Nama kegiatan *"><input className="input" name="name" required autoFocus placeholder="mis. Pelatihan Manajemen Proyek Angkatan 3" /></Field>
            <Field label="Lokasi"><input className="input" name="location" placeholder="mis. Aula Kantor Pusat / Zoom" /></Field>
            <div className="form-grid">
              <Field label="Tanggal mulai"><input className="input" type="date" name="start_date" /></Field>
              <Field label="Tanggal selesai"><input className="input" type="date" name="end_date" /></Field>
            </div>
            <Field label="Menu yang dipakai" hint="Bisa diubah kapan saja di Ringkasan kegiatan. Menu nonaktif tidak tampil bagi panitia maupun peserta.">
              <div className="menu-grid">
                {MENUS.map((m) => (
                  <label key={m.key} className="menu-opt on"><input type="checkbox" name={m.flag} defaultChecked /><span><b>{m.label}</b></span></label>
                ))}
              </div>
            </Field>
          </form>
        </Modal>
      )}
    </>
  )
}
