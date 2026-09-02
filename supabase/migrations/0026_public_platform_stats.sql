-- Public, aggregate-only platform metrics for the site footer.
create or replace function public.get_platform_stats()
returns table (users_count bigint, streamers_count bigint)
language sql security definer stable set search_path = public
as $$
  select
    (select count(*) from public.profiles) as users_count,
    (select count(*) from public.streamers where is_active = true) as streamers_count;
$$;

revoke all on function public.get_platform_stats() from public;
grant execute on function public.get_platform_stats() to anon, authenticated;
