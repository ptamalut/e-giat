import { Download, Maximize, MonitorSmartphone, SquarePlus, WifiOff, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useBrand } from './brand'
import { Modal } from './ui'
import { useInstall, type Platform } from '../lib/pwa'

const KEY = 'laksana-install'
const SNOOZE_MS = 7 * 24 * 3600 * 1000
const EVENT = 'laksana:install'

/** Buka dialog pemasangan dari mana saja (tombol di navigasi/footer). */
export const openInstallDialog = () => window.dispatchEvent(new Event(EVENT))

const readPref = (): { until?: number; never?: boolean } => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} } }
const writePref = (p: { until?: number; never?: boolean }) => { try { localStorage.setItem(KEY, JSON.stringify(p)) } catch { /* abaikan */ } }
/** Boleh muncul otomatis? Tidak bila ditolak selamanya atau masih dalam masa tunda. */
export const autoInstallAllowed = (pref: { until?: number; never?: boolean }, now = Date.now()) => !pref.never && !(pref.until && pref.until > now)

const STEPS: Record<Platform, { title: string; steps: string[] }> = {
  ios: { title: 'iPhone / iPad (Safari)', steps: ['Buka halaman ini di Safari.', 'Ketuk tombol Bagikan (kotak dengan panah ke atas).', 'Pilih "Tambah ke Layar Utama", lalu ketuk Tambah.'] },
  android: { title: 'Android (Chrome)', steps: ['Ketuk tombol Pasang sekarang di bawah, atau menu ⋮ di pojok kanan atas.', 'Pilih "Instal aplikasi" atau "Tambahkan ke layar utama".', 'Konfirmasi. Ikon aplikasi muncul di layar utama.'] },
  desktop: { title: 'Komputer (Chrome / Edge)', steps: ['Klik ikon Pasang di sisi kanan address bar, atau menu ⋮ → "Instal aplikasi".', 'Konfirmasi pemasangan.', 'Aplikasi terbuka di jendela sendiri dan bisa disematkan ke taskbar.'] },
}

/**
 * Pop up informasi pemasangan aplikasi (PWA). Muncul otomatis sekali (lalu ditunda 7 hari bila ditutup, atau tidak lagi bila dipilih
 * "Jangan tampilkan lagi") dan bisa dibuka kapan saja lewat `openInstallDialog()`. Tidak muncul bila aplikasi sudah terpasang.
 */
export default function InstallDialog({ auto = true }: { auto?: boolean }) {
  const { settings } = useBrand()
  const { canInstall, installed, platform, install } = useInstall()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const h = () => setOpen(true)
    window.addEventListener(EVENT, h)
    return () => window.removeEventListener(EVENT, h)
  }, [])

  useEffect(() => {
    if (!auto || installed || !autoInstallAllowed(readPref())) return
    const t = setTimeout(() => setOpen(true), 2500)
    return () => clearTimeout(t)
  }, [auto, installed])

  if (!open || installed) return null
  const later = () => { writePref({ until: Date.now() + SNOOZE_MS }); setOpen(false) }
  const never = () => { writePref({ never: true }); setOpen(false) }
  const s = STEPS[platform]
  return (
    <Modal title={`Pasang ${settings.app_name} di perangkat Anda`} onClose={later}
      footer={<>
        <button className="btn ghost" onClick={never}>Jangan tampilkan lagi</button>
        <span className="spacer" />
        <button className="btn" onClick={later}>Nanti</button>
        {canInstall && <button className="btn primary" onClick={() => void install().then((ok) => ok && setOpen(false))}><Download size={16} /> Pasang sekarang</button>}
      </>}>
      <div className="install-head">
        <span className="icon-chip" style={{ width: 44, height: 44 }}><MonitorSmartphone size={22} /></span>
        <p className="muted" style={{ margin: 0, flex: 1 }}>Gratis, tanpa toko aplikasi. Dibuka dari layar utama seperti aplikasi biasa.</p>
      </div>
      <ul className="install-perks">
        <li><Zap size={16} /> Lebih cepat dibuka</li>
        <li><Maximize size={16} /> Tampil layar penuh</li>
        <li><WifiOff size={16} /> Tampilan dasar tetap terbuka saat sinyal lemah</li>
      </ul>
      <div className="install-steps">
        <b>{s.title}</b>
        <ol>{s.steps.map((t) => <li key={t}>{t}</li>)}</ol>
        {platform === 'ios' && <p className="muted small"><SquarePlus size={14} style={{ verticalAlign: '-0.15em' }} /> Di iPhone, pemasangan hanya bisa lewat Safari.</p>}
      </div>
    </Modal>
  )
}
