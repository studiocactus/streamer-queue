import { useEffect, Component } from 'react'
import { BrowserRouter, Routes, Route, Outlet, Navigate, useParams } from 'react-router-dom'
import { Toaster } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { streamerPath } from '@/lib/routes'
import { Seo } from '@/components/Seo'

// Error Boundary para capturar crashes e mostrar mensagem em vez de tela preta
class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] crash:', error, info)
  }
  render() {
    if (this.state.error) {
      const err = this.state.error as Error
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center',
          justifyContent: 'center', flexDirection: 'column', gap: 16,
          background: '#0f0f17', color: '#f5f5f7', padding: 32, textAlign: 'center'
        }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#ff4d6a' }}>Erro na aplicação</h1>
          <p style={{ color: '#9999aa', maxWidth: 600 }}>{err.message}</p>
          <pre style={{
            background: '#17171f', border: '1px solid #2a2a36',
            borderRadius: 8, padding: 16, fontSize: 11,
            color: '#9999aa', maxWidth: 700, overflowX: 'auto', textAlign: 'left'
          }}>{err.stack}</pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#7c4dff', color: '#fff', border: 'none',
              borderRadius: 8, padding: '10px 24px', cursor: 'pointer', fontSize: 14
            }}
          >
            Recarregar página
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// Pages
import LandingPage from '@/pages/Landing'
import ExplorePage from '@/pages/Explore'
import StreamerPage from '@/pages/StreamerPage'
import AuthCallback from '@/pages/AuthCallback'
import ViewerDashboard from '@/pages/dashboard/ViewerDashboard'
import StreamerDashboard from '@/pages/dashboard/StreamerDashboard'
import OverlayPage from '@/pages/Overlay'
import ViewerProfile from '@/pages/ViewerProfile'

// Layout com header e footer
function AppLayout() {
  return (
    <div className="flex flex-col min-h-screen" data-app-release="2026-09-02">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}

// Layout dos dashboards com rodapé global
function DashLayout() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}

function LegacyStreamerRedirect() {
  const { slug = '' } = useParams()
  return <Navigate to={streamerPath(slug)} replace />
}

function AppInitializer({ children }: { children: React.ReactNode }) {
  const { initialize, setSession, setUser, user, refreshProfile } = useAuthStore()

  useEffect(() => {
    // Inicializar estado de autenticação
    initialize()

    // Escutar mudanças de sessão
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session)
        setUser(session?.user ?? null)

        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          await initialize()
        }

        if (event === 'SIGNED_OUT') {
          setSession(null)
          setUser(null)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [initialize, setSession, setUser])

  useEffect(() => {
    if (!user?.id) return

    const refreshAccess = () => void refreshProfile()
    const channel = supabase
      .channel(`account-role-${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'streamers',
        filter: `owner_id=eq.${user.id}`,
      }, refreshAccess)
      .subscribe()

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshAccess()
    }
    document.addEventListener('visibilitychange', refreshWhenVisible)
    window.addEventListener('focus', refreshAccess)

    return () => {
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      window.removeEventListener('focus', refreshAccess)
      void supabase.removeChannel(channel)
    }
  }, [user?.id, refreshProfile])

  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Seo />
      <AppInitializer>
        {/* Toast notifications */}
        <Toaster
          position="top-right"
          theme="dark"
          toastOptions={{
            style: {
              background: '#17171F',
              border: '1px solid #2A2A36',
              color: '#F5F5F7',
            },
          }}
        />

        <ErrorBoundary>
        <Routes>
          <Route path="/overlay/:slug" element={<OverlayPage />} />
          {/* Public routes with header+footer */}
          <Route element={<AppLayout />}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/explore" element={<ExplorePage />} />
            <Route path="/streamer/:slug" element={<LegacyStreamerRedirect />} />
            <Route path="/viewer/:login" element={<ViewerProfile />} />
            <Route path="/:slug" element={<StreamerPage />} />
          </Route>

          {/* Auth callback */}
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* Protected dashboard routes */}
          <Route element={<DashLayout />}>
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <ViewerDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/streamer"
              element={
                <ProtectedRoute requireStreamer>
                  <StreamerDashboard />
                </ProtectedRoute>
              }
            />
          </Route>

          {/* 404 */}
          <Route
            path="*"
            element={
              <div className="min-h-screen flex items-center justify-center text-center p-8">
                <div>
                  <p className="text-8xl font-black text-border mb-4">404</p>
                  <h1 className="text-2xl font-bold text-content-primary mb-2">Página não encontrada</h1>
                  <p className="text-content-secondary mb-6">A página que você procura não existe.</p>
                  <a href="/" className="text-brand-purple hover:underline">← Voltar ao início</a>
                </div>
              </div>
            }
          />
        </Routes>
        </ErrorBoundary>
      </AppInitializer>
    </BrowserRouter>
  )
}
