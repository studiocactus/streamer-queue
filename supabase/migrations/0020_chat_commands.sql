-- Suggestions submitted directly from Twitch chat.
alter table public.streamer_settings
  add column if not exists chat_command text not null default '!sugerir',
  add column if not exists chat_command_enabled boolean not null default true;

alter table public.streamer_settings
  drop constraint if exists streamer_settings_chat_command_format;
alter table public.streamer_settings
  add constraint streamer_settings_chat_command_format
  check (chat_command ~ '^![a-z0-9][a-z0-9_-]{1,30}$');

alter table public.suggestions alter column submitted_by drop not null;
alter table public.suggestions
  add column if not exists submission_source text not null default 'platform',
  add column if not exists submission_priority smallint not null default 100,
  add column if not exists chat_user_id text,
  add column if not exists chat_user_login text,
  add column if not exists chat_display_name text;

alter table public.suggestions
  drop constraint if exists suggestions_submission_source_check;
alter table public.suggestions
  add constraint suggestions_submission_source_check
  check (submission_source in ('platform', 'chat'));

alter table public.suggestions
  drop constraint if exists suggestions_submitter_identity_check;
alter table public.suggestions
  add constraint suggestions_submitter_identity_check
  check (
    (submitted_by is not null and submission_source = 'platform')
    or
    (submitted_by is null and submission_source = 'chat'
      and chat_user_id is not null and chat_user_login is not null and chat_display_name is not null)
  );

create index if not exists idx_suggestions_priority
  on public.suggestions(streamer_id, status, submission_priority desc, submitted_at asc);
create index if not exists idx_suggestions_chat_user
  on public.suggestions(streamer_id, chat_user_id)
  where chat_user_id is not null;

-- EventSub delivers notifications at least once. Persist message IDs so retries
-- cannot create duplicate suggestions.
create table if not exists public.twitch_eventsub_messages (
  message_id text primary key,
  event_type text not null,
  received_at timestamptz not null default now()
);

alter table public.twitch_eventsub_messages enable row level security;
-- No policies: only service-role Edge Functions can access delivery IDs.

