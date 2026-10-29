/* Kamera & lokasi untuk absensi: izin, pengambilan, dan pesan galat yang membantu. */

export type PermState = 'prompt' | 'granted' | 'denied' | 'unknown'
export type CaptureCode = 'denied' | 'unavailable' | 'timeout' | 'unsupported' | 'insecure' | 'busy'

export class CaptureError extends Error {
  constructor(public code: CaptureCode, message: string) { super(message) }
}

export interface Fix { lat: number; lng: number; accuracy: number }

const HOW_TO = 'Ketuk ikon gembok/pengaturan di sebelah alamat halaman, izinkan akses, lalu coba lagi.'

/** Status izin bila browser mendukung Permissions API; jika tidak, 'unknown' (izin baru ditanyakan saat dipakai). */
export async function queryPermission(name: 'geolocation' | 'camera'): Promise<PermState> {
  try {
    const r = await navigator.permissions.query({ name: name as PermissionName })
    return r.state as PermState
  } catch { return 'unknown' }
}

const insecure = () => typeof window !== 'undefined' && window.isSecureContext === false

/** Ambil lokasi saat ini. Melempar CaptureError dengan pesan berbahasa Indonesia. */
export function getPosition(timeoutMs = 20000): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (insecure()) return reject(new CaptureError('insecure', 'Lokasi hanya bisa dibaca bila halaman dibuka lewat HTTPS. Buka link dari alamat yang aman (https://).'))
    if (!('geolocation' in navigator)) return reject(new CaptureError('unsupported', 'Perangkat atau browser ini tidak mendukung pembacaan lokasi.'))
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => {
        if (e.code === e.PERMISSION_DENIED) reject(new CaptureError('denied', `Izin lokasi ditolak. ${HOW_TO} Pastikan juga GPS/lokasi perangkat menyala.`))
        else if (e.code === e.TIMEOUT) reject(new CaptureError('timeout', 'Lokasi tidak terbaca tepat waktu. Pastikan GPS menyala dan sinyal baik, lalu coba lagi.'))
        else reject(new CaptureError('unavailable', 'Lokasi tidak tersedia. Aktifkan GPS/layanan lokasi perangkat, lalu coba lagi.'))
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    )
  })
}

/** Buka kamera depan (selfie). Melempar CaptureError dengan pesan berbahasa Indonesia. */
export async function startCamera(): Promise<MediaStream> {
  if (insecure()) throw new CaptureError('insecure', 'Kamera hanya bisa dipakai bila halaman dibuka lewat HTTPS. Buka link dari alamat yang aman (https://).')
  if (!navigator.mediaDevices?.getUserMedia) throw new CaptureError('unsupported', 'Perangkat atau browser ini tidak mendukung kamera. Coba browser lain (Chrome/Safari terbaru).')
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false,
    })
  } catch (e) {
    const name = (e as { name?: string }).name
    if (name === 'NotAllowedError' || name === 'SecurityError') throw new CaptureError('denied', `Izin kamera ditolak. ${HOW_TO}`)
    if (name === 'NotFoundError' || name === 'OverconstrainedError') throw new CaptureError('unavailable', 'Kamera tidak ditemukan di perangkat ini.')
    if (name === 'NotReadableError' || name === 'AbortError') throw new CaptureError('busy', 'Kamera sedang dipakai aplikasi lain. Tutup aplikasi tersebut lalu coba lagi.')
    throw new CaptureError('unavailable', 'Kamera tidak dapat dibuka. Coba lagi atau muat ulang halaman.')
  }
}

export const stopStream = (s: MediaStream | null | undefined) => s?.getTracks().forEach((t) => t.stop())

/** Ukuran akhir (px) agar sisi terpanjang <= max, dengan menjaga rasio. */
export function fitSize(w: number, h: number, max: number): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h))
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }
}

/**
 * Tangkap bingkai video menjadi JPEG terkompresi (sisi terpanjang <= maxSide, ukuran <= maxBytes).
 * Gambar disimpan apa adanya (tidak dicerminkan) meskipun pratinjau layar dicerminkan.
 */
export async function captureSelfie(video: HTMLVideoElement, maxSide = 720, maxBytes = 450 * 1024): Promise<Blob> {
  const { w, h } = fitSize(video.videoWidth, video.videoHeight, maxSide)
  if (!video.videoWidth) throw new CaptureError('unavailable', 'Kamera belum siap. Tunggu sebentar lalu ambil foto lagi.')
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(video, 0, 0, w, h)
  for (const q of [0.78, 0.68, 0.58, 0.48]) {
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', q))
    if (blob && blob.size <= maxBytes) return blob
    if (blob && q === 0.48) return blob
  }
  throw new CaptureError('unavailable', 'Gagal memproses foto.')
}

/** Tautan peta untuk koordinat. */
export const mapsUrl = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`
export const fmtCoord = (lat: number, lng: number) => `${lat.toFixed(5)}, ${lng.toFixed(5)}`
export const fmtAccuracy = (m: number | null | undefined) => (m == null ? '' : m < 1000 ? `±${Math.round(m)} m` : `±${(m / 1000).toFixed(1)} km`)
