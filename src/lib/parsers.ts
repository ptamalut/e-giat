import type { PersonRole } from './types'

/* ---------- Impor soal dari teks ---------- */

export interface ParsedQuestion {
  text: string
  options: string[]
  correct_index: number
  explanation?: string
}

export interface ParseResult<T> {
  items: T[]
  errors: string[]
}

export const QUESTION_FORMAT_HELP = `1. Ibu kota Indonesia adalah...
A. Bandung
B. Jakarta *
C. Surabaya
Pembahasan: Jakarta ditetapkan sebagai ibu kota negara.

2. Pancasila terdiri dari 5 sila.
A. Benar
B. Salah
Kunci: A`

/**
 * Format: blok dipisahkan baris kosong. Baris pertama = soal (nomor di depan diabaikan).
 * Opsi diawali "A." / "A)" dst. Kunci ditandai tanda * di akhir opsi, atau baris "Kunci: B".
 * Baris "Pembahasan: ..." bersifat opsional.
 */
export function parseQuestions(input: string): ParseResult<ParsedQuestion> {
  const items: ParsedQuestion[] = []
  const errors: string[] = []
  const blocks = input.replace(/\r/g, '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)

  blocks.forEach((block, idx) => {
    const label = `Soal ke-${idx + 1}`
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean)
    const textLines: string[] = []
    const options: string[] = []
    let correct = -1
    let keyLetter: string | null = null
    let explanation: string | undefined

    for (const line of lines) {
      const key = line.match(/^(?:kunci|jawaban)\s*[:=-]\s*([A-Za-z])\b/i)
      const exp = line.match(/^(?:pembahasan|penjelasan)\s*[:=-]\s*(.+)$/i)
      const opt = line.match(/^\(?([A-Ha-h])[.)]\s+(.*)$/)
      if (key) keyLetter = key[1].toUpperCase()
      else if (exp) explanation = exp[1].trim()
      else if (opt && textLines.length > 0) {
        let t = opt[2].trim()
        if (/\s*\*\s*$/.test(t)) {
          t = t.replace(/\s*\*\s*$/, '').trim()
          if (correct !== -1) errors.push(`${label}: lebih dari satu kunci jawaban ditandai *.`)
          correct = options.length
        }
        options.push(t)
      } else if (options.length === 0) textLines.push(line.replace(/^\d+\s*[.)]\s*/, ''))
      else options[options.length - 1] += ' ' + line // lanjutan baris opsi sebelumnya
    }

    const text = textLines.join(' ').trim()
    if (keyLetter) {
      const i = keyLetter.charCodeAt(0) - 65
      if (i >= 0 && i < options.length) correct = i
      else {
        errors.push(`${label}: kunci "${keyLetter}" tidak sesuai dengan opsi yang ada.`)
        return
      }
    }
    if (!text) errors.push(`${label}: teks soal kosong.`)
    else if (options.length < 2) errors.push(`${label}: minimal 2 opsi jawaban (format "A. ...").`)
    else if (options.length > 8) errors.push(`${label}: maksimal 8 opsi.`)
    else if (options.some((o) => !o)) errors.push(`${label}: ada opsi yang kosong.`)
    else if (correct < 0) errors.push(`${label}: kunci jawaban belum ditandai (beri * atau baris "Kunci: B").`)
    else items.push({ text, options, correct_index: correct, explanation })
  })

  return { items, errors }
}

/* ---------- Impor peserta dari teks (tempel dari Excel/CSV) ---------- */

export interface ParsedParticipant {
  name: string
  identifier: string | null
  grade: string | null
  job_title: string | null
  institution: string | null
  phone: string | null
  role: PersonRole
}

type Field = keyof ParsedParticipant
/** Urutan kolom bawaan bila tidak ada baris judul. */
export const PARTICIPANT_COLUMNS: Field[] = ['name', 'identifier', 'grade', 'job_title', 'institution', 'phone']
/** Kolom "Peran" hanya dibaca bila ada di baris judul; bila tidak, dipakai peran bawaan impor. */

export const PARTICIPANT_FORMAT_HELP = `Satu peserta per baris. Cara termudah: salin kolom dari Excel lalu tempel di sini (pemisah Tab).
Urutan kolom: Nama Lengkap & Gelar, NIP, Pangkat/Gol. Ruang, Jabatan, Satuan Kerja, No. WhatsApp
Baris judul (header) boleh disertakan; urutan kolom akan dibaca dari judulnya. Kolom opsional "Peran" (Peserta/Narasumber)
hanya dibaca bila ada di baris judul.

Nama bergelar sering memuat koma (mis. "Budi, S.Pd., M.Si."), jadi gunakan Tab, titik koma (;), atau garis tegak (|)
sebagai pemisah, atau apit nama dengan tanda kutip.`

