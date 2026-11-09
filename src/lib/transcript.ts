/** Pengolah transkrip rapat (suara → teks) untuk notula. Semua berjalan di browser, tanpa layanan berbayar. */

export interface Segment { text: string; /** waktu (ms sejak epoch) saat potongan ucapan selesai dikenali */ at: number }

const cap = (s: string) => s.charAt(0).toLocaleUpperCase('id-ID') + s.slice(1)

/** Satu potongan ucapan: rapikan spasi, huruf awal kapital, akhiri dengan titik. */
export function tidySegment(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t) return ''
  return /[.!?]$/.test(t) ? cap(t) : `${cap(t)}.`
}

/** Gabungkan potongan ucapan menjadi paragraf; jeda panjang antar-ucapan memulai paragraf baru. */
export function buildTranscript(segments: readonly Segment[], pauseMs = 8000): string {
  const paras: string[] = []
  let cur: string[] = []
  let last = 0
  for (const s of segments) {
    const t = tidySegment(s.text)
    if (!t) continue
    if (cur.length && s.at - last > pauseMs) { paras.push(cur.join(' ')); cur = [] }
    cur.push(t)
    last = s.at
  }
  if (cur.length) paras.push(cur.join(' '))
  return paras.join('\n\n')
}

/** Pecah teks menjadi kalimat (berdasarkan titik/tanda tanya/seru dan baris baru). */
export function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 2)
}

const DECISION = /\b(diputuskan|memutuskan|disepakati|menyepakati|sepakat|keputusan(?:nya)?|ditetapkan|menetapkan|disetujui|menyetujui|disimpulkan|kesimpulan(?:nya)?)\b/i
const FOLLOW = /\b(ditindaklanjuti|menindaklanjuti|tindak lanjut|ditugaskan|ditugasi|bertanggung jawab|penanggung jawab|paling lambat|selambat-lambatnya|batas waktu|tenggat|deadline|pic)\b/i
const AGENDA = /\b(agenda|membahas|pembahasan hari ini|topik)\b/i

const MONTHS = ['januari', 'februari', 'maret', 'april', 'mei', 'juni', 'juli', 'agustus', 'september', 'oktober', 'november', 'desember']
const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Tenggat dari kalimat: "15 November (2026)", "besok", "lusa", "minggu depan". Hasil yyyy-mm-dd atau ''. */
export function parseDue(sentence: string, ref: Date): string {
  const m = sentence.match(new RegExp(`(\\d{1,2})\\s+(${MONTHS.join('|')})(?:\\s+(\\d{4}))?`, 'i'))
  if (m) {
    const day = Number(m[1]), month = MONTHS.indexOf(m[2].toLowerCase())
    let year = m[3] ? Number(m[3]) : ref.getFullYear()
    let d = new Date(year, month, day)
    if (!m[3] && d < new Date(ref.getFullYear(), ref.getMonth(), ref.getDate())) { year++; d = new Date(year, month, day) } // tanpa tahun & sudah lewat → tahun depan
    return d.getMonth() === month && d.getDate() === day ? iso(d) : ''
  }
  const plus = (n: number) => { const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + n); return iso(d) }
  if (/\bbesok\b/i.test(sentence)) return plus(1)
  if (/\blusa\b/i.test(sentence)) return plus(2)
  if (/\bminggu depan\b/i.test(sentence)) return plus(7)
  return ''
}

const TITLES = new Set(['bapak', 'ibu', 'pak', 'bu', 'sdr', 'sdr.', 'saudara', 'saudari', 'bagian', 'bidang', 'tim', 'seksi', 'subbag', 'kepala', 'panitera', 'sekretaris', 'ketua', 'hakim', 'panmud', 'kasubbag', 'kabag'])
const STOP = new Set(['untuk', 'agar', 'supaya', 'dan', 'yang', 'paling', 'selambat-lambatnya', 'sebelum', 'pada', 'di', 'dengan', 'guna', 'harap', 'mohon', 'segera', 'dalam', 'akan', 'untuk.', 'atau', 'serta', 'tanggal', 'besok', 'lusa', 'minggu'])
const TRIGGER = /(?:oleh|kepada|dikoordinir(?:\s+oleh)?|dikoordinasikan(?:\s+oleh)?|pic|penanggung jawab(?:nya)?|ditugaskan(?:\s+(?:kepada|ke))?|ditugasi|bertanggung jawab(?:\s+(?:adalah|ialah))?)\s*[:\-]?\s+/gi

const titleCase = (s: string) => s.split(' ').map((w) => cap(w.toLocaleLowerCase('id-ID'))).join(' ')

/** Penanggung jawab dari kalimat: kata sapaan/jabatan setelah "oleh/kepada/PIC/…" + maksimal dua kata berikutnya. */
export function parsePic(sentence: string): string {
  TRIGGER.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = TRIGGER.exec(sentence))) {
    const words = sentence.slice(m.index + m[0].length).split(/\s+/).map((w) => w.replace(/[,;.]+$/, ''))
    if (!words.length || !TITLES.has(words[0].toLowerCase())) continue
    const out = [words[0]]
    for (const w of words.slice(1)) {
      if (!w || out.length >= 3 || STOP.has(w.toLowerCase()) || /^\d/.test(w)) break
      out.push(w)
    }
    return titleCase(out.join(' '))
  }
  return ''
}

export interface TranscriptSuggestion {
  agenda: string[]
  decisions: string[]
  followUps: { task: string; pic: string; due: string }[]
}

const clean = (s: string) => cap(s.replace(/\s+/g, ' ').trim().replace(/[.]+$/, ''))

/**
 * Saran isian notula dari transkrip, berbasis kata kunci (bukan AI): kalimat yang mengandung "diputuskan/disepakati/…"
 * menjadi saran keputusan; yang mengandung "ditugaskan/paling lambat/tindak lanjut/…" menjadi saran tindak lanjut
 * (penanggung jawab dan tenggat dicoba dikenali). Selalu tinjau dulu sebelum dipakai.
 */
export function suggestFromTranscript(text: string, ref = new Date()): TranscriptSuggestion {
  const sentences = splitSentences(text)
  const seen = new Set<string>()
  const uniq = (xs: string[]) => xs.filter((x) => { const k = x.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true })
  const agenda = uniq(sentences.filter((s) => AGENDA.test(s)).slice(0, 3).map(clean))
  seen.clear()
  const decisions = uniq(sentences.filter((s) => DECISION.test(s)).map(clean))
  seen.clear()
  const followUps = sentences.filter((s) => FOLLOW.test(s)).map((s) => ({ task: clean(s), pic: parsePic(s), due: parseDue(s, ref) }))
    .filter((f) => { const k = f.task.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true })
  return { agenda, decisions, followUps }
}

/** Tambahkan teks ke isian yang sudah ada (dipisah baris kosong); isian kosong langsung diisi. */
export const appendBlock = (existing: string, add: string) => (existing.trim() ? `${existing.replace(/\s+$/, '')}\n\n${add.trim()}` : add.trim())
/** Tambahkan butir-butir bernomor lanjutan ke isian yang sudah ada. */
export function appendLines(existing: string, lines: readonly string[]): string {
  const base = existing.replace(/\s+$/, '')
  const start = base ? base.split('\n').filter((l) => l.trim()).length : 0
  const add = lines.map((l, i) => `${start + i + 1}. ${l}`).join('\n')
  return base ? `${base}\n${add}` : add
}
