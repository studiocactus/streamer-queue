-- Keep operational tables bounded without touching profiles, suggestions or queue history.
create or replace function public.cleanup_operational_records()
returns table (
  event_receipts_deleted bigint,
  cooldowns_deleted bigint,
  chat_logs_deleted bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_event_receipts bigint := 0;
  deleted_cooldowns bigint := 0;
  deleted_chat_logs bigint := 0;
begin
  delete from public.twitch_eventsub_messages
  where processing_status = 'completed'
    and received_at < clock_timestamp() - interval '30 days';
  get diagnostics deleted_event_receipts = row_count;

  delete from public.chat_command_cooldowns
  where allowed_at < clock_timestamp() - interval '1 day';
  get diagnostics deleted_cooldowns = row_count;

  delete from public.chat_message_logs
  where created_at < clock_timestamp() - interval '90 days';
  get diagnostics deleted_chat_logs = row_count;

  return query
  select deleted_event_receipts, deleted_cooldowns, deleted_chat_logs;
end;
$$;

revoke all on function public.cleanup_operational_records() from public, anon, authenticated;
grant execute on function public.cleanup_operational_records() to service_role;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'watchqueue-operational-cleanup';

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  perform cron.schedule(
    'watchqueue-operational-cleanup',
    '43 4 * * *',
    'select public.cleanup_operational_records();'
  );
end;
$$;
