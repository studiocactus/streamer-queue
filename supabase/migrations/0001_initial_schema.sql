-- ============================================================
-- WatchQueue — Migration 0001: Schema Inicial
-- ============================================================

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- Para busca textual

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  twitch_user_id TEXT UNIQUE NOT NULL,
  twitch_login   TEXT NOT NULL,
  display_name   TEXT NOT NULL,
  avatar_url     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_twitch_user_id ON public.profiles(twitch_user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_twitch_login ON public.profiles(twitch_login);

-- ============================================================
-- STREAMERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.streamers (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id               UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  twitch_broadcaster_id  TEXT UNIQUE,
  channel_name           TEXT NOT NULL,
  slug                   TEXT UNIQUE NOT NULL,
  avatar_url             TEXT,
  cover_url              TEXT,
  bio                    TEXT,
  is_public              BOOLEAN NOT NULL DEFAULT TRUE,
  is_active              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT slug_format CHECK (slug ~ '^[a-z0-9-]+$'),
  CONSTRAINT slug_length CHECK (char_length(slug) BETWEEN 3 AND 50)
);

CREATE INDEX IF NOT EXISTS idx_streamers_owner_id ON public.streamers(owner_id);
CREATE INDEX IF NOT EXISTS idx_streamers_slug ON public.streamers(slug);
CREATE INDEX IF NOT EXISTS idx_streamers_is_public ON public.streamers(is_public) WHERE is_public = TRUE;
CREATE INDEX IF NOT EXISTS idx_streamers_channel_name_trgm ON public.streamers USING gin(channel_name gin_trgm_ops);

-- ============================================================
-- STREAMER_MEMBERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.streamer_members (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  streamer_id UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'moderator' CHECK (role IN ('owner', 'moderator', 'viewer')),
  permissions TEXT[] NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (streamer_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_streamer_members_streamer ON public.streamer_members(streamer_id);
CREATE INDEX IF NOT EXISTS idx_streamer_members_user ON public.streamer_members(user_id);

-- ============================================================
-- SUGGESTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.suggestions (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  streamer_id      UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
  submitted_by     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category         TEXT NOT NULL DEFAULT 'movie' CHECK (category IN ('movie', 'series', 'anime', 'other')),
  title            TEXT NOT NULL,
  description      TEXT,
  poster_url       TEXT,
  release_year     INT CHECK (release_year BETWEEN 1888 AND 2100),
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'queued', 'watching', 'completed', 'rejected')),
  queue_position   INT,
  rejection_reason TEXT,
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at      TIMESTAMPTZ,
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  CONSTRAINT title_length CHECK (char_length(title) BETWEEN 1 AND 200)
);

CREATE INDEX IF NOT EXISTS idx_suggestions_streamer ON public.suggestions(streamer_id);
CREATE INDEX IF NOT EXISTS idx_suggestions_submitted_by ON public.suggestions(submitted_by);
CREATE INDEX IF NOT EXISTS idx_suggestions_status ON public.suggestions(streamer_id, status);
CREATE INDEX IF NOT EXISTS idx_suggestions_queue ON public.suggestions(streamer_id, queue_position) WHERE queue_position IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_suggestions_title_trgm ON public.suggestions USING gin(title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_suggestions_submitted_at ON public.suggestions(submitted_at DESC);

-- ============================================================
-- VOTES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.votes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  streamer_id   UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
  suggestion_id UUID NOT NULL REFERENCES public.suggestions(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Previne voto duplicado
  UNIQUE (suggestion_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_votes_suggestion ON public.votes(suggestion_id);
CREATE INDEX IF NOT EXISTS idx_votes_user ON public.votes(user_id);
CREATE INDEX IF NOT EXISTS idx_votes_streamer ON public.votes(streamer_id);

-- ============================================================
-- STREAMER_SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.streamer_settings (
  streamer_id                UUID PRIMARY KEY REFERENCES public.streamers(id) ON DELETE CASCADE,
  require_approval           BOOLEAN NOT NULL DEFAULT TRUE,
  allow_votes                BOOLEAN NOT NULL DEFAULT TRUE,
  max_suggestions_per_user   INT NOT NULL DEFAULT 3 CHECK (max_suggestions_per_user BETWEEN 1 AND 50),
  public_list                BOOLEAN NOT NULL DEFAULT TRUE,
  chat_notifications_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  monetization_mode          TEXT NOT NULL DEFAULT 'free' CHECK (monetization_mode IN ('free', 'highlight', 'skip_queue', 'custom')),
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TWITCH_CONNECTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.twitch_connections (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  streamer_id      UUID UNIQUE NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
  broadcaster_id   TEXT,
  bot_user_id      TEXT,
  scopes           TEXT[] NOT NULL DEFAULT '{}',
  token_status     TEXT NOT NULL DEFAULT 'active' CHECK (token_status IN ('active', 'expired', 'revoked')),
  token_expires_at TIMESTAMPTZ,
  -- NOTA: access_token e refresh_token NUNCA são armazenados aqui.
  -- São mantidos como secrets nas Edge Functions via Vault ou env vars.
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_twitch_connections_streamer ON public.twitch_connections(streamer_id);

-- ============================================================
-- CHAT_MESSAGE_TEMPLATES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.chat_message_templates (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  streamer_id UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL CHECK (event_type IN ('suggestion_received', 'suggestion_approved', 'watching_now', 'completed')),
  template    TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (streamer_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_chat_templates_streamer ON public.chat_message_templates(streamer_id);

-- ============================================================
-- CHAT_MESSAGE_LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.chat_message_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  streamer_id   UUID NOT NULL REFERENCES public.streamers(id) ON DELETE CASCADE,
  suggestion_id UUID REFERENCES public.suggestions(id) ON DELETE SET NULL,
  event_type    TEXT NOT NULL,
  message       TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'simulated')),
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_logs_streamer ON public.chat_message_logs(streamer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_logs_suggestion ON public.chat_message_logs(suggestion_id);

-- ============================================================
-- TRIGGERS: updated_at automático
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER tr_streamers_updated_at
  BEFORE UPDATE ON public.streamers
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER tr_streamer_settings_updated_at
  BEFORE UPDATE ON public.streamer_settings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER tr_twitch_connections_updated_at
  BEFORE UPDATE ON public.twitch_connections
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER tr_chat_templates_updated_at
  BEFORE UPDATE ON public.chat_message_templates
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- TRIGGER: Criar settings automaticamente ao criar streamer
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_streamer()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.streamer_settings (streamer_id) VALUES (NEW.id)
  ON CONFLICT (streamer_id) DO NOTHING;

  -- Criar templates padrão de mensagem
  INSERT INTO public.chat_message_templates (streamer_id, event_type, template) VALUES
    (NEW.id, 'suggestion_received', '🎬 {viewer} adicionou "{titulo}" à lista do canal!'),
    (NEW.id, 'suggestion_approved', '✅ A sugestão "{titulo}" de {viewer} foi aprovada!'),
    (NEW.id, 'watching_now', '🍿 O streamer começou a assistir "{titulo}", sugestão de {viewer}!'),
    (NEW.id, 'completed', '🎉 Terminamos de assistir "{titulo}"! Obrigado, {viewer}!')
  ON CONFLICT (streamer_id, event_type) DO NOTHING;

  -- Adicionar owner como membro
  INSERT INTO public.streamer_members (streamer_id, user_id, role, permissions)
  VALUES (NEW.id, NEW.owner_id, 'owner', ARRAY['approve', 'reject', 'manage_queue', 'manage_members', 'manage_settings'])
  ON CONFLICT (streamer_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tr_new_streamer
  AFTER INSERT ON public.streamers
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_streamer();

-- ============================================================
-- TRIGGER: Criar profile automaticamente ao criar auth user
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, twitch_user_id, twitch_login, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'provider_id', NEW.id::text),
    COALESCE(NEW.raw_user_meta_data->>'preferred_username', NEW.email, 'user'),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'Usuário'),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE SET
    twitch_login = EXCLUDED.twitch_login,
    display_name = EXCLUDED.display_name,
    avatar_url = EXCLUDED.avatar_url,
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER tr_new_auth_user
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
