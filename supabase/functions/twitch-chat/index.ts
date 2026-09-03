// The browser may wake a persisted delivery, never send an independent message.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WORKER_SECRET = Deno.env.get('CHAT_WORKER_SECRET')
const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const token = req.headers.get('Authorization')
    if (!token?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: auth, error: authError } = await admin.auth.getUser(token.slice(7))
    if (authError || !auth.user) return json({ error: 'Unauthorized' }, 401)
    const { streamer_id, suggestion_id, event_type } = await req.json()
    if (!streamer_id || !suggestion_id || !event_type) return json({ error: 'Missing event' }, 400)
    const { data: suggestion, error: suggestionError } = await admin.from('suggestions')
      .select('submitted_by').eq('id', suggestion_id).eq('streamer_id', streamer_id).maybeSingle()
    if (suggestionError) throw suggestionError
    if (!suggestion) return json({ error: 'Not found' }, 404)
    if (event_type !== 'suggestion_received' || suggestion.submitted_by !== auth.user.id) {
      const { data: member, error } = await admin.from('streamer_members').select('role')
        .eq('streamer_id', streamer_id).eq('user_id', auth.user.id).in('role', ['owner', 'moderator']).maybeSingle()
      if (error) throw error
      if (!member) return json({ error: 'Forbidden' }, 403)
    }
    const { data: delivery, error } = await admin.from('chat_delivery_queue').select('id,status,last_error')
      .eq('streamer_id', streamer_id).eq('suggestion_id', suggestion_id).eq('event_type', event_type).maybeSingle()
    if (error) throw error
    // Only events actually produced by database transitions can be announced.
    if (!delivery) return json({ error: 'Delivery not found' }, 404)
    if (delivery.status === 'pending' && WORKER_SECRET) {
      try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/chat-delivery-worker`, {
          method: 'POST', signal: AbortSignal.timeout(12000),
          headers: { 'Content-Type': 'application/json', 'x-chat-worker-secret': WORKER_SECRET },
          body: JSON.stringify({ delivery_id: delivery.id, limit: 1 }),
        })
        if (!response.ok) console.error('[twitch-chat] Worker wake failed:', response.status)
        await response.body?.cancel()
      } catch {
        console.warn('[twitch-chat] Worker wake unavailable; delivery remains durable')
      }
    }
    const { data: latest, error: latestError } = await admin.from('chat_delivery_queue')
      .select('status,last_error').eq('id', delivery.id).single()
    if (latestError) throw latestError
    return json({ success: latest.status === 'sent', status: latest.status, error: latest.last_error })
  } catch (error) {
    console.error('[twitch-chat] Delivery lookup failed', error)
    return json({ error: 'Não foi possível consultar o envio. A fila continua responsável pela entrega.' }, 500)
  }
})
