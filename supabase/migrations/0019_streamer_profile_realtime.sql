-- Public profile changes (cover, bio and social links) update open viewer pages.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'streamers'
  ) then
    alter publication supabase_realtime add table public.streamers;
  end if;
end
$$;
