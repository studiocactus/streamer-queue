-- Four owner-selectable public profile themes.
alter table public.streamers
  add column if not exists profile_theme text not null default 'neon';
alter table public.streamers
  drop constraint if exists streamers_profile_theme_check;
alter table public.streamers
  add constraint streamers_profile_theme_check
  check (profile_theme in ('neon', 'aurora', 'sunset', 'midnight'));

-- Platform ownership is explicit and independent from channel moderation.
create table if not exists public.platform_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
create policy "platform_admins_select_own" on public.platform_admins
  for select using (auth.uid() = user_id);

insert into public.platform_admins (user_id)
select id from public.profiles where lower(twitch_login) = 'thenees'
on conflict (user_id) do nothing;

create or replace function public.is_platform_admin(p_user_id uuid)
returns boolean as $$
  select exists (select 1 from public.platform_admins where user_id = p_user_id);
$$ language sql security definer stable set search_path = public;

-- Viewers may never create their own channel. Only the platform owner can use
-- the controlled promotion function below.
drop policy if exists "streamers_insert_own" on public.streamers;

create or replace function public.promote_viewer_to_streamer(p_user_id uuid)
returns uuid as $$
declare
  v_profile public.profiles%rowtype;
  v_streamer_id uuid;
  v_slug text;
begin
  if auth.uid() is null or not public.is_platform_admin(auth.uid()) then
    raise exception 'Somente o proprietário da plataforma pode promover streamers';
  end if;
  select * into v_profile from public.profiles where id = p_user_id;
  if not found then raise exception 'Viewer não encontrado'; end if;
  select id into v_streamer_id from public.streamers where owner_id = p_user_id limit 1;
  if v_streamer_id is not null then return v_streamer_id; end if;

  v_slug := regexp_replace(lower(v_profile.twitch_login), '[^a-z0-9-]', '', 'g');
  if char_length(v_slug) < 3 then v_slug := 'canal-' || left(p_user_id::text, 8); end if;

  insert into public.streamers (owner_id, twitch_broadcaster_id, channel_name, slug, avatar_url, is_public, is_active)
  values (p_user_id, v_profile.twitch_user_id, v_profile.display_name, v_slug, v_profile.avatar_url, true, true)
  returning id into v_streamer_id;

  -- Roles are hierarchical: after promotion the account is no longer a viewer/moderator.
  delete from public.streamer_members where user_id = p_user_id and role = 'moderator';
  return v_streamer_id;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function public.promote_viewer_to_streamer(uuid) from public, anon;
grant execute on function public.promote_viewer_to_streamer(uuid) to authenticated;

-- A channel owner may only add/remove actual viewers as moderators.
drop policy if exists "members_insert_owner" on public.streamer_members;
create policy "members_insert_owner" on public.streamer_members
  for insert with check (
    auth.uid() is not null
    and public.is_streamer_owner(streamer_id, auth.uid())
    and role = 'moderator'
    and user_id <> auth.uid()
    and not exists (select 1 from public.streamers where owner_id = user_id)
    and not public.is_platform_admin(user_id)
  );

drop policy if exists "members_update_owner" on public.streamer_members;
create policy "members_update_owner" on public.streamer_members
  for update using (
    auth.uid() is not null
    and public.is_streamer_owner(streamer_id, auth.uid())
    and role = 'moderator'
  ) with check (
    role = 'moderator'
    and not exists (select 1 from public.streamers where owner_id = user_id)
    and not public.is_platform_admin(user_id)
  );

drop policy if exists "members_delete_owner" on public.streamer_members;
create policy "members_delete_owner" on public.streamer_members
  for delete using (
    auth.uid() is not null
    and public.is_streamer_owner(streamer_id, auth.uid())
    and role = 'moderator'
  );

