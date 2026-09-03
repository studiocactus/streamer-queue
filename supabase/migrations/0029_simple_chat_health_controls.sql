-- A single, safe recovery action for the streamer dashboard. The queue remains
-- private; owners and moderators can only retry deliveries from their channel.
create or replace function public.retry_failed_chat_deliveries(p_streamer_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  if not exists (
    select 1 from public.streamer_members
    where streamer_id = p_streamer_id
      and user_id = auth.uid()
      and role in ('owner', 'moderator')
  ) then
    raise exception 'Not authorized';
  end if;

  update public.chat_delivery_queue
  set status = 'pending',
      attempts = 0,
      next_attempt_at = now(),
      locked_at = null,
      processed_at = null,
      last_error = null,
      updated_at = now()
  where streamer_id = p_streamer_id
    and status = 'failed';

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.retry_failed_chat_deliveries(uuid) from public;
grant execute on function public.retry_failed_chat_deliveries(uuid) to authenticated;
