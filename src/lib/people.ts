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
