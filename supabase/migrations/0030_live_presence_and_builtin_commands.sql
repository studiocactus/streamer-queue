-- Twitch EventSub becomes the source of truth for live presence.
alter table public.streamers
  add column if not exists is_live boolean not null default false,
  add column if not exists live_started_at timestamptz,
  add column if not exists live_status_updated_at timestamptz;

create index if not exists idx_streamers_live_public
  on public.streamers(is_live, channel_name)
  where is_public = true and is_active = true;

drop function if exists public.get_public_streamers(text, integer, integer);
create function public.get_public_streamers(
  p_search text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  channel_name text,
  slug text,
  avatar_url text,
  cover_url text,
  bio text,
  suggestion_count bigint,
  watching_now_title text,
  is_live boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select
    s.id,
    s.channel_name,
    s.slug,
    s.avatar_url,
    s.cover_url,
    s.bio,
    count(distinct sg.id) filter (where sg.status <> 'rejected') as suggestion_count,
    (select w.title from public.suggestions w where w.streamer_id = s.id and w.status = 'watching' order by w.started_at desc nulls last limit 1),
    s.is_live
  from public.streamers s
  left join public.suggestions sg on sg.streamer_id = s.id
  where s.is_public = true
    and s.is_active = true
    and (p_search is null or s.channel_name ilike '%' || p_search || '%')
  group by s.id
  order by s.is_live desc, suggestion_count desc, s.created_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;

revoke all on function public.get_public_streamers(text, integer, integer) from public;
grant execute on function public.get_public_streamers(text, integer, integer) to anon, authenticated;

-- Reconcile EventSub subscriptions daily without exposing credentials.
create or replace function public.invoke_twitch_eventsub_sync()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  worker_url text;
  worker_secret text;
begin
  select replace(decrypted_secret, '/chat-delivery-worker', '/twitch-eventsub-sync') into worker_url
  from vault.decrypted_secrets where name = 'chat_worker_url' limit 1;
  select decrypted_secret into worker_secret
  from vault.decrypted_secrets where name = 'chat_worker_secret' limit 1;
  if worker_url is null or worker_secret is null then return; end if;
  perform net.http_post(
    url := worker_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-chat-worker-secret', worker_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
end;
$$;

revoke all on function public.invoke_twitch_eventsub_sync() from public, anon, authenticated;
grant execute on function public.invoke_twitch_eventsub_sync() to service_role;

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'watchqueue-eventsub-sync';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule('watchqueue-eventsub-sync', '17 4 * * *', 'select public.invoke_twitch_eventsub_sync();');
end;
$$;
