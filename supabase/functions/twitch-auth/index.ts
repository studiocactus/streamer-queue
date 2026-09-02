// ============================================================
// WatchQueue — Edge Function: twitch-auth
// Fluxo: iniciar OAuth / processar callback / criar/atualizar perfil
// ============================================================
// Deploy: supabase functions deploy twitch-auth
// Variáveis necessárias (via supabase secrets set):
//   TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_REDIRECT_URI,
//   APP_URL, SUPABASE_SERVICE_ROLE_KEY
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TWITCH_CLIENT_ID = Deno.env.get('TWITCH_CLIENT_ID')
const TWITCH_CLIENT_SECRET = Deno.env.get('TWITCH_CLIENT_SECRET')
const TWITCH_REDIRECT_URI = Deno.env.get('TWITCH_REDIRECT_URI')
const APP_URL = Deno.env.get('APP_URL') ?? 'http://localhost:5173'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TWITCH_EVENTSUB_SECRET = Deno.env.get('TWITCH_EVENTSUB_SECRET')
const TWITCH_EVENTSUB_CALLBACK = Deno.env.get('TWITCH_EVENTSUB_CALLBACK') ?? `${SUPABASE_URL}/functions/v1/twitch-eventsub`

const TWITCH_AUTH_URL = 'https://id.twitch.tv/oauth2/authorize'
const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token'
const TWITCH_USERS_URL = 'https://api.twitch.tv/helix/users'

// Escopos mínimos — apenas identificação do viewer
// Permissões de chat serão concedidas pelo streamer separadamente
const VIEWER_SCOPES = 'openid user:read:email'
const CHAT_SCOPES = 'user:write:chat user:read:chat user:bot channel:bot'

