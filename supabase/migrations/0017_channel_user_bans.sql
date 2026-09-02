-- Channel-scoped bans controlled exclusively by the streamer owner.
create table if not exists public.banned_users (
  id uuid primary key default uuid_generate_v4(),
  streamer_id uuid not null references public.streamers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  banned_by uuid not null references public.profiles(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  unique (streamer_id, user_id)
);

create index if not exists idx_banned_users_streamer on public.banned_users(streamer_id);
alter table public.banned_users enable row level security;

create policy "bans_select_owner" on public.banned_users for select using (
  auth.uid() is not null and public.is_streamer_owner(streamer_id, auth.uid())
);
create policy "bans_insert_owner" on public.banned_users for insert with check (
  auth.uid() is not null and auth.uid() = banned_by
  and public.is_streamer_owner(streamer_id, auth.uid())
  and user_id <> auth.uid()
);
create policy "bans_update_owner" on public.banned_users for update using (
  auth.uid() is not null and public.is_streamer_owner(streamer_id, auth.uid())
);
create policy "bans_delete_owner" on public.banned_users for delete using (
  auth.uid() is not null and public.is_streamer_owner(streamer_id, auth.uid())
);

drop policy if exists "suggestions_insert_authenticated" on public.suggestions;
create policy "suggestions_insert_authenticated" on public.suggestions for insert with check (
  auth.uid() is not null and auth.uid() = submitted_by
  and exists (
    select 1 from public.streamers s
    where s.id = streamer_id and s.is_public = true and s.is_active = true
  )
  and not exists (
    select 1 from public.banned_users b
    where b.streamer_id = suggestions.streamer_id and b.user_id = auth.uid()
  )
);

drop policy if exists "votes_insert_own" on public.votes;
create policy "votes_insert_own" on public.votes for insert with check (
  auth.uid() is not null and auth.uid() = user_id
  and not exists (
    select 1 from public.banned_users b
    where b.streamer_id = votes.streamer_id and b.user_id = auth.uid()
  )
  and exists (
    select 1 from public.streamers s
    where s.id = streamer_id and s.is_public = true and s.is_active = true
  )
  and exists (
    select 1 from public.suggestions sg
    where sg.id = suggestion_id and sg.submitted_by <> auth.uid()
      and sg.status in ('approved', 'queued', 'pending')
  )
  and exists (
    select 1 from public.streamer_settings ss
    where ss.streamer_id = streamer_id and ss.allow_votes = true
  )
);
