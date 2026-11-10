import { describe, expect, it } from 'vitest'
import { checkMaterialFile, cleanUrl, fileKind, fmtSize, hostOf, mimeOf, randomMaterialPath, titleFromFileName } from './materials'

describe('berkas materi', () => {
  it('tipe MIME dari tipe browser atau ekstensi', () => {
    expect(mimeOf({ name: 'a.pdf', type: 'application/pdf' })).toBe('application/pdf')
    expect(mimeOf({ name: 'slide.PPTX', type: '' })).toBe('application/vnd.openxmlformats-officedocument.presentationml.presentation')
    expect(mimeOf({ name: 'x.zip', type: 'application/x-zip-compressed' })).toBe('application/zip')
    expect(mimeOf({ name: 'virus.exe', type: 'application/x-msdownload' })).toBeNull()
    expect(mimeOf({ name: 'noext', type: '' })).toBeNull()
  })
  it('pemeriksaan jenis dan ukuran', () => {
    expect(checkMaterialFile({ name: 'a.pdf', type: 'application/pdf', size: 1000 })).toBeNull()
    expect(checkMaterialFile({ name: 'a.exe', type: '', size: 10 })).toMatch(/tidak didukung/)
    expect(checkMaterialFile({ name: 'a.pdf', type: 'application/pdf', size: 51 * 1024 * 1024 })).toMatch(/50 MB/)
    expect(checkMaterialFile({ name: 'a.pdf', type: 'application/pdf', size: 0 })).toMatch(/kosong/)
  })
  it('golongan berkas', () => {
    expect(fileKind('tautan', null)).toBe('tautan')
    expect(fileKind('berkas', 'application/pdf')).toBe('pdf')
    expect(fileKind('berkas', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')).toBe('slide')
    expect(fileKind('berkas', 'application/vnd.ms-powerpoint')).toBe('slide')
    expect(fileKind('berkas', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('sheet')
    expect(fileKind('berkas', 'application/msword')).toBe('word')
    expect(fileKind('berkas', 'image/png')).toBe('image')
    expect(fileKind('berkas', 'application/zip')).toBe('arsip')
    expect(fileKind('berkas', null)).toBe('lain')
  })
  it('ukuran dan judul awal', () => {
    expect(fmtSize(500)).toBe('500 B'); expect(fmtSize(340 * 1024)).toBe('340 KB'); expect(fmtSize(1.5 * 1024 * 1024)).toBe('1,5 MB'); expect(fmtSize(null)).toBe('')
    expect(titleFromFileName('Materi_Analisis-Jabatan  v2.pptx')).toBe('Materi Analisis - Jabatan v2')
    expect(titleFromFileName('.pdf')).toBe('.pdf')
  })
  it('path acak memuat id kegiatan dan ekstensi', () => {
    expect(randomMaterialPath('a1', 'Modul 1.PDF')).toMatch(/^a1\/[0-9a-f]{32}\.pdf$/)
    expect(randomMaterialPath('a1', 'tanpa-ekstensi')).toMatch(/^a1\/[0-9a-f]{32}$/)
  })
  it('tautan: hanya http/https', () => {
    expect(cleanUrl(' drive.google.com/x ')).toBe('https://drive.google.com/x')
    expect(cleanUrl('http://a.id')).toBe('http://a.id/')
    expect(cleanUrl('javascript:alert(1)')).toBeNull()
    expect(cleanUrl('ftp://a.id')).toBeNull()
    expect(cleanUrl('')).toBeNull()
    expect(hostOf('https://www.drive.google.com/a')).toBe('drive.google.com')
  })
})
