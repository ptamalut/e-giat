import { useEffect, useState } from 'react'

/** Peristiwa pemasangan Chrome/Edge/Android; dapat terjadi sebelum React tampil, jadi ditangkap sejak modul dimuat. */
interface InstallPrompt extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
let deferred: InstallPrompt | null = null
let installed = false
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as InstallPrompt; notify() })
  window.addEventListener('appinstalled', () => { installed = true; deferred = null; notify() })
}

/** Daftarkan service worker (hanya di produksi). */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => { /* tidak wajib */ }) })
}

/** Sudah berjalan sebagai aplikasi terpasang (jendela mandiri)? */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
}

export type Platform = 'ios' | 'android' | 'desktop'
export function detectPlatform(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent, maxTouch = typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints): Platform {
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && maxTouch > 1)) return 'ios'   // iPadOS menyamar sebagai Mac
  if (/Android/i.test(ua)) return 'android'
  return 'desktop'
}

export interface InstallState {
  /** peramban menawarkan pemasangan langsung (tombol Pasang) */
  canInstall: boolean
  /** sudah terpasang / sedang berjalan sebagai aplikasi */
  installed: boolean
  platform: Platform
  install: () => Promise<boolean>
}

export function useInstall(): InstallState {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])
  return {
    canInstall: !!deferred && !installed,
    installed: installed || isStandalone(),
    platform: detectPlatform(),
    install: async () => {
      if (!deferred) return false
      const p = deferred
      await p.prompt()
      const { outcome } = await p.userChoice
      deferred = null
      notify()
      return outcome === 'accepted'
    },
  }
}
