import { Award, BarChart3, CalendarCheck, ClipboardList, Images, LayoutDashboard, NotebookPen, Users, type LucideIcon } from 'lucide-react'
import type { MenuKey } from '../../lib/menus'

export interface ActivityNavItem { to: string; label: string; icon: LucideIcon; end?: boolean; menu?: MenuKey }

const ALL: ActivityNavItem[] = [
  { to: '', label: 'Ringkasan', icon: LayoutDashboard, end: true },
  { to: 'peserta', label: 'Peserta', icon: Users },
  { to: 'absensi', label: 'Absensi', icon: CalendarCheck, menu: 'attendance' },
  { to: 'notula', label: 'Notula', icon: NotebookPen, menu: 'notes' },
  { to: 'kuis', label: 'Kuis', icon: ClipboardList, menu: 'quiz' },
  { to: 'sertifikat', label: 'Sertifikat', icon: Award, menu: 'certificate' },
  { to: 'dokumentasi', label: 'Dokumentasi', icon: Images, menu: 'documentation' },
  { to: 'laporan', label: 'Laporan', icon: BarChart3 },
]

/** Menu kegiatan yang tampil: Ringkasan, Peserta, dan Laporan selalu ada; sisanya mengikuti pengaturan kegiatan. */
export const activityNav = (enabled: MenuKey[]): ActivityNavItem[] => ALL.filter((i) => !i.menu || enabled.includes(i.menu))

