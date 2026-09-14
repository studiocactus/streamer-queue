-- Full operational access follows membership for existing and future moderators.
create or replace function public.has_streamer_permission(p_streamer_id uuid, p_user_id uuid, p_permission text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_streamer_owner(p_streamer_id, p_user_id) or exists (
    select 1 from public.streamer_members
    where streamer_id = p_streamer_id and user_id = p_user_id
      and (role in ('owner', 'moderator') or p_permission = any(permissions))
  );
$$;
create or replace function public.get_my_moderated_channels()
returns table(id uuid, channel_name text, slug text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select s.id, s.channel_name, s.slug, s.avatar_url from public.streamers s
  where public.is_platform_admin(auth.uid()) or exists (
    select 1 from public.streamer_members m where m.streamer_id=s.id
      and m.user_id=auth.uid() and m.role='moderator'
  );
$$;
-- Permission-based policies already cover settings, polls, automations and counters.
create policy channel_staff_manage_templates on public.chat_message_templates for all to authenticated
using (public.can_manage_streamer(streamer_id)) with check (public.can_manage_streamer(streamer_id));
create policy channel_staff_manage_bans on public.banned_users for all to authenticated
using (public.can_manage_streamer(streamer_id)) with check (public.can_manage_streamer(streamer_id));
create policy channel_staff_manage_members on public.streamer_members for all to authenticated
using (public.can_manage_streamer(streamer_id) and role <> 'owner')
with check (public.can_manage_streamer(streamer_id) and role <> 'owner');
create policy channel_staff_delete_suggestions on public.suggestions for delete to authenticated
using (public.can_manage_streamer(streamer_id));
create policy channel_staff_insert_suggestions on public.suggestions for insert to authenticated
with check (public.can_manage_streamer(streamer_id) and submitted_by=auth.uid());
create policy channel_staff_read_deliveries on public.chat_delivery_queue for select to authenticated
using (public.can_manage_streamer(streamer_id));
create policy channel_staff_manage_notifications on public.streamer_notifications for all to authenticated
using (public.can_manage_streamer(streamer_id)) with check (public.can_manage_streamer(streamer_id));
create policy channel_staff_manage_assets on storage.objects for all to authenticated
using (bucket_id='streamer-assets' and exists(select 1 from public.streamers s where s.id::text=(storage.foldername(name))[1] and public.can_manage_streamer(s.id)))
with check (bucket_id='streamer-assets' and exists(select 1 from public.streamers s where s.id::text=(storage.foldername(name))[1] and public.can_manage_streamer(s.id)));

-- Delegated editing must not transfer ownership or change the linked Twitch identity.
create or replace function public.guard_moderator_channel_identity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_streamer_owner(old.id, auth.uid()) and
    (new.id is distinct from old.id or new.owner_id is distinct from old.owner_id
      or new.twitch_broadcaster_id is distinct from old.twitch_broadcaster_id) then
    raise exception 'CHANNEL_IDENTITY_IMMUTABLE' using errcode='42501';
  end if;
  return new;
end;
$$;
create trigger guard_moderator_channel_identity before update on public.streamers
for each row execute function public.guard_moderator_channel_identity();

create or replace function public.is_twitch_chat_manager(p_streamer_id uuid, p_twitch_user_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p where p.twitch_user_id=p_twitch_user_id
      and public.has_streamer_permission(p_streamer_id,p.id,'manage_settings')
  );
$$;