async function subscribeToChatMessages(broadcasterId: string) {
  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !TWITCH_EVENTSUB_SECRET) {
    throw new Error('EventSub não configurado no servidor')
  }
  const tokenResponse = await fetch(TWITCH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: TWITCH_CLIENT_ID,
      client_secret: TWITCH_CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  })
  if (!tokenResponse.ok) throw new Error('Falha ao autorizar EventSub')
  const appToken = await tokenResponse.json()
  const response = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${appToken.access_token}`,
      'Client-Id': TWITCH_CLIENT_ID,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'channel.chat.message',
      version: '1',
      condition: { broadcaster_user_id: broadcasterId, user_id: broadcasterId },
      transport: { method: 'webhook', callback: TWITCH_EVENTSUB_CALLBACK, secret: TWITCH_EVENTSUB_SECRET },
    }),
  })
  if (!response.ok && response.status !== 409) {
    throw new Error(`Falha ao assinar mensagens do chat: ${await response.text()}`)
  }
}

function readCookie(req: Request, name: string) {
  const cookies = req.headers.get('cookie') ?? ''
  return cookies.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1)
}

function safeStreamerReturnTo(value: string | null | undefined) {
  if (!value) return '/dashboard'
  const legacyMatch = value.match(/^\/streamer\/([a-z0-9_-]+)$/i)
  const slug = legacyMatch?.[1] ?? value.match(/^\/([a-z0-9_-]+)$/i)?.[1]
  if (slug && !['auth', 'dashboard', 'explore', 'streamer'].includes(slug.toLowerCase())) return `/${slug.toLowerCase()}`
  return '/dashboard'
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const pathname = url.pathname

  // CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': APP_URL,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  if (req.method === 'POST') {
    const corsHeaders = { 'Access-Control-Allow-Origin': APP_URL, 'Content-Type': 'application/json' }
    try {
      const { action, streamer_id: streamerId } = await req.json()
      const authHeader = req.headers.get('Authorization')
      if (action !== 'disconnect_chat' || !streamerId || !authHeader?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400, headers: corsHeaders })
      }

      const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      const { data: authData, error: authError } = await adminClient.auth.getUser(authHeader.slice(7))
      if (authError || !authData.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
      }

      const { data: owner } = await adminClient
        .from('streamers')
        .select('id')
        .eq('id', streamerId)
        .eq('owner_id', authData.user.id)
        .maybeSingle()
      if (!owner) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders })
      }

      const { data: credential } = await adminClient
        .from('twitch_chat_credentials')
        .select('access_token')
        .eq('streamer_id', streamerId)
        .maybeSingle()

      if (credential?.access_token && TWITCH_CLIENT_ID) {
        await fetch('https://id.twitch.tv/oauth2/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ client_id: TWITCH_CLIENT_ID, token: credential.access_token }),
        }).catch((error) => console.error('Falha ao revogar token Twitch:', error))
      }

      const [credentialsResult, connectionResult, settingsResult] = await Promise.all([
        adminClient.from('twitch_chat_credentials').delete().eq('streamer_id', streamerId),
        adminClient.from('twitch_connections').update({ token_status: 'revoked' }).eq('streamer_id', streamerId),
        adminClient.from('streamer_settings').update({ chat_notifications_enabled: false }).eq('streamer_id', streamerId),
      ])
      const persistenceError = credentialsResult.error ?? connectionResult.error ?? settingsResult.error
      if (persistenceError) throw persistenceError

      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders })
    } catch (error) {
      console.error('Erro ao desconectar chat:', error)
      return new Response(JSON.stringify({ error: 'Disconnect failed' }), { status: 500, headers: corsHeaders })
    }
  }

  // ============================================================
  // GET /twitch-auth/login — Inicia o fluxo OAuth
  // ============================================================
  if (pathname.endsWith('/login')) {
    if (!TWITCH_CLIENT_ID || !TWITCH_REDIRECT_URI) {
      return Response.redirect(
        `${APP_URL}/auth/callback?error=twitch_not_configured`,
        302
      )
    }

    // State para CSRF protection
    const state = crypto.randomUUID()
    const returnTo = safeStreamerReturnTo(url.searchParams.get('return_to'))

    const params = new URLSearchParams({
      client_id: TWITCH_CLIENT_ID,
      redirect_uri: TWITCH_REDIRECT_URI,
      response_type: 'code',
      scope: VIEWER_SCOPES,
      state,
      claims: JSON.stringify({
        id_token: { email: null, preferred_username: null },
        userinfo: { picture: null, updated_at: null },
      }),
    })

    const response = Response.redirect(`${TWITCH_AUTH_URL}?${params}`, 302)

    // Armazenar state em cookie seguro
    const headers = new Headers(response.headers)
    headers.set(
      'Set-Cookie',
      `twitch_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`
    )
    headers.append(
      'Set-Cookie',
      `twitch_return_to=${encodeURIComponent(returnTo)}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`
    )

    return new Response(null, {
      status: 302,
      headers,
    })
  }

  if (pathname.endsWith('/connect-chat')) {
    const streamerId = url.searchParams.get('streamer_id')
    if (!streamerId || !TWITCH_CLIENT_ID || !TWITCH_REDIRECT_URI) {
      return Response.redirect(`${APP_URL}/dashboard/streamer?chat=invalid`, 302)
    }
    const state = crypto.randomUUID()
    const params = new URLSearchParams({
      client_id: TWITCH_CLIENT_ID,
      redirect_uri: TWITCH_REDIRECT_URI,
      response_type: 'code',
      scope: CHAT_SCOPES,
      state,
      force_verify: 'true',
    })
    const headers = new Headers({ Location: `${TWITCH_AUTH_URL}?${params}` })
    headers.append('Set-Cookie', `twitch_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`)
    headers.append('Set-Cookie', `twitch_oauth_mode=chat; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`)
    headers.append('Set-Cookie', `twitch_streamer_id=${streamerId}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`)
    return new Response(null, { status: 302, headers })
  }

  // ============================================================
  // GET /twitch-auth/callback — Processa o retorno do Twitch
  // ============================================================
  if (pathname.endsWith('/callback')) {
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const expectedState = readCookie(req, 'twitch_oauth_state')
    const error = url.searchParams.get('error')

    if (error) {
      return Response.redirect(
        `${APP_URL}/auth/callback?error=${encodeURIComponent(error)}`,
        302
      )
    }

    if (!code) {
      return Response.redirect(
        `${APP_URL}/auth/callback?error=missing_code`,
        302
      )
    }

    if (!state || !expectedState || state !== expectedState) {
      return Response.redirect(
        `${APP_URL}/auth/callback?error=invalid_oauth_state`,
        302
      )
    }

    if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !TWITCH_REDIRECT_URI) {
      return Response.redirect(
        `${APP_URL}/auth/callback?error=server_misconfigured`,
        302
      )
    }

    try {
      // 1. Trocar code por token
      const tokenResponse = await fetch(TWITCH_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: TWITCH_CLIENT_ID,
          client_secret: TWITCH_CLIENT_SECRET,
          code,
          grant_type: 'authorization_code',
          redirect_uri: TWITCH_REDIRECT_URI,
        }),
      })

      if (!tokenResponse.ok) {
        throw new Error('Falha ao obter token da Twitch')
      }

      const tokenData = await tokenResponse.json()
      const { access_token, refresh_token } = tokenData

      // 2. Buscar perfil do usuário na Twitch
      const userResponse = await fetch(TWITCH_USERS_URL, {
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Client-Id': TWITCH_CLIENT_ID,
        },
      })

      if (!userResponse.ok) {
        throw new Error('Falha ao buscar perfil da Twitch')
      }

      const userData = await userResponse.json()
      const twitchUser = userData.data[0]

      if (!twitchUser) {
        throw new Error('Usuário Twitch não encontrado')
      }

      // 3. Criar/atualizar usuário no Supabase
      const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      const returnTo = safeStreamerReturnTo(decodeURIComponent(readCookie(req, 'twitch_return_to') ?? ''))

      if (readCookie(req, 'twitch_oauth_mode') === 'chat') {
        const streamerId = readCookie(req, 'twitch_streamer_id')
        const { data: streamer } = await adminClient
          .from('streamers')
          .select('id, twitch_broadcaster_id')
          .eq('id', streamerId)
          .maybeSingle()
        if (!streamer || streamer.twitch_broadcaster_id !== twitchUser.id) {
          throw new Error('A conta Twitch não corresponde ao canal do streamer')
        }
        await adminClient.from('twitch_chat_credentials').upsert({
          streamer_id: streamer.id,
          broadcaster_id: twitchUser.id,
          access_token,
          refresh_token,
          scopes: tokenData.scope ?? [],
          expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        await adminClient.from('twitch_connections').upsert({
          streamer_id: streamer.id,
          broadcaster_id: twitchUser.id,
          bot_user_id: twitchUser.id,
          scopes: tokenData.scope ?? [],
          token_status: 'active',
          token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
        }, { onConflict: 'streamer_id' })
        await adminClient.from('streamer_settings').update({ chat_notifications_enabled: true }).eq('streamer_id', streamer.id)
        await subscribeToChatMessages(twitchUser.id)
        return Response.redirect(`${APP_URL}/dashboard/streamer?chat=connected`, 302)
      }

      // Verificar se já existe usuário com este twitch_user_id
      const { data: existingProfile } = await adminClient
        .from('profiles')
        .select('id')
        .eq('twitch_user_id', twitchUser.id)
        .maybeSingle()

      let userId: string

      if (existingProfile) {
        userId = existingProfile.id

        // Atualizar dados do perfil
        await adminClient.from('profiles').update({
          twitch_login: twitchUser.login,
          display_name: twitchUser.display_name,
          avatar_url: twitchUser.profile_image_url,
          updated_at: new Date().toISOString(),
        }).eq('id', userId)

        // Gerar sessão para usuário existente
        const { data: linkData, error: linkError } =
          await adminClient.auth.admin.generateLink({
            type: 'magiclink',
            email: twitchUser.email || `${twitchUser.id}@twitch.watchqueue.app`,
            options: {
              redirectTo: `${APP_URL}/auth/callback?return_to=${encodeURIComponent(returnTo)}`,
              data: {
                provider: 'twitch',
                provider_id: twitchUser.id,
                full_name: twitchUser.display_name,
                avatar_url: twitchUser.profile_image_url,
                preferred_username: twitchUser.login,
              },
            },
          })

        if (linkError) throw linkError

        const sessionUrl = new URL(linkData.properties.action_link)
        return Response.redirect(sessionUrl.toString(), 302)
      } else {
        // Criar novo usuário
        const { data: newUser, error: createError } =
          await adminClient.auth.admin.createUser({
            email: twitchUser.email || `${twitchUser.id}@twitch.watchqueue.app`,
            email_confirm: true,
            user_metadata: {
              provider: 'twitch',
              provider_id: twitchUser.id,
              full_name: twitchUser.display_name,
              avatar_url: twitchUser.profile_image_url,
              preferred_username: twitchUser.login,
            },
          })

        if (createError) throw createError
        userId = newUser.user.id

        // Profile será criado pelo trigger handle_new_user

        // Gerar sessão
        const { data: linkData, error: linkError } =
          await adminClient.auth.admin.generateLink({
            type: 'magiclink',
            email: twitchUser.email || `${twitchUser.id}@twitch.watchqueue.app`,
            options: {
              redirectTo: `${APP_URL}/auth/callback?return_to=${encodeURIComponent(returnTo)}`,
            },
          })

        if (linkError) throw linkError

        const sessionUrl = new URL(linkData.properties.action_link)
        return Response.redirect(sessionUrl.toString(), 302)
      }
    } catch (err) {
      console.error('Erro no callback Twitch:', err)
      return Response.redirect(
        `${APP_URL}/auth/callback?error=auth_failed&message=${encodeURIComponent(String(err))}`,
        302
      )
    }
  }

  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  })
})
