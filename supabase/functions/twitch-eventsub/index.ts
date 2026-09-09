// Receives signed Twitch EventSub chat messages and creates pending suggestions.
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { normalizeContentReference } from '../_shared/content-reference.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TWITCH_CLIENT_ID = Deno.env.get('TWITCH_CLIENT_ID')!
const TWITCH_CLIENT_SECRET = Deno.env.get('TWITCH_CLIENT_SECRET')!
const EVENTSUB_SECRET = Deno.env.get('TWITCH_EVENTSUB_SECRET')!
const APP_URL = Deno.env.get('APP_URL') ?? 'https://streamer-queue.vercel.app'

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

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  if (messageType === 'revocation') {
    console.warn('[twitch-eventsub] Subscription revoked:', payload.subscription?.status)
    await handleRevocation(admin, payload)
    return new Response(null, { status: 204 })
  }
  if (messageType !== 'notification') return new Response(null, { status: 204 })

  const { data: attempt, error: claimError } = await admin.rpc('claim_twitch_event', {
    p_message_id: messageId, p_event_type: payload.subscription.type,
  })
  if (claimError) return new Response('Event storage unavailable', { status: 503 })
  if (attempt === 0) return new Response(null, { status: 204 })
  if (!attempt || attempt < 0) return new Response('Event is processing', { status: 503 })
  try {
    const response = await processNotification(admin, payload, messageId, attempt)
    const { data: finished, error } = await admin.rpc('finish_twitch_event', {
      p_message_id: messageId, p_attempt: attempt, p_completed: true,
    })
    if (error || !finished) throw new Error('Event completion unavailable')
    return response
  } catch (error) {
    console.error('[twitch-eventsub] Processing failed', error)
    const { error: releaseError } = await admin.rpc('finish_twitch_event', {
      p_message_id: messageId, p_attempt: attempt, p_completed: false,
    })
    if (releaseError) console.error('[twitch-eventsub] Lease release failed', releaseError)
    return new Response('Event processing unavailable', { status: 503 })
  }
})

async function handleRevocation(admin: SupabaseClient, payload: {
  subscription?: { type?: string; status?: string; condition?: { broadcaster_user_id?: string } }
}) {
  const subscription = payload.subscription
  if (subscription?.type !== 'channel.chat.message' || subscription.status !== 'authorization_revoked') return
  const broadcasterId = subscription.condition?.broadcaster_user_id
  if (!broadcasterId) return
  const { data: streamer, error } = await admin.from('streamers')
    .select('id').eq('twitch_broadcaster_id', broadcasterId).maybeSingle()
  if (error) throw error
  if (!streamer) return
  const { error: markError } = await admin.rpc('mark_twitch_reconnect_required', {
    p_streamer_id: streamer.id, p_status: 'revoked',
  })
  if (markError) throw markError
}

