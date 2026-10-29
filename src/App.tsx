import { Compass } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import { Loading } from './components/ui'
import { isConfigured } from './lib/supabase'
import Login from './pages/Login'
import SetupNeeded from './pages/SetupNeeded'

// Bagian peserta & panitia dipisah agar halaman peserta (HP) tetap ringan.
const AdminShell = lazy(() => import('./pages/admin/AdminShell'))
const Dashboard = lazy(() => import('./pages/admin/Dashboard'))
const ActivityLayout = lazy(() => import('./pages/admin/ActivityLayout'))
const Overview = lazy(() => import('./pages/admin/Overview'))
const ParticipantsTab = lazy(() => import('./pages/admin/ParticipantsTab'))
const AttendanceTab = lazy(() => import('./pages/admin/AttendanceTab'))
const QuizzesTab = lazy(() => import('./pages/admin/QuizzesTab'))
const QuizEditor = lazy(() => import('./pages/admin/QuizEditor'))
const CertificatesTab = lazy(() => import('./pages/admin/CertificatesTab'))
const ReportsTab = lazy(() => import('./pages/admin/ReportsTab'))
const Portal = lazy(() => import('./pages/portal/Portal'))
const QuizRun = lazy(() => import('./pages/portal/QuizRun'))
const QuizResult = lazy(() => import('./pages/portal/QuizResult'))

function RequireAuth() {
  const { session, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <Loading />
  if (!session) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  return <Outlet />
}

function NotFound() {
  return (
    <div className="auth-wrap"><div className="card auth-card center">
      <div className="empty" style={{ padding: '8px 0' }}><div className="big"><Compass size={26} /></div></div>
      <h2>Halaman tidak ditemukan</h2>
      <p className="muted">Periksa kembali link yang Anda buka.</p>
    </div></div>
  )
}

export default function App() {
  if (!isConfigured) return <SetupNeeded />
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<Navigate to="/admin" replace />} />
        <Route path="/login" element={<Login />} />

        <Route path="/p/:token" element={<Portal />} />
        <Route path="/p/:token/kuis/:quizId" element={<QuizRun />} />
        <Route path="/p/:token/hasil/:attemptId" element={<QuizResult />} />

        <Route element={<RequireAuth />}>
          <Route path="/admin" element={<AdminShell />}>
            <Route index element={<Dashboard />} />
            <Route path="kegiatan/:id" element={<ActivityLayout />}>
              <Route index element={<Overview />} />
              <Route path="peserta" element={<ParticipantsTab />} />
              <Route path="absensi" element={<AttendanceTab />} />
              <Route path="kuis" element={<QuizzesTab />} />
              <Route path="kuis/:quizId" element={<QuizEditor />} />
              <Route path="sertifikat" element={<CertificatesTab />} />
              <Route path="laporan" element={<ReportsTab />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}
