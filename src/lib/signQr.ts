import QRCode from 'qrcode'

/** Alamat verifikasi tanda tangan elektronik untuk sebuah kode (`base` = alamat aplikasi, mis. location.origin). */
export const signUrl = (base: string, code: string) => `${base.replace(/\/+$/, '')}/v/${code}`

/** Kode dari alamat verifikasi, atau null bila bukan alamat verifikasi. */
export function codeFromUrl(url: string): string | null {
  const m = url.match(/\/v\/([0-9a-f]{32})(?:[/?#]|$)/)
  return m ? m[1] : null
}

/** QR (PNG, data URL) untuk sebuah alamat; kecil dan tanpa margin lebar agar muat di kolom tanda tangan. */
export const qrDataUrl = (url: string, px = 220) => QRCode.toDataURL(url, { margin: 1, width: px, errorCorrectionLevel: 'M' })

/** Byte PNG dari data URL base64. */
export function dataUrlBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Buat QR untuk banyak alamat sekaligus (tanpa duplikat): alamat -> data URL. */
export async function qrMap(urls: Iterable<string | null | undefined>): Promise<Map<string, string>> {
  const uniq = [...new Set([...urls].filter((u): u is string => !!u))]
  const imgs = await Promise.all(uniq.map((u) => qrDataUrl(u)))
  return new Map(uniq.map((u, i) => [u, imgs[i]]))
}

export const SIGN_NOTE = 'Tanda tangan elektronik: pindai kode QR pada kolom Tanda Tangan untuk memeriksa keaslian kehadiran.'
