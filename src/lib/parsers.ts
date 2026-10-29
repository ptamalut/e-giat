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
  institution: string | null
  email: string | null
  phone: string | null
}

export const PARTICIPANT_FORMAT_HELP = `Satu peserta per baris. Kolom dipisah Tab (tempel dari Excel), koma, titik koma, atau |
Urutan kolom: Nama, NIP/ID, Instansi/Unit, Email, No. HP

Budi Santoso, 198001012005011001, Dinas Pendidikan, budi@contoh.id, 08123456789
Siti Aminah, 198503152010012002, Dinas Kesehatan`

export function parseParticipants(input: string): ParseResult<ParsedParticipant> {
  const items: ParsedParticipant[] = []
  const errors: string[] = []
  const lines = input.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return { items, errors }

  const delim = lines.some((l) => l.includes('\t')) ? '\t' : lines.some((l) => l.includes('|')) ? '|' : lines.some((l) => l.includes(';')) ? ';' : ','
  const split = (l: string) => l.split(delim).map((c) => c.trim().replace(/^"|"$/g, ''))

  const first = split(lines[0]).map((c) => c.toLowerCase())
  const hasHeader = first[0] === 'nama' || first[0] === 'name' || first[0] === 'nama peserta'
  const seen = new Set<string>()

  const body = lines.slice(hasHeader ? 1 : 0)
  for (let i = 0; i < body.length; i++) {
    const c = split(body[i])
    const name = c[0]
    const row = i + 1 + (hasHeader ? 1 : 0)
    const email = c[3] || null
    const key = (c[1] || name).toLowerCase()
    if (!name) errors.push(`Baris ${row}: nama kosong.`)
    else if (email && !/^\S+@\S+\.\S+$/.test(email)) errors.push(`Baris ${row} (${name}): format email tidak valid.`)
    else if (seen.has(key)) errors.push(`Baris ${row} (${name}): duplikat dalam daftar yang ditempel.`)
    else {
      seen.add(key)
      items.push({ name, identifier: c[1] || null, institution: c[2] || null, email, phone: c[4] || null })
    }
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
