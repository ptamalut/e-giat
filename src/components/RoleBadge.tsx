import type { CSSProperties } from 'react'
import { ROLE_LABEL, ROLE_TONE } from '../lib/people'
import type { PersonRole } from '../lib/types'

/** Lencana peran; tidak menampilkan apa pun untuk peserta biasa. */
export function RoleBadge({ role, style, className = '' }: { role: PersonRole; style?: CSSProperties; className?: string }) {
  if (role === 'peserta') return null
  return <span className={`badge ${ROLE_TONE[role]} ${className}`} style={{ marginLeft: 8, ...style }}>{ROLE_LABEL[role]}</span>
}
