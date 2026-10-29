import { ArrowUpDown, Contact, Download, FileDown, ExternalLink, KeyRound, Link2, MessageCircle, Plus, Printer, QrCode, RefreshCcw, Search, Trash2, Users } from 'lucide-react'
import QRCode from 'qrcode'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Empty, ErrorBox, Loading, Modal, useAsync, useConfirm, useToast } from '../../components/ui'
import { downloadCsv, safeName } from '../../lib/csv'
import { RoleBadge } from '../../components/RoleBadge'
import { SatkerControls, SatkerGroupRow, useCollapsed } from '../../components/SatkerGroup'
import { ROLE_LABEL, ROLES, roleLine } from '../../lib/people'
import { activeMenus } from '../../lib/menus'
import { participantLink } from '../../lib/format'
import { groupBySatker, matchesUnit, roleSummary, sortPeople } from '../../lib/satker'
import { waNumber } from '../../lib/parsers'
import { removeParticipantCertificateFiles } from '../../lib/certificateApi'
import { removeSelfiesOf } from '../../lib/selfieApi'
import { errMsg, fetchAll, supabase } from '../../lib/supabase'
import type { Activity, Participant, PersonRole } from '../../lib/types'
import { useActivity } from './ActivityLayout'
import ExportModal from './ExportModal'
import OrderModal from './OrderModal'
import { AccessModal, PickEmployees } from './ParticipantPicker'

/** Menu yang boleh dipakai orang ini lewat link pribadinya (menu aktif di kegiatan DAN hak akses orang ini). */
const allowedMenus = (p: Participant, a: Activity) => activeMenus(a).filter((m) => p[m.access]).map((m) => m.label)

async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true } catch {
    const t = document.createElement('textarea')
    t.value = text; document.body.appendChild(t); t.select()
    const ok = document.execCommand('copy'); t.remove(); return ok
  }
}

