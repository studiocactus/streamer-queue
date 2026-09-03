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

      setUser: (user) => set((state) => (
        state.user?.id !== user?.id
          ? { user, profile: null, streamerProfile: null }
          : { user }
      )),
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
        if (!user) {
          set({ profile: null, streamerProfile: null })
          return
        }

        try {
          const requestedUserId = user.id
          const [{ data: profile }, { data: streamer }] = await Promise.all([
            supabase.from('profiles').select('*').eq('id', requestedUserId).single(),
            supabase
              .from('streamers')
              .select('*, settings:streamer_settings(*)')
              .eq('owner_id', requestedUserId)
              .eq('is_active', true)
              .maybeSingle(),
          ])

          // Ignore a response if another account entered while these requests
          // were running. This prevents permissions from leaking between sessions.
          if (get().user?.id !== requestedUserId) return

          // A existência de um canal define o papel de streamer.
          // Novos usuários entram somente como viewers; canais são liberados por convite.
          set({ profile: profile ?? null, streamerProfile: streamer ?? null })
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
