import { rpc } from './supabase'
import type { AttendanceStatus } from './types'

/** Hasil pemeriksaan tanda tangan elektronik (QR) pada daftar hadir. */
export interface SignatureCheck {
  valid: boolean
  status: AttendanceStatus
  name: string
  /** NIP disamarkan oleh server */
  nip: string | null
  job_title: string | null
  institution: string | null
  activity: string
  session: string
  session_start: string
  checked_in_at: string
  /** dicatat manual oleh panitia (bukan absen mandiri) */
  manual: boolean
}

/** Kode tanda tangan: 32 heksadesimal huruf kecil. */
export const isSignCode = (v: string) => /^[0-9a-f]{32}$/.test(v)

export const verifySignature = (code: string) => rpc<SignatureCheck | null>('verify_signature', { p_code: code })
