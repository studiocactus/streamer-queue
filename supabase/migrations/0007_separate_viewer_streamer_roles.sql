-- Todo novo login entra como viewer. A existência de uma linha em streamers
-- passa a representar uma liberação explícita de acesso para um streamer.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, twitch_user_id, twitch_login, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'provider_id', NEW.id::text),
    COALESCE(NEW.raw_user_meta_data->>'preferred_username', SPLIT_PART(NEW.email, '@', 1), 'user'),
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      NEW.raw_user_meta_data->>'preferred_username',
      'Usuário'
    ),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE SET
    twitch_login = EXCLUDED.twitch_login,
    display_name = EXCLUDED.display_name,
    avatar_url = EXCLUDED.avatar_url,
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- A função legada permanece disponível somente para operações administrativas.
REVOKE ALL ON FUNCTION public.ensure_streamer_profile(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_streamer_profile(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.ensure_streamer_profile(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_streamer_profile(UUID) TO service_role;
