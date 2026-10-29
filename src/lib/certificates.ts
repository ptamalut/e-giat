export const CERT_BUCKET = 'certificates'
export const CERT_MAX_BYTES = 10 * 1024 * 1024
export const CERT_ACCEPT = '.pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg'

export type CertMime = 'application/pdf' | 'image/png' | 'image/jpeg'
export const CERT_EXT: Record<CertMime, string> = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg' }

/** Tipe berkas dari isinya (bukan ekstensi): PDF, PNG, atau JPEG. null bila bukan salah satunya. */
export async function sniffType(file: Blob): Promise<CertMime | null> {
  const b = new Uint8Array(await file.slice(0, 8).arrayBuffer())
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return 'application/pdf' // %PDF-
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  return null
}

/** Path acak di Storage: <id kegiatan>/<32 hex>.<ext> (tidak bisa ditebak). */
export const randomCertPath = (activityId: string, mime: CertMime) =>
  `${activityId}/${crypto.randomUUID().replace(/-/g, '')}.${CERT_EXT[mime]}`

/** Nama unduhan yang rapi: "Sertifikat - Nama Orang.pdf" */
export function certDownloadName(personName: string, mime: string | null, fallback: string): string {
  const ext = mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : (fallback.split('.').pop() ?? 'pdf')
  const safe = personName.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
  return `Sertifikat - ${safe || 'peserta'}.${ext}`
}

export const fmtBytes = (n: number | null | undefined) =>
  n == null ? '—' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`

/* ---------- pencocokan nama berkas -> orang ---------- */

export interface PersonLite { id: string; name: string; identifier: string | null }
export type Confidence = 'nip' | 'nama' | 'mirip'
export interface FileMatch {
  personId: string | null
  confidence: Confidence | null
  /** lebih dari satu orang cocok sama baiknya, perlu dipilih manual */
  ambiguous: boolean
  /** orang yang sama sudah dicocokkan ke berkas lain dalam kelompok unggahan ini */
  duplicate: boolean
}

const TITLES = new Set(['dr', 'drs', 'dra', 'ir', 'h', 'hj', 'prof', 'ns', 'apt', 'drg', 'kh', 'hc'])
const NOISE = /\b(sertifikat|certificate|cert|piagam|penghargaan|scan|final|fix)\b/gi

/**
 * Nama inti tanpa gelar, huruf kecil: "Prof. Dr. Ir. Budi Santoso, S.T., M.Sc." -> "budi santoso".
 * Gelar belakang dibuang (setelah koma, atau singkatan bertitik di tengah seperti "S.Pd").
 */
export function coreName(name: string): string {
  const head = name.toLowerCase().split(',')[0]
  const tokens = head.split(/[\s_\-]+/).filter(Boolean)
    .filter((t) => !/\p{L}\.\p{L}/u.test(t)) // S.Pd, M.Si, ...
  while (tokens.length > 1 && TITLES.has(tokens[0].replace(/[.\s]/g, ''))) tokens.shift()
  return tokens.join(' ').replace(/[^\p{L}\s']/gu, '').replace(/\s+/g, ' ').trim()
}

const baseOf = (fileName: string) => fileName.replace(/\.[^.]+$/, '')
const digitsOf = (s: string) => s.replace(/\D/g, '')
const hasWords = (hay: string, needle: string) => ` ${hay} `.includes(` ${needle} `)

/** Cocokkan satu nama berkas ke orang: NIP persis > nama persis > nama mirip (minimal 2 kata). */
export function matchFile(fileName: string, people: readonly PersonLite[]): Omit<FileMatch, 'duplicate'> {
  const base = baseOf(fileName)

  // 1) NIP: deret angka (boleh berspasi/titik) yang sama dengan NIP seseorang
  const runs = (base.match(/\d[\d\s.\-]{6,}\d/g) ?? []).map(digitsOf)
  const allDigits = digitsOf(base)
  const byNip = people.filter((p) => {
    const id = p.identifier ? digitsOf(p.identifier) : ''
    return id.length >= 8 && (runs.includes(id) || allDigits === id)
  })
  if (byNip.length === 1) return { personId: byNip[0].id, confidence: 'nip', ambiguous: false }
  if (byNip.length > 1) return { personId: null, confidence: null, ambiguous: true }

  // 2) nama
  // garis bawah dianggap huruf oleh \b, jadi diganti spasi dulu agar kata "Sertifikat_Nama_Orang" terbaca benar
  const fc = coreName(base.replace(/_+/g, ' ').replace(NOISE, ' ').replace(/\d+/g, ' '))
  if (!fc) return { personId: null, confidence: null, ambiguous: false }
  const exact = people.filter((p) => coreName(p.name) === fc)
  if (exact.length === 1) return { personId: exact[0].id, confidence: 'nama', ambiguous: false }
  if (exact.length > 1) return { personId: null, confidence: null, ambiguous: true }

  const near = people.filter((p) => {
    const pc = coreName(p.name)
    const [short, long] = pc.length <= fc.length ? [pc, fc] : [fc, pc]
    return short.split(' ').length >= 2 && hasWords(long, short)
  })
  if (near.length === 1) return { personId: near[0].id, confidence: 'mirip', ambiguous: false }
  return { personId: null, confidence: null, ambiguous: near.length > 1 }
}

/** Cocokkan banyak berkas sekaligus; orang yang sama hanya dipakai satu berkas (berkas berikutnya ditandai duplikat). */
export function matchFiles(fileNames: readonly string[], people: readonly PersonLite[]): FileMatch[] {
  const used = new Set<string>()
  return fileNames.map((n) => {
    const m = matchFile(n, people)
    if (m.personId && used.has(m.personId)) return { personId: null, confidence: null, ambiguous: false, duplicate: true }
    if (m.personId) used.add(m.personId)
    return { ...m, duplicate: false }
  })
}
