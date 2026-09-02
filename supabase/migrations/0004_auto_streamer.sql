-- ============================================================
-- WatchQueue — Migration 0004: Auto-criação de canal de streamer
-- ============================================================

-- Function para garantir que o usuário tenha um canal de streamer
CREATE OR REPLACE FUNCTION public.ensure_streamer_profile(p_user_id UUID)
RETURNS SETOF public.streamers AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_streamer public.streamers%ROWTYPE;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT * INTO v_streamer FROM public.streamers WHERE owner_id = p_user_id LIMIT 1;
  IF FOUND THEN
    RETURN NEXT v_streamer;
    RETURN;
  END IF;

  INSERT INTO public.streamers (owner_id, channel_name, slug, avatar_url, is_public, is_active)
  VALUES (
    p_user_id,
    v_profile.display_name,
    LOWER(v_profile.twitch_login),
    v_profile.avatar_url,
    TRUE,
    TRUE
  )
  ON CONFLICT (slug) DO UPDATE SET owner_id = EXCLUDED.owner_id
  RETURNING * INTO v_streamer;

  RETURN NEXT v_streamer;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atualizar handle_new_user para criar o canal automaticamente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_login TEXT;
  v_name TEXT;
  v_avatar TEXT;
  v_user_id UUID;
BEGIN
  v_login := COALESCE(NEW.raw_user_meta_data->>'preferred_username', SPLIT_PART(NEW.email, '@', 1), 'user');
  v_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', v_login);
  v_avatar := NEW.raw_user_meta_data->>'avatar_url';
  v_user_id := NEW.id;

  -- 1. Upsert Profile
  INSERT INTO public.profiles (id, twitch_user_id, twitch_login, display_name, avatar_url)
  VALUES (
    v_user_id,
    COALESCE(NEW.raw_user_meta_data->>'provider_id', v_user_id::text),
    v_login,
    v_name,
    v_avatar
  )
  ON CONFLICT (id) DO UPDATE SET
    twitch_login = EXCLUDED.twitch_login,
    display_name = EXCLUDED.display_name,
    avatar_url = EXCLUDED.avatar_url,
    updated_at = NOW();

  -- 2. Auto-criar canal de streamer para o usuário
  IF NOT EXISTS (SELECT 1 FROM public.streamers WHERE owner_id = v_user_id) THEN
    INSERT INTO public.streamers (owner_id, channel_name, slug, avatar_url, is_public, is_active)
    VALUES (v_user_id, v_name, LOWER(v_login), v_avatar, TRUE, TRUE)
    ON CONFLICT (slug) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Executar para perfis existentes que ainda não têm streamer channel
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id, display_name, twitch_login, avatar_url FROM public.profiles LOOP
    IF NOT EXISTS (SELECT 1 FROM public.streamers WHERE owner_id = r.id) THEN
      INSERT INTO public.streamers (owner_id, channel_name, slug, avatar_url, is_public, is_active)
      VALUES (r.id, r.display_name, LOWER(r.twitch_login), r.avatar_url, TRUE, TRUE)
      ON CONFLICT (slug) DO NOTHING;
    END IF;
  END LOOP;
END $$;
