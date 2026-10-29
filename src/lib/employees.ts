import { normalizeNip } from './parsers'

interface Keyed { name: string; identifier: string | null }

const nameKey = (n: string) => n.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
const nipKey = (v: string | null | undefined) => normalizeNip(v ?? '')

/**
 * Pisahkan data masuk menjadi yang baru dan yang sudah ada (dilewati).
 * Dianggap sudah ada bila NIP-nya sama; atau bila salah satunya tidak punya NIP dan namanya sama
 * (dua orang bernama sama dengan NIP berbeda tetap dianggap orang yang berbeda).
 */
export function splitKnown<T extends Keyed>(existing: readonly Keyed[], incoming: readonly T[]): { fresh: T[]; skipped: T[] } {
  const nips = new Set(existing.map((e) => nipKey(e.identifier)).filter(Boolean))
  const namesWithoutNip = new Set(existing.filter((e) => !nipKey(e.identifier)).map((e) => nameKey(e.name)))
  const namesWithNip = new Set(existing.filter((e) => nipKey(e.identifier)).map((e) => nameKey(e.name)))
  const fresh: T[] = [], skipped: T[] = []
  for (const it of incoming) {
    const nip = nipKey(it.identifier), name = nameKey(it.name)
    const known = nip ? nips.has(nip) || namesWithoutNip.has(name) : namesWithNip.has(name) || namesWithoutNip.has(name)
    if (known) skipped.push(it)
    else {
      fresh.push(it)
      // yang baru ditambahkan juga dihitung agar kembar dalam satu gelombang tidak lolos
      if (nip) nips.add(nip)
      ;(nip ? namesWithNip : namesWithoutNip).add(name)
    }
  }
  return { fresh, skipped }
}

