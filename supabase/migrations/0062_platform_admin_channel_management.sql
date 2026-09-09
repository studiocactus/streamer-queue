-- Global platform administration applies dynamically, including future channels.
create or replace function public.is_streamer_member(p_streamer_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
 select public.is_platform_admin(p_user_id) or exists(select 1 from public.streamer_members where streamer_id=p_streamer_id and user_id=p_user_id);
$$;
create or replace function public.is_streamer_owner(p_streamer_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
 select public.is_platform_admin(p_user_id) or exists(select 1 from public.streamers where id=p_streamer_id and owner_id=p_user_id);
$$;
create or replace function public.has_streamer_permission(p_streamer_id uuid, p_user_id uuid, p_permission text)
returns boolean language sql stable security definer set search_path = public as $$
 select public.is_platform_admin(p_user_id) or exists(select 1 from public.streamer_members where streamer_id=p_streamer_id and user_id=p_user_id and (role='owner' or p_permission=any(permissions)));
$$;
create or replace function public.can_manage_streamer(p_streamer_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
 select public.is_streamer_owner(p_streamer_id, auth.uid()) or exists(select 1 from public.streamer_members where streamer_id=p_streamer_id and user_id=auth.uid() and role in ('owner','moderator'));
$$;
create or replace function public.get_my_moderated_channels()
returns table(id uuid, channel_name text, slug text, avatar_url text)
language sql stable security definer set search_path = public as $$
 select s.id,s.channel_name,s.slug,s.avatar_url from public.streamers s
 where public.is_platform_admin(auth.uid()) or (s.is_active and exists(select 1 from public.streamer_members m where m.streamer_id=s.id and m.user_id=auth.uid() and m.role='moderator' and 'manage_settings'=any(m.permissions)));
$$;
create policy platform_admin_update_streamers on public.streamers for update to authenticated using (public.is_platform_admin(auth.uid())) with check (public.is_platform_admin(auth.uid()));
create policy platform_admin_read_delivery_queue on public.chat_delivery_queue for select to authenticated using (public.is_platform_admin(auth.uid()));
create policy platform_admin_insert_suggestions on public.suggestions for insert to authenticated
with check (public.is_platform_admin(auth.uid()) and submitted_by = auth.uid());
create policy platform_admin_manage_assets on storage.objects for all to authenticated
using (bucket_id = 'streamer-assets' and public.is_platform_admin(auth.uid()) and exists (select 1 from public.streamers s where s.id::text = (storage.foldername(name))[1]))
with check (bucket_id = 'streamer-assets' and public.is_platform_admin(auth.uid()) and exists (select 1 from public.streamers s where s.id::text = (storage.foldername(name))[1]));
-- A single, safe recovery action for the streamer dashboard. The queue remains
-- private; owners and moderators can only retry deliveries from their channel.
create or replace function public.retry_failed_chat_deliveries(p_streamer_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  if not public.can_manage_streamer(p_streamer_id) then
    raise exception 'Not authorized';
  end if;

  update public.chat_delivery_queue
  set status = 'pending',
      attempts = 0,
      next_attempt_at = now(),
      locked_at = null,
      processed_at = null,
      last_error = null,
      updated_at = now()
  where streamer_id = p_streamer_id
    and status = 'failed';

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.retry_failed_chat_deliveries(uuid) from public;
grant execute on function public.retry_failed_chat_deliveries(uuid) to authenticated;

create or replace function public.is_twitch_chat_manager(p_streamer_id uuid, p_twitch_user_id text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.profiles p where p.twitch_user_id = p_twitch_user_id and public.is_platform_admin(p.id)) or exists (
    select 1
    from public.streamers s
    join public.profiles owner_profile on owner_profile.id = s.owner_id
    where s.id = p_streamer_id and owner_profile.twitch_user_id = p_twitch_user_id
  ) or exists (
    select 1
    from public.streamer_members member
    join public.profiles moderator_profile on moderator_profile.id = member.user_id
    where member.streamer_id = p_streamer_id
      and moderator_profile.twitch_user_id = p_twitch_user_id
      and member.role = 'moderator'
      and 'manage_settings' = any(member.permissions)
  );
$$;
