import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && key)

// createClient melempar error jika URL kosong, jadi pakai placeholder agar layar
// "belum dikonfigurasi" tetap bisa ditampilkan.
export const supabase = createClient(url || 'http://localhost:54321', key || 'not-configured', {
  auth: { persistSession: true, autoRefreshToken: true },
})

export function errMsg(e: unknown): string {
  if (!e) return 'Terjadi kesalahan.'
  if (typeof e === 'string') return e
  if (typeof e === 'object' && 'message' in e) {
    const m = String((e as { message: unknown }).message)
    if (/failed to fetch|networkerror|load failed/i.test(m)) return 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.'
    return m
  }
  return 'Terjadi kesalahan.'
}

/** Memanggil RPC dan melempar Error berpesan Indonesia bila gagal. */
export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(errMsg(error))
  return data as T
}

/** Mengambil semua baris (PostgREST membatasi 1000 baris per permintaan). Query harus punya order() yang stabil. */
export async function fetchAll<T>(
  query: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const size = 1000
  const out: T[] = []
  for (let from = 0; ; from += size) {
    const { data, error } = await query(from, from + size - 1)
    if (error) throw new Error(errMsg(error))
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < size) break
  }
  return out
}
