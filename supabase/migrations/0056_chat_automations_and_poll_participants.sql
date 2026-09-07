create table public.chat_timed_messages (
  id uuid primary key default gen_random_uuid(), streamer_id uuid not null references public.streamers(id) on delete cascade,
  kind text not null default 'message' check (kind in ('message','poll_leader')),
  message text not null default '', interval_minutes integer not null check (interval_minutes between 5 and 240),
  enabled boolean not null default true, last_sent_at timestamptz, created_at timestamptz not null default now()
);
create table public.chat_custom_commands (
  id uuid primary key default gen_random_uuid(), streamer_id uuid not null references public.streamers(id) on delete cascade,
  command text not null check (command ~ '^![a-z0-9][a-z0-9_-]{1,30}$'), response text not null check (char_length(response) between 1 and 500),
  enabled boolean not null default true, created_at timestamptz not null default now(), unique(streamer_id, command)
);
alter table public.chat_timed_messages enable row level security;
alter table public.chat_custom_commands enable row level security;
create policy "timed messages managed by channel staff" on public.chat_timed_messages for all to authenticated using (public.has_streamer_permission(streamer_id, auth.uid(), 'manage_settings')) with check (public.has_streamer_permission(streamer_id, auth.uid(), 'manage_settings'));
create policy "custom commands managed by channel staff" on public.chat_custom_commands for all to authenticated using (public.has_streamer_permission(streamer_id, auth.uid(), 'manage_settings')) with check (public.has_streamer_permission(streamer_id, auth.uid(), 'manage_settings'));
alter table public.film_poll_votes add column if not exists twitch_user_login text;
