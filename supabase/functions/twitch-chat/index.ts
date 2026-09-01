// ============================================================
// WatchQueue — Edge Function: twitch-chat
// Envia mensagem ao chat do Twitch ou simula no dashboard
// ============================================================
// Deploy: supabase functions deploy twitch-chat
// Variáveis: TWITCH_CLIENT_ID, SUPABASE_SERVICE_ROLE_KEY
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TWITCH_CLIENT_ID = Deno.env.get('TWITCH_CLIENT_ID')
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
    const { streamer_id, suggestion_id, event_type, viewer_name, title } = payload

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

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
    message = message
      .replace('{viewer}', viewer_name)
      .replace('{titulo}', title)

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
      // TODO: implementar envio real via Twitch API (requer bot token)
      // Por ora, simula para evitar erros de configuração incompleta
      // Quando o streamer integrar o bot, esta seção enviará de verdade
      console.log(`[twitch-chat] Simulando envio para canal ${connection.broadcaster_id}: ${message}`)
      status = 'simulated'
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
