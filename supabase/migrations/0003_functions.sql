-- ============================================================
-- WatchQueue — Migration 0003: Funções Utilitárias
-- ============================================================

-- ============================================================
-- Busca streamer por slug (com dados agregados)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_streamer_by_slug(p_slug TEXT)
RETURNS TABLE (
  id UUID,
  owner_id UUID,
  channel_name TEXT,
  slug TEXT,
  avatar_url TEXT,
  cover_url TEXT,
  bio TEXT,
  is_public BOOLEAN,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  suggestion_count BIGINT,
  pending_count BIGINT,
  watching_now_id UUID,
  watching_now_title TEXT,
  watching_now_category TEXT
) AS $$
  SELECT
    s.id,
    s.owner_id,
    s.channel_name,
    s.slug,
    s.avatar_url,
    s.cover_url,
    s.bio,
    s.is_public,
    s.is_active,
    s.created_at,
    s.updated_at,
    COUNT(DISTINCT sg.id) FILTER (WHERE sg.status NOT IN ('rejected')) AS suggestion_count,
    COUNT(DISTINCT sg.id) FILTER (WHERE sg.status = 'pending') AS pending_count,
    MAX(sg.id) FILTER (WHERE sg.status = 'watching') AS watching_now_id,
    MAX(sg.title) FILTER (WHERE sg.status = 'watching') AS watching_now_title,
    MAX(sg.category) FILTER (WHERE sg.status = 'watching') AS watching_now_category
  FROM public.streamers s
  LEFT JOIN public.suggestions sg ON sg.streamer_id = s.id
  WHERE s.slug = p_slug AND s.is_public = TRUE AND s.is_active = TRUE
  GROUP BY s.id, s.owner_id, s.channel_name, s.slug, s.avatar_url, s.cover_url, s.bio, s.is_public, s.is_active, s.created_at, s.updated_at;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- Listar streamers públicos com dados agregados
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_public_streamers(
  p_search TEXT DEFAULT NULL,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  channel_name TEXT,
  slug TEXT,
  avatar_url TEXT,
  cover_url TEXT,
  bio TEXT,
  suggestion_count BIGINT,
  watching_now_title TEXT
) AS $$
  SELECT
    s.id,
    s.channel_name,
    s.slug,
    s.avatar_url,
    s.cover_url,
    s.bio,
    COUNT(DISTINCT sg.id) FILTER (WHERE sg.status NOT IN ('rejected')) AS suggestion_count,
    MAX(sg.title) FILTER (WHERE sg.status = 'watching') AS watching_now_title
  FROM public.streamers s
  LEFT JOIN public.suggestions sg ON sg.streamer_id = s.id
  WHERE
    s.is_public = TRUE
    AND s.is_active = TRUE
    AND (p_search IS NULL OR s.channel_name ILIKE '%' || p_search || '%')
  GROUP BY s.id, s.channel_name, s.slug, s.avatar_url, s.cover_url, s.bio
  ORDER BY suggestion_count DESC, s.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- Verificar se usuário já votou em uma sugestão
-- ============================================================
CREATE OR REPLACE FUNCTION public.user_voted(p_suggestion_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.votes
    WHERE suggestion_id = p_suggestion_id AND user_id = p_user_id
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- Contagem de sugestões do usuário num canal (para limite)
-- ============================================================
CREATE OR REPLACE FUNCTION public.user_suggestion_count(p_streamer_id UUID, p_user_id UUID)
RETURNS BIGINT AS $$
  SELECT COUNT(*) FROM public.suggestions
  WHERE streamer_id = p_streamer_id
    AND submitted_by = p_user_id
    AND status NOT IN ('rejected', 'completed');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- Detectar sugestões similares (anti-duplicata)
-- ============================================================
CREATE OR REPLACE FUNCTION public.find_similar_suggestions(
  p_streamer_id UUID,
  p_title TEXT,
  p_threshold FLOAT DEFAULT 0.3
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  status TEXT,
  similarity FLOAT
) AS $$
  SELECT
    sg.id,
    sg.title,
    sg.status,
    similarity(sg.title, p_title) AS similarity
  FROM public.suggestions sg
  WHERE sg.streamer_id = p_streamer_id
    AND sg.status NOT IN ('completed', 'rejected')
    AND similarity(sg.title, p_title) > p_threshold
  ORDER BY similarity DESC
  LIMIT 5;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- Mover sugestão para posição na fila (reordena as demais)
-- ============================================================
CREATE OR REPLACE FUNCTION public.reorder_queue(
  p_streamer_id UUID,
  p_suggestion_id UUID,
  p_new_position INT
)
RETURNS VOID AS $$
DECLARE
  old_position INT;
BEGIN
  SELECT queue_position INTO old_position
  FROM public.suggestions
  WHERE id = p_suggestion_id AND streamer_id = p_streamer_id;

  IF old_position IS NULL THEN
    RAISE EXCEPTION 'Sugestão não está na fila';
  END IF;

  IF old_position < p_new_position THEN
    UPDATE public.suggestions
    SET queue_position = queue_position - 1
    WHERE streamer_id = p_streamer_id
      AND queue_position > old_position
      AND queue_position <= p_new_position
      AND id != p_suggestion_id;
  ELSE
    UPDATE public.suggestions
    SET queue_position = queue_position + 1
    WHERE streamer_id = p_streamer_id
      AND queue_position >= p_new_position
      AND queue_position < old_position
      AND id != p_suggestion_id;
  END IF;

  UPDATE public.suggestions
  SET queue_position = p_new_position
  WHERE id = p_suggestion_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
