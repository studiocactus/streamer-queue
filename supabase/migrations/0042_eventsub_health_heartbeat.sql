-- The public status is healthy only when chat delivery and Twitch event
-- reconciliation have both completed recently.
alter table public.system_health
  drop constraint system_health_component_check;
alter table public.system_health
  add constraint system_health_component_check
  check (component in ('chat-delivery-worker', 'twitch-eventsub-sync'));

create or replace function public.record_system_heartbeat(p_component text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_component not in ('chat-delivery-worker', 'twitch-eventsub-sync') then
    raise exception 'Unknown health component';
  end if;

  insert into public.system_health (component, last_success_at, updated_at)
  values (p_component, clock_timestamp(), clock_timestamp())
  on conflict (component) do update
    set last_success_at = excluded.last_success_at,
        updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.record_system_heartbeat(text) from public, anon, authenticated;
grant execute on function public.record_system_heartbeat(text) to service_role;

create or replace function public.get_platform_stats()
returns table (users_count bigint, streamers_count bigint, platform_status text)
language sql
security definer
stable
set search_path = public
as $$
  select
    (select count(*) from public.profiles) as users_count,
    (select count(*) from public.streamers where is_active = true) as streamers_count,
    case when
      exists (
        select 1 from public.system_health
        where component = 'chat-delivery-worker'
          and last_success_at >= clock_timestamp() - interval '3 minutes'
      )
      and exists (
        select 1 from public.system_health
        where component = 'twitch-eventsub-sync'
          and last_success_at >= clock_timestamp() - interval '35 minutes'
      )
    then 'operational' else 'attention' end as platform_status;
$$;

revoke all on function public.get_platform_stats() from public;
grant execute on function public.get_platform_stats() to anon, authenticated;
