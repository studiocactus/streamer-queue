-- Expand community ideas beyond films/series and support streamer-created items.
alter table public.suggestions drop constraint if exists suggestions_category_check;
alter table public.suggestions add constraint suggestions_category_check
  check (category in ('movie', 'series', 'anime', 'react', 'music', 'other'));

alter table public.suggestions add column if not exists source_url text;
alter table public.suggestions add constraint suggestions_source_url_length
  check (source_url is null or (char_length(source_url) <= 1000 and source_url ~ '^https?://'));

alter table public.chat_message_templates drop constraint if exists chat_message_templates_event_type_check;
alter table public.chat_message_templates add constraint chat_message_templates_event_type_check
  check (event_type in ('suggestion_received', 'suggestion_approved', 'watching_now', 'completed', 'streamer_added'));

insert into public.chat_message_templates (streamer_id, event_type, template, enabled)
select id, 'streamer_added', '📌 {viewer} adicionou “{titulo}” em {categoria}. Vote na sua ideia favorita pelo WatchQueue!', true
from public.streamers
on conflict (streamer_id, event_type) do nothing;

drop policy if exists "votes_insert_own" on public.votes;
create policy "votes_insert_own" on public.votes
  for insert with check (
    auth.uid() is not null
    and auth.uid() = user_id
    and exists (
      select 1 from public.streamers s
      where s.id = streamer_id and s.is_public = true and s.is_active = true
    )
    and exists (
      select 1 from public.suggestions sg
      where sg.id = suggestion_id
        and sg.submitted_by <> auth.uid()
        and sg.status in ('approved', 'queued', 'pending')
    )
    and exists (
      select 1 from public.streamer_settings ss
      where ss.streamer_id = streamer_id and ss.allow_votes = true
    )
  );
