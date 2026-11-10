import { sortPeople } from './satker'

/** Peringkat tiap pegawai (mulai 1) menurut urutan di Data pegawai: yang sudah diatur dulu, sisanya abjad. */
export function employeeRanks(employees: readonly { id: string; name: string; sort_order: number | null }[]): Map<string, number> {
  return new Map(sortPeople(employees).map((e, i) => [e.id, i + 1]))
}

/**
 * Urutkan peserta kegiatan seperti Data pegawai: yang berasal dari pegawai menurut peringkatnya;
 * yang tidak tertaut ke pegawai menyusul menurut abjad.
 */
export function orderByEmployees<T extends { employee_id: string | null; name: string }>(participants: readonly T[], ranks: ReadonlyMap<string, number>): T[] {
  const rank = (p: T) => (p.employee_id ? ranks.get(p.employee_id) : undefined) ?? Infinity
  return [...participants].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'id', { sensitivity: 'base' }))
}
