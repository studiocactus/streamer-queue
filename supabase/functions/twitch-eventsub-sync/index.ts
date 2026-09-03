import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TWITCH_CLIENT_ID = Deno.env.get('TWITCH_CLIENT_ID')!
const TWITCH_CLIENT_SECRET = Deno.env.get('TWITCH_CLIENT_SECRET')!
const TWITCH_EVENTSUB_SECRET = Deno.env.get('TWITCH_EVENTSUB_SECRET')!
const TWITCH_EVENTSUB_CALLBACK = Deno.env.get('TWITCH_EVENTSUB_CALLBACK') ?? `${SUPABASE_URL}/functions/v1/twitch-eventsub`
const CHAT_WORKER_SECRET = Deno.env.get('CHAT_WORKER_SECRET')

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!CHAT_WORKER_SECRET || req.headers.get('x-chat-worker-secret') !== CHAT_WORKER_SECRET) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: TWITCH_CLIENT_ID,
      client_secret: TWITCH_CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  })
  if (!tokenResponse.ok) return json({ error: 'Twitch authorization failed' }, 502)
  const accessToken = (await tokenResponse.json()).access_token as string

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: streamers, error } = await admin
    .from('streamers')
    .select('id, twitch_broadcaster_id')
    .eq('is_active', true)
    .not('twitch_broadcaster_id', 'is', null)
  if (error) return json({ error: error.message }, 500)

  let created = 0
  let existing = 0
  const failures: string[] = []
  const activeSubscriptions = new Set<string>()
  let subscriptionInventoryComplete = true
  let cursor: string | undefined

  do {
    const params = new URLSearchParams({ first: '100' })
    if (cursor) params.set('after', cursor)
    const response = await fetch(`https://api.twitch.tv/helix/eventsub/subscriptions?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Client-Id': TWITCH_CLIENT_ID },
    })
    if (!response.ok) {
      failures.push(`subscriptions-list:${response.status}`)
      subscriptionInventoryComplete = false
      break
    }
    const payload = await response.json() as {
      data?: Array<{
        status: string
        type: string
        condition: { broadcaster_user_id?: string; user_id?: string }
        transport: { method?: string; callback?: string }
      }>
      pagination?: { cursor?: string }
    }
    for (const subscription of payload.data ?? []) {
      if (
        ['enabled', 'webhook_callback_verification_pending'].includes(subscription.status)
        && subscription.transport.method === 'webhook'
        && subscription.transport.callback === TWITCH_EVENTSUB_CALLBACK
      ) {
        activeSubscriptions.add(subscriptionKey(
          subscription.type,
          subscription.condition.broadcaster_user_id,
          subscription.condition.user_id,
        ))
      }
    }
    cursor = payload.pagination?.cursor
  } while (cursor)

  for (const streamer of streamers ?? []) {
    for (const type of ['stream.online', 'stream.offline', 'channel.chat.message']) {
      const condition = type === 'channel.chat.message'
        ? { broadcaster_user_id: streamer.twitch_broadcaster_id, user_id: streamer.twitch_broadcaster_id }
        : { broadcaster_user_id: streamer.twitch_broadcaster_id }
      const key = subscriptionKey(type, condition.broadcaster_user_id, 'user_id' in condition ? condition.user_id : undefined)
      if (activeSubscriptions.has(key)) {
        existing++
        continue
      }
      if (!subscriptionInventoryComplete) continue
      const response = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Client-Id': TWITCH_CLIENT_ID,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type,
          version: '1',
          condition,
          transport: { method: 'webhook', callback: TWITCH_EVENTSUB_CALLBACK, secret: TWITCH_EVENTSUB_SECRET },
        }),
      })
      if (response.ok) {
        created++
        activeSubscriptions.add(key)
      }
      else if (response.status === 409) existing++
      else failures.push(`${type}:${response.status}`)
    }
  }

  // EventSub tells us about future changes. This snapshot also corrects stale
  // state after deploys, reconnects or missed webhook deliveries.
  let reconciled = 0
  const broadcasterIds = (streamers ?? []).map((streamer) => streamer.twitch_broadcaster_id as string)
  const liveStreams = new Map<string, string>()
  let statusSnapshotComplete = true
  for (let offset = 0; offset < broadcasterIds.length; offset += 100) {
    const params = new URLSearchParams()
    for (const broadcasterId of broadcasterIds.slice(offset, offset + 100)) params.append('user_id', broadcasterId)
    const response = await fetch(`https://api.twitch.tv/helix/streams?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Client-Id': TWITCH_CLIENT_ID },
    })
    if (!response.ok) {
      failures.push(`stream-status:${response.status}`)
      statusSnapshotComplete = false
      continue
    }
    const payload = await response.json() as { data?: Array<{ user_id: string; started_at: string }> }
    for (const liveStream of payload.data ?? []) liveStreams.set(liveStream.user_id, liveStream.started_at)
  }

  const checkedAt = new Date().toISOString()
  for (const streamer of statusSnapshotComplete ? (streamers ?? []) : []) {
    const startedAt = liveStreams.get(streamer.twitch_broadcaster_id as string)
    const isLive = Boolean(startedAt)
    const { error: updateError } = await admin
      .from('streamers')
      .update({
        is_live: isLive,
        live_started_at: startedAt ?? null,
        live_status_updated_at: checkedAt,
      })
      .eq('id', streamer.id)
    if (updateError) failures.push(`stream-status-update:${streamer.id}`)
    else reconciled++
  }

  return json({ channels: streamers?.length ?? 0, created, existing, reconciled, failures }, failures.length ? 207 : 200)
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function subscriptionKey(type: string, broadcasterId?: string, userId?: string) {
  return `${type}:${broadcasterId ?? ''}:${userId ?? ''}`
}
