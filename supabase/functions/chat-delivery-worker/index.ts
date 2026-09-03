import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { normalizeContentReference } from '../_shared/content-reference.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TWITCH_CLIENT_ID = Deno.env.get('TWITCH_CLIENT_ID')!
const TWITCH_CLIENT_SECRET = Deno.env.get('TWITCH_CLIENT_SECRET')!
const CHAT_WORKER_SECRET = Deno.env.get('CHAT_WORKER_SECRET')

type QueueItem = {
  id: string
  streamer_id: string
  suggestion_id: string
  event_type: string
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!CHAT_WORKER_SECRET || req.headers.get('x-chat-worker-secret') !== CHAT_WORKER_SECRET) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const requestedLimit = Number((await req.json().catch(() => ({})))?.limit ?? 20)
  const limit = Math.max(1, Math.min(Number.isFinite(requestedLimit) ? requestedLimit : 20, 50))
  const { data, error } = await admin.rpc('claim_chat_deliveries', { p_limit: limit })
  if (error) return json({ error: error.message }, 500)

  const results = []
  for (const item of (data ?? []) as QueueItem[]) {
    const result = await processDelivery(item)
    await admin.rpc('finish_chat_delivery', {
      p_id: item.id,
      p_sent: result.sent,
      p_error: result.error,
    })
    results.push({ id: item.id, sent: result.sent, error: result.error })
  }

  return json({ processed: results.length, results })
})

async function processDelivery(item: QueueItem): Promise<{ sent: boolean; error: string | null }> {
  try {
    const { data: previous } = await admin
      .from('chat_message_logs')
      .select('id')
      .eq('suggestion_id', item.suggestion_id)
      .eq('event_type', item.event_type)
      .eq('status', 'sent')
      .limit(1)
      .maybeSingle()
    if (previous) return { sent: true, error: null }

    const { data: suggestion } = await admin
      .from('suggestions')
      .select('id, streamer_id, submitted_by, title, category, chat_display_name')
      .eq('id', item.suggestion_id)
      .eq('streamer_id', item.streamer_id)
      .maybeSingle()
    if (!suggestion) return { sent: false, error: 'Sugestão não encontrada' }

    const [{ data: connection }, { data: settings }, { data: credential }, { data: template }] = await Promise.all([
      admin.from('twitch_connections').select('broadcaster_id, token_status').eq('streamer_id', item.streamer_id).maybeSingle(),
      admin.from('streamer_settings').select('chat_notifications_enabled').eq('streamer_id', item.streamer_id).maybeSingle(),
      admin.from('twitch_chat_credentials').select('*').eq('streamer_id', item.streamer_id).maybeSingle(),
      admin.from('chat_message_templates').select('template, enabled').eq('streamer_id', item.streamer_id).eq('event_type', item.event_type).maybeSingle(),
    ])

    if (!settings?.chat_notifications_enabled) return { sent: true, error: null }
    if (template && !template.enabled) return { sent: true, error: null }
    if (!connection || connection.token_status !== 'active' || !credential) {
      return { sent: false, error: 'Conexão com o chat da Twitch indisponível' }
    }

    const { data: viewer } = suggestion.submitted_by
      ? await admin.from('profiles').select('display_name').eq('id', suggestion.submitted_by).maybeSingle()
      : { data: null }
    const content = await normalizeContentReference(suggestion.title)
    const viewerName = viewer?.display_name ?? suggestion.chat_display_name ?? 'Viewer da Twitch'
    const message = (template.template || defaultTemplate(item.event_type))
      .replaceAll('{viewer}', viewerName)
      .replaceAll('{titulo}', content.title)
      .replaceAll('{categoria}', categoryLabel(suggestion.category))
      .slice(0, 500)

    const token = await validAccessToken(credential, item.streamer_id)
    if (!token) return { sent: false, error: 'Falha ao renovar autorização da Twitch' }

    const response = await fetch('https://api.twitch.tv/helix/chat/messages', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Client-Id': TWITCH_CLIENT_ID, 'Content-Type': 'application/json' },
      body: JSON.stringify({ broadcaster_id: connection.broadcaster_id, sender_id: connection.broadcaster_id, message }),
    })
    const body = await response.json().catch(() => null)
    const sent = response.ok && body?.data?.[0]?.is_sent === true
    const errorMessage = sent ? null : body?.data?.[0]?.drop_reason?.message ?? `Twitch respondeu ${response.status}`

    if (response.status === 401 || response.status === 403) {
      await admin.from('twitch_connections').update({ token_status: 'expired' }).eq('streamer_id', item.streamer_id)
    }
    await admin.from('chat_message_logs').insert({
      streamer_id: item.streamer_id,
      suggestion_id: item.suggestion_id,
      event_type: item.event_type,
      message,
      status: sent ? 'sent' : 'failed',
      error_message: errorMessage,
    })
    return { sent, error: errorMessage }
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : String(error) }
  }
}

async function validAccessToken(credential: Record<string, string>, streamerId: string) {
  if (new Date(credential.expires_at).getTime() > Date.now() + 60_000) return credential.access_token
  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: credential.refresh_token,
      client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET,
    }),
  })
  if (!response.ok) return null
  const refreshed = await response.json()
  await admin.from('twitch_chat_credentials').update({
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token ?? credential.refresh_token,
    expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('streamer_id', streamerId)
  return refreshed.access_token as string
}

function defaultTemplate(eventType: string) {
  return ({
    suggestion_received: '🎬 {viewer} adicionou “{titulo}” à lista do canal!',
    suggestion_approved: '✅ A sugestão “{titulo}” de {viewer} foi aprovada!',
    queued: '📋 “{titulo}”, ideia de {viewer}, entrou na fila do canal!',
    watching_now: '🍿 O streamer começou a assistir “{titulo}”, sugestão de {viewer}!',
    completed: '🎉 Terminamos de assistir “{titulo}”! Obrigado, {viewer}!',
    rejected: 'ℹ️ A ideia “{titulo}”, enviada por {viewer}, não foi aprovada desta vez.',
    streamer_added: '📌 {viewer} adicionou “{titulo}” em {categoria}. Vote na sua ideia favorita pelo WatchQueue!',
  } as Record<string, string>)[eventType] ?? '📺 Nova atividade no WatchQueue!'
}

function categoryLabel(category: string) {
  return ({ movie: 'Filmes', series: 'Séries', anime: 'Animes', react: 'Reacts', music: 'Músicas', other: 'Outros' } as Record<string, string>)[category] ?? 'Conteúdos'
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
