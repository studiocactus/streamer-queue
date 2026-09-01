import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom'
import { Toaster } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'

// Pages
import LandingPage from '@/pages/Landing'
import ExplorePage from '@/pages/Explore'
import StreamerPage from '@/pages/StreamerPage'
import AuthCallback from '@/pages/AuthCallback'
import ViewerDashboard from '@/pages/dashboard/ViewerDashboard'
import StreamerDashboard from '@/pages/dashboard/StreamerDashboard'

// Layout com header e footer
function AppLayout() {
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

// Layout sem footer (dashboard)
function DashLayout() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}

function AppInitializer({ children }: { children: React.ReactNode }) {
  const { initialize, setSession, setUser } = useAuthStore()

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

  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
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

        <Routes>
          {/* Public routes with header+footer */}
          <Route element={<AppLayout />}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/explore" element={<ExplorePage />} />
            <Route path="/streamer/:slug" element={<StreamerPage />} />
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
                <ProtectedRoute>
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
      </AppInitializer>
    </BrowserRouter>
  )
}
