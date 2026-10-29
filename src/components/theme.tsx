import { Monitor, Moon, Sun } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'
const KEY = 'laksana-theme'

function readMode(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch { /* penyimpanan tidak tersedia */ }
  return 'system'
}

const prefersDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches

function apply(mode: ThemeMode) {
  const resolved = mode === 'system' ? (prefersDark() ? 'dark' : 'light') : mode
  document.documentElement.dataset.theme = resolved
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#0a0e1f' : '#4f46e5')
}

interface ThemeState { mode: ThemeMode; setMode: (m: ThemeMode) => void }
const Ctx = createContext<ThemeState>({ mode: 'system', setMode: () => {} })
export const useTheme = () => useContext(Ctx)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readMode)

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m)
    try { localStorage.setItem(KEY, m) } catch { /* abaikan */ }
  }, [])

  useEffect(() => {
    apply(mode)
    if (mode !== 'system') return
    // mode otomatis: ikuti perubahan pengaturan perangkat secara langsung
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const on = () => apply('system')
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [mode])

  // sinkron antar tab
  useEffect(() => {
    const on = (e: StorageEvent) => { if (e.key === KEY) setModeState(readMode()) }
    window.addEventListener('storage', on)
    return () => window.removeEventListener('storage', on)
  }, [])

  return <Ctx.Provider value={{ mode, setMode }}>{children}</Ctx.Provider>
}

const OPTIONS = [
  { id: 'light', label: 'Tema terang', icon: Sun },
  { id: 'dark', label: 'Tema gelap', icon: Moon },
  { id: 'system', label: 'Ikuti pengaturan perangkat', icon: Monitor },
] as const

/** Pemilih tema tiga pilihan. `onDark` untuk dipasang di atas latar gelap (sidebar, header portal). */
export function ThemeToggle({ onDark }: { onDark?: boolean }) {
  const { mode, setMode } = useTheme()
  return (
    <div className={`theme-toggle ${onDark ? 'on-dark' : ''}`} role="group" aria-label="Tema tampilan">
      {OPTIONS.map(({ id, label, icon: Icon }) => (
        <button key={id} type="button" aria-pressed={mode === id} aria-label={label} title={label} onClick={() => setMode(id)}>
          <Icon size={16} />
        </button>
      ))}
    </div>
  )
}