async function processNotification(
  admin: SupabaseClient,
  payload: { subscription: { type: string }; event: ChatMessageEvent & { started_at?: string } },
  messageId: string,
  attempt: number,
) {

  const subscriptionType = payload.subscription?.type
  if (subscriptionType === 'stream.online' || subscriptionType === 'stream.offline') {
    const isLive = subscriptionType === 'stream.online'
    const { error } = await admin.from('streamers').update({
      is_live: isLive,
      live_started_at: isLive ? payload.event?.started_at ?? new Date().toISOString() : null,
      live_status_updated_at: new Date().toISOString(),
    }).eq('twitch_broadcaster_id', payload.event?.broadcaster_user_id)
    if (error) throw error
    return new Response(null, { status: 204 })
  }
  if (subscriptionType !== 'channel.chat.message') return new Response(null, { status: 204 })

  const event = payload.event as ChatMessageEvent
  const { data: streamer, error: streamerError } = await admin
    .from('streamers')
    .select('id, channel_name, is_active, accepting_suggestions, settings:streamer_settings(chat_command, chat_command_enabled)')
    .eq('twitch_broadcaster_id', event.broadcaster_user_id)
    .maybeSingle()
  if (streamerError) throw streamerError

  const settings = Array.isArray(streamer?.settings) ? streamer.settings[0] : streamer?.settings
  if (!streamer?.is_active || !settings) return new Response(null, { status: 204 })

  const text = event.message?.text?.trim() ?? ''
  const firstSpace = text.search(/\s/)
  const command = (firstSpace === -1 ? text : text.slice(0, firstSpace)).toLowerCase()
  const title = (firstSpace === -1 ? '' : text.slice(firstSpace + 1)).trim()

  if (command === '!command' || command === '!cmd') {
    await handleChatCommandManagement(admin, streamer.id, event, title)
    return new Response(null, { status: 204 })
  }

  if (!['!fila', '!proximo', settings.chat_command.toLowerCase()].includes(command)) {
    // Poll commands are independent from the suggestion command and are resolved atomically in Postgres.
    const { data: pollVote, error: pollVoteError } = await admin.rpc('cast_film_poll_vote', {
      p_streamer_id: streamer.id, p_twitch_user_id: event.chatter_user_id, p_command: command,
    })
    if (pollVoteError) throw pollVoteError
    const vote = pollVote?.[0]
    if (vote?.accepted) {
      const message = String(vote.viewer_template)
        .replaceAll('{viewer}', `@${event.chatter_user_login}`)
        .replaceAll('{titulo}', vote.title)
        .replaceAll('{votos}', String(vote.votes))
        .replaceAll('{comando}', vote.command)
      await sendChatMessage(admin, streamer.id, event.broadcaster_user_id, message)
      return new Response(null, { status: 204 })
    }
    const { data: personalCounter, error: counterError } = await admin.rpc('increment_personal_chat_counter', {
      p_streamer_id: streamer.id, p_command: command, p_target: event.chatter_user_login,
    })
    if (counterError) throw counterError
    const counter = personalCounter?.[0]
    if (counter) {
      // Keep the login as the counter key, but display Twitch's original casing.
      const targetDisplayName = event.chatter_user_name?.trim() || counter.target_display_name
      await sendChatMessage(admin, streamer.id, event.broadcaster_user_id, String(counter.response_template)
        .replaceAll('{target}', targetDisplayName).replaceAll('{count}', String(counter.count)))
      return new Response(null, { status: 204 })
    }
    const { data: customCommand, error: customCommandError } = await admin.rpc('claim_chat_custom_command', {
      p_streamer_id: streamer.id, p_command: command, p_twitch_user_id: event.chatter_user_id,
    })
    if (customCommandError) throw customCommandError
    const claimedCommand = customCommand?.[0]
    if (claimedCommand?.response) {
      await sendChatMessage(admin, streamer.id, event.broadcaster_user_id,
        renderChatTemplate(String(claimedCommand.response), {
          event, messageId, channelName: streamer.channel_name, command, argumentsText: title,
          usageCount: Number(claimedCommand.usage_count ?? 0),
        }))
    }
    return new Response(null, { status: 204 })
  }
  if (!settings.chat_command_enabled) return new Response(null, { status: 204 })
  const { data: commandAllowed, error: cooldownError } = await admin.rpc('claim_twitch_event_command', {
    p_message_id: messageId, p_attempt: attempt,
    p_streamer_id: streamer.id, p_twitch_user_id: event.chatter_user_id,
  })
  if (cooldownError) {
    throw cooldownError
  }
  if (!commandAllowed) return new Response(null, { status: 204 })
  if (command === '!fila' || command === '!proximo') {
    await answerQueueCommand(admin, streamer.id, event.broadcaster_user_id, event.chatter_user_login, command)
    return new Response(null, { status: 204 })
  }
  if (command !== settings.chat_command.toLowerCase()) return new Response(null, { status: 204 })
  if (streamer.accepting_suggestions === false && event.chatter_user_id !== event.broadcaster_user_id) {
    await sendChatMessage(admin, streamer.id, event.broadcaster_user_id,
      `@${event.chatter_user_login}, as sugestões estão pausadas neste momento.`)
    return new Response(null, { status: 204 })
  }
  if (!title) {
    await sendChatMessage(admin, streamer.id, event.broadcaster_user_id,
      `@${event.chatter_user_login}, use ${settings.chat_command} seguido do nome do conteúdo.`)
    return new Response(null, { status: 204 })
  }

  if (title.length > 200) {
    await sendChatMessage(admin, streamer.id, event.broadcaster_user_id,
      `@${event.chatter_user_login}, use no máximo 200 caracteres no nome do conteúdo.`)
    return new Response(null, { status: 204 })
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id')
    .eq('twitch_user_id', event.chatter_user_id)
    .maybeSingle()
  if (profileError) throw profileError

  if (profile) {
    const { data: banned, error: banError } = await admin
      .from('banned_users')
      .select('id')
      .eq('streamer_id', streamer.id)
      .eq('user_id', profile.id)
      .maybeSingle()
    if (banError) throw banError
    if (banned) return new Response(null, { status: 204 })
  }

  const { data: existing, error: existingError } = await admin.from('suggestions')
    .select('id,title').eq('twitch_event_message_id', messageId).maybeSingle()
  if (existingError) throw existingError
  const content = existing ? { title: existing.title, sourceUrl: null, thumbnailUrl: null } : await normalizeContentReference(title)
  let suggestion = existing
  if (!suggestion) {
    const { data: inserted, error: insertError } = await admin.from('suggestions').insert({
      twitch_event_message_id: messageId,
      streamer_id: streamer.id,
      submitted_by: profile?.id ?? null,
      category: 'other',
      title: content.title,
      description: `Enviado pelo chat da Twitch por @${event.chatter_user_login}.`,
      source_url: content.sourceUrl,
      poster_url: content.thumbnailUrl,
      status: 'pending',
      submission_source: profile ? 'platform' : 'chat',
      submission_priority: profile ? 100 : 0,
      chat_user_id: profile ? null : event.chatter_user_id,
      chat_user_login: profile ? null : event.chatter_user_login,
      chat_display_name: profile ? null : event.chatter_user_name,
    }).select('id').single()
    // A previous lease may have finished inserting just as it expired.
    if (insertError) {
      const { data: recovered, error } = await admin.from('suggestions')
        .select('id,title').eq('twitch_event_message_id', messageId).maybeSingle()
      if (error) throw error
      suggestion = recovered
    } else suggestion = { id: inserted.id, title: content.title }
    if (!suggestion) {
      if (insertError?.message?.includes('SUGGESTION_ALREADY_ACTIVE')) {
        await sendChatMessage(admin, streamer.id, event.broadcaster_user_id,
          `@${event.chatter_user_login}, você já enviou essa sugestão e ela continua na lista. Não precisa enviar novamente.`)
        return new Response(null, { status: 204 })
      }
      if (insertError) throw insertError
    }
  }
  if (!suggestion) throw new Error('Suggestion persistence unavailable')

  const { data: alreadySent, error: logLookupError } = await admin.from('chat_message_logs')
    .select('id').eq('suggestion_id', suggestion.id).eq('event_type', 'chat_suggestion_received')
    .eq('status', 'sent').limit(1).maybeSingle()
  if (logLookupError) throw logLookupError
  if (alreadySent) return new Response(null, { status: 204 })

  const confirmation = `@${event.chatter_user_login}, “${content.title}” foi enviado. O streamer irá revisar o conteúdo e visualizar quando puder. Usuários da plataforma têm prioridade.`
  const sendResult = await sendChatMessage(admin, streamer.id, event.broadcaster_user_id, confirmation)
  const { error: logError } = await admin.from('chat_message_logs').insert({
    streamer_id: streamer.id,
    suggestion_id: suggestion.id,
    event_type: 'chat_suggestion_received',
    message: confirmation,
    status: sendResult.sent ? 'sent' : 'failed',
    error_message: sendResult.error,
  })
  if (logError) throw logError

  return new Response(null, { status: 204 })
}

async function handleChatCommandManagement(
  admin: SupabaseClient,
  streamerId: string,
  event: ChatMessageEvent,
  content: string,
) {
  const { data: isManager, error: permissionError } = await admin.rpc('is_twitch_chat_manager', {
    p_streamer_id: streamerId,
    p_twitch_user_id: event.chatter_user_id,
  })
  if (permissionError) throw permissionError
  if (!isManager) return

  const [action = '', target = '', ...responseParts] = content.trim().split(/\s+/)
  const normalizedAction = action.toLowerCase()
  const response = responseParts.join(' ')
  if (!action || !target || ((normalizedAction === 'add' || normalizedAction === 'edit' || normalizedAction === 'update') && !response)) {
    await sendChatMessage(admin, streamerId, event.broadcaster_user_id,
      `@${event.chatter_user_login}, use !command add !nome resposta, !command edit !nome nova resposta, !command remove !nome ou !command show !nome.`)
    return
  }

  const { data, error } = await admin.rpc('manage_chat_command_from_twitch', {
    p_streamer_id: streamerId,
    p_twitch_user_id: event.chatter_user_id,
    p_action: normalizedAction,
    p_command: target,
    p_response: response || null,
  })
  if (error) throw error
  const result = data?.[0]
  if (result?.message) {
    await sendChatMessage(admin, streamerId, event.broadcaster_user_id, `@${event.chatter_user_login}, ${result.message}`)
  }
}

function renderChatTemplate(template: string, context: {
  event: ChatMessageEvent
  messageId: string
  channelName: string
  command: string
  argumentsText: string
  usageCount: number
}) {
  const args = context.argumentsText ? context.argumentsText.split(/\s+/) : []
  const words = [context.command, ...args]
  const displayName = context.event.chatter_user_name || context.event.chatter_user_login
  const target = args[0]?.replace(/^@/, '') || displayName

  const argumentValue = (startRaw: string, endRaw: string | undefined, fallback: string | undefined) => {
    const start = startRaw === '' ? 0 : Number(startRaw)
    const end = endRaw === undefined ? start : endRaw === '' ? words.length - 1 : Number(endRaw)
    const value = Number.isFinite(start) && Number.isFinite(end) && start <= end
      ? words.slice(start, end + 1).join(' ')
      : ''
    return value || fallback || ''
  }

  let output = template
    .replaceAll('{viewer}', `@${context.event.chatter_user_login}`)
    .replace(/\$\((\d*)(?::(\d*)?)?(?:\|([^)]*))?\)|\$\{(\d*)(?::(\d*)?)?(?:\|([^}]*))?\}/g,
      (_match, pStart, pEnd, pFallback, bStart, bEnd, bFallback) => argumentValue(
        pStart ?? bStart, pEnd ?? bEnd, pFallback ?? bFallback,
      ))

  const replacements: Record<string, string> = {
    sender: displayName,
    'sender.name': context.event.chatter_user_login,
    'sender.twitchid': context.event.chatter_user_id,
    source: displayName,
    user: target,
    'user.name': target.toLowerCase(),
    touser: target,
    channel: context.channelName,
    'channel.display_name': context.channelName,
    'channel.provider': 'twitch',
    'channel.provider_id': context.event.broadcaster_user_id,
    provider: 'twitch',
    msgid: context.messageId,
    pointsname: 'pontos',
    count: String(context.usageCount),
    getcount: String(context.usageCount),
  }
  output = output.replace(/\$\((sender(?:\.(?:name|twitchid))?|source|user(?:\.(?:name))?|touser|channel(?:\.(?:display_name|provider|provider_id))?|provider|msgid|pointsname|count|getcount)\)|\$\{(sender(?:\.(?:name|twitchid))?|source|user(?:\.(?:name))?|touser|channel(?:\.(?:display_name|provider|provider_id))?|provider|msgid|pointsname|count|getcount)\}/gi,
    (_match, parenthesized, braced) => replacements[String(parenthesized ?? braced).toLowerCase()] ?? '')

  output = output
    .replace(/\$\((?:random)\)|\$\{(?:random)\}/gi, () => String(Math.floor(Math.random() * 100) + 1))
    .replace(/\$\((?:random|random\.number)\.(\d+)-(\d+)\)|\$\{(?:random|random\.number)\.(\d+)-(\d+)\}/gi,
      (_match, fromA, toA, fromB, toB) => {
        const from = Number(fromA ?? fromB)
        const to = Number(toA ?? toB)
        return Number.isFinite(from) && Number.isFinite(to) && to >= from
          ? String(Math.floor(Math.random() * (to - from + 1)) + from)
          : ''
      })
    .replace(/\$\((?:queryescape|queryencode) ([^)]+)\)|\$\{(?:queryescape|queryencode) ([^}]+)\}/gi,
      (_match, a, b) => encodeURIComponent(String(a ?? b)).replace(/%20/g, '+'))
    .replace(/\$\((?:pathescape|pathencode) ([^)]+)\)|\$\{(?:pathescape|pathencode) ([^}]+)\}/gi,
      (_match, a, b) => encodeURIComponent(String(a ?? b)))
    .replace(/\$\(repeat (\d+) ([^)]+)\)|\$\{repeat (\d+) ([^}]+)\}/gi,
      (_match, countA, textA, countB, textB) => Array.from(
        { length: Math.min(Number(countA ?? countB), 100) },
        () => String(textA ?? textB),
      ).join(' '))

  return output.slice(0, 500)
}

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

