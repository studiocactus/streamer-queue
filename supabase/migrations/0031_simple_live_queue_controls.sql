-- Keep queue ordering predictable without asking streamers to manage numbers.
with ordered as (
  select id, row_number() over (
    partition by streamer_id
    order by queue_position nulls last, submitted_at, id
  )::integer as position
  from public.suggestions
  where status = 'queued'
)
update public.suggestions suggestion
set queue_position = ordered.position
from ordered
where suggestion.id = ordered.id;

create or replace function public.assign_queue_position()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'queued' and (old.status is distinct from 'queued' or new.queue_position is null) then
    select coalesce(max(queue_position), 0) + 1 into new.queue_position
    from public.suggestions
    where streamer_id = new.streamer_id and status = 'queued' and id <> new.id;
  elsif new.status <> 'queued' then
    new.queue_position := null;
  end if;
  return new;
end;
$$;

drop trigger if exists suggestions_assign_queue_position on public.suggestions;
create trigger suggestions_assign_queue_position
  before update of status on public.suggestions
  for each row execute function public.assign_queue_position();

create or replace function public.can_manage_streamer(p_streamer_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.streamers where id = p_streamer_id and owner_id = auth.uid()
  ) or exists (
    select 1 from public.streamer_members
    where streamer_id = p_streamer_id and user_id = auth.uid() and role in ('owner', 'moderator')
  );
$$;

revoke all on function public.can_manage_streamer(uuid) from public, anon, authenticated;

create or replace function public.reorder_queue(
  p_streamer_id uuid,
  p_suggestion_id uuid,
  p_new_position integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  old_position integer;
  target_position integer;
  queue_size integer;
begin
  if not public.can_manage_streamer(p_streamer_id) then raise exception 'Acesso negado'; end if;

  select queue_position into old_position from public.suggestions
  where id = p_suggestion_id and streamer_id = p_streamer_id and status = 'queued'
  for update;
  if old_position is null then raise exception 'Conteúdo não está na fila'; end if;

  select count(*) into queue_size from public.suggestions
  where streamer_id = p_streamer_id and status = 'queued';
  target_position := greatest(1, least(p_new_position, queue_size));
  if target_position = old_position then return; end if;

  if old_position < target_position then
    update public.suggestions set queue_position = queue_position - 1
    where streamer_id = p_streamer_id and status = 'queued'
      and queue_position > old_position and queue_position <= target_position;
  else
    update public.suggestions set queue_position = queue_position + 1
    where streamer_id = p_streamer_id and status = 'queued'
      and queue_position >= target_position and queue_position < old_position;
  end if;
  update public.suggestions set queue_position = target_position where id = p_suggestion_id;
end;
$$;

revoke all on function public.reorder_queue(uuid, uuid, integer) from public, anon;
grant execute on function public.reorder_queue(uuid, uuid, integer) to authenticated;

create or replace function public.advance_streamer_queue(p_streamer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  next_id uuid;
begin
  if not public.can_manage_streamer(p_streamer_id) then raise exception 'Acesso negado'; end if;

  update public.suggestions
  set status = 'completed', completed_at = now()
  where streamer_id = p_streamer_id and status = 'watching';

  select id into next_id from public.suggestions
  where streamer_id = p_streamer_id and status = 'queued'
  order by queue_position, submitted_at
  limit 1 for update;

  if next_id is not null then
    update public.suggestions set status = 'watching', started_at = now() where id = next_id;
  end if;
  return next_id;
end;
$$;

revoke all on function public.advance_streamer_queue(uuid) from public, anon;
grant execute on function public.advance_streamer_queue(uuid) to authenticated;
