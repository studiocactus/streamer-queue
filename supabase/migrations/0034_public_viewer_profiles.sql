-- Optional public identity for viewers, kept intentionally small.
alter table public.profiles
  add column if not exists bio text,
  add column if not exists social_links jsonb not null default '{}'::jsonb;

alter table public.profiles drop constraint if exists profiles_bio_length;
alter table public.profiles add constraint profiles_bio_length
  check (bio is null or char_length(bio) <= 500);
alter table public.profiles drop constraint if exists profiles_social_links_object;
alter table public.profiles add constraint profiles_social_links_object
  check (jsonb_typeof(social_links) = 'object');

create or replace function public.get_public_viewer_profile(p_login text)
returns table (
  id uuid,
  twitch_login text,
  display_name text,
  avatar_url text,
  bio text,
  social_links jsonb,
  moderated_channels jsonb
)
language sql
security definer
stable
set search_path = public
as $$
  select
    p.id,
    p.twitch_login,
    p.display_name,
    p.avatar_url,
    p.bio,
    p.social_links,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'channel_name', s.channel_name,
        'slug', s.slug,
        'avatar_url', s.avatar_url
      ) order by s.channel_name)
      from public.streamer_members sm
      join public.streamers s on s.id = sm.streamer_id
      where sm.user_id = p.id
        and sm.role = 'moderator'
        and s.is_active = true
        and s.is_public = true
    ), '[]'::jsonb)
  from public.profiles p
  where lower(p.twitch_login) = lower(trim(p_login))
  limit 1;
$$;

revoke all on function public.get_public_viewer_profile(text) from public;
grant execute on function public.get_public_viewer_profile(text) to anon, authenticated;
