import { Link, useLocation } from 'react-router-dom'
import { Tv2, Search, LayoutDashboard, LogOut, Menu, X, ChevronDown, Bell } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { getTwitchAuthUrl } from '@/lib/supabase'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { useStreamerNotifications } from '@/hooks/useStreamerNotifications'

export function Header() {
  const { user, profile, streamerProfile, logout } = useAuthStore()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const { pendingCount } = useStreamerNotifications(streamerProfile?.id)

  const isActive = (path: string) => location.pathname === path

  useEffect(() => {
    setMobileOpen(false)
    setUserMenuOpen(false)
  }, [location.pathname, location.search])

  useEffect(() => {
    if (!userMenuOpen) return

    const closeOnOutsideInteraction = (event: PointerEvent) => {
      if (!userMenuRef.current?.contains(event.target as Node)) {
        setUserMenuOpen(false)
      }
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setUserMenuOpen(false)
      }
    }

    document.addEventListener('pointerdown', closeOnOutsideInteraction)
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideInteraction)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [userMenuOpen])

  const handleLoginWithTwitch = () => {
    window.location.href = getTwitchAuthUrl()
  }

  return (
    <header className="sticky top-0 z-40 bg-bg-primary/80 backdrop-blur-xl border-b border-border">
      <nav className="app-shell">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 bg-brand-purple rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform">
              <Tv2 size={18} className="text-white" />
            </div>
            <span className="font-bold text-lg text-content-primary">
              Watch<span className="text-brand-purple">Queue</span>
            </span>
          </Link>

          {/* Nav Desktop */}
          <div className="hidden md:flex items-center gap-6">
            <Link
              to="/explore"
              className={cn(
                'text-sm font-medium transition-colors hover:text-content-primary',
                isActive('/explore') ? 'text-content-primary' : 'text-content-secondary'
              )}
            >
              Explorar
            </Link>
            {user && (
              <Link
                to="/dashboard"
                className={cn(
                  'text-sm font-medium transition-colors hover:text-content-primary',
                  isActive('/dashboard') ? 'text-content-primary' : 'text-content-secondary'
                )}
              >
                Minhas sugestões
              </Link>
            )}
            {streamerProfile && (
              <Link
                to="/dashboard/streamer"
                className={cn(
                  'text-sm font-medium transition-colors hover:text-content-primary',
                  isActive('/dashboard/streamer') ? 'text-content-primary' : 'text-content-secondary'
                )}
              >
                Painel do streamer
              </Link>
            )}
          </div>

          {/* Auth */}
          <div className="flex items-center gap-3">
            {streamerProfile && (
              <Link
                to="/dashboard/streamer"
                aria-label={`${pendingCount} sugestões pendentes`}
                className="focus-ring relative flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-bg-secondary text-content-secondary transition-colors hover:text-content-primary"
              >
                <Bell size={17} />
                {pendingCount > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full border-2 border-bg-primary bg-brand-purple px-1 text-center text-[10px] font-bold leading-4 text-white">
                    {pendingCount > 99 ? '99+' : pendingCount}
                  </span>
                )}
              </Link>
            )}
            {user ? (
              <div ref={userMenuRef} className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-bg-secondary transition-colors"
                  id="user-menu-button"
                  aria-haspopup="true"
                  aria-expanded={userMenuOpen}
                >
                  <Avatar
                    src={profile?.avatar_url}
                    alt={profile?.display_name}
                    fallback={profile?.display_name}
                    size="sm"
                  />
                  <span className="hidden sm:block text-sm font-medium text-content-primary">
                    {profile?.display_name ?? 'Usuário'}
                  </span>
                  <ChevronDown size={14} className="text-content-muted" />
                </button>

                {userMenuOpen && (
                    <div className="absolute right-0 z-20 mt-2 w-52 rounded-xl border border-border bg-bg-secondary py-1 shadow-xl animate-fade-in">
                      <div className="px-4 py-3 border-b border-border">
                        <p className="text-sm font-medium text-content-primary">
                          {profile?.display_name}
                        </p>
                        <p className="text-xs text-content-muted">@{profile?.twitch_login}</p>
                      </div>
                      <Link
                        to="/dashboard"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-content-secondary hover:text-content-primary hover:bg-bg-tertiary transition-colors"
                      >
                        <LayoutDashboard size={16} />
                        Minhas sugestões
                      </Link>
                      {streamerProfile && (
                        <>
                          <Link
                            to="/dashboard/streamer"
                            onClick={() => setUserMenuOpen(false)}
                            className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-content-secondary hover:text-content-primary hover:bg-bg-tertiary transition-colors"
                          >
                            <LayoutDashboard size={16} />
                            Painel do streamer
                          </Link>
                          <Link
                            to={`/streamer/${streamerProfile.slug}`}
                            onClick={() => setUserMenuOpen(false)}
                            className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-content-secondary hover:text-content-primary hover:bg-bg-tertiary transition-colors"
                          >
                            <Tv2 size={16} />
                            Página pública
                          </Link>
                        </>
                      )}
                      <button
                        onClick={() => { logout(); setUserMenuOpen(false) }}
                        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-status-rejected hover:bg-bg-tertiary transition-colors"
                      >
                        <LogOut size={16} />
                        Sair
                      </button>
                    </div>
                )}
              </div>
            ) : (
              <Button
                onClick={handleLoginWithTwitch}
                variant="primary"
                size="sm"
                leftIcon={
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                    <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
                  </svg>
                }
              >
                <span className="hidden min-[430px]:inline">Entrar com Twitch</span>
                <span className="min-[430px]:hidden">Entrar</span>
              </Button>
            )}

            {/* Mobile menu toggle */}
            <button
              className="md:hidden p-2 rounded-lg text-content-secondary hover:text-content-primary hover:bg-bg-secondary transition-colors"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Menu"
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Nav */}
        {mobileOpen && (
          <div className="md:hidden border-t border-border py-3 space-y-1 animate-fade-in">
            <Link
              to="/explore"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm text-content-secondary hover:text-content-primary hover:bg-bg-secondary rounded-xl transition-colors"
            >
              <Search size={16} />
              Explorar Streamers
            </Link>
            {user && (
              <Link
                to="/dashboard"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-content-secondary hover:text-content-primary hover:bg-bg-secondary rounded-xl transition-colors"
              >
                <LayoutDashboard size={16} />
                Minhas sugestões
              </Link>
            )}
            {streamerProfile && (
              <Link
                to="/dashboard/streamer"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-content-secondary hover:text-content-primary hover:bg-bg-secondary rounded-xl transition-colors"
              >
                <Tv2 size={16} />
                Painel do streamer
              </Link>
            )}
          </div>
        )}
      </nav>
    </header>
  )
}
