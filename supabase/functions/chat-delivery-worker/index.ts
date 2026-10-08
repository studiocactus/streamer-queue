import { fetchOriginalDuration } from '../_shared/video-duration.ts'
import { SYSTEM_BOT_MESSAGES, renderBotMessage } from '../_shared/bot-messages.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
  attempts: number
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!CHAT_WORKER_SECRET || req.headers.get('x-chat-worker-secret') !== CHAT_WORKER_SECRET) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const payload = await req.json().catch(() => ({}))
  const requestedLimit = Number(payload?.limit ?? 20)
  const limit = Math.max(1, Math.min(Number.isFinite(requestedLimit) ? requestedLimit : 20, 50))
  const results = []
  const started = Date.now()
  for (let index = 0; index < limit && Date.now() - started < 45000; index++) {
    const { data, error } = await admin.rpc('claim_chat_delivery', { p_id: payload.delivery_id ?? null })
    if (error) return json({ error: error.message }, 500)
    const item = data?.[0] as QueueItem | undefined
    if (!item) break
    const result = await processDelivery(item)
    const { error: finishError, data: settled } = await admin.rpc('settle_chat_delivery', {
      p_id: item.id,
      p_attempt: item.attempts,
      p_status: result.skipped ? 'skipped' : result.sent ? 'sent' : 'failed',
      p_error: result.error,
    })
    if (finishError || !settled) return json({ error: 'Delivery settlement failed' }, 500)
    results.push({ id: item.id, sent: result.sent, error: result.error })
    if (payload.delivery_id) break
  }
  // A poll announcement must never delay or fail the established delivery queue.
  try {
    await announceStartedFilmPolls()
  } catch (error) {
    console.error('[chat-delivery-worker] Poll opening announcement failed', error)
  }
  try {
    await announceEndedFilmPolls()
    await sendTimedMessages()
  } catch (error) {
    console.error('[chat-delivery-worker] Film poll announcement failed', error)
  }

  try { await refreshVideoDurations() } catch (error) { console.warn('[chat-delivery-worker] Duration metadata unavailable', error) }

  const { error: heartbeatError } = await admin.rpc('record_system_heartbeat', {
    p_component: 'chat-delivery-worker',
  })
  if (heartbeatError) console.error('[chat-delivery-worker] Heartbeat persistence failed', heartbeatError)

  return json({ processed: results.length, results })
})