async function answerQueueCommand(
  admin: SupabaseClient,
  streamerId: string,
  broadcasterId: string,
  chatterLogin: string,
  command: string,
) {
  const queries = await Promise.all([
    admin.from('streamers').select('slug').eq('id', streamerId).single(),
    admin.from('suggestions').select('title').eq('streamer_id', streamerId).eq('status', 'watching').order('started_at', { ascending: false }).limit(1).maybeSingle(),
    admin.from('suggestions').select('title, queue_position').eq('streamer_id', streamerId).eq('status', 'queued').order('queue_position', { ascending: true }).limit(3),
  ])
  for (const result of queries) if (result.error) throw result.error
  const [{ data: streamer }, { data: watching }, { data: queued }] = queries
  const link = `${APP_URL.replace(/\/$/, '')}/${streamer?.slug ?? ''}`
  let message: string
  if (command === '!proximo') {
    message = queued?.[0]
      ? `@${chatterLogin}, o próximo da fila é “${queued[0].title}”. Veja a fila: ${link}`
      : `@${chatterLogin}, a fila está vazia. Envie uma sugestão: ${link}`
  } else {
    const now = watching?.title ? `Agora: “${watching.title}”. ` : ''
    const list = queued?.length ? `Fila: ${queued.map((item, index) => `${index + 1}. ${item.title}`).join(' • ')}.` : 'A fila está vazia.'
    message = `@${chatterLogin}, ${now}${list} ${link}`
  }
  await sendChatMessage(admin, streamerId, broadcasterId, message)
}

