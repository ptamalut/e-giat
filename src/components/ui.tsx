import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

/* ---------- Toast ---------- */
type ToastKind = 'info' | 'success' | 'error'
interface ToastItem { id: number; kind: ToastKind; text: string }
const ToastCtx = createContext<(text: string, kind?: ToastKind) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

/* ---------- Konfirmasi ---------- */
interface ConfirmOpts { title: string; message?: ReactNode; confirmText?: string; danger?: boolean }
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false)
export const useConfirm = () => useContext(ConfirmCtx)

export function UIProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const seq = useRef(0)
  const toast = useCallback((text: string, kind: ToastKind = 'info') => {
    const id = ++seq.current
    setToasts((t) => [...t, { id, kind, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3200)
  }, [])

  const [dlg, setDlg] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null)
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setDlg({ ...o, resolve })), [])
  const close = (v: boolean) => { dlg?.resolve(v); setDlg(null) }

  return (
    <ToastCtx.Provider value={toast}>
      <ConfirmCtx.Provider value={confirm}>
        {children}
        <div className="toasts" role="status" aria-live="polite">
          {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
        </div>
        {dlg && (
          <Modal title={dlg.title} onClose={() => close(false)}
            footer={<>
              <button className="btn" onClick={() => close(false)}>Batal</button>
              <button className={`btn ${dlg.danger ? 'danger' : 'primary'}`} onClick={() => close(true)} autoFocus>{dlg.confirmText ?? 'Ya, lanjutkan'}</button>
            </>}>
            {dlg.message}
          </Modal>
        )}
      </ConfirmCtx.Provider>
    </ToastCtx.Provider>
  )
}

/* ---------- Modal ---------- */
export function Modal({ title, children, footer, onClose, wide }: {
  title: string; children: ReactNode; footer?: ReactNode; onClose: () => void; wide?: boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn ghost sm" onClick={onClose} aria-label="Tutup">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

/* ---------- Potongan kecil ---------- */
export function Loading({ text = 'Memuat…' }: { text?: string }) {
  return <div className="loading"><span className="spinner" />{text}</div>
}

export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="alert error">
      {error} {onRetry && <button className="btn sm" style={{ marginLeft: 8 }} onClick={onRetry}>Coba lagi</button>}
    </div>
  )
}

export function Empty({ icon = '📭', title, children }: { icon?: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="big">{icon}</div>
      <strong>{title}</strong>
      {children && <div style={{ marginTop: 6 }}>{children}</div>}
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  )
}

export function Check({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span><span className="t">{label}</span>{hint && <><br /><span className="hint">{hint}</span></>}</span>
    </label>
  )
}

export function Stat({ value, label, sub }: { value: ReactNode; label: string; sub?: ReactNode }) {
  return <div className="stat"><div className="v">{value}</div><div className="l">{label}</div>{sub && <div className="s">{sub}</div>}</div>
}

/** Grafik batang vertikal sederhana (tanpa dependensi). */
export function BarChart({ data, max, unit = '' }: { data: { label: string; value: number }[]; max?: number; unit?: string }) {
  const m = max ?? Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="bars" role="img" aria-label="Grafik batang">
      {data.map((d) => (
        <div className="bar" key={d.label}>
          <div className="fill" style={{ height: `${(d.value / m) * 100}%` }}>{d.value > 0 && <b>{Math.round(d.value * 10) / 10}{unit}</b>}</div>
          <span className="lab">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

export function HBar({ value, max = 100, tone, label }: { value: number | null; max?: number; tone?: 'good' | 'mid' | 'bad'; label?: string }) {
  const v = value ?? 0
  return (
    <div className="hbar">
      <div className={`track ${tone ?? ''}`}><div style={{ width: `${Math.min(100, (v / max) * 100)}%` }} /></div>
      <span className="val">{label ?? (value == null ? '—' : Math.round(v))}</span>
    </div>
  )
}

export function RankMedal({ rank }: { rank: number | null }) {
  if (rank == null) return <span className="muted">—</span>
  return <span className={`medal ${rank <= 3 ? `r${rank}` : ''}`}>{rank}</span>
}

/* ---------- Hook data ---------- */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const seq = useRef(0)

  const run = useCallback(async (silent = false) => {
    const my = ++seq.current
    if (!silent) setLoading(true)
    try {
      const d = await fnRef.current()
      if (my === seq.current) { setData(d); setError(null) }
    } catch (e) {
      if (my === seq.current) setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (my === seq.current) setLoading(false)
    }
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void run() }, deps)
  return { data, error, loading, reload: run, setData }
}
