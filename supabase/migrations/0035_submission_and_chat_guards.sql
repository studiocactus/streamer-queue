-- Per-person protection; existing suggestions are never removed.
create or replace function public.guard_duplicate_suggestion()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  identity_key text;
  normalized_title text;
begin
  identity_key := coalesce(new.submitted_by::text, 'twitch:' || new.chat_user_id);
  normalized_title := lower(regexp_replace(trim(new.title), '\s+', ' ', 'g'));
  if identity_key is null or new.status in ('completed', 'rejected') then return new; end if;
  -- Serialize concurrent submissions by the same person in this channel.
  perform pg_advisory_xact_lock(hashtextextended(new.streamer_id::text || ':' || identity_key, 0));
  if exists (
    select 1 from public.suggestions s
    where s.streamer_id = new.streamer_id
      and coalesce(s.submitted_by::text, 'twitch:' || s.chat_user_id) = identity_key
      and s.status not in ('completed', 'rejected')
      and lower(regexp_replace(trim(s.title), '\s+', ' ', 'g')) = normalized_title
  ) then
    raise exception using errcode = 'P0001', message = 'SUGGESTION_ALREADY_ACTIVE';
  end if;
  return new;
end;
$$;
create trigger suggestions_guard_duplicate before insert on public.suggestions
for each row execute function public.guard_duplicate_suggestion();

create table public.chat_command_cooldowns (
  streamer_id uuid not null references public.streamers(id) on delete cascade,
  twitch_user_id text not null,
  allowed_at timestamptz not null,
  primary key (streamer_id, twitch_user_id)
);
alter table public.chat_command_cooldowns enable row level security;
revoke all on public.chat_command_cooldowns from anon, authenticated;

create function public.claim_chat_command(p_streamer_id uuid, p_twitch_user_id text)
returns boolean language plpgsql security definer set search_path = public as $$
declare claimed boolean;
begin
  insert into public.chat_command_cooldowns as cooldown (streamer_id, twitch_user_id, allowed_at)
  values (p_streamer_id, p_twitch_user_id, clock_timestamp() + interval '10 seconds')
  on conflict (streamer_id, twitch_user_id) do update
    set allowed_at = excluded.allowed_at
    where cooldown.allowed_at <= clock_timestamp()
  returning true into claimed;
  return coalesce(claimed, false);
end;
$$;
revoke all on function public.claim_chat_command(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_chat_command(uuid, text) to service_role;