const HEADER_ALIASES: Record<Field, string[]> = {
  name: ['nama', 'namalengkap', 'namalengkapbesertagelar', 'namalengkapdangelar', 'namapeserta', 'name'],
  identifier: ['nip', 'nipnik', 'nik', 'nomorindukpegawai', 'nomorpeserta', 'id'],
  grade: ['pangkatgolruang', 'pangkatgolonganruang', 'pangkatgol', 'pangkat', 'golongan', 'golruang', 'golonganruang'],
  job_title: ['jabatan'],
  institution: ['satuankerja', 'unitkerja', 'instansi', 'unit', 'skpd', 'opd'],
  phone: ['nowhatsapp', 'nomorwhatsapp', 'whatsapp', 'nowa', 'nohp', 'nomorhp', 'hp', 'telepon', 'notelepon'],
  role: ['peran', 'sebagai', 'status', 'kategori', 'role'],
}
const normHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Memecah satu baris berdasarkan pemisah, dengan dukungan nilai berkutip ("a, b"). */
function splitLine(line: string, delim: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++ } else quoted = !quoted
    } else if (ch === delim && !quoted) { out.push(cur.trim()); cur = '' } else cur += ch
  }
  out.push(cur.trim())
  return out
}

/** NIP sering ditulis "19800101 200501 1 001"; simpan sebagai angka tanpa spasi. */
export function normalizeNip(v: string): string {
  const t = v.trim()
  return /^[\d\s]+$/.test(t) ? t.replace(/\s+/g, '') : t
}

const SPEAKER = /nara\s*sumber|pembicara|pemateri|instruktur|widyaiswara|fasilitator/i

/** Nilai kolom Peran -> peran; tidak dikenali dianggap bawaan. */
export function parseRole(v: string | undefined, fallback: PersonRole): PersonRole {
  if (!v) return fallback
  return SPEAKER.test(v) ? 'narasumber' : /peserta|participant/i.test(v) ? 'peserta' : fallback
}

export function parseParticipants(input: string, defaultRole: PersonRole = 'peserta'): ParseResult<ParsedParticipant> {
  const items: ParsedParticipant[] = []
  const errors: string[] = []
  // hanya buang spasi di ujung kanan: tab di depan menandakan kolom pertama (nama) kosong
  const lines = input.replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim())
  if (lines.length === 0) return { items, errors }

  const delim = lines.some((l) => l.includes('\t')) ? '\t' : lines.some((l) => l.includes('|')) ? '|' : lines.some((l) => l.includes(';')) ? ';' : ','

  // baris judul: petakan kolom berdasarkan namanya
  let order = PARTICIPANT_COLUMNS as (Field | null)[]
  let hasHeader = false
  const first = splitLine(lines[0], delim).map(normHeader)
  const mapped = first.map((h) => (Object.keys(HEADER_ALIASES) as Field[]).find((f) => HEADER_ALIASES[f].includes(h)) ?? null)
  if (mapped.includes('name') && mapped.filter(Boolean).length >= 2) { order = mapped; hasHeader = true }
  else if (first[0] && HEADER_ALIASES.name.includes(first[0])) hasHeader = true // hanya kolom nama berjudul

  const seen = new Set<string>()
  const body = lines.slice(hasHeader ? 1 : 0)
  for (let i = 0; i < body.length; i++) {
    const row = i + 1 + (hasHeader ? 1 : 0)
    const cells = splitLine(body[i], delim)
    const rec: Partial<Record<Field, string>> = {}
    cells.forEach((c, ci) => { const f = order[ci]; if (f && c) rec[f] = c })

    const name = rec.name?.replace(/\s+/g, ' ').trim()
    const nip = rec.identifier ? normalizeNip(rec.identifier) : null
    if (!hasHeader && cells.length > PARTICIPANT_COLUMNS.length) {
      errors.push(`Baris ${row} (${cells[0]}): kolom lebih dari ${PARTICIPANT_COLUMNS.length}. Jika nama bergelar memuat koma, gunakan Tab/titik koma atau apit nama dengan tanda kutip.`)
      continue
    }
    if (!name) { errors.push(`Baris ${row}: nama kosong.`); continue }
    if (nip && /^\d(?:[.,]\d+)?e\+?\d+$/i.test(nip)) {
      errors.push(`Baris ${row} (${name}): NIP "${nip}" terbaca sebagai angka ilmiah. Ubah kolom NIP di Excel menjadi format Teks lalu salin ulang.`)
      continue
    }
    const key = (nip || name).toLowerCase()
    if (seen.has(key)) { errors.push(`Baris ${row} (${name}): duplikat dalam daftar yang ditempel.`); continue }
    seen.add(key)
    items.push({
      name, identifier: nip, grade: rec.grade ?? null, job_title: rec.job_title ?? null,
      institution: rec.institution ?? null, phone: rec.phone ?? null, role: parseRole(rec.role, defaultRole),
    })
  }
  return { items, errors }
}

/** Nomor HP Indonesia -> format internasional untuk wa.me (0812… -> 62812…) */
export function waNumber(phone: string | null | undefined): string | null {
  if (!phone) return null
  let d = phone.replace(/[^\d+]/g, '')
  if (d.startsWith('+')) d = d.slice(1)
  else if (d.startsWith('0')) d = '62' + d.slice(1)
  else if (d.startsWith('8')) d = '62' + d
  return d.length >= 9 ? d : null
}
