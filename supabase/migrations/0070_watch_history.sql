-- Original media duration, never elapsed time in the watching status.
alter table public.suggestions add column duration_seconds integer check(duration_seconds>0 and duration_seconds<=604800);
alter table public.suggestions add column duration_source text check(duration_source in ('youtube','manual'));
alter table public.suggestions add column duration_checked_at timestamptz;

create table public.watch_history (
  id uuid primary key default gen_random_uuid(),
  streamer_id uuid not null references public.streamers(id) on delete cascade,
  suggestion_id uuid references public.suggestions(id) on delete set null,
  title text not null,
  category text not null,
  source_url text,
  duration_seconds integer check(duration_seconds>0 and duration_seconds<=604800),
  duration_source text check(duration_source in ('youtube','manual')),
  completed_at timestamptz,
  duration_checked_at timestamptz,
  imported boolean not null default false,
  created_at timestamptz not null default now()
);
create index watch_history_channel_date on public.watch_history(streamer_id,completed_at desc);
create index watch_history_suggestion on public.watch_history(suggestion_id);
alter table public.watch_history enable row level security;
revoke all on public.watch_history from public,anon,authenticated;
grant select on public.watch_history to authenticated;
grant all on public.watch_history to service_role;
create policy watch_history_staff_read on public.watch_history for select to authenticated
using(public.can_manage_streamer(streamer_id));

-- Viewers cannot manufacture reported durations; trusted metadata is resolved server-side.
create or replace function public.guard_suggestion_duration()
returns trigger language plpgsql set search_path=public as $$
begin
  if current_user in ('anon','authenticated') then
    if tg_op='INSERT' then
      new.duration_seconds:=null; new.duration_source:=null; new.duration_checked_at:=null;
    elsif new.duration_seconds is distinct from old.duration_seconds or new.duration_source is distinct from old.duration_source or new.duration_checked_at is distinct from old.duration_checked_at then
      raise exception 'Use the channel duration editor' using errcode='42501';
    end if;
  end if;
  if tg_op='UPDATE' and new.source_url is distinct from old.source_url then
    new.duration_seconds:=null;new.duration_source:=null;new.duration_checked_at:=null;
  end if;
  return new;
end; $$;
create trigger suggestions_guard_duration before insert or update on public.suggestions for each row execute function public.guard_suggestion_duration();

create or replace function public.record_watch_completion()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='UPDATE' then
    if new.duration_seconds is distinct from old.duration_seconds or new.duration_source is distinct from old.duration_source then
      update public.watch_history set duration_seconds=new.duration_seconds,duration_source=new.duration_source
      where suggestion_id=new.id and source_url is not distinct from new.source_url;
    end if;
    if new.status is not distinct from old.status then return new; end if;
  end if;
  if new.status='completed' then
    insert into public.watch_history(streamer_id,suggestion_id,title,category,source_url,duration_seconds,duration_source,completed_at)
    values(new.streamer_id,new.id,new.title,new.category,new.source_url,new.duration_seconds,new.duration_source,now());
  end if;
  return new;
end; $$;
revoke all on function public.record_watch_completion() from public,anon,authenticated;
create trigger suggestions_record_completion after insert or update of status,duration_seconds,duration_source on public.suggestions
for each row execute function public.record_watch_completion();
insert into public.watch_history(streamer_id,suggestion_id,title,category,source_url,duration_seconds,duration_source,completed_at,imported)
select streamer_id,id,title,category,source_url,duration_seconds,duration_source,completed_at,true from public.suggestions where status='completed';

-- Editing a retained history entry also corrects the linked suggestion and its other completions.
create or replace function public.set_watch_duration(p_history_id uuid,p_seconds integer)
returns void language plpgsql security definer set search_path=public as $$
declare entry public.watch_history%rowtype;
begin
  select * into entry from public.watch_history where id=p_history_id for update;
  if not found or not public.can_manage_streamer(entry.streamer_id) then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_seconds is not null and (p_seconds<=0 or p_seconds>604800) then raise exception 'Invalid duration' using errcode='22023'; end if;
  update public.watch_history set duration_seconds=p_seconds,duration_source=case when p_seconds is null then null else 'manual' end where id=entry.id;
  update public.suggestions set duration_seconds=p_seconds,duration_source=case when p_seconds is null then null else 'manual' end,
    duration_checked_at=now()
  where id=entry.suggestion_id and source_url is not distinct from entry.source_url;
end; $$;
revoke all on function public.set_watch_duration(uuid,integer) from public,anon;
grant execute on function public.set_watch_duration(uuid,integer) to authenticated;

create or replace function public.get_watch_report(p_streamer_id uuid,p_from date,p_to date,p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; range_start timestamptz; range_end timestamptz;
begin
  if auth.uid() is null or (p_streamer_id is null and not public.is_platform_admin(auth.uid()))
    or (p_streamer_id is not null and not public.can_manage_streamer(p_streamer_id)) then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_from is null or p_to is null or p_to<p_from or p_to-p_from>365 or p_offset<0 or p_offset is null then raise exception 'Invalid period' using errcode='22023'; end if;
  range_start:=p_from::timestamp at time zone 'America/Sao_Paulo';
  range_end:=(p_to+1)::timestamp at time zone 'America/Sao_Paulo';
  with entries as (
    select h.*,s.channel_name from public.watch_history h join public.streamers s on s.id=h.streamer_id
    where (p_streamer_id is null or h.streamer_id=p_streamer_id) and h.completed_at>=range_start and h.completed_at<range_end
  ), daily as (
    select p_from+n as day,coalesce(sum(e.duration_seconds),0) as seconds,count(e.id) as completed,
      count(e.id) filter(where e.duration_seconds is null) as unknown
    from generate_series(0,p_to-p_from) n left join entries e on (e.completed_at at time zone 'America/Sao_Paulo')::date=p_from+n
    group by n
  ), page as (
    select * from entries order by completed_at desc,id desc limit 50 offset p_offset
  )
  select jsonb_build_object(
    'seconds',coalesce((select sum(duration_seconds) from entries),0),
    'completed',(select count(*) from entries),
    'known',(select count(*) from entries where duration_seconds is not null),
    'unknown',(select count(*) from entries where duration_seconds is null),
    'undated',(select count(*) from public.watch_history where completed_at is null and (p_streamer_id is null or streamer_id=p_streamer_id)),
    'daily',coalesce((select jsonb_agg(to_jsonb(daily) order by day) from daily),'[]'::jsonb),
    'entries',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb),
    'timezone','America/Sao_Paulo'
  ) into result;
  return result;
end; $$;
revoke all on function public.get_watch_report(uuid,date,date,integer) from public,anon;
grant execute on function public.get_watch_report(uuid,date,date,integer) to authenticated;
