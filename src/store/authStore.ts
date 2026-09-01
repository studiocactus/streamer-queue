import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, Session } from '@supabase/supabase-js'
import type { Profile, Streamer } from '@/types'
import { supabase } from '@/lib/supabase'

interface AuthState {
  user: User | null
  session: Session | null
  profile: Profile | null
  streamerProfile: Streamer | null
  isLoading: boolean
  isInitialized: boolean
  // Actions
  setUser: (user: User | null) => void
  setSession: (session: Session | null) => void
  setProfile: (profile: Profile | null) => void
  setStreamerProfile: (streamer: Streamer | null) => void
  setLoading: (loading: boolean) => void
  initialize: () => Promise<void>
  logout: () => Promise<void>
  refreshProfile: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      session: null,
      profile: null,
      streamerProfile: null,
      isLoading: true,
      isInitialized: false,

      setUser: (user) => set({ user }),
      setSession: (session) => set({ session }),
      setProfile: (profile) => set({ profile }),
      setStreamerProfile: (streamer) => set({ streamerProfile: streamer }),
      setLoading: (isLoading) => set({ isLoading }),

      initialize: async () => {
        set({ isLoading: true })
        try {
          const { data: { session } } = await supabase.auth.getSession()

          if (session?.user) {
            set({ session, user: session.user })
            await get().refreshProfile()
          } else {
            set({ session: null, user: null, profile: null, streamerProfile: null })
          }
        } catch (error) {
          console.error('Erro ao inicializar auth:', error)
        } finally {
          set({ isLoading: false, isInitialized: true })
        }
      },

      refreshProfile: async () => {
        const { user } = get()
        if (!user) return

        try {
          // Buscar perfil
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single()

          if (profile) {
            set({ profile })
          }

          // Buscar perfil de streamer (se for dono de algum canal)
          const { data: streamer } = await supabase
            .from('streamers')
            .select('*, settings:streamer_settings(*)')
            .eq('owner_id', user.id)
            .maybeSingle()

          set({ streamerProfile: streamer })
        } catch (error) {
          console.error('Erro ao carregar perfil:', error)
        }
      },

      logout: async () => {
        await supabase.auth.signOut()
        set({
          user: null,
          session: null,
          profile: null,
          streamerProfile: null,
        })
      },
    }),
    {
      name: 'watchqueue-auth',
      partialize: (state) => ({
        // Não persistir dados sensíveis, apenas IDs para reconexão
        profile: state.profile,
      }),
    }
  )
)
