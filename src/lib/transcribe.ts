/**
 * Ubah rekaman suara menjadi teks memakai pengenalan suara bawaan browser (gratis, tanpa API key).
 * Chrome 139 ke atas: rekaman dialirkan sebagai trek audio, tanpa suara dari speaker. Browser lain yang punya pengenalan suara:
 * cara cadangan, rekaman diputar lewat speaker dan didengarkan mikrofon. Berjalan selama durasi rekaman.
 */
import { startDictation, trackSpeechSupported, type SpeechFailure } from './speech'

export interface TranscribeHandlers {
  onFinal: (text: string) => void
  onInterim: (text: string) => void
  /** detik yang sudah diproses */
  onProgress: (seconds: number) => void
  /** selesai (rekaman habis atau dihentikan) */
  onDone: () => void
  onFail: (why: SpeechFailure) => void
}

export interface TranscribeJob { stop: () => void; viaMic: boolean }

export function transcribeBlob(blob: Blob, h: TranscribeHandlers, lang = 'id-ID'): TranscribeJob | null {
  const viaMic = !trackSpeechSupported()
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  audio.preload = 'auto'
  let ctx: AudioContext | null = null
  let track: MediaStreamTrack | undefined
  let finished = false
  let tick: ReturnType<typeof setInterval> | undefined
  let tail: ReturnType<typeof setTimeout> | undefined
  let dict: { stop: () => void } | null = null

  const cleanup = () => {
    clearInterval(tick); clearTimeout(tail)
    audio.pause(); audio.removeAttribute('src'); audio.load()
    URL.revokeObjectURL(url)
    void ctx?.close().catch(() => undefined)
  }
  const end = (fail?: SpeechFailure) => {
    if (finished) return
    finished = true
    dict?.stop()
    cleanup()
    if (fail) h.onFail(fail)
    h.onDone()
  }

  if (!viaMic) {
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      ctx = new AC()
      void ctx.resume()
      const dest = ctx.createMediaStreamDestination()
      ctx.createMediaElementSource(audio).connect(dest)     // tidak disambung ke speaker: diam
      track = dest.stream.getAudioTracks()[0]
    } catch { cleanup(); h.onFail('lain'); return null }
  }

  dict = startDictation({
    onFinal: h.onFinal,
    onInterim: h.onInterim,
    onFail: (why) => end(why),
  }, lang, { track })
  if (!dict) { cleanup(); return null }

  audio.onended = () => { tail = setTimeout(() => end(), 2000) }   // beri waktu hasil terakhir diterima
  audio.onerror = () => end('lain')
  tick = setInterval(() => h.onProgress(Math.floor(audio.currentTime)), 500)
  void audio.play().catch(() => end('lain'))
  return { stop: () => end(), viaMic }
}
