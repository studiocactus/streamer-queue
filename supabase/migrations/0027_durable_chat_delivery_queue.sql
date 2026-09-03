-- Durable outbox for Twitch chat deliveries. Queue rows are created in the same
-- transaction as suggestion changes, so closing the browser cannot lose events.
create table if not exists public.chat_delivery_queue (
  id uuid primary key default gen_random_uuid(),
  streamer_id uuid not null references public.streamers(id) on delete cascade,
  suggestion_id uuid not null references public.suggestions(id) on delete cascade,
  event_type text not null check (event_type in (
    'suggestion_received', 'suggestion_approved', 'queued', 'watching_now',
    'completed', 'rejected', 'streamer_added'
  )),
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  attempts smallint not null default 0 check (attempts >= 0),
  max_attempts smallint not null default 5 check (max_attempts between 1 and 10),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (suggestion_id, event_type)
);

create index if not exists idx_chat_delivery_queue_ready
  on public.chat_delivery_queue(next_attempt_at, created_at)
  where status in ('pending', 'processing');

create index if not exists idx_chat_delivery_queue_streamer
  on public.chat_delivery_queue(streamer_id, created_at desc);

alter table public.chat_delivery_queue enable row level security;

create policy "chat_delivery_queue_select_member"
  on public.chat_delivery_queue for select to authenticated
  using (
    exists (
      select 1 from public.streamer_members member
      where member.streamer_id = chat_delivery_queue.streamer_id
        and member.user_id = auth.uid()
    )
  );

create or replace function public.enqueue_suggestion_chat_delivery()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  delivery_event text;
  channel_owner uuid;
begin
  if tg_op = 'INSERT' then
    if new.submission_source <> 'platform' then
      return new;
    end if;

    select owner_id into channel_owner from public.streamers where id = new.streamer_id;
    delivery_event := case
      when new.submitted_by = channel_owner then 'streamer_added'
      else 'suggestion_received'
    end;
  elsif new.status is distinct from old.status then
    delivery_event := case new.status
      when 'approved' then 'suggestion_approved'
      when 'queued' then 'queued'
      when 'watching' then 'watching_now'
      when 'completed' then 'completed'
      when 'rejected' then 'rejected'
      else null
    end;
  end if;

  if delivery_event is not null then
    insert into public.chat_delivery_queue (streamer_id, suggestion_id, event_type)
    values (new.streamer_id, new.id, delivery_event)
    on conflict (suggestion_id, event_type) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists suggestions_enqueue_chat_delivery on public.suggestions;
create trigger suggestions_enqueue_chat_delivery
  after insert or update of status on public.suggestions
  for each row execute function public.enqueue_suggestion_chat_delivery();

-- Service-role workers claim ready tasks atomically. Processing rows abandoned
-- for more than two minutes can be reclaimed after an interrupted execution.
create or replace function public.claim_chat_deliveries(p_limit integer default 20)
returns setof public.chat_delivery_queue
language sql
security definer
set search_path = public
as $$
  with ready as (
    select id
    from public.chat_delivery_queue
    where (
      status = 'pending'
      or (status = 'processing' and locked_at < now() - interval '2 minutes')
    )
      and next_attempt_at <= now()
      and attempts < max_attempts
    order by next_attempt_at, created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 50))
  )
  update public.chat_delivery_queue queue
  set status = 'processing',
      attempts = queue.attempts + 1,
      locked_at = now(),
      updated_at = now()
  from ready
  where queue.id = ready.id
  returning queue.*;
$$;

revoke all on function public.claim_chat_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_chat_deliveries(integer) to service_role;

create or replace function public.finish_chat_delivery(
  p_id uuid,
  p_sent boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.chat_delivery_queue
  set status = case
        when p_sent then 'sent'
        when attempts >= max_attempts then 'failed'
        else 'pending'
      end,
      processed_at = case when p_sent or attempts >= max_attempts then now() else null end,
      next_attempt_at = case
        when p_sent then next_attempt_at
        else now() + make_interval(secs => least(300, 5 * power(2, greatest(attempts - 1, 0)))::integer)
      end,
      locked_at = null,
      last_error = case when p_sent then null else left(coalesce(p_error, 'Falha desconhecida'), 1000) end,
      updated_at = now()
  where id = p_id;
end;
$$;

revoke all on function public.finish_chat_delivery(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.finish_chat_delivery(uuid, boolean, text) to service_role;
