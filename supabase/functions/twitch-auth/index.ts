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

const TWITCH_AUTH_URL = 'https://id.twitch.tv/oauth2/authorize'
const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token'
const TWITCH_USERS_URL = 'https://api.twitch.tv/helix/users'

// Escopos mínimos — apenas identificação do viewer
// Permissões de chat serão concedidas pelo streamer separadamente
const VIEWER_SCOPES = 'openid user:read:email'

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const pathname = url.pathname

  // CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': APP_URL,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      },
    })
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

    return new Response(null, {
      status: 302,
      headers,
    })
  }

  // ============================================================
  // GET /twitch-auth/callback — Processa o retorno do Twitch
  // ============================================================
  if (pathname.endsWith('/callback')) {
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
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
