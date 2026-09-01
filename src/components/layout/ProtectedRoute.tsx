import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

interface ProtectedRouteProps {
  children: ReactNode
  requireStreamer?: boolean
}

export function ProtectedRoute({ children, requireStreamer = false }: ProtectedRouteProps) {
  const { user, isLoading, isInitialized, streamerProfile } = useAuthStore()
  const location = useLocation()

  if (!isInitialized || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={32} className="text-brand-purple animate-spin" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/" state={{ from: location }} replace />
  }

  if (requireStreamer && !streamerProfile) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
