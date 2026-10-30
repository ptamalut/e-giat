import type { CSSProperties } from 'react'
import { ROLE_LABEL, ROLE_TONE } from '../lib/people'
import type { PersonRole } from '../lib/types'

/** Lencana peran; tidak menampilkan apa pun untuk peserta biasa. */
export function RoleBadge({ role, style, className = '' }: { role: PersonRole; style?: CSSProperties; className?: string }) {
  if (!role || role === 'peserta') return null
  return <span className={`badge ${ROLE_TONE[role]} ${className}`} style={{ marginLeft: 8, ...style }}>{ROLE_LABEL[role]}</span>
}

/** Lencana semua jenis seseorang; tidak tampil bila hanya peserta. Bila merangkap, "Peserta" ikut ditampilkan. */
export function RoleBadges({ roles, style }: { roles: PersonRole[]; style?: CSSProperties }) {
  if (!roles?.length || (roles.length === 1 && roles[0] === 'peserta')) return null
  return <>{roles.map((r) => <span key={r} className={`badge ${ROLE_TONE[r]}`} style={{ marginLeft: 8, ...style }}>{ROLE_LABEL[r]}</span>)}</>
}
