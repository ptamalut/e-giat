import { describe, expect, it } from 'vitest'
import { splitKnown } from './employees'

const E = (name: string, identifier: string | null = null) => ({ name, identifier })

describe('splitKnown (pegawai yang sudah ada dilewati)', () => {
  const existing = [E('Dr. Budi Santoso, M.Si.', '198001012005011001'), E('Siti Aminah, S.E.', null)]

  it('NIP sama dilewati walau penulisan nama berbeda', () => {
    const r = splitKnown(existing, [E('Budi Santoso', '1980 0101 2005 0110 01'), E('Rina', '199001012015012001')])
    expect(r.skipped.map((x) => x.name)).toEqual(['Budi Santoso'])
    expect(r.fresh.map((x) => x.name)).toEqual(['Rina'])
  })
  it('data masuk tanpa NIP dilewati bila namanya sama dengan pegawai yang sudah ada (huruf besar/kecil, tanda baca, spasi diabaikan)', () => {
    const r = splitKnown(existing, [E('dr  budi santoso m.si', null), E('SITI AMINAH S.E', null)])
    expect(r.fresh).toEqual([])
    expect(r.skipped).toHaveLength(2)
  })
  it('data masuk ber-NIP dilewati bila pegawai yang ada namanya sama tetapi belum punya NIP', () => {
    const r = splitKnown(existing, [E('Siti Aminah, S.E.', '198505052010012002')])
    expect(r.skipped).toHaveLength(1)
  })
  it('nama sama dengan NIP berbeda dianggap orang berbeda', () => {
    const r = splitKnown(existing, [E('Dr. Budi Santoso, M.Si.', '199999999999999999')])
    expect(r.fresh).toHaveLength(1)
  })
  it('kembar di dalam data masuk hanya lolos sekali', () => {
    const r = splitKnown([], [E('Andi', '198701012010011001'), E('Andi lain', '1987 0101 2010 0110 01'), E('Rudi'), E('rudi')])
    expect(r.fresh.map((x) => x.name)).toEqual(['Andi', 'Rudi'])
  })
})
