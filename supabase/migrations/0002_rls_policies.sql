-- ============================================================
-- WatchQueue — Migration 0002: Row Level Security
-- ============================================================

-- Ativar RLS em todas as tabelas
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streamers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streamer_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streamer_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.twitch_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_message_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Helper: verifica se o usuário é membro de um canal
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_streamer_member(p_streamer_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.streamer_members
    WHERE streamer_id = p_streamer_id
      AND user_id = p_user_id
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: verifica se é owner
CREATE OR REPLACE FUNCTION public.is_streamer_owner(p_streamer_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.streamers
    WHERE id = p_streamer_id AND owner_id = p_user_id
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: verifica se tem permissão específica
CREATE OR REPLACE FUNCTION public.has_streamer_permission(p_streamer_id UUID, p_user_id UUID, p_permission TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.streamer_members
    WHERE streamer_id = p_streamer_id
      AND user_id = p_user_id
      AND (role = 'owner' OR p_permission = ANY(permissions))
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- PROFILES
-- ============================================================
-- Qualquer um vê perfis públicos
CREATE POLICY "profiles_select_public" ON public.profiles
  FOR SELECT USING (true);

-- Usuário atualiza apenas o próprio perfil
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Inserção via trigger de auth (SECURITY DEFINER)
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- ============================================================
-- STREAMERS
-- ============================================================
-- Visitantes veem canais públicos e ativos
CREATE POLICY "streamers_select_public" ON public.streamers
  FOR SELECT USING (is_public = TRUE AND is_active = TRUE);

-- Membros veem mesmo canais privados do canal deles
CREATE POLICY "streamers_select_member" ON public.streamers
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND public.is_streamer_member(id, auth.uid())
  );

-- Usuário cria canal próprio
CREATE POLICY "streamers_insert_own" ON public.streamers
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- Owner atualiza canal próprio
CREATE POLICY "streamers_update_owner" ON public.streamers
  FOR UPDATE USING (auth.uid() = owner_id);

-- Owner deleta canal próprio
CREATE POLICY "streamers_delete_owner" ON public.streamers
  FOR DELETE USING (auth.uid() = owner_id);

-- ============================================================
-- STREAMER_MEMBERS
-- ============================================================
-- Membros veem outros membros do mesmo canal
CREATE POLICY "members_select_member" ON public.streamer_members
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND public.is_streamer_member(streamer_id, auth.uid())
  );

-- Owner gerencia membros
CREATE POLICY "members_insert_owner" ON public.streamer_members
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND public.is_streamer_owner(streamer_id, auth.uid())
  );

CREATE POLICY "members_update_owner" ON public.streamer_members
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND public.is_streamer_owner(streamer_id, auth.uid())
  );

CREATE POLICY "members_delete_owner" ON public.streamer_members
  FOR DELETE USING (
    auth.uid() IS NOT NULL
    AND public.is_streamer_owner(streamer_id, auth.uid())
  );

-- ============================================================
-- SUGGESTIONS
-- ============================================================
-- Visitantes veem sugestões de canais públicos (exceto pendentes e rejeitadas)
CREATE POLICY "suggestions_select_public" ON public.suggestions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.streamers s
      WHERE s.id = streamer_id
        AND s.is_public = TRUE
        AND s.is_active = TRUE
    )
    AND status NOT IN ('pending', 'rejected')
  );

-- Usuário vê todas as sugestões de canais públicos se autenticado
CREATE POLICY "suggestions_select_authenticated" ON public.suggestions
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.streamers s
      WHERE s.id = streamer_id AND s.is_public = TRUE
    )
  );

-- Moderadores veem todas as sugestões do canal deles
CREATE POLICY "suggestions_select_member" ON public.suggestions
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND public.is_streamer_member(streamer_id, auth.uid())
  );

-- Usuário autenticado envia sugestões em canais públicos
CREATE POLICY "suggestions_insert_authenticated" ON public.suggestions
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = submitted_by
    AND EXISTS (
      SELECT 1 FROM public.streamers s
      WHERE s.id = streamer_id AND s.is_public = TRUE AND s.is_active = TRUE
    )
  );

-- Usuário edita apenas próprias sugestões pendentes
CREATE POLICY "suggestions_update_own_pending" ON public.suggestions
  FOR UPDATE USING (
    auth.uid() = submitted_by
    AND status = 'pending'
  );

-- Moderadores/owners aprovam, rejeitam, movem na fila
CREATE POLICY "suggestions_update_moderator" ON public.suggestions
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND public.has_streamer_permission(streamer_id, auth.uid(), 'approve')
  );

-- ============================================================
-- VOTES
-- ============================================================
-- Qualquer um vê a contagem de votos
CREATE POLICY "votes_select_public" ON public.votes
  FOR SELECT USING (true);

-- Usuário vota apenas uma vez (UNIQUE constraint + RLS)
CREATE POLICY "votes_insert_own" ON public.votes
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.streamers s
      WHERE s.id = streamer_id AND s.is_public = TRUE AND s.is_active = TRUE
    )
    AND EXISTS (
      SELECT 1 FROM public.suggestions sg
      WHERE sg.id = suggestion_id
        AND sg.status IN ('approved', 'queued', 'pending')
    )
    -- Verificar configuração allow_votes
    AND EXISTS (
      SELECT 1 FROM public.streamer_settings ss
      WHERE ss.streamer_id = streamer_id AND ss.allow_votes = TRUE
    )
  );

-- Usuário remove próprio voto
CREATE POLICY "votes_delete_own" ON public.votes
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- STREAMER_SETTINGS
-- ============================================================
-- Visitantes veem configurações públicas
CREATE POLICY "settings_select_public" ON public.streamer_settings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.streamers s
      WHERE s.id = streamer_id AND s.is_public = TRUE
    )
  );

-- Owner atualiza configurações
CREATE POLICY "settings_update_owner" ON public.streamer_settings
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND public.is_streamer_owner(streamer_id, auth.uid())
  );

-- ============================================================
-- TWITCH_CONNECTIONS
-- ============================================================
-- NUNCA expõe tokens ao frontend — acesso apenas via service role
-- Owner pode ver o status (sem tokens)
CREATE POLICY "twitch_select_owner" ON public.twitch_connections
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND public.is_streamer_owner(streamer_id, auth.uid())
  );

-- Inserção/atualização apenas via service role (Edge Functions)
-- As políticas abaixo são negadas para anon/authenticated — Edge Functions usam service role

-- ============================================================
-- CHAT_MESSAGE_TEMPLATES
-- ============================================================
-- Owner e moderadores veem templates
CREATE POLICY "templates_select_member" ON public.chat_message_templates
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND public.is_streamer_member(streamer_id, auth.uid())
  );

-- Owner atualiza templates
CREATE POLICY "templates_update_owner" ON public.chat_message_templates
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND public.is_streamer_owner(streamer_id, auth.uid())
  );

-- ============================================================
-- CHAT_MESSAGE_LOGS
-- ============================================================
-- Owner e moderadores veem logs
CREATE POLICY "chat_logs_select_member" ON public.chat_message_logs
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND public.is_streamer_member(streamer_id, auth.uid())
  );
