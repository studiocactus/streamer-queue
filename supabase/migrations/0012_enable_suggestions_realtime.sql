-- Deliver suggestion inserts/updates to subscribed streamer dashboards.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'suggestions'
  ) then
    alter publication supabase_realtime add table public.suggestions;
  end if;
end
$$;
