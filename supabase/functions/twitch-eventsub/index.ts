// Receives signed Twitch EventSub chat messages and creates pending suggestions.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TWITCH_CLIENT_ID = Deno.env.get('TWITCH_CLIENT_ID')!
const TWITCH_CLIENT_SECRET = Deno.env.get('TWITCH_CLIENT_SECRET')!
const EVENTSUB_SECRET = Deno.env.get('TWITCH_EVENTSUB_SECRET')!

const encoder = new TextEncoder()

type ChatMessageEvent = {
  broadcaster_user_id: string
  chatter_user_id: string
  chatter_user_login: string
  chatter_user_name: string
  message: { text: string }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const rawBody = await req.text()
  const messageId = req.headers.get('Twitch-Eventsub-Message-Id') ?? ''
  const timestamp = req.headers.get('Twitch-Eventsub-Message-Timestamp') ?? ''
  const signature = req.headers.get('Twitch-Eventsub-Message-Signature') ?? ''
  const messageType = req.headers.get('Twitch-Eventsub-Message-Type') ?? ''

  if (!EVENTSUB_SECRET || !(await isValidSignature(messageId, timestamp, rawBody, signature))) {
    return new Response('Invalid signature', { status: 403 })
  }

  // Reject old signed payloads to reduce replay risk.
  const sentAt = Date.parse(timestamp)
  if (!Number.isFinite(sentAt) || Math.abs(Date.now() - sentAt) > 10 * 60 * 1000) {
    return new Response('Stale message', { status: 403 })
  }

  const payload = JSON.parse(rawBody)
  if (messageType === 'webhook_callback_verification') {
    return new Response(payload.challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }
  if (messageType === 'revocation') {
    console.warn('[twitch-eventsub] Subscription revoked:', payload.subscription?.status)
    return new Response(null, { status: 204 })
  }
  if (messageType !== 'notification' || payload.subscription?.type !== 'channel.chat.message') {
    return new Response(null, { status: 204 })
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Twitch retries notifications. The primary key makes processing idempotent.
  const { error: deliveryError } = await admin.from('twitch_eventsub_messages').insert({
    message_id: messageId,
    event_type: payload.subscription.type,
  })
  if (deliveryError?.code === '23505') return new Response(null, { status: 204 })
  if (deliveryError) throw deliveryError

  const event = payload.event as ChatMessageEvent
  const { data: streamer } = await admin
    .from('streamers')
    .select('id, is_active, settings:streamer_settings(chat_command, chat_command_enabled)')
    .eq('twitch_broadcaster_id', event.broadcaster_user_id)
    .maybeSingle()

  const settings = Array.isArray(streamer?.settings) ? streamer.settings[0] : streamer?.settings
  if (!streamer?.is_active || !settings?.chat_command_enabled) return new Response(null, { status: 204 })

  const text = event.message?.text?.trim() ?? ''
  const firstSpace = text.search(/\s/)
  const command = (firstSpace === -1 ? text : text.slice(0, firstSpace)).toLowerCase()
  const title = (firstSpace === -1 ? '' : text.slice(firstSpace + 1)).trim()
  if (command !== settings.chat_command.toLowerCase() || !title) return new Response(null, { status: 204 })

  if (title.length > 200) {
    await sendChatMessage(admin, streamer.id, event.broadcaster_user_id,
      `@${event.chatter_user_login}, use no máximo 200 caracteres no nome do conteúdo.`)
    return new Response(null, { status: 204 })
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('twitch_user_id', event.chatter_user_id)
    .maybeSingle()

  if (profile) {
    const { data: banned } = await admin
      .from('banned_users')
      .select('id')
      .eq('streamer_id', streamer.id)
      .eq('user_id', profile.id)
      .maybeSingle()
    if (banned) return new Response(null, { status: 204 })
  }

  const { data: suggestion, error: insertError } = await admin.from('suggestions').insert({
    streamer_id: streamer.id,
    submitted_by: profile?.id ?? null,
    category: 'other',
    title,
    description: `Enviado pelo chat da Twitch por @${event.chatter_user_login}.`,
    status: 'pending',
    submission_source: profile ? 'platform' : 'chat',
    submission_priority: profile ? 100 : 0,
    chat_user_id: profile ? null : event.chatter_user_id,
    chat_user_login: profile ? null : event.chatter_user_login,
    chat_display_name: profile ? null : event.chatter_user_name,
  }).select('id').single()
  if (insertError) throw insertError

  const confirmation = `@${event.chatter_user_login}, “${title}” foi enviado. O streamer irá revisar o conteúdo e visualizar quando puder. Usuários da plataforma têm prioridade.`
  const sendResult = await sendChatMessage(admin, streamer.id, event.broadcaster_user_id, confirmation)
  await admin.from('chat_message_logs').insert({
    streamer_id: streamer.id,
    suggestion_id: suggestion.id,
    event_type: 'chat_suggestion_received',
    message: confirmation,
    status: sendResult.sent ? 'sent' : 'failed',
    error_message: sendResult.error,
  })

  return new Response(null, { status: 204 })
})

async function isValidSignature(messageId: string, timestamp: string, body: string, signature: string) {
  if (!messageId || !timestamp || !signature.startsWith('sha256=')) return false
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(EVENTSUB_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(messageId + timestamp + body))
  const expected = `sha256=${Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')}`
  if (expected.length !== signature.length) return false
  let mismatch = 0
  for (let index = 0; index < expected.length; index++) mismatch |= expected.charCodeAt(index) ^ signature.charCodeAt(index)
  return mismatch === 0
}

async function sendChatMessage(admin: ReturnType<typeof createClient>, streamerId: string, broadcasterId: string, message: string) {
  try {
    const { data: credential } = await admin.from('twitch_chat_credentials').select('*').eq('streamer_id', streamerId).maybeSingle()
    if (!credential) return { sent: false, error: 'Chat não conectado' }

    let accessToken = credential.access_token
    if (new Date(credential.expires_at).getTime() <= Date.now() + 60_000) {
      const refreshResponse = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token', refresh_token: credential.refresh_token,
          client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET,
        }),
      })
      if (!refreshResponse.ok) return { sent: false, error: 'Falha ao renovar autorização' }
      const refreshed = await refreshResponse.json()
      accessToken = refreshed.access_token
      await admin.from('twitch_chat_credentials').update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token ?? credential.refresh_token,
        expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('streamer_id', streamerId)
    }

    const response = await fetch('https://api.twitch.tv/helix/chat/messages', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Client-Id': TWITCH_CLIENT_ID, 'Content-Type': 'application/json' },
      body: JSON.stringify({ broadcaster_id: broadcasterId, sender_id: broadcasterId, message: message.slice(0, 500) }),
    })
    const result = await response.json().catch(() => null)
    if (!response.ok || result?.data?.[0]?.is_sent !== true) {
      return { sent: false, error: result?.data?.[0]?.drop_reason?.message ?? `Twitch respondeu ${response.status}` }
    }
    return { sent: true, error: null }
  } catch (error) {
    return { sent: false, error: String(error) }
  }
}

