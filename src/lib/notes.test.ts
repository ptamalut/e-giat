import { describe, expect, it } from 'vitest'
import { attendeesText, cleanFollowUps, bodyToSections, cleanSections, emptyNote, flattenSections, noteBody, followUpProgress, newItem, newSection, newSub, noteSections, outlineText, overdue, parseOutline, sectionLetter } from './notes'

const F = (task: string, over: Partial<{ done: boolean; due: string; pic: string }> = {}) => ({ id: task, task, pic: '', due: '', done: false, ...over })

describe('notula', () => {
  it('cleanFollowUps membuang baris tanpa tugas dan merapikan spasi', () => {
    expect(cleanFollowUps([F('  Kirim laporan '), F('   '), F('', {})])).toEqual([{ id: '  Kirim laporan ', task: 'Kirim laporan', pic: '', due: '', done: false }])
  })
  it('followUpProgress menghitung yang selesai', () => {
    expect(followUpProgress([F('a', { done: true }), F('b')])).toEqual({ done: 1, total: 2, label: '1/2 selesai' })
    expect(followUpProgress([]).label).toBe('tanpa tindak lanjut')
  })
  it('overdue hanya untuk yang belum selesai dan lewat tenggat', () => {
    expect(overdue(F('a', { due: '2026-01-01' }), '2026-02-01')).toBe(true)
    expect(overdue(F('a', { due: '2026-01-01', done: true }), '2026-02-01')).toBe(false)
    expect(overdue(F('a', { due: '2026-03-01' }), '2026-02-01')).toBe(false)
    expect(overdue(F('a'), '2026-02-01')).toBe(false)
  })
  it('attendeesText memberi nomor dan satker', () => {
    expect(attendeesText([{ name: 'Budi', institution: 'Dinas A' }, { name: 'Siti' }])).toBe('1. Budi (Dinas A)\n2. Siti')
  })
})

describe('format notula: bagian dan butir', () => {
  it('huruf bagian A, B, C …', () => {
    expect([0, 1, 25, 26].map(sectionLetter)).toEqual(['A', 'B', 'Z', '27'])
  })
  it('notula baru: tanpa kerangka bagian (satu narasi kosong)', () => {
    expect(emptyNote(null).sections).toEqual([])
    expect(noteBody({ sections: [], discussion: null, decisions: null, follow_ups: [] })).toEqual({ text: '', items: [] })
  })
  it('bodyToSections: satu bagian tanpa judul; kosong bila narasi dan butir kosong', () => {
    expect(bodyToSections({ text: '  ', items: [] })).toEqual([])
    const [sec] = bodyToSections({ text: ' Narasi \n\nKedua ', items: [newItem('', 'butir')] })
    expect(sec).toMatchObject({ type: 'teks', title: '', intro: 'Narasi \n\nKedua' }); expect(sec.items).toHaveLength(1)
  })
  it('flattenSections: notula lama berbagian diratakan (judul tebal pada narasi, butir dikumpulkan, tabel dilewati)', () => {
    const body = flattenSections([
      newSection('teks', 'Pembukaan', 'Rapat dibuka.', [newItem('', 'a')]),
      newSection('teks', '', 'Tanpa judul.'),
      newSection('tindak_lanjut', 'Tindak lanjut', 'Disepakati:'),
      newSection('teks', 'Penutup', '', [newItem('', 'b')]),
    ])
    expect(body.text).toBe('**Pembukaan**\nRapat dibuka.\n\nTanpa judul.\n\n**Penutup**')
    expect(body.items.map((i) => i.text)).toEqual(['a', 'b'])
  })
  it('parseOutline: butir, anak butir, sambungan baris, judul tebal', () => {
    const items = parseOutline('1. **Struktur kepanitiaan.** Panitia terdiri atas SC dan OC;\n2. Perbaikan SK Panitia:\n   a. Klarifikasi nama rangkap;\n   b. Hapus jabatan Bendahara\n      apabila tidak ada dana;\n3. Peserta luring.')
    expect(items.map((i) => [i.lead, i.text, i.subs.length])).toEqual([
      ['Struktur kepanitiaan', 'Panitia terdiri atas SC dan OC;', 0],
      ['Perbaikan SK Panitia:', '', 2],      // butir beranak tanpa judul tebal: teksnya menjadi judul
      ['', 'Peserta luring.', 0],
    ])
    expect(items[1].subs.map((x) => x.text)).toEqual(['Klarifikasi nama rangkap;', 'Hapus jabatan Bendahara apabila tidak ada dana;'])
  })
  it('parseOutline: teks tanpa nomor menjadi satu butir; kosong tidak menghasilkan apa-apa', () => {
    expect(parseOutline('Hanya satu kalimat.').map((i) => i.text)).toEqual(['Hanya satu kalimat.'])
    expect(parseOutline(' \n\n')).toEqual([])
    expect(parseOutline('a. anak tanpa induk').map((i) => i.text)).toEqual(['a. anak tanpa induk'])
  })
  it('outlineText kebalikan parseOutline', () => {
    const items = [newItem('Judul', 'isi', [newSub('', 'anak satu'), newSub('Tebal', 'anak dua')]), newItem('', 'butir dua')]
    const back = parseOutline(outlineText(items))
    expect(back.map((i) => [i.lead, i.text, i.subs.map((s) => [s.lead, s.text])])).toEqual([
      ['Judul', 'isi', [['', 'anak satu'], ['Tebal', 'anak dua']]],
      ['', 'butir dua', []],
    ])
  })
  it('cleanSections membuang butir kosong dan merapikan spasi', () => {
    const out = cleanSections([
      newSection('teks', '  Pembukaan ', '  ', [newItem('', '  '), newItem(' L ', ' t ', [newSub('', ''), newSub('', ' a ')])]),
      newSection('teks', '', '', [newItem()]),               // kosong seluruhnya: dibuang
      newSection('tindak_lanjut', 'Tindak lanjut'),
    ])
    expect(out).toHaveLength(2)
    expect(out[0].title).toBe('Pembukaan'); expect(out[0].intro).toBe('')
    expect(out[0].items).toHaveLength(1)
    expect(out[0].items[0]).toMatchObject({ lead: 'L', text: 't' })
    expect(out[0].items[0].subs.map((s) => s.text)).toEqual(['a'])
    expect(out[1].type).toBe('tindak_lanjut')
  })
  it('noteSections: memakai bagian tersimpan; notula lama diturunkan; kosong -> kerangka bawaan', () => {
    const saved = [newSection('teks', 'A')]
    expect(noteSections({ sections: saved, discussion: 'x', decisions: null, follow_ups: [] })).toBe(saved)
    const old = noteSections({ sections: [], discussion: 'Satu.\n\nDua.', decisions: '1. Setuju\n- Lanjut', follow_ups: [F('a')] })
    expect(old.map((x) => x.title)).toEqual(['Pembahasan', 'Keputusan dan Kesimpulan', 'Rencana Tindak Lanjut'])
    expect(old[1].items.map((i) => i.text)).toEqual(['Setuju', 'Lanjut'])
    expect(noteSections({ sections: [], discussion: null, decisions: null, follow_ups: [] })).toEqual([])
    expect(noteSections({ sections: [], discussion: null, decisions: null, follow_ups: [F('a')] })).toEqual([])   // hanya tindak lanjut: tabelnya ditambahkan di dokumen
  })
})
