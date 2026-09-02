const TWITCH_CLIENT_ID = Deno.env.get('TWITCH_CLIENT_ID')!
const TWITCH_CLIENT_SECRET = Deno.env.get('TWITCH_CLIENT_SECRET')!
const APP_URL = Deno.env.get('APP_URL') ?? '*'

let cachedToken = ''
let tokenExpiresAt = 0

async function getAppToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken
  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, grant_type: 'client_credentials' }),
  })
  if (!response.ok) throw new Error('Não foi possível autenticar na Twitch')
  const data = await response.json()
  cachedToken = data.access_token
  tokenExpiresAt = Date.now() + Math.max(60, data.expires_in - 120) * 1000
  return cachedToken
}

Deno.serve(async (req) => {
  const headers = {
    'Access-Control-Allow-Origin': APP_URL,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json',
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  try {
    const { login } = await req.json()
    if (!login) return new Response(JSON.stringify({ error: 'Login obrigatório' }), { status: 400, headers })
    const token = await getAppToken()
    const response = await fetch(`https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(login)}`, {
      headers: { Authorization: `Bearer ${token}`, 'Client-Id': TWITCH_CLIENT_ID },
    })
    if (!response.ok) throw new Error('Falha ao consultar status da Twitch')
    const data = await response.json()
    const stream = data.data?.[0]
    return new Response(JSON.stringify({ is_live: Boolean(stream), title: stream?.title ?? null, game_name: stream?.game_name ?? null, viewer_count: stream?.viewer_count ?? 0 }), { headers })
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error), is_live: false }), { status: 500, headers })
  }
})
