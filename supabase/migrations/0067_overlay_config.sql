alter table public.streamers add column if not exists overlay_config jsonb not null
  default '{"orientation":"horizontal","text":"#ffffff","background":"#111119"}'::jsonb;
