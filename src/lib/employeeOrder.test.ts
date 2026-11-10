import { describe, expect, it } from 'vitest'
import { employeeRanks, orderByEmployees } from './employeeOrder'

const E = (id: string, name: string, sort_order: number | null = null) => ({ id, name, sort_order })

describe('urutan mengikuti Data pegawai', () => {
  it('employeeRanks: yang diatur dulu, sisanya abjad, mulai dari 1', () => {
    const r = employeeRanks([E('a', 'Andi'), E('b', 'Budi', 2), E('c', 'Citra', 1), E('d', 'Dewi')])
    expect([r.get('c'), r.get('b'), r.get('a'), r.get('d')]).toEqual([1, 2, 3, 4])
  })
  it('orderByEmployees: menurut peringkat pegawai, tanpa tautan pegawai di akhir', () => {
    const ranks = employeeRanks([E('a', 'Andi', 3), E('b', 'Budi', 1), E('c', 'Citra', 2)])
    const people = [
      { employee_id: 'a', name: 'Andi' }, { employee_id: null, name: 'Zed' }, { employee_id: 'b', name: 'Budi' }, { employee_id: 'c', name: 'Citra' }, { employee_id: null, name: 'Aman' },
    ]
    expect(orderByEmployees(people, ranks).map((p) => p.name)).toEqual(['Budi', 'Citra', 'Andi', 'Aman', 'Zed'])
  })
})
