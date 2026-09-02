import { createClient } from '@supabase/supabase-js'
import { normalizeStreamerReturnPath } from '@/lib/routes'

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

export function getTwitchAuthUrl(returnTo?: string) {
  const url = new URL(`${supabaseUrl}/functions/v1/twitch-auth/login`)
  const safeReturnTo = normalizeStreamerReturnPath(returnTo)
  if (safeReturnTo) url.searchParams.set('return_to', safeReturnTo)
  return url.toString()
}

export function getTwitchChatConnectUrl(streamerId: string) {
  return `${supabaseUrl}/functions/v1/twitch-auth/connect-chat?streamer_id=${encodeURIComponent(streamerId)}`
}

export default supabase
