import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import type { ReactNode } from 'react'
import { PageLoading } from '@/components/ui/PageLoading'

interface ProtectedRouteProps {
  children: ReactNode
  requireStreamer?: boolean
}

export function ProtectedRoute({ children, requireStreamer = false }: ProtectedRouteProps) {
  const { user, isLoading, isInitialized, streamerProfile } = useAuthStore()
  const location = useLocation()

  if (!isInitialized || isLoading) {
    return <PageLoading />
  }

  if (!user) {
    return (
      <Navigate
        to="/"
        state={{
          from: location.pathname,
          authRequired: true,
        }}
        replace
      />
    )
  }

  if (requireStreamer && !streamerProfile) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
