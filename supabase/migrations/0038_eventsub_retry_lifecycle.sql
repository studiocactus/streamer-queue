-- Old receipts remain completed: do not replay historic commands.
alter table public.twitch_eventsub_messages
  add column processing_status text not null default 'completed'
    check (processing_status in ('processing', 'retryable', 'completed')),
  add column attempt integer not null default 0,
  add column locked_at timestamptz,
  add column command_allowed boolean;

-- A retry can recover the suggestion created before an interrupted response.
alter table public.suggestions add column twitch_event_message_id text unique;

create function public.claim_twitch_event(p_message_id text, p_event_type text)
returns integer language plpgsql security definer set search_path = public as $$
declare receipt public.twitch_eventsub_messages%rowtype;
begin
  insert into public.twitch_eventsub_messages(message_id, event_type, processing_status)
  values (p_message_id, p_event_type, 'retryable') on conflict (message_id) do nothing;
  select * into receipt from public.twitch_eventsub_messages where message_id=p_message_id for update;
  if receipt.processing_status = 'completed' then return 0; end if;
  if receipt.processing_status = 'processing' and receipt.locked_at > now()-interval '2 minutes' then return -1; end if;
  update public.twitch_eventsub_messages set processing_status='processing',
    attempt=attempt+1, locked_at=now() where message_id=p_message_id returning attempt into receipt.attempt;
  return receipt.attempt;
end;
$$;

create function public.finish_twitch_event(p_message_id text, p_attempt integer, p_completed boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare affected integer;
begin
  update public.twitch_eventsub_messages
  set processing_status=case when p_completed then 'completed' else 'retryable' end, locked_at=null
  where message_id=p_message_id and attempt=p_attempt and processing_status='processing';
  get diagnostics affected = row_count;
  return affected=1;
end;
$$;

-- Remember the original cooldown decision atomically. A retry is not a new command.
create function public.claim_twitch_event_command(p_message_id text, p_attempt integer,
  p_streamer_id uuid, p_twitch_user_id text)
returns boolean language plpgsql security definer set search_path = public as $$
declare receipt public.twitch_eventsub_messages%rowtype; allowed boolean;
begin
  select * into receipt from public.twitch_eventsub_messages where message_id=p_message_id for update;
  if not found or receipt.attempt <> p_attempt or receipt.processing_status <> 'processing' then
    raise exception 'Event lease unavailable';
  end if;
  if receipt.command_allowed is not null then return receipt.command_allowed; end if;
  allowed := public.claim_chat_command(p_streamer_id, p_twitch_user_id);
  update public.twitch_eventsub_messages set command_allowed=allowed where message_id=p_message_id;
  return allowed;
end;
$$;

revoke all on function public.claim_twitch_event(text,text) from public, anon, authenticated;
revoke all on function public.finish_twitch_event(text,integer,boolean) from public, anon, authenticated;
revoke all on function public.claim_twitch_event_command(text,integer,uuid,text) from public, anon, authenticated;
grant execute on function public.claim_twitch_event(text,text) to service_role;
grant execute on function public.finish_twitch_event(text,integer,boolean) to service_role;
grant execute on function public.claim_twitch_event_command(text,integer,uuid,text) to service_role;

-- Browser clients cannot forge a receipt ID and interfere with retry deduplication.
create function public.guard_twitch_event_reference()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('anon','authenticated') then
    if tg_op='INSERT' and new.twitch_event_message_id is not null then
      raise exception 'Event reference is server-managed' using errcode='42501';
    elsif tg_op='UPDATE' and new.twitch_event_message_id is distinct from old.twitch_event_message_id then
      raise exception 'Event reference is server-managed' using errcode='42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger suggestions_guard_event_reference before insert or update on public.suggestions
for each row execute function public.guard_twitch_event_reference();
