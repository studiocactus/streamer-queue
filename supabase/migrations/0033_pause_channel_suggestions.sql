-- One visible switch controls new suggestions from both web and Twitch chat.
alter table public.streamers
  add column if not exists accepting_suggestions boolean not null default true;

drop policy if exists "suggestions_insert_authenticated" on public.suggestions;
create policy "suggestions_insert_authenticated" on public.suggestions
  for insert with check (
    auth.uid() is not null
    and auth.uid() = submitted_by
    and exists (
      select 1 from public.streamers s
      where s.id = streamer_id
        and s.is_public = true
        and s.is_active = true
        and (s.accepting_suggestions = true or s.owner_id = auth.uid())
    )
    and not exists (
      select 1 from public.banned_users b
      where b.streamer_id = suggestions.streamer_id and b.user_id = auth.uid()
    )
  );
