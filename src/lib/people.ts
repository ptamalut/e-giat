import type { PersonRole } from './types'

export const ROLES: PersonRole[] = ['peserta', 'narasumber', 'panitia']
export const ROLE_LABEL: Record<PersonRole, string> = { peserta: 'Peserta', narasumber: 'Narasumber', panitia: 'Panitia' }
export const ROLE_TONE: Record<PersonRole, string> = { peserta: '', narasumber: 'info', panitia: 'warn' }
export const ROLE_HINT: Record<PersonRole, string> = {
  peserta: 'Bawaan: absensi, kuis, dan sertifikat; masuk peringkat.',
  narasumber: 'Bawaan: absensi dan sertifikat, tanpa kuis dan tidak masuk peringkat.',
  panitia: 'Bawaan: semua menu kecuali kuis, tidak masuk peringkat.',
}

/** Hak akses menu per orang (berlaku bila menunya aktif di kegiatan). Urutan = urutan menu kegiatan. */
export interface Access {
  access_attendance: boolean; access_notes: boolean; access_quiz: boolean; access_certificate: boolean; access_documentation: boolean
}
export const ACCESS_KEYS = ['access_attendance', 'access_notes', 'access_quiz', 'access_certificate', 'access_documentation'] as const
export const ACCESS_LABEL: Record<keyof Access, string> = {
  access_attendance: 'Absensi', access_notes: 'Notula', access_quiz: 'Kuis', access_certificate: 'Sertifikat', access_documentation: 'Dokumentasi',
}
/** Isian awal hak akses mengikuti jenis (bisa diubah per orang): peserta = absensi, kuis, sertifikat; narasumber = absensi, sertifikat; panitia = semua kecuali kuis. */
export const defaultAccess = (r: PersonRole): Access => ({
  access_attendance: true, access_notes: r === 'panitia', access_quiz: r === 'peserta', access_certificate: true, access_documentation: r === 'panitia',
})

/** Pangkat/golongan ruang PNS, dipakai sebagai saran isian (boleh mengetik bebas, mis. golongan PPPK). */
export const GRADE_SUGGESTIONS = [
  'Juru Muda (I/a)', 'Juru Muda Tingkat I (I/b)', 'Juru (I/c)', 'Juru Tingkat I (I/d)',
  'Pengatur Muda (II/a)', 'Pengatur Muda Tingkat I (II/b)', 'Pengatur (II/c)', 'Pengatur Tingkat I (II/d)',
  'Penata Muda (III/a)', 'Penata Muda Tingkat I (III/b)', 'Penata (III/c)', 'Penata Tingkat I (III/d)',
  'Pembina (IV/a)', 'Pembina Tingkat I (IV/b)', 'Pembina Utama Muda (IV/c)', 'Pembina Utama Madya (IV/d)', 'Pembina Utama (IV/e)',
]

const TITLE_PREFIX = /^(dr|drs|dra|ir|h|hj|prof|ns|apt|drg|dr\.?\s*h|kh|h\.?c)\.?,?$/i

/** Huruf awal nama untuk avatar, melewati gelar di depan nama (Dr., Ir., H., dst.). */
export function nameInitial(name: string): string {
  const words = name.trim().split(/\s+/)
  const first = words.find((w) => !TITLE_PREFIX.test(w)) ?? words[0] ?? '?'
  return first.replace(/^[^\p{L}\p{N}]+/u, '').charAt(0).toUpperCase() || '?'
}

/** Baris rincian peserta untuk tampilan ringkas: jabatan · satuan kerja. */
export const roleLine = (p: { job_title?: string | null; institution?: string | null }) =>
  [p.job_title, p.institution].filter(Boolean).join(' · ')
