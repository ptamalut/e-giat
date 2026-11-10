import { Check } from 'lucide-react'

/** Penanda langkah (wizard): langkah selesai bercentang, langkah sekarang disorot. */
export default function Stepper({ steps, current }: { steps: readonly string[]; current: number }) {
  return (
    <ol className="stepper" aria-label="Langkah">
      {steps.map((s, i) => (
        <li key={s} className={i === current ? 'cur' : i < current ? 'done' : ''} aria-current={i === current ? 'step' : undefined}>
          <span className="st-n">{i < current ? <Check size={13} strokeWidth={3} /> : i + 1}</span>
          <span className="st-l">{s}</span>
        </li>
      ))}
    </ol>
  )
}
