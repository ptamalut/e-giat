import { Award, CalendarCheck, CheckCheck, ClipboardList, LayoutGrid, Trash2, Trophy, Users } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CardTitle, Check, ErrorBox, Field, Loading, Stat, useAsync, useConfirm, useToast } from '../../components/ui'
import { fmtPct, fmtScore } from '../../lib/format'
import { MENUS, menuOn, type MenuDef } from '../../lib/menus'
import { removeActivityCertificateFiles } from '../../lib/certificateApi'
import { removeSelfiesOf } from '../../lib/selfieApi'
import { removeActivityDocFiles } from '../../lib/docsApi'
import { errMsg, supabase } from '../../lib/supabase'
import type { ActivityStatus, RankingRow } from '../../lib/types'
import { useActivity } from './ActivityLayout'

export default function Overview() {
  const { activity: a, reload } = useActivity()
  const toast = useToast()
  const confirm = useConfirm()
  const nav = useNavigate()
  const [form, setForm] = useState({
    name: a.name, description: a.description ?? '', location: a.location ?? '',
    start_date: a.start_date ?? '', end_date: a.end_date ?? '', status: a.status,
    weight_attendance: a.weight_attendance, show_leaderboard: a.show_leaderboard, public_access: a.public_access,
  })
  const [saving, setSaving] = useState(false)
  const [savingMenu, setSavingMenu] = useState<string | null>(null)
  // tampilan langsung berubah saat dicentang; dikembalikan bila penyimpanan gagal
  const [flags, setFlags] = useState(() => Object.fromEntries(MENUS.map((m) => [m.key, a[m.flag]])) as Record<MenuDef['key'], boolean>)

  const { data, error, loading, reload: refresh } = useAsync(async () => {
    const [p, s, q, att, rank, spk] = await Promise.all([
      supabase.from('participants').select('id', { count: 'exact', head: true }).eq('activity_id', a.id).eq('role', 'peserta'),
      supabase.from('attendance_sessions').select('id', { count: 'exact', head: true }).eq('activity_id', a.id),
      supabase.from('quizzes').select('id, is_published, questions(count)').eq('activity_id', a.id),
      supabase.from('quiz_attempts').select('id', { count: 'exact', head: true }).eq('activity_id', a.id).not('submitted_at', 'is', null),
      supabase.rpc('activity_ranking', { p_activity: a.id }),
      supabase.from('participants').select('id', { count: 'exact', head: true }).eq('activity_id', a.id).neq('role', 'peserta'),
    ])
    for (const r of [p, s, q, att, rank, spk]) if (r.error) throw new Error(errMsg(r.error))
    const quizzes = (q.data ?? []) as { id: string; is_published: boolean; questions: { count: number }[] }[]
    return {
      participants: p.count ?? 0,
      speakers: spk.count ?? 0,
      sessions: s.count ?? 0,
      quizzes: quizzes.length,
      readyQuizzes: quizzes.filter((x) => x.is_published && (x.questions[0]?.count ?? 0) > 0).length,
      attempts: att.count ?? 0,
      ranking: (rank.data ?? []) as RankingRow[],
    }
  }, [a.id])

  async function save(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('activities').update({
      name: form.name.trim(),
      description: form.description.trim() || null,
      location: form.location.trim() || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      status: form.status,
      weight_attendance: form.weight_attendance,
      show_leaderboard: form.show_leaderboard,
      public_access: form.public_access,
    }).eq('id', a.id)
    setSaving(false)
    if (error) return toast(errMsg(error), 'error')
    toast('Perubahan disimpan.', 'success')
    await reload()
    void refresh(true)
  }

  async function toggleMenu(m: MenuDef, on: boolean) {
    setSavingMenu(m.key)
    setFlags((f) => ({ ...f, [m.key]: on }))
    const { error } = await supabase.from('activities').update({ [m.flag]: on }).eq('id', a.id)
    setSavingMenu(null)
    if (error) { setFlags((f) => ({ ...f, [m.key]: !on })); return toast(errMsg(error), 'error') }
    toast(`Menu ${m.label} ${on ? 'diaktifkan' : 'dinonaktifkan'}.`, 'success')
    await reload()
  }

  async function remove() {
    const ok = await confirm({
      title: 'Hapus kegiatan?', danger: true, confirmText: 'Hapus permanen',
      message: <>Semua peserta, absensi, kuis, notula, dokumentasi, dan hasil di kegiatan <b>{a.name}</b> akan ikut terhapus dan <b>tidak bisa dikembalikan</b>.</>,
    })
    if (!ok) return
    await removeActivityCertificateFiles(a.id) // bersihkan berkas sertifikat di Storage
    await removeSelfiesOf({ activityId: a.id }) // dan foto selfie absensi
    await removeActivityDocFiles(a.id) // dan foto dokumentasi
    const { error } = await supabase.from('activities').delete().eq('id', a.id)
    if (error) return toast(errMsg(error), 'error')
    toast('Kegiatan dihapus.', 'success')
    nav('/admin')
  }

  if (loading && !data) return <Loading />
  if (error || !data) return <ErrorBox error={error ?? ''} onRetry={() => void refresh()} />

  const avgAtt = data.ranking.length && data.sessions
    ? data.ranking.reduce((s, r) => s + Number(r.attendance_pct ?? 0), 0) / data.ranking.length : null
  const hasPeople = data.participants + data.speakers > 0
  const steps = [
    { done: hasPeople, text: 'Pilih peserta kegiatan dari data pegawai (tentukan jenis dan hak akses menunya)', to: 'peserta', cta: 'Tambah peserta' },
    menuOn(a, 'attendance') && { done: data.sessions > 0, text: 'Buat sesi absensi (hari/sesi + jam buka & tutup)', to: 'absensi', cta: 'Buat sesi' },
    { done: hasPeople && (!menuOn(a, 'attendance') || data.sessions > 0), text: 'Bagikan link / QR unik ke setiap orang', to: 'peserta', cta: 'Lihat link' },
    menuOn(a, 'quiz') && { done: data.readyQuizzes > 0, text: 'Buat kuis pre test / post test lalu terbitkan', to: 'kuis', cta: 'Buat kuis' },
    menuOn(a, 'quiz') && { done: data.attempts > 0, text: 'Pantau hasil, peringkat, dan unduh laporan', to: 'laporan', cta: 'Buka laporan' },
    menuOn(a, 'certificate') && { done: a.certificates_open, text: 'Unggah sertifikat lalu buka unduhan untuk peserta', to: 'sertifikat', cta: 'Kelola sertifikat' },
  ].filter((x): x is { done: boolean; text: string; to: string; cta: string } => !!x)

  return (
    <div className="stack">
      <div className="grid cols-4">
        <Stat icon={<Users size={20} />} value={data.participants} label="Peserta" sub={data.speakers ? `+ ${data.speakers} narasumber/panitia` : undefined} />
        {menuOn(a, 'attendance') && <Stat icon={<CalendarCheck size={20} />} tone="success" value={data.sessions} label="Sesi absensi" sub={avgAtt != null ? `rata-rata hadir ${fmtPct(avgAtt)}` : undefined} />}
        {menuOn(a, 'quiz') && <Stat icon={<ClipboardList size={20} />} tone="warn" value={data.quizzes} label="Kuis" sub={`${data.readyQuizzes} terbit`} />}
        {menuOn(a, 'quiz') && <Stat icon={<CheckCheck size={20} />} tone="info" value={data.attempts} label="Kuis terkumpul" />}
      </div>

      <div className="grid cols-2">
        <div className="card">
          <div className="card-head"><CardTitle icon={<Award size={18} />}>Langkah-langkah</CardTitle></div>
          <ul className="checklist">
            {steps.map((s, i) => (
              <li key={i}>
                <span className={`step ${s.done ? 'done' : ''}`}>{s.done ? <CheckCheck size={13} strokeWidth={3} /> : i + 1}</span>
                <span style={{ flex: 1, textDecoration: s.done ? 'line-through' : 'none' }} className={s.done ? 'muted' : ''}>{s.text}</span>
                {!s.done && <Link className="btn sm" to={s.to}>{s.cta}</Link>}
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <div className="card-head"><CardTitle icon={<Trophy size={18} />} tone="warn">Peringkat sementara</CardTitle><span className="spacer" /><Link to="laporan" className="small">Selengkapnya</Link></div>
          {data.ranking.filter((r) => r.final_score > 0).slice(0, 5).map((r) => (
            <div key={r.participant_id} className="item" style={{ padding: '8px 0' }}>
              <span className={`medal ${r.rank <= 3 ? `r${r.rank}` : ''}`}>{r.rank}</span>
              <div className="grow" style={{ minWidth: 0 }}><div className="title">{r.name}</div><div className="muted small">{r.institution ?? ''}</div></div>
              <b>{fmtScore(r.final_score)}</b>
            </div>
          ))}
          {!data.ranking.some((r) => r.final_score > 0) && <p className="muted">Peringkat akan muncul setelah ada peserta yang absen atau mengerjakan kuis.</p>}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><CardTitle icon={<LayoutGrid size={18} />}>Menu kegiatan</CardTitle></div>
        <p className="muted small" style={{ marginTop: -4 }}>
          Aktifkan hanya menu yang dipakai pada kegiatan ini. Menu yang dinonaktifkan tidak tampil bagi panitia maupun peserta (dan ditolak di server);
          datanya tetap tersimpan sehingga bisa diaktifkan lagi. Peserta, Laporan, dan Data pegawai selalu tersedia.
        </p>
        <div className="menu-grid">
          {MENUS.map((m) => (
            <label key={m.key} className={`menu-opt ${flags[m.key] ? 'on' : ''}`}>
              <input type="checkbox" checked={flags[m.key]} disabled={savingMenu === m.key}
                onChange={(e) => void toggleMenu(m, e.target.checked)} />
              <span><b>{m.label}</b><span className="hint" style={{ display: 'block' }}>{m.hint}</span></span>
            </label>
          ))}
        </div>
      </div>

      <form className="card" onSubmit={save}>
        <div className="card-head"><h2>Pengaturan kegiatan</h2></div>
        <Field label="Nama kegiatan *"><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Deskripsi"><textarea className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Tampil di halaman peserta" /></Field>
        <div className="form-grid">
          <Field label="Lokasi"><input className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
          <Field label="Tanggal mulai"><input className="input" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></Field>
          <Field label="Tanggal selesai"><input className="input" type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></Field>
          <Field label="Status" hint="Draft: peserta belum bisa absen/kuis.">
            <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ActivityStatus })}>
              <option value="draft">Draft</option><option value="aktif">Berjalan</option><option value="selesai">Selesai</option>
            </select>
          </Field>
        </div>
        <Field label={`Bobot nilai akhir: kehadiran ${form.weight_attendance}% · kuis ${100 - form.weight_attendance}%`}
          hint="Dipakai untuk peringkat keseluruhan. Kuis yang dihitung diatur di pengaturan masing-masing kuis.">
          <input type="range" min={0} max={100} step={5} value={form.weight_attendance} onChange={(e) => setForm({ ...form, weight_attendance: Number(e.target.value) })} />
        </Field>
        <Check label="Tampilkan papan peringkat ke peserta" hint="Peserta melihat top 10 dan posisinya sendiri (nama peserta lain terlihat)." checked={form.show_leaderboard} onChange={(v) => setForm({ ...form, show_leaderboard: v })} />
        <Check label="Tampilkan di halaman depan (masuk dengan NIP)"
          hint={`Saat status Berjalan, kegiatan ini muncul di halaman depan aplikasi dan peserta bisa membuka halaman pribadinya dengan memasukkan NIP. Matikan bila peserta hanya boleh masuk lewat link/QR. Alamat langsung: ${location.origin}/k/${a.id}`}
          checked={form.public_access} onChange={(v) => setForm({ ...form, public_access: v })} />
        <div className="row between">
          <button className="btn primary" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan perubahan'}</button>
          <button type="button" className="btn danger" onClick={() => void remove()}><Trash2 size={16} /> Hapus kegiatan</button>
        </div>
      </form>
    </div>
  )
}
