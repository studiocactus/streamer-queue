-- Run the durable Twitch delivery worker every minute through pg_cron + pg_net.
-- Required Vault secrets:
--   chat_worker_url    = https://<project-ref>.supabase.co/functions/v1/chat-delivery-worker
--   chat_worker_secret = same value configured as CHAT_WORKER_SECRET in Edge Functions
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.invoke_chat_delivery_worker()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  worker_url text;
  worker_secret text;
begin
  select decrypted_secret into worker_url
  from vault.decrypted_secrets
  where name = 'chat_worker_url'
  limit 1;

  select decrypted_secret into worker_secret
  from vault.decrypted_secrets
  where name = 'chat_worker_secret'
  limit 1;

  if worker_url is null or worker_secret is null then
    raise warning 'Chat delivery worker secrets are not configured in Vault';
    return;
  end if;

  perform net.http_post(
    url := worker_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-chat-worker-secret', worker_secret
    ),
    body := '{"limit":20}'::jsonb,
    timeout_milliseconds := 15000
  );
end;
$$;

revoke all on function public.invoke_chat_delivery_worker() from public, anon, authenticated;
grant execute on function public.invoke_chat_delivery_worker() to service_role;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'watchqueue-chat-delivery-worker';
  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  perform cron.schedule(
    'watchqueue-chat-delivery-worker',
    '* * * * *',
    'select public.invoke_chat_delivery_worker();'
  );
end;
$$;
