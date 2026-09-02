import { createClient } from '@supabase/supabase-js'

const rawUrl = import.meta.env.VITE_SUPABASE_URL || ''
export const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Variáveis de ambiente Supabase não configuradas. ' +
    'Verifique VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
})

export function getTwitchAuthUrl() {
  return `${supabaseUrl}/functions/v1/twitch-auth/login`
}

export function getTwitchChatConnectUrl(streamerId: string) {
  return `${supabaseUrl}/functions/v1/twitch-auth/connect-chat?streamer_id=${encodeURIComponent(streamerId)}`
}

export default supabase
