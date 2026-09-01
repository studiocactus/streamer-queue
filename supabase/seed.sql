-- ============================================================
-- WatchQueue — Seed: Dados Demonstrativos (Desenvolvimento)
-- ============================================================
-- ATENÇÃO: Execute este arquivo SOMENTE em ambientes de desenvolvimento.
-- NÃO executar em produção.
-- ============================================================

-- Para usar este seed:
-- 1. Crie usuários manualmente via Supabase Dashboard ou Auth API
-- 2. Anote os UUIDs gerados
-- 3. Substitua os placeholders abaixo pelos UUIDs reais
-- 4. Execute no SQL Editor do Supabase

-- Streamers de demonstração
-- (Estes UUIDs são fictícios e precisam ser ajustados para UUIDs reais de auth.users)

DO $$
DECLARE
  -- Substitua por UUIDs reais de usuários criados
  thenees_id UUID := '00000000-0000-0000-0000-000000000001';
  luna_id    UUID := '00000000-0000-0000-0000-000000000002';
  retro_id   UUID := '00000000-0000-0000-0000-000000000003';

  thenees_streamer_id UUID;
  luna_streamer_id    UUID;
  retro_streamer_id   UUID;
BEGIN

  -- Profiles (normalmente criados automaticamente via trigger de auth)
  INSERT INTO public.profiles (id, twitch_user_id, twitch_login, display_name, avatar_url) VALUES
    (thenees_id, 'twitch_001', 'thenees', 'Thenees', 'https://static-cdn.jtvnw.net/jtv_user_pictures/placeholder-1.png'),
    (luna_id,    'twitch_002', 'lunaplay', 'LunaPlay', 'https://static-cdn.jtvnw.net/jtv_user_pictures/placeholder-2.png'),
    (retro_id,   'twitch_003', 'retronerd', 'RetroNerd', 'https://static-cdn.jtvnw.net/jtv_user_pictures/placeholder-3.png')
  ON CONFLICT (id) DO NOTHING;

  -- Streamers
  INSERT INTO public.streamers (owner_id, channel_name, slug, bio, is_public, is_active) VALUES
    (thenees_id, 'Thenees', 'thenees', 'Streamer focado em filmes clássicos e séries de ficção científica. Aqui a comunidade decide o que a gente assiste!', TRUE, TRUE),
    (luna_id,    'LunaPlay', 'lunaplay', 'Animes, filmes de animação e muito mais! Venha sugerir seus favoritos.', TRUE, TRUE),
    (retro_id,   'RetroNerd', 'retronerd', 'Clássicos dos anos 80, 90 e início dos 2000. Nostalgia pura toda semana.', TRUE, TRUE)
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO thenees_streamer_id;

  -- Buscar IDs dos streamers criados
  SELECT id INTO thenees_streamer_id FROM public.streamers WHERE slug = 'thenees';
  SELECT id INTO luna_streamer_id    FROM public.streamers WHERE slug = 'lunaplay';
  SELECT id INTO retro_streamer_id   FROM public.streamers WHERE slug = 'retronerd';

  -- Sugestões para Thenees
  INSERT INTO public.suggestions (streamer_id, submitted_by, category, title, description, release_year, status, queue_position) VALUES
    (thenees_streamer_id, luna_id,   'movie',  'Interestelar', 'Uma das maiores obras do cinema moderno, sobre física quântica e amor.', 2014, 'watching', NULL),
    (thenees_streamer_id, retro_id,  'series', 'Ruptura', 'Serie da Apple TV+ sobre um programa corporativo misterioso.', 2022, 'queued', 1),
    (thenees_streamer_id, luna_id,   'movie',  'O Senhor dos Anéis: A Sociedade do Anel', 'O começo da épica jornada de Frodo.', 2001, 'queued', 2),
    (thenees_streamer_id, retro_id,  'movie',  'Cyberpunk: Mercenários', 'Anime baseado no universo do game Cyberpunk 2077.', 2022, 'approved', NULL),
    (thenees_streamer_id, thenees_id,'series', 'Arcane', 'Animação da Netflix baseada em League of Legends.', 2021, 'pending', NULL)
  ON CONFLICT DO NOTHING;

  -- Sugestões para LunaPlay
  INSERT INTO public.suggestions (streamer_id, submitted_by, category, title, description, release_year, status, queue_position) VALUES
    (luna_streamer_id, retro_id,   'anime',  'One Piece', 'A jornada de Luffy para se tornar o Rei dos Piratas.', 1999, 'watching', NULL),
    (luna_streamer_id, thenees_id, 'anime',  'Arcane', 'Animação incrível baseada em League of Legends.', 2021, 'queued', 1),
    (luna_streamer_id, retro_id,   'movie',  'Interestelar', 'Obra-prima de Christopher Nolan.', 2014, 'pending', NULL)
  ON CONFLICT DO NOTHING;

  -- Sugestões para RetroNerd
  INSERT INTO public.suggestions (streamer_id, submitted_by, category, title, description, release_year, status, queue_position) VALUES
    (retro_streamer_id, luna_id,    'movie',  'O Exterminador do Futuro', 'Clássico de ficção científica dos anos 80.', 1984, 'completed', NULL),
    (retro_streamer_id, thenees_id, 'series', 'Twin Peaks', 'O mistério de Laura Palmer na televisão dos anos 90.', 1990, 'queued', 1),
    (retro_streamer_id, luna_id,    'movie',  'Blade Runner', 'O futuro noir de Ridley Scott.', 1982, 'approved', NULL)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Seed executado com sucesso!';
  RAISE NOTICE 'Thenees streamer_id: %', thenees_streamer_id;
  RAISE NOTICE 'LunaPlay streamer_id: %', luna_streamer_id;
  RAISE NOTICE 'RetroNerd streamer_id: %', retro_streamer_id;

END $$;
