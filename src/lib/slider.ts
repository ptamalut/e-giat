/** Hitungan untuk slider horizontal (scroll-snap); semua ukuran dalam piksel. */

/** Toleransi (px) untuk dianggap sudah di ujung (pembulatan piksel dan padding). */
export const EDGE = 4

/** Jumlah "halaman" (sebanyak lebar tampilan yang muat). */
export const slidePages = (scrollWidth: number, clientWidth: number) => (clientWidth <= 0 ? 1 : Math.max(1, Math.ceil((scrollWidth - 1) / clientWidth)))

/** Halaman yang sedang tampil (0-based). Di ujung kanan selalu halaman terakhir. */
export function currentPage(scrollLeft: number, clientWidth: number, scrollWidth: number): number {
  const pages = slidePages(scrollWidth, clientWidth)
  if (scrollLeft + clientWidth >= scrollWidth - EDGE) return pages - 1
  return Math.min(pages - 1, Math.max(0, Math.round(scrollLeft / Math.max(1, clientWidth))))
}

/** Posisi gulir tujuan untuk geser maju/mundur; `wrap` kembali ke awal/akhir bila sudah di ujung. null = tidak bergerak. */
export function nextScrollLeft(scrollLeft: number, clientWidth: number, scrollWidth: number, dir: 1 | -1, wrap = false): number | null {
  const max = Math.max(0, scrollWidth - clientWidth)
  const step = Math.max(1, Math.round(clientWidth * 0.9))
  if (dir === 1) {
    if (scrollLeft >= max - EDGE) return wrap && max > 0 ? 0 : null
    return Math.min(max, scrollLeft + step)
  }
  if (scrollLeft <= EDGE) return wrap && max > 0 ? max : null
  return Math.max(0, scrollLeft - step)
}
