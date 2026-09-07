-- A equipe autorizada do canal pode acompanhar a contagem, mas os votos
-- continuam sendo inseridos exclusivamente pela função segura do EventSub.
drop policy if exists "film poll votes visible to channel staff" on public.film_poll_votes;
create policy "film poll votes visible to channel staff" on public.film_poll_votes
  for select to authenticated
  using (
    exists (
      select 1
      from public.film_polls p
      where p.id = poll_id
        and public.has_streamer_permission(p.streamer_id, auth.uid(), 'manage_settings')
    )
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'film_poll_votes'
  ) then
    alter publication supabase_realtime add table public.film_poll_votes;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'film_polls'
  ) then
    alter publication supabase_realtime add table public.film_polls;
  end if;
end
$$;
