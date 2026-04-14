import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useParams } from 'react-router-dom'
import { Layout } from '@/components/layout/layout'
import { Toaster } from "@/components/ui/sonner"
import { AuthProvider } from '@/context/auth-context'
import { ProtectedRoute } from '@/components/auth/protected-route'

// Lazy-loaded pages for code splitting
const HomePage       = lazy(() => import('@/pages/home').then(m => ({ default: m.HomePage })))
const FleaPage       = lazy(() => import('@/pages/market/flea').then(m => ({ default: m.FleaPage })))
const FleaNewPage    = lazy(() => import('@/pages/market/flea-new').then(m => ({ default: m.FleaNewPage })))
const FleaDetailPage = lazy(() => import('@/pages/market/flea-detail').then(m => ({ default: m.FleaDetailPage })))
const FleaEditPage   = lazy(() => import('@/pages/market/flea-edit').then(m => ({ default: m.FleaEditPage })))
const ChatRoomPage   = lazy(() => import('@/pages/chat/ChatRoomPage').then(m => ({ default: m.ChatRoomPage })))
const MyPage         = lazy(() => import('@/pages/mypage').then(m => ({ default: m.MyPage })))
const BannedPage     = lazy(() => import('@/pages/BannedPage').then(m => ({ default: m.BannedPage })))
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard').then(m => ({ default: m.AdminDashboard })))
const UserDetailPage = lazy(() => import('@/pages/admin/UserDetailPage').then(m => ({ default: m.UserDetailPage })))

const ADMIN_ROLES = ['campus_admin', 'super_admin']
const ALL_ROLES   = ['student', 'campus_admin', 'super_admin']

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  )
}

// Thin redirect components for legacy detail/edit URLs
function LegacyDetailRedirect() {
  const { id } = useParams()
  return <Navigate to={`/campus/uiuc/listings/${id}`} replace />
}
function LegacyEditRedirect() {
  const { id } = useParams()
  return <Navigate to={`/campus/uiuc/listings/${id}/edit`} replace />
}

function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route element={<Layout />}>
            {/* Home */}
            <Route path="/" element={<HomePage />} />

            {/* ── Multi-campus marketplace (/campus/:slug/...) ─────────────── */}
            <Route path="/campus/:slug/listings" element={<FleaPage />} />
            <Route path="/campus/:slug/listings/new" element={
              <ProtectedRoute allowedRoles={ALL_ROLES}>
                <FleaNewPage />
              </ProtectedRoute>
            } />
            <Route path="/campus/:slug/listings/:id" element={<FleaDetailPage />} />
            <Route path="/campus/:slug/listings/:id/edit" element={
              <ProtectedRoute allowedRoles={ALL_ROLES}>
                <FleaEditPage />
              </ProtectedRoute>
            } />

            {/* ── Legacy /market/flea redirects → UIUC campus ─────────────── */}
            <Route path="/market/flea" element={<Navigate to="/campus/uiuc/listings" replace />} />
            <Route path="/market/flea/new" element={<Navigate to="/campus/uiuc/listings/new" replace />} />
            <Route path="/market/flea/:id" element={<LegacyDetailRedirect />} />
            <Route path="/market/flea/:id/edit" element={<LegacyEditRedirect />} />

            {/* Chat */}
            <Route path="/chat/room/:id" element={
              <ProtectedRoute allowedRoles={ALL_ROLES}>
                <ChatRoomPage />
              </ProtectedRoute>
            } />

            {/* User */}
            <Route path="/mypage" element={
              <ProtectedRoute allowedRoles={ALL_ROLES}>
                <MyPage />
              </ProtectedRoute>
            } />
            <Route path="/banned" element={<BannedPage />} />

            {/* Admin */}
            <Route path="/admin" element={
              <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                <AdminDashboard />
              </ProtectedRoute>
            } />
            <Route path="/admin/users/:id" element={
              <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                <UserDetailPage />
              </ProtectedRoute>
            } />

            {/* 404 catch-all */}
            <Route path="*" element={
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
                <h1 className="text-6xl font-bold text-muted-foreground">404</h1>
                <p className="mt-2 text-lg text-muted-foreground">Page not found</p>
                <a href="/" className="mt-4 text-primary hover:underline">Go home</a>
              </div>
            } />
          </Route>
        </Routes>
      </Suspense>
      <Toaster />
    </AuthProvider>
  )
}

export default App
