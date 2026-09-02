-- Channel owners can create missing customizable chat templates.
create policy "templates_insert_owner" on public.chat_message_templates
  for insert with check (
    auth.uid() is not null
    and public.is_streamer_owner(streamer_id, auth.uid())
  );
