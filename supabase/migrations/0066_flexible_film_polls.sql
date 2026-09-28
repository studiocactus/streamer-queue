-- Poll size is chosen by the channel; commands follow the selected order.
alter table public.film_poll_options drop constraint film_poll_options_position_check;
alter table public.film_poll_options alter column position type integer;
alter table public.film_poll_options add constraint film_poll_options_position_check check(position > 0);

create table public.film_poll_announcements (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.film_polls(id) on delete cascade,
  position integer not null,
  message text not null check(char_length(message) between 1 and 450),
  sent_at timestamptz,
  locked_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  unique(poll_id,position)
);
alter table public.film_poll_announcements enable row level security;
create policy staff_read_poll_announcements on public.film_poll_announcements for select to authenticated
using(exists(select 1 from public.film_polls p where p.id=poll_id and public.can_manage_streamer(p.streamer_id)));

create or replace function public.create_film_poll(
  p_streamer_id uuid, p_starts_at timestamptz, p_ends_at timestamptz,
  p_titles text[], p_vote_template text, p_result_template text
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  poll_id uuid;
  film_title text;
  option_number integer := 0;
  part_number integer := 1;
  announcement text := '🎬 Votação aberta! Vote com o comando do filme: ';
  entry text;
begin
  if not public.can_manage_streamer(p_streamer_id) then raise exception 'Not authorized' using errcode='42501'; end if;
  if coalesce(cardinality(p_titles),0) < 2 or p_starts_at is null or p_ends_at is null
     or p_ends_at <= p_starts_at or p_ends_at <= now() then
    raise exception 'Choose at least two films and a valid voting period' using errcode='22023';
  end if;
  if exists(select 1 from unnest(p_titles) t where t is null or char_length(trim(t)) not between 1 and 200)
    or (select count(distinct lower(trim(t))) from unnest(p_titles) t) <> cardinality(p_titles) then
    raise exception 'Film titles must be distinct and contain 1 to 200 characters' using errcode='22023';
  end if;
  if coalesce(char_length(trim(p_vote_template)),0) not between 1 and 500
    or coalesce(char_length(trim(p_result_template)),0) not between 1 and 500 then
    raise exception 'Invalid message template' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('film-poll:' || p_streamer_id::text,0));
  update public.film_polls set status='ended'
    where streamer_id=p_streamer_id and status in ('scheduled','active') and ends_at<=now();
  insert into public.film_polls(streamer_id,starts_at,ends_at,vote_message_template,result_message_template)
    values(p_streamer_id,p_starts_at,p_ends_at,trim(p_vote_template),trim(p_result_template)) returning id into poll_id;
  foreach film_title in array p_titles loop
    option_number := option_number+1;
    insert into public.film_poll_options(poll_id,position,title,command)
      values(poll_id,option_number,trim(film_title),'!filme' || option_number);
    entry := '!filme' || option_number || ' — ' || trim(film_title);
    if char_length(announcement || entry || ' | ') > 450 then
      insert into public.film_poll_announcements(poll_id,position,message) values(poll_id,part_number,trim(announcement));
      part_number := part_number+1;
      announcement := '';
    end if;
    announcement := announcement || entry || ' | ';
  end loop;
  insert into public.film_poll_announcements(poll_id,position,message)
    values(poll_id,part_number,rtrim(announcement,' |'));
  return poll_id;
end;
$$;
revoke all on function public.create_film_poll(uuid,timestamptz,timestamptz,text[],text,text) from public,anon;
grant execute on function public.create_film_poll(uuid,timestamptz,timestamptz,text[],text,text) to authenticated;

create or replace function public.claim_film_poll_announcement()
returns table(id uuid,streamer_id uuid,message text,attempt integer)
language plpgsql security definer set search_path=public as $$
declare selected public.film_poll_announcements%rowtype; channel_id uuid;
begin
  select a.* into selected from public.film_poll_announcements a
    join public.film_polls p on p.id=a.poll_id
    where p.status in ('scheduled','active') and p.starts_at<=now() and p.ends_at>now()
      and a.sent_at is null and (a.locked_at is null or a.locked_at<now()-interval '2 minutes')
      and not exists(select 1 from public.film_poll_announcements earlier
        where earlier.poll_id=a.poll_id and earlier.position<a.position and earlier.sent_at is null)
    order by p.starts_at,a.position for update of a skip locked limit 1;
  if not found then return; end if;
  update public.film_poll_announcements a set locked_at=now(),attempts=a.attempts+1
    where a.id=selected.id returning a.attempts into selected.attempts;
  select p.streamer_id into channel_id from public.film_polls p where p.id=selected.poll_id;
  return query select selected.id,channel_id,selected.message,selected.attempts;
end;
$$;

create or replace function public.settle_film_poll_announcement(p_id uuid,p_attempt integer,p_sent boolean,p_error text default null)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  update public.film_poll_announcements set sent_at=case when p_sent then now() else null end,
    locked_at=case when p_sent then null else now() end,last_error=p_error
    where id=p_id and attempts=p_attempt and sent_at is null;
  return found;
end;
$$;
revoke all on function public.claim_film_poll_announcement() from public,anon,authenticated;
revoke all on function public.settle_film_poll_announcement(uuid,integer,boolean,text) from public,anon,authenticated;
grant execute on function public.claim_film_poll_announcement() to service_role;
grant execute on function public.settle_film_poll_announcement(uuid,integer,boolean,text) to service_role;

create or replace function public.delete_channel_suggestions(p_streamer_id uuid,p_ids uuid[])
returns integer language plpgsql security definer set search_path=public as $$
declare removed integer;
begin
  if not public.can_manage_streamer(p_streamer_id) then raise exception 'Not authorized' using errcode='42501'; end if;
  if exists(select 1 from public.suggestions where id=any(p_ids) and streamer_id<>p_streamer_id) then
    raise exception 'Selection contains another channel' using errcode='42501';
  end if;
  delete from public.suggestions where streamer_id=p_streamer_id and id=any(p_ids);
  get diagnostics removed = row_count;
  return removed;
end;
$$;
revoke all on function public.delete_channel_suggestions(uuid,uuid[]) from public,anon;
grant execute on function public.delete_channel_suggestions(uuid,uuid[]) to authenticated;
