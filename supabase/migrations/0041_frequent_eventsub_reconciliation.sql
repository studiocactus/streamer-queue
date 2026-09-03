-- Repair missed live/offline events quickly. The sync worker inventories existing
-- EventSub subscriptions before creating any missing ones, keeping this cadence cheap.
do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'watchqueue-eventsub-sync';

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  perform cron.schedule(
    'watchqueue-eventsub-sync',
    '*/15 * * * *',
    'select public.invoke_twitch_eventsub_sync();'
  );
end;
$$;