async function sendChatMessage(admin: SupabaseClient, streamerId: string, broadcasterId: string, message: string) {
  try {
    const { data: credential, error: credentialError } = await admin.from('twitch_chat_credentials').select('*').eq('streamer_id', streamerId).maybeSingle()
    if (credentialError) throw credentialError
    if (!credential) throw new Error('Chat não conectado')

    let accessToken = credential.access_token
    if (new Date(credential.expires_at).getTime() <= Date.now() + 60_000) {
      const refreshResponse = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        signal: AbortSignal.timeout(5000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token', refresh_token: credential.refresh_token,
          client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET,
        }),
      })
      if (!refreshResponse.ok) {
        await markReconnectRequired(admin, streamerId, 'expired')
        throw new Error('Falha ao renovar autorização')
      }
      const refreshed = await refreshResponse.json()
      accessToken = refreshed.access_token
      const { error: saveError } = await admin.from('twitch_chat_credentials').update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token ?? credential.refresh_token,
        expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('streamer_id', streamerId)
      if (saveError) throw saveError
    }

    const response = await fetch('https://api.twitch.tv/helix/chat/messages', {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
      headers: { Authorization: `Bearer ${accessToken}`, 'Client-Id': TWITCH_CLIENT_ID, 'Content-Type': 'application/json' },
      body: JSON.stringify({ broadcaster_id: broadcasterId, sender_id: broadcasterId, message: message.slice(0, 500) }),
    })
    const result = await response.json().catch(() => null)
    if (!response.ok || result?.data?.[0]?.is_sent !== true) {
      if (response.status === 401 || response.status === 403) {
        await markReconnectRequired(admin, streamerId, 'expired')
      }
      throw new Error(result?.data?.[0]?.drop_reason?.message ?? `Twitch respondeu ${response.status}`)
    }
    return { sent: true, error: null }
  } catch (error) {
    throw error
  }
}

async function markReconnectRequired(admin: SupabaseClient, streamerId: string, status: 'expired' | 'revoked') {
  const { error } = await admin.rpc('mark_twitch_reconnect_required', {
    p_streamer_id: streamerId, p_status: status,
  })
  if (error) throw error
}
