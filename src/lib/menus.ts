import type { Activity } from './types'

/** Menu yang bisa diaktifkan/dinonaktifkan per kegiatan. */
export type MenuKey = 'attendance' | 'notes' | 'quiz' | 'certificate' | 'documentation'

export interface MenuDef {
  key: MenuKey
  flag: 'enable_attendance' | 'enable_notes' | 'enable_quiz' | 'enable_certificate' | 'enable_documentation'
  /** segmen URL di bawah /admin/kegiatan/:id */
  route: string
  label: string
  hint: string
  /** kolom hak akses per orang pada tabel peserta */
  access: 'access_attendance' | 'access_notes' | 'access_quiz' | 'access_certificate' | 'access_documentation'
}

/** Urutan bawaan menu kegiatan. */
export const MENUS: MenuDef[] = [
  { key: 'attendance', flag: 'enable_attendance', route: 'absensi', label: 'Absensi', access: 'access_attendance',
    hint: 'Sesi absensi, link & QR pribadi, foto selfie dan lokasi.' },
  { key: 'notes', flag: 'enable_notes', route: 'notula', label: 'Notula', access: 'access_notes',
    hint: 'Catatan hasil rapat/sesi: pembahasan, keputusan, dan tindak lanjut (peserta hanya melihat yang Final).' },
  { key: 'quiz', flag: 'enable_quiz', route: 'kuis', label: 'Kuis', access: 'access_quiz',
    hint: 'Pre test / post test berwaktu, hasil, dan peringkat.' },
  { key: 'certificate', flag: 'enable_certificate', route: 'sertifikat', label: 'Sertifikat', access: 'access_certificate',
    hint: 'Unggah sertifikat per orang dan buka unduhannya.' },
  { key: 'documentation', flag: 'enable_documentation', route: 'dokumentasi', label: 'Dokumentasi', access: 'access_documentation',
    hint: 'Foto kegiatan dan tautan video/dokumen, dikelompokkan per album.' },
]

export const menuOn = (a: Pick<Activity, MenuDef['flag']>, key: MenuKey) =>
  a[MENUS.find((m) => m.key === key)!.flag]

/** Kunci menu yang aktif pada sebuah kegiatan. */
export const enabledMenus = (a: Pick<Activity, MenuDef['flag']>): MenuKey[] => MENUS.filter((m) => a[m.flag]).map((m) => m.key)

/** Menu dari segmen URL (mis. "kuis" atau "kuis/abc"); undefined bila bukan menu yang bisa dinonaktifkan. */
export const menuOfPath = (segment: string): MenuDef | undefined => MENUS.find((m) => m.route === segment.split('/')[0])

/** Menu yang aktif pada kegiatan, urut menurut urutan bawaan (dasar daftar hak akses per orang). */
export const activeMenus = (a: Pick<Activity, MenuDef['flag']>): MenuDef[] => MENUS.filter((m) => a[m.flag])
