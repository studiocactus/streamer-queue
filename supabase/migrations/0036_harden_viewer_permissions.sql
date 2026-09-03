-- Check only the caller's ban without exposing the channel's private ban list.
create or replace function public.is_banned_from_channel(p_streamer_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.banned_users b
    where b.streamer_id = p_streamer_id and b.user_id = auth.uid()
  );
$$;
revoke all on function public.is_banned_from_channel(uuid) from public, anon;
grant execute on function public.is_banned_from_channel(uuid) to authenticated;

drop policy if exists "suggestions_insert_authenticated" on public.suggestions;
create policy "suggestions_insert_authenticated" on public.suggestions
for insert to authenticated with check (
  auth.uid() = submitted_by
  and not public.is_banned_from_channel(suggestions.streamer_id)
  and exists (
    select 1 from public.streamers s
    where s.id = suggestions.streamer_id and s.is_public and s.is_active
      and (s.accepting_suggestions or s.owner_id = auth.uid())
      and (suggestions.status = 'pending' or s.owner_id = auth.uid())
  )
);

drop policy if exists "suggestions_update_own_pending" on public.suggestions;
create policy "suggestions_update_own_pending" on public.suggestions
for update to authenticated
using (auth.uid() = submitted_by and status = 'pending'
  and not public.is_banned_from_channel(suggestions.streamer_id))
with check (auth.uid() = submitted_by and status = 'pending'
  and not public.is_banned_from_channel(suggestions.streamer_id));

drop policy if exists "votes_insert_own" on public.votes;
create policy "votes_insert_own" on public.votes
for insert to authenticated with check (
  auth.uid() = user_id
  and not public.is_banned_from_channel(votes.streamer_id)
  and exists (
    select 1 from public.streamers s
    where s.id = votes.streamer_id and s.is_public and s.is_active
  )
  and exists (
    select 1 from public.suggestions sg
    where sg.id = votes.suggestion_id and sg.streamer_id = votes.streamer_id
      and sg.submitted_by is distinct from auth.uid()
      and sg.status in ('approved', 'queued', 'pending')
  )
  and exists (
    select 1 from public.streamer_settings ss
    where ss.streamer_id = votes.streamer_id and ss.allow_votes
  )
);

-- Identity is managed by the trusted OAuth backend, not browser clients.
drop policy if exists "profiles_insert_own" on public.profiles;
revoke insert, update on public.profiles from public, anon, authenticated;
grant update (bio, social_links) on public.profiles to authenticated;

-- Editing a pending suggestion must not move it to another channel/author.
create or replace function public.guard_suggestion_ownership()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated') and
    (new.streamer_id is distinct from old.streamer_id
      or new.submitted_by is distinct from old.submitted_by) then
    raise exception 'SUGGESTION_OWNERSHIP_IMMUTABLE' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger suggestions_guard_ownership before update on public.suggestions
for each row execute function public.guard_suggestion_ownership();
