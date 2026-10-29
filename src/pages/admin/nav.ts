import { Award, BarChart3, CalendarCheck, ClipboardList, LayoutDashboard, Users, type LucideIcon } from 'lucide-react'

export interface ActivityNavItem { to: string; label: string; icon: LucideIcon; end?: boolean }

export const ACTIVITY_NAV: ActivityNavItem[] = [
  { to: '', label: 'Ringkasan', icon: LayoutDashboard, end: true },
  { to: 'peserta', label: 'Peserta', icon: Users },
  { to: 'absensi', label: 'Absensi', icon: CalendarCheck },
  { to: 'kuis', label: 'Kuis', icon: ClipboardList },
  { to: 'sertifikat', label: 'Sertifikat', icon: Award },
  { to: 'laporan', label: 'Laporan', icon: BarChart3 },
]
