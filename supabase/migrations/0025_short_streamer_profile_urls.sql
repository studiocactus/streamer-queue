-- Streamer profile URLs use the Twitch login directly at /:slug.
-- Twitch logins may contain underscores, so preserve them in channel slugs.
alter table public.streamers drop constraint if exists slug_format;
alter table public.streamers
  add constraint slug_format check (slug ~ '^[a-z0-9_-]+$');

-- Restore underscores for existing channels when the Twitch login is available
-- and the desired slug is not already owned by another channel.
update public.streamers s
set slug = lower(p.twitch_login)
from public.profiles p
where p.id = s.owner_id
  and p.twitch_login ~* '^[a-z0-9_]{3,25}$'
  and s.slug <> lower(p.twitch_login)
  and not exists (
    select 1
    from public.streamers other
    where other.id <> s.id
      and other.slug = lower(p.twitch_login)
  );

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

  v_slug := regexp_replace(lower(v_profile.twitch_login), '[^a-z0-9_-]', '', 'g');
  if char_length(v_slug) < 3 or v_slug in ('auth', 'dashboard', 'explore', 'streamer') then
    v_slug := 'canal-' || left(p_user_id::text, 8);
  end if;
  if exists (select 1 from public.streamers where slug = v_slug) then
    v_slug := left(v_slug, 40) || '-' || left(p_user_id::text, 8);
  end if;

  insert into public.streamers (owner_id, twitch_broadcaster_id, channel_name, slug, avatar_url, is_public, is_active)
  values (p_user_id, v_profile.twitch_user_id, v_profile.display_name, v_slug, v_profile.avatar_url, true, true)
  returning id into v_streamer_id;

  delete from public.streamer_members where user_id = p_user_id and role = 'moderator';
  return v_streamer_id;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function public.promote_viewer_to_streamer(uuid) from public, anon;
grant execute on function public.promote_viewer_to_streamer(uuid) to authenticated;
