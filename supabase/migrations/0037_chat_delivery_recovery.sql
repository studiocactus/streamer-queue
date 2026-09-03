alter table public.chat_delivery_queue drop constraint chat_delivery_queue_status_check;
alter table public.chat_delivery_queue add constraint chat_delivery_queue_status_check
  check (status in ('pending', 'processing', 'sent', 'failed', 'skipped'));
alter table public.chat_message_logs drop constraint chat_message_logs_status_check;
alter table public.chat_message_logs add constraint chat_message_logs_status_check
  check (status in ('sent', 'failed', 'simulated', 'skipped'));

-- One claim per send: rows do not spend their lease waiting in a worker's batch.
create function public.claim_chat_delivery(p_id uuid default null)
returns setof public.chat_delivery_queue language plpgsql security definer
set search_path = public as $$
begin
  update public.chat_delivery_queue
  set status = 'failed', locked_at = null, processed_at = now(), updated_at = now(),
    last_error = 'Processamento interrompido na última tentativa. Tente reenviar pelo painel.'
  where status = 'processing' and locked_at < now() - interval '2 minutes'
    and attempts >= max_attempts and (p_id is null or id = p_id);

  return query
  with ready as (
    select id from public.chat_delivery_queue
    where (status = 'pending' or (status = 'processing' and locked_at < now() - interval '2 minutes'))
      and next_attempt_at <= now() and attempts < max_attempts
      and (p_id is null or id = p_id)
    order by next_attempt_at, created_at for update skip locked limit 1
  )
  update public.chat_delivery_queue q
  set status = 'processing', attempts = q.attempts + 1, locked_at = now(), updated_at = now()
  from ready where q.id = ready.id returning q.*;
end;
$$;

-- A late worker cannot overwrite the result of a more recent attempt.
create function public.settle_chat_delivery(p_id uuid, p_attempt integer, p_status text, p_error text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare affected integer;
begin
  if p_status not in ('sent', 'failed', 'skipped') or p_status is null then
    raise exception 'Invalid delivery outcome';
  end if;
  update public.chat_delivery_queue
  set status = case when p_status = 'failed' and attempts < max_attempts then 'pending' else p_status end,
    processed_at = case when p_status <> 'failed' or attempts >= max_attempts then now() else null end,
    next_attempt_at = case when p_status = 'failed' then
      now() + make_interval(secs => least(300, 5 * power(2, greatest(attempts - 1, 0)))::integer)
      else next_attempt_at end,
    locked_at = null, updated_at = now(),
    last_error = case when p_status = 'sent' then null else left(p_error, 1000) end
  where id = p_id and status = 'processing' and attempts = p_attempt;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;
revoke all on function public.claim_chat_delivery(uuid) from public, anon, authenticated;
revoke all on function public.settle_chat_delivery(uuid,integer,text,text) from public, anon, authenticated;
grant execute on function public.claim_chat_delivery(uuid) to service_role;
grant execute on function public.settle_chat_delivery(uuid,integer,text,text) to service_role;