async function announceStartedFilmPolls() {
  for (let index = 0; index < 8; index++) {
    const { data, error } = await admin.rpc('claim_film_poll_announcement')
    if (error) throw error
    const item = data?.[0]
    if (!item) return
    let sent = false
    let failure: string | null = null
    try {
      const { data: opening, error: openingError } = await admin.from('chat_message_templates').select('template,enabled').eq('streamer_id', item.streamer_id).eq('event_type', 'poll_opening').maybeSingle()
      if (openingError) throw openingError
      if (opening?.enabled === false) {
        const { error: skippedError } = await admin.rpc('settle_film_poll_announcement', { p_id: item.id, p_attempt: item.attempt, p_sent: true, p_error: null })
        if (skippedError) throw skippedError
        continue
      }
      const films = String(item.message).replace(/^🎬 Votação aberta! Vote com o comando do filme: /, '')
      const message = renderBotMessage(opening?.template ?? SYSTEM_BOT_MESSAGES.poll_opening.template, { filmes: films })
      const { data: connection, error: connectionError } = await admin.from('twitch_connections').select('broadcaster_id').eq('streamer_id', item.streamer_id).maybeSingle()
      const { data: credential, error: credentialError } = await admin.from('twitch_chat_credentials').select('*').eq('streamer_id', item.streamer_id).maybeSingle()
      if (connectionError || credentialError || !connection?.broadcaster_id || !credential) throw new Error('Conexão Twitch indisponível')
      const token = await validAccessToken(credential, item.streamer_id)
      if (!token) throw new Error('Token Twitch indisponível')
      const response = await fetch('https://api.twitch.tv/helix/chat/messages', {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Client-Id': TWITCH_CLIENT_ID, 'Content-Type': 'application/json' },
        body: JSON.stringify({ broadcaster_id: connection.broadcaster_id, sender_id: connection.broadcaster_id, message }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok || !body?.data?.[0]?.is_sent) throw new Error(body?.data?.[0]?.drop_reason?.message ?? `Twitch HTTP ${response.status}`)
      sent = true
    } catch (error) {
      failure = error instanceof Error ? error.message : 'Falha ao anunciar votação'
    }
    const { error: settleError } = await admin.rpc('settle_film_poll_announcement', { p_id: item.id, p_attempt: item.attempt, p_sent: sent, p_error: failure })
    if (settleError) throw settleError
  }
}

async function announceEndedFilmPolls() {
  const { data: polls, error } = await admin.from('film_polls')
    .select('id, streamer_id, result_message_template, film_poll_options(id, title, command, film_poll_votes(count))')
    .lte('ends_at', new Date().toISOString()).neq('status', 'archived').is('result_announced_at', null).limit(10)
  if (error) throw error
  for (const poll of polls ?? []) {
    // The vote window ends at its scheduled time. If Twitch rejects the result
    // message, a future worker run keeps retrying because result_announced_at
    // remains null, while the streamer is free to schedule the next poll.
    const { error: endError } = await admin.from('film_polls')
      .update({ status: 'ended' })
      .eq('id', poll.id)
      .neq('status', 'ended')
    if (endError) throw endError
    const options = (poll.film_poll_options ?? []).map((option: Record<string, unknown>) => ({
      ...option, votes: Number((option.film_poll_votes as { count?: number }[])?.[0]?.count ?? 0),
    })).sort((a: { votes: number; title: string }, b: { votes: number; title: string }) => b.votes - a.votes || a.title.localeCompare(b.title))
    const winner = options[0]
    if (!winner) continue
    if (!poll.result_message_template.trim()) {
      const { error: silentError } = await admin.from('film_polls').update({ result_announced_at: new Date().toISOString() }).eq('id', poll.id).is('result_announced_at', null)
      if (silentError) throw silentError
      continue
    }
    const { data: connection } = await admin.from('twitch_connections').select('broadcaster_id').eq('streamer_id', poll.streamer_id).maybeSingle()
    const { data: credential } = await admin.from('twitch_chat_credentials').select('*').eq('streamer_id', poll.streamer_id).maybeSingle()
    if (!connection?.broadcaster_id || !credential) continue
    const token = await validAccessToken(credential, poll.streamer_id)
    if (!token) continue
    const message = poll.result_message_template.replaceAll('{titulo}', winner.title).replaceAll('{votos}', String(winner.votes)).replaceAll('{comando}', String(winner.command ?? '')).slice(0, 500)
    const response = await fetch('https://api.twitch.tv/helix/chat/messages', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Client-Id': TWITCH_CLIENT_ID, 'Content-Type': 'application/json' }, body: JSON.stringify({ broadcaster_id: connection.broadcaster_id, sender_id: connection.broadcaster_id, message }) })
    const body = await response.json().catch(() => null)
    if (response.ok && body?.data?.[0]?.is_sent) await admin.from('film_polls').update({ result_announced_at: new Date().toISOString() }).eq('id', poll.id).is('result_announced_at', null)
  }
}

async function sendTimedMessages() {
  const { data: timers, error } = await admin.from('chat_timed_messages').select('*').eq('enabled', true).limit(30)
  if (error) throw error
  for (const timer of timers ?? []) {
    if (timer.last_sent_at && Date.now() - new Date(timer.last_sent_at).getTime() < timer.interval_minutes * 60_000) continue
    let message = timer.message
    if (timer.kind === 'poll_leader') {
      const { data: poll } = await admin.from('film_polls').select('id').eq('streamer_id', timer.streamer_id).lte('starts_at', new Date().toISOString()).gt('ends_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (!poll) continue
      const { data: votes } = await admin.from('film_poll_votes').select('twitch_user_id').eq('poll_id', poll.id)
      const totals = new Map<string, number>(); for (const vote of votes ?? []) totals.set(vote.twitch_user_id, (totals.get(vote.twitch_user_id) ?? 0) + 1)
      const leader = [...totals.entries()].sort((a, b) => b[1] - a[1])[0]
      if (!leader) continue
      message = message.replaceAll('{viewer}', `@${leader[0]}`).replaceAll('{votos}', String(leader[1]))
    }
    const { data: connection } = await admin.from('twitch_connections').select('broadcaster_id').eq('streamer_id', timer.streamer_id).maybeSingle()
    const { data: credential } = await admin.from('twitch_chat_credentials').select('*').eq('streamer_id', timer.streamer_id).maybeSingle()
    if (!connection?.broadcaster_id || !credential) continue
    const token = await validAccessToken(credential, timer.streamer_id); if (!token) continue
    const response = await fetch('https://api.twitch.tv/helix/chat/messages', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Client-Id': TWITCH_CLIENT_ID, 'Content-Type': 'application/json' }, body: JSON.stringify({ broadcaster_id: connection.broadcaster_id, sender_id: connection.broadcaster_id, message: message.slice(0, 500) }) })
    const body = await response.json().catch(() => null)
    if (response.ok && body?.data?.[0]?.is_sent) await admin.from('chat_timed_messages').update({ last_sent_at: new Date().toISOString() }).eq('id', timer.id)
  }
}

async function processDelivery(item: QueueItem): Promise<{ sent: boolean; skipped?: boolean; error: string | null }> {
  try {
    const { data: previous, error: previousError } = await admin
      .from('chat_message_logs')
      .select('id')
      .eq('suggestion_id', item.suggestion_id)
      .eq('event_type', item.event_type)
      .eq('status', 'sent')
      .limit(1)
      .maybeSingle()
    if (previousError) throw previousError
    if (previous) return { sent: true, error: null }

    const { data: suggestion, error: suggestionError } = await admin
      .from('suggestions')
      .select('id, streamer_id, submitted_by, title, category, chat_display_name')
      .eq('id', item.suggestion_id)
      .eq('streamer_id', item.streamer_id)
      .maybeSingle()
    if (suggestionError) throw suggestionError
    if (!suggestion) return { sent: false, error: 'Sugestão não encontrada' }

    const queries = await Promise.all([
      admin.from('twitch_connections').select('broadcaster_id, token_status').eq('streamer_id', item.streamer_id).maybeSingle(),
      admin.from('streamer_settings').select('chat_notifications_enabled').eq('streamer_id', item.streamer_id).maybeSingle(),
      admin.from('twitch_chat_credentials').select('*').eq('streamer_id', item.streamer_id).maybeSingle(),
      admin.from('chat_message_templates').select('template, enabled').eq('streamer_id', item.streamer_id).eq('event_type', item.event_type).maybeSingle(),
    ])

    for (const query of queries) if (query.error) throw query.error
    const [{ data: connection }, { data: settings }, { data: credential }, { data: template }] = queries
    if (!settings) throw new Error('Configurações do canal não encontradas')
    if (!settings.chat_notifications_enabled || template?.enabled === false) {
      const reason = !settings.chat_notifications_enabled ? 'Avisos do chat desativados no canal' : 'Este aviso está desativado'
      const { error } = await admin.from('chat_message_logs').insert({
        streamer_id: item.streamer_id, suggestion_id: item.suggestion_id,
        event_type: item.event_type, message: '', status: 'skipped', error_message: reason,
      })
      if (error) throw error
      return { sent: false, skipped: true, error: reason }
    }
    if (!connection || connection.token_status !== 'active' || !credential) {
      return { sent: false, error: 'Conexão com o chat da Twitch indisponível' }
    }

    const { data: viewer, error: viewerError } = suggestion.submitted_by
      ? await admin.from('profiles').select('display_name').eq('id', suggestion.submitted_by).maybeSingle()
      : { data: null, error: null }
    if (viewerError) throw viewerError
    const viewerName = viewer?.display_name ?? suggestion.chat_display_name ?? 'Viewer da Twitch'
    let messageTemplate = template?.template || defaultTemplate(item.event_type)
    const message = messageTemplate
      .replaceAll('{viewer}', viewerName)
      .replaceAll('{titulo}', suggestion.title)
      .replaceAll('{categoria}', categoryLabel(suggestion.category))
      .slice(0, 500)

    const token = await validAccessToken(credential, item.streamer_id)
    if (!token) return { sent: false, error: 'Falha ao renovar autorização da Twitch' }

    const response = await fetch('https://api.twitch.tv/helix/chat/messages', {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${token}`, 'Client-Id': TWITCH_CLIENT_ID, 'Content-Type': 'application/json' },
      body: JSON.stringify({ broadcaster_id: connection.broadcaster_id, sender_id: connection.broadcaster_id, message }),
    })
    const body = await response.json().catch(() => null)
    const sent = response.ok && body?.data?.[0]?.is_sent === true
    const errorMessage = sent ? null : body?.data?.[0]?.drop_reason?.message ?? `Twitch respondeu ${response.status}`

    if (response.status === 401 || response.status === 403) {
      await markReconnectRequired(item.streamer_id)
    }
    const { error: logError } = await admin.from('chat_message_logs').insert({
      streamer_id: item.streamer_id,
      suggestion_id: item.suggestion_id,
      event_type: item.event_type,
      message,
      status: sent ? 'sent' : 'failed',
      error_message: errorMessage,
    })
    // Preserve confirmed delivery even if the auxiliary log write fails.
    if (logError) console.error('[chat-delivery-worker] Log persistence failed', logError)
    return { sent, error: errorMessage }
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : String(error) }
  }
}

async function validAccessToken(credential: Record<string, string>, streamerId: string) {
  if (new Date(credential.expires_at).getTime() > Date.now() + 60_000) return credential.access_token
  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    signal: AbortSignal.timeout(10000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: credential.refresh_token,
      client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET,
    }),
  })
  if (!response.ok) {
    await markReconnectRequired(streamerId)
    return null
  }
  const refreshed = await response.json()
  const { error } = await admin.from('twitch_chat_credentials').update({
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token ?? credential.refresh_token,
    expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('streamer_id', streamerId)
  if (error) throw error
  return refreshed.access_token as string
}

async function markReconnectRequired(streamerId: string) {
  const { error } = await admin.rpc('mark_twitch_reconnect_required', {
    p_streamer_id: streamerId, p_status: 'expired',
  })
  if (error) throw error
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

async function refreshVideoDurations() {
  const retryBefore = new Date(Date.now() - 86400000).toISOString()
  // Small independent batches never block chat delivery when a provider is unavailable.
  for (const table of ['suggestions', 'watch_history']) {
    let query = admin.from(table).select('id,source_url').is('duration_seconds', null).not('source_url', 'is', null)
      .or('duration_checked_at.is.null,duration_checked_at.lt.' + retryBefore)
      .order('completed_at', { ascending: false, nullsFirst: false }).limit(3)
    if (table === 'watch_history') query = query.is('suggestion_id', null)
    const { data, error } = await query
    if (error) throw error
    await Promise.all((data ?? []).map(async item => {
      const seconds = await fetchOriginalDuration(item.source_url)
      const update = { duration_checked_at: new Date().toISOString(), ...(seconds ? { duration_seconds: seconds, duration_source: 'youtube' } : {}) }
      const { error: updateError } = await admin.from(table).update(update).eq('id', item.id).eq('source_url', item.source_url).is('duration_seconds', null)
      if (updateError) throw updateError
    }))
  }
}
