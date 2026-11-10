/** Pembungkus pengenalan suara bawaan browser (Web Speech API): gratis, tanpa API key. */

interface RecognitionAlternative { transcript: string }
interface RecognitionResult { isFinal: boolean; length: number; [i: number]: RecognitionAlternative }
interface RecognitionEvent { resultIndex: number; results: { length: number; [i: number]: RecognitionResult } }
interface Recognition {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number
  onresult: ((e: RecognitionEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(track?: MediaStreamTrack): void; stop(): void; abort(): void
}
type RecognitionCtor = new () => Recognition

const ctor = (): RecognitionCtor | null => {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export const speechSupported = () => typeof window !== 'undefined' && ctor() !== null

/**
 * Apakah pengenalan suara bisa menerima trek audio langsung (Chrome 139 ke atas), sehingga rekaman bisa diubah ke teks
 * tanpa diputar lewat speaker. Dideteksi dari fungsi statis `available` yang hadir bersamaan dengan fitur itu.
 */
export const trackSpeechSupported = () => {
  const c = typeof window !== 'undefined' ? (ctor() as unknown as { available?: unknown } | null) : null
  return !!c && typeof c.available === 'function'
}

export type SpeechFailure = 'izin' | 'mikrofon' | 'jaringan' | 'tidak-didukung' | 'lain'

export const SPEECH_FAILURE_TEXT: Record<SpeechFailure, string> = {
  izin: 'Izin mikrofon ditolak. Klik ikon gembok di address bar → izinkan Mikrofon, lalu coba lagi.',
  mikrofon: 'Mikrofon tidak ditemukan atau sedang dipakai aplikasi lain.',
  jaringan: 'Layanan pengenalan suara browser tidak bisa dihubungi. Periksa koneksi internet lalu coba lagi.',
  'tidak-didukung': 'Browser ini belum mendukung pengenalan suara. Gunakan Google Chrome atau Microsoft Edge (komputer atau Android).',
  lain: 'Perekaman berhenti karena kesalahan pada pengenalan suara. Coba lagi.',
}

export interface DictationHandlers {
  /** potongan ucapan yang sudah final */
  onFinal: (text: string) => void
  /** ucapan yang sedang dikenali (belum final); string kosong bila tidak ada */
  onInterim: (text: string) => void
  /** perekaman berhenti sendiri karena kesalahan */
  onFail: (why: SpeechFailure) => void
}

export interface Dictation { stop: () => void }

/**
 * Mulai mendengarkan terus-menerus. Chrome menghentikan pengenalan setelah hening beberapa detik; fungsi ini
 * otomatis memulai lagi sampai `stop()` dipanggil. Mengembalikan null bila browser tidak mendukung.
 */
export function startDictation(h: DictationHandlers, lang = 'id-ID', opts: { track?: MediaStreamTrack } = {}): Dictation | null {
  const Ctor = ctor()
  if (!Ctor) { h.onFail('tidak-didukung'); return null }
  let wanted = true
  let restarts: number[] = []
  let rec: Recognition | null = null

  const fail = (why: SpeechFailure) => { wanted = false; h.onInterim(''); h.onFail(why) }

  const begin = () => {
    rec = new Ctor()
    rec.lang = lang
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 1
    rec.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        const text = r[0]?.transcript ?? ''
        if (r.isFinal) { if (text.trim()) h.onFinal(text) } else interim += text
      }
      h.onInterim(interim)
    }
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') fail('izin')
      else if (e.error === 'audio-capture') fail('mikrofon')
      else if (e.error === 'network') fail('jaringan')
      else if (e.error !== 'no-speech' && e.error !== 'aborted') fail('lain')
    }
    rec.onend = () => {
      h.onInterim('')
      if (!wanted || opts.track?.readyState === 'ended') return
      // mulai lagi; bila terus gagal dalam waktu singkat, berhenti agar tidak berputar tanpa akhir
      const now = Date.now()
      restarts = restarts.filter((t) => now - t < 5000)
      restarts.push(now)
      if (restarts.length > 6) return fail('lain')
      setTimeout(() => { if (wanted) { try { begin() } catch { fail('lain') } } }, 200)
    }
    if (opts.track) rec.start(opts.track); else rec.start()
  }
  try { begin() } catch { fail('lain'); return null }
  return { stop: () => { wanted = false; try { rec?.stop() } catch { /* sudah berhenti */ } } }
}
