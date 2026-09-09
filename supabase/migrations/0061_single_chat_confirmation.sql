-- Chat-origin suggestions already receive their confirmation from EventSub.
-- Keep registered-viewer priority and all later status notifications.
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
    if new.submission_source <> 'platform' or new.twitch_event_message_id is not null then
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
