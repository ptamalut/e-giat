import { Download, MonitorSmartphone, Share, SquarePlus, X, Zap, WifiOff, Maximize } from 'lucide-react'
import { useState } from 'react'
import { useBrand } from './brand'
import { useInstall, type Platform } from '../lib/pwa'

const STEPS: Record<Platform, { title: string; steps: string[] }> = {
  ios: { title: 'iPhone / iPad (Safari)', steps: ['Buka halaman ini di Safari.', 'Ketuk tombol Bagikan (kotak dengan panah ke atas).', 'Pilih "Tambah ke Layar Utama", lalu ketuk Tambah.'] },
  android: { title: 'Android (Chrome)', steps: ['Ketuk tombol Pasang di bawah, atau menu ⋮ di pojok kanan atas.', 'Pilih "Instal aplikasi" atau "Tambahkan ke layar utama".', 'Konfirmasi. Ikon aplikasi muncul di layar utama.'] },
  desktop: { title: 'Komputer (Chrome / Edge)', steps: ['Klik ikon Pasang di sisi kanan address bar, atau menu ⋮ → "Instal LAKSANA".', 'Konfirmasi pemasangan.', 'Aplikasi terbuka di jendela sendiri dan bisa disematkan ke taskbar.'] },
}

/** Informasi dan tombol pemasangan aplikasi (PWA). Tidak tampil bila aplikasi sudah terpasang. */
export default function InstallInfo({ compact = false }: { compact?: boolean }) {
  const { settings } = useBrand()
  const { canInstall, installed, platform, install } = useInstall()
  const [dismissed, setDismissed] = useState(() => { try { return compact && localStorage.getItem('laksana-install-dismissed') === '1' } catch { return false } })
  if (installed || dismissed) return null

  const dismiss = () => { setDismissed(true); try { localStorage.setItem('laksana-install-dismissed', '1') } catch { /* abaikan */ } }

  if (compact) {
    return (
      <div className="alert info install-compact" role="region" aria-label="Pasang aplikasi">
        <MonitorSmartphone size={18} />
        <span style={{ flex: 1 }}>
          {canInstall
            ? <>Pasang <b>{settings.app_name}</b> di perangkat Anda agar lebih cepat dibuka.</>
            : platform === 'ios'
              ? <>Pasang <b>{settings.app_name}</b>: ketuk <Share size={14} style={{ verticalAlign: '-0.15em' }} /> Bagikan → <b>Tambah ke Layar Utama</b>.</>
              : <>Pasang <b>{settings.app_name}</b> lewat menu browser → <b>Instal aplikasi</b>.</>}
        </span>
        {canInstall && <button className="btn sm primary" onClick={() => void install()}><Download size={14} /> Pasang</button>}
        <button className="icon-btn" aria-label="Tutup" onClick={dismiss}><X size={16} /></button>
      </div>
    )
  }

  const s = STEPS[platform]
  return (
    <section className="install-card" aria-labelledby="h-pasang">
      <div className="install-head">
        <span className="icon-chip"><MonitorSmartphone size={20} /></span>
        <div>
          <h2 id="h-pasang" style={{ margin: 0 }}>Pasang {settings.app_name} di perangkat Anda</h2>
          <p className="muted" style={{ margin: '2px 0 0' }}>Gratis, tanpa toko aplikasi. Dibuka dari layar utama seperti aplikasi biasa.</p>
        </div>
        {canInstall && <button className="btn primary lg install-btn" onClick={() => void install()}><Download size={18} /> Pasang sekarang</button>}
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
    </section>
  )
}
