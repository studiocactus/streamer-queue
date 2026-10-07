-- Approved is a legacy input alias; the persisted workflow has one queue step.
create or replace function public.assign_queue_position()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status = 'approved' then new.status := 'queued'; end if;
  if new.status = 'queued' then
    if tg_op = 'INSERT' or old.status is distinct from 'queued' or new.queue_position is null then
      perform pg_advisory_xact_lock(hashtextextended('suggestion-queue:' || new.streamer_id::text, 0));
      select coalesce(max(queue_position),0)+1 into new.queue_position from public.suggestions
        where streamer_id=new.streamer_id and status='queued' and id<>new.id;
      new.approved_at := coalesce(new.approved_at, now());
    end if;
  else new.queue_position := null;
  end if;
  return new;
end; $$;
drop trigger if exists suggestions_assign_queue_position on public.suggestions;
create trigger suggestions_assign_queue_position before insert or update of status on public.suggestions
for each row execute function public.assign_queue_position();
-- Preserve existing queue order and move the legacy backlog without announcing old approvals.
alter table public.suggestions disable trigger suggestions_enqueue_chat_delivery;
do $$ declare item record; begin
  for item in select id from public.suggestions where status='approved' order by approved_at nulls last, submitted_at, id loop
    update public.suggestions set status='queued' where id=item.id;
  end loop;
end $$;
alter table public.suggestions enable trigger suggestions_enqueue_chat_delivery;