export default function ParticipantsTab() {
  const { activity, reload: reloadActivity } = useActivity()
  const toast = useToast()
  const confirm = useConfirm()
  const [q, setQ] = useState('')
  const [roleFilter, setRoleFilter] = useState<'semua' | PersonRole>('semua')
  const [picking, setPicking] = useState(false)
  const [access, setAccess] = useState<Participant[] | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [qr, setQr] = useState<Participant | null>(null)
  const [grouped, setGrouped] = useState(true)
  const [unit, setUnit] = useState('')
  const { collapsed, toggle, setAll } = useCollapsed()
  const [ordering, setOrdering] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [cards, setCards] = useState<{ p: Participant; img: string }[] | null>(null)

  const { data, error, loading, reload } = useAsync(async () => {
    return sortPeople(await fetchAll<Participant>((a, b) => supabase.from('participants').select('*').eq('activity_id', activity.id).order('name').order('id').range(a, b)))
  }, [activity.id])

  const counts = useMemo(() => {
    const all = data ?? []
    return Object.fromEntries([['semua', all.length], ...ROLES.map((r) => [r, all.filter((p) => p.role === r).length])]) as Record<'semua' | PersonRole, number>
  }, [data])

  // semua kelompok (tanpa filter) berurutan sesuai pengaturan; dipakai untuk pilihan satker, ubah nama, ekspor, dan cetak
  const allGroups = useMemo(() => groupBySatker(data ?? [], (p) => p.institution, activity.satker_order), [data, activity.satker_order])
  const ordered = useMemo(() => allGroups.flatMap((g) => g.items), [allGroups])

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return ordered.filter((p) => (roleFilter === 'semua' || p.role === roleFilter) && matchesUnit(unit, p.institution) && (!s || [p.name, p.identifier, p.grade, p.job_title, p.institution, p.phone].some((v) => v?.toLowerCase().includes(s))))
  }, [ordered, q, roleFilter, unit])
  const groups = useMemo(() => groupBySatker(list, (p) => p.institution, activity.satker_order), [list, activity.satker_order])

  const waText = (p: Participant) => {
    const m = allowedMenus(p, activity)
    const what = m.length ? `untuk ${m.join(', ').toLowerCase()}` : 'kegiatan'
    return `Yth. ${p.name}, berikut link pribadi Anda ${what} pada kegiatan "${activity.name}"${p.role !== 'peserta' ? ` (sebagai ${ROLE_LABEL[p.role].toLowerCase()})` : ''}:\n${participantLink(p.token)}\n\nJangan dibagikan ke orang lain.`
  }

  async function remove(p: Participant) {  // mengeluarkan dari kegiatan (data pegawainya tidak terhapus)
    // hitung dulu apa yang ikut hilang supaya admin tahu dampaknya (hasil kuis hilang = peserta bisa mengulang dari nol)
    const [{ count: quizN }, { count: attN }] = await Promise.all([
      supabase.from('quiz_attempts').select('id', { count: 'exact', head: true }).eq('participant_id', p.id).not('submitted_at', 'is', null),
      supabase.from('attendances').select('id', { count: 'exact', head: true }).eq('participant_id', p.id),
    ])
    const ok = await confirm({ title: `Keluarkan ${p.name} dari kegiatan?`, danger: true, confirmText: quizN || attN ? 'Keluarkan beserta datanya' : 'Keluarkan',
      message: <>
        {quizN ? <div className="alert error" style={{ marginBottom: 10 }}><span><b>{p.name} sudah mengerjakan kuis ({quizN} percobaan selesai).</b> Seluruh hasilnya akan hilang permanen
          dan tidak bisa dikembalikan; nilai, peringkat, dan N-Gain ikut berubah. Bila tujuannya hanya mengulang kuis, pakai <b>Laporan → Hasil kuis → Reset</b>
          agar orangnya dan link pribadinya tetap sama.</span></div> : null}
        Data absensi{attN ? ` (${attN} sesi)` : ''} termasuk foto selfie &amp; lokasi, serta sertifikat peserta ini juga terhapus dan link pribadinya tidak berlaku lagi. Data pegawainya tetap ada di Data pegawai.
      </> })
    if (!ok) return
    await removeParticipantCertificateFiles([p.id]) // berkas sertifikatnya ikut dibersihkan
    await removeSelfiesOf({ participantIds: [p.id] }) // begitu pula foto selfie absensinya
    const { error } = await supabase.from('participants').delete().eq('id', p.id)
    if (error) return toast(errMsg(error), 'error')
    toast('Dikeluarkan dari kegiatan.', 'success'); setSel((s) => { const n = new Set(s); n.delete(p.id); return n }); void reload(true)
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
    if (!ordered.length) return
    const imgs = await Promise.all(ordered.map((p) => QRCode.toDataURL(participantLink(p.token), { margin: 1, width: 300 })))
    setCards(ordered.map((p, i) => ({ p, img: imgs[i] })))
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
      ['Peran', 'Nama Lengkap & Gelar', 'NIP', 'Pangkat/Gol. Ruang', 'Jabatan', 'Satuan Kerja', 'No. WhatsApp', 'Link'],
      ...ordered.map((p) => [ROLE_LABEL[p.role], p.name, p.identifier, p.grade, p.job_title, p.institution, p.phone, participantLink(p.token)]),
    ])
  }

  const cols = grouped ? 7 : 8
  const taken = useMemo(() => new Set((data ?? []).map((p) => p.employee_id).filter((v): v is string => !!v)), [data])
  const selected = (data ?? []).filter((p) => sel.has(p.id))
  const toggleSel = (id: string) => setSel((s0) => { const n = new Set(s0); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const setMany = (items: Participant[], on: boolean) => setSel((s0) => { const n = new Set(s0); items.forEach((p) => (on ? n.add(p.id) : n.delete(p.id))); return n })

  const renderRow = (p: Participant, i: number) => (
    <tr key={p.id}>
      <td><input type="checkbox" className="rowcheck" checked={sel.has(p.id)} onChange={() => toggleSel(p.id)} aria-label={`Pilih ${p.name}`} /></td>
      <td className="muted">{i + 1}</td>
      <td style={{ minWidth: 220 }}>
        <b>{p.name}</b><RoleBadge role={p.role} /><div className="mono muted">{p.identifier ? `NIP ${p.identifier}` : '—'}</div>
        <div className="access-chips" title="Menu yang boleh dipakai lewat link pribadinya" style={{ marginTop: 5 }}>
          {activeMenus(activity).map((m) => (
            <span key={m.key} className={`access-chip ${p[m.access] ? '' : 'off'}`}>{m.label}</span>
          ))}
        </div>
      </td>
      <td style={{ minWidth: 170 }}>
        {p.job_title ? <div>{p.job_title}</div> : <div className="muted">—</div>}
        {p.grade && <div className="muted small">{p.grade}</div>}
      </td>
      {!grouped && <td style={{ minWidth: 140 }}>{p.institution ?? <span className="muted">—</span>}</td>}
      <td className="nowrap mono">{p.phone ?? <span className="muted">—</span>}</td>
      <td className="actions">
        <div className="row tight" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
          <button className="btn sm" onClick={async () => toast((await copy(participantLink(p.token))) ? 'Link disalin.' : 'Gagal menyalin.', 'success')} aria-label={`Salin link ${p.name}`} title="Salin link"><Link2 size={15} /></button>
          <button className="btn sm" onClick={() => setQr(p)} aria-label="Tampilkan QR" title="Tampilkan QR"><QrCode size={15} /></button>
          <a className="btn sm" target="_blank" rel="noreferrer" aria-label="Kirim lewat WhatsApp"
            href={`https://wa.me/${waNumber(p.phone) ?? ''}?text=${encodeURIComponent(waText(p))}`}
            title={waNumber(p.phone) ? 'Kirim lewat WhatsApp' : 'No. WhatsApp kosong, pilih kontak sendiri'}><MessageCircle size={15} /></a>
          <a className="btn sm" href={`/p/${p.token}`} target="_blank" rel="noreferrer" aria-label="Buka halaman peserta" title="Buka halaman peserta"><ExternalLink size={15} /></a>
          <span style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} aria-hidden />
          <button className="icon-btn" onClick={() => setAccess([p])} aria-label={`Jenis & hak akses ${p.name}`} title="Jenis & hak akses"><KeyRound size={16} /></button>
          <button className="icon-btn" onClick={() => void regenerate(p)} aria-label="Buat ulang link" title="Buat ulang link"><RefreshCcw size={16} /></button>
          <button className="icon-btn danger" onClick={() => void remove(p)} aria-label={`Keluarkan ${p.name}`} title="Keluarkan dari kegiatan"><Trash2 size={16} /></button>
        </div>
      </td>
    </tr>
  )

  return (
    <>
      <div className="card flush no-print">
        <div className="toolbar">
          <div className="row">
            <label className="search"><Search size={16} /><input className="input" placeholder="Cari nama, NIP, jabatan, atau satuan kerja" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari peserta" /></label>
            <div className="pills" role="group" aria-label="Filter jenis">
              {(['semua', ...ROLES] as const).map((r) => (
                <button key={r} className={`pill ${roleFilter === r ? 'active' : ''}`} onClick={() => setRoleFilter(r)}>
                  {r === 'semua' ? 'Semua' : ROLE_LABEL[r]} <span className="muted">{counts[r]}</span>
                </button>
              ))}
            </div>
            <SatkerControls groups={allGroups} total={data?.length ?? 0} unit={unit} setUnit={setUnit} grouped={grouped} setGrouped={setGrouped} />
            {grouped && groups.length > 1 && (
              <button className="btn ghost sm" onClick={() => setAll(collapsed.size ? null : groups.map((g) => g.key))}>
                {collapsed.size ? 'Buka semua' : 'Lipat semua'}
              </button>
            )}
          </div>
          <div className="row tight">
            <button className="btn sm" onClick={() => setOrdering(true)} disabled={!data?.length}><ArrowUpDown size={15} /> Atur urutan</button>
            <button className="btn sm" onClick={() => setExporting(true)} disabled={!data?.length}><FileDown size={15} /> Ekspor Word / PDF</button>
            <button className="btn sm" onClick={exportLinks} disabled={!data?.length}><Download size={15} /> Link (CSV)</button>
            <button className="btn sm" onClick={() => void printCards()} disabled={!data?.length}><Printer size={15} /> Kartu QR</button>
            <button className="btn primary sm" onClick={() => setPicking(true)}><Plus size={16} /> Tambah dari data pegawai</button>
          </div>
        </div>

        {selected.length > 0 && (
          <div className="bulkbar" role="region" aria-label="Aksi untuk yang dipilih">
            <b>{selected.length} dipilih</b>
            <button className="btn sm" onClick={() => setAccess(selected)}><KeyRound size={14} /> Atur jenis &amp; hak akses</button>
            <button className="btn ghost sm" onClick={() => setSel(new Set())}>Batal pilih</button>
          </div>
        )}

        {loading && !data && <Loading />}
        {error && <div style={{ padding: 16 }}><ErrorBox error={error} onRetry={() => void reload()} /></div>}
        {!loading && !error && !data?.length && (
          <Empty icon={<Users size={26} />} title="Belum ada peserta, narasumber, atau panitia">
            Peserta dipilih dari <Link to="/admin/pegawai">data pegawai</Link>, lalu ditentukan jenis (peserta/narasumber/panitia) dan hak akses menunya.
            <div style={{ marginTop: 12 }}>
              <button className="btn primary" onClick={() => setPicking(true)}><Contact size={16} /> Pilih dari data pegawai</button>
            </div>
          </Empty>
        )}
        {!!data?.length && (
          <div className="table-wrap">
            <table className="table">
              <thead><tr>
                <th style={{ width: 34 }}><input type="checkbox" className="rowcheck" aria-label="Pilih semua yang tampil"
                  checked={list.length > 0 && list.every((p) => sel.has(p.id))} onChange={(e) => setMany(list, e.target.checked)} /></th>
                <th>#</th><th>Nama, NIP &amp; akses menu</th><th>Pangkat/Gol. &amp; jabatan</th>{!grouped && <th>Satuan kerja</th>}<th>WhatsApp</th><th className="actions">Link pribadi &amp; aksi</th>
              </tr></thead>
              <tbody>
                {grouped
                  ? groups.map((g) => {
                      const isCollapsed = collapsed.has(g.key)
                      return (
                        <Fragment key={g.key || '__none__'}>
                          <SatkerGroupRow label={g.label} colSpan={cols} collapsed={isCollapsed} onToggle={() => toggle(g.key)}
                            meta={`${g.items.length} orang · ${roleSummary(g.items)}`}
                            actions={<button className="btn ghost sm" onClick={() => setMany(g.items, !g.items.every((p) => sel.has(p.id)))}>
                              {g.items.every((p) => sel.has(p.id)) ? 'Batal pilih kelompok' : 'Pilih kelompok'}
                            </button>} />
                          {!isCollapsed && g.items.map((p, i) => renderRow(p, i))}
                        </Fragment>
                      )
                    })
                  : list.map((p, i) => renderRow(p, i))}
                {list.length === 0 && <tr><td colSpan={cols} className="center muted">Tidak ada hasil{q ? <> untuk "{q}"</> : ''}.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {picking && <PickEmployees activity={activity} taken={taken} onClose={() => setPicking(false)} onSaved={() => { setPicking(false); void reload(true) }} />}
      {access && <AccessModal activity={activity} people={access} onClose={() => setAccess(null)} onSaved={() => { setAccess(null); setSel(new Set()); void reload(true) }} />}
      {ordering && data && <OrderModal activity={activity} people={data} onClose={() => setOrdering(false)}
        onSaved={() => { setOrdering(false); void reloadActivity(); void reload(true) }} />}
      {exporting && data && <ExportModal activity={activity} people={ordered} onClose={() => setExporting(false)}
        onOrder={() => { setExporting(false); setOrdering(true) }} />}
      {qr && <QrModal p={qr} activityName={activity.name} onClose={() => setQr(null)} />}

      <div className="print-cards-wrap">
        {cards && (
          <div className="print-cards">
            {cards.map(({ p, img }) => (
              <div className="print-card" key={p.id}>
                <div style={{ fontWeight: 700 }}>{activity.name}</div>
                <img src={img} alt={`QR ${p.name}`} />
                <div style={{ fontSize: 15, fontWeight: 700 }}>{p.name}</div>
                {p.role !== 'peserta' && <div style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>{ROLE_LABEL[p.role]}</div>}
                <div>{[p.identifier && `NIP ${p.identifier}`, p.grade].filter(Boolean).join(' · ')}</div>
                <div>{roleLine(p)}</div>
                <div style={{ fontSize: 10, marginTop: 4 }}>{allowedMenus(p, activity).length ? `Scan untuk ${allowedMenus(p, activity).join(', ').toLowerCase()}` : 'Scan untuk membuka halaman kegiatan'}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
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
