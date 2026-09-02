// ============================================================
// WatchQueue — Edge Function: twitch-chat
// Envia mensagem ao chat do Twitch ou simula no dashboard
// ============================================================
// Deploy: supabase functions deploy twitch-chat
// Variáveis: TWITCH_CLIENT_ID, SUPABASE_SERVICE_ROLE_KEY
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TWITCH_CLIENT_ID = Deno.env.get('TWITCH_CLIENT_ID')
const TWITCH_CLIENT_SECRET = Deno.env.get('TWITCH_CLIENT_SECRET')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface ChatEventPayload {
  streamer_id: string
  suggestion_id?: string
  event_type: 'suggestion_received' | 'suggestion_approved' | 'watching_now' | 'completed'
  viewer_name: string
  title: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      },
    })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  try {
    const payload: ChatEventPayload = await req.json()
    const { streamer_id, suggestion_id, event_type } = payload
    let viewerName = payload.viewer_name
    let suggestionTitle = payload.title

    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: authData, error: authError } = await adminClient.auth.getUser(authHeader.slice(7))
    if (authError || !authData.user || !suggestion_id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }

    // Never trust chat text supplied by the browser. Resolve the suggestion and
    // viewer from the database and confirm who is allowed to trigger the event.
    const { data: suggestion } = await adminClient
      .from('suggestions')
      .select('id, streamer_id, submitted_by, title')
      .eq('id', suggestion_id)
      .eq('streamer_id', streamer_id)
      .maybeSingle()

    if (!suggestion) {
      return new Response(JSON.stringify({ error: 'Suggestion not found' }), { status: 404 })
    }

    if (event_type === 'suggestion_received') {
      if (suggestion.submitted_by !== authData.user.id) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
      }
    } else {
      const { data: member } = await adminClient
        .from('streamer_members')
        .select('role')
        .eq('streamer_id', streamer_id)
        .eq('user_id', authData.user.id)
        .in('role', ['owner', 'moderator'])
        .maybeSingle()
      if (!member) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
      }
    }

    const { data: viewer } = await adminClient
      .from('profiles')
      .select('display_name')
      .eq('id', suggestion.submitted_by)
      .maybeSingle()
    viewerName = viewer?.display_name ?? 'Viewer'
    suggestionTitle = suggestion.title

    // Buscar template de mensagem
    const { data: template } = await adminClient
      .from('chat_message_templates')
      .select('*')
      .eq('streamer_id', streamer_id)
      .eq('event_type', event_type)
      .eq('enabled', true)
      .maybeSingle()

    // Formatar mensagem
    let message = template?.template ?? getDefaultTemplate(event_type)
    if (!message.includes('{viewer}')) {
      message = `${message.trim()} — sugestão de {viewer}`
    }
    message = message
      .replaceAll('{viewer}', viewerName)
      .replaceAll('{titulo}', suggestionTitle)

    // Verificar se há integração Twitch configurada
    const { data: connection } = await adminClient
      .from('twitch_connections')
      .select('broadcaster_id, token_status')
      .eq('streamer_id', streamer_id)
      .maybeSingle()

    // Verificar settings
    const { data: settings } = await adminClient
      .from('streamer_settings')
      .select('chat_notifications_enabled')
      .eq('streamer_id', streamer_id)
      .maybeSingle()

    let status: 'sent' | 'failed' | 'simulated' = 'simulated'
    let errorMessage: string | null = null

    const isConfigured =
      connection &&
      connection.token_status === 'active' &&
      TWITCH_CLIENT_ID &&
      settings?.chat_notifications_enabled

    if (isConfigured) {
      const { data: credential } = await adminClient
        .from('twitch_chat_credentials')
        .select('*')
        .eq('streamer_id', streamer_id)
        .maybeSingle()

      if (!credential || !TWITCH_CLIENT_SECRET) {
        errorMessage = 'Conexão de chat ainda não autorizada'
        status = 'failed'
      } else {
        let accessToken = credential.access_token
        if (new Date(credential.expires_at).getTime() <= Date.now() + 60_000) {
          const refreshResponse = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'refresh_token', refresh_token: credential.refresh_token,
              client_id: TWITCH_CLIENT_ID!, client_secret: TWITCH_CLIENT_SECRET,
            }),
          })
          if (!refreshResponse.ok) throw new Error('Falha ao renovar autorização do chat')
          const refreshed = await refreshResponse.json()
          accessToken = refreshed.access_token
          await adminClient.from('twitch_chat_credentials').update({
            access_token: refreshed.access_token,
            refresh_token: refreshed.refresh_token ?? credential.refresh_token,
            expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          }).eq('streamer_id', streamer_id)
        }

        const chatResponse = await fetch('https://api.twitch.tv/helix/chat/messages', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Client-Id': TWITCH_CLIENT_ID!, 'Content-Type': 'application/json' },
          body: JSON.stringify({ broadcaster_id: connection.broadcaster_id, sender_id: connection.broadcaster_id, message: message.slice(0, 500) }),
        })
        if (!chatResponse.ok) {
          errorMessage = `Twitch respondeu ${chatResponse.status}: ${await chatResponse.text()}`
          status = 'failed'
        } else {
          status = 'sent'
        }
      }
    } else {
      console.log(`[twitch-chat] Integração não configurada. Simulando: ${message}`)
      status = 'simulated'
    }

    // Registrar log
    await adminClient.from('chat_message_logs').insert({
      streamer_id,
      suggestion_id: suggestion_id ?? null,
      event_type,
      message,
      status,
      error_message: errorMessage,
    })

    return new Response(
      JSON.stringify({ success: true, message, status }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[twitch-chat] Erro:', err)
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

function getDefaultTemplate(eventType: string): string {
  const templates: Record<string, string> = {
    suggestion_received: '🎬 {viewer} adicionou "{titulo}" à lista do canal!',
    suggestion_approved: '✅ A sugestão "{titulo}" de {viewer} foi aprovada!',
    watching_now: '🍿 O streamer começou a assistir "{titulo}", sugestão de {viewer}!',
    completed: '🎉 Terminamos de assistir "{titulo}"! Obrigado, {viewer}!',
  }
  return templates[eventType] ?? '📺 Nova atividade no WatchQueue!'
}
