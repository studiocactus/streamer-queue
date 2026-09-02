-- Credenciais privadas usadas somente pelas Edge Functions (service role).
CREATE TABLE IF NOT EXISTS public.twitch_chat_credentials (
  streamer_id UUID PRIMARY KEY REFERENCES public.streamers(id) ON DELETE CASCADE,
  broadcaster_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.twitch_chat_credentials ENABLE ROW LEVEL SECURITY;
-- Sem policies: anon e authenticated nunca acessam os tokens; service role ignora RLS.
