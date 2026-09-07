-- Moderators are scoped to one channel and receive only operational permissions.
-- Membership rows remain owner-managed through the existing RLS policies.
update public.streamer_members
set permissions = array(select distinct permission from unnest(permissions || array['approve', 'reject', 'manage_queue', 'manage_settings']) as permission)
where role = 'moderator';

drop policy if exists "settings_update_moderator" on public.streamer_settings;
create policy "settings_update_moderator" on public.streamer_settings
for update to authenticated
using (public.has_streamer_permission(streamer_id, auth.uid(), 'manage_settings'))
with check (public.has_streamer_permission(streamer_id, auth.uid(), 'manage_settings'));

drop policy if exists "streamers_update_moderator" on public.streamers;
create policy "streamers_update_moderator" on public.streamers
for update to authenticated
using (public.has_streamer_permission(id, auth.uid(), 'manage_settings'))
with check (public.has_streamer_permission(id, auth.uid(), 'manage_settings'));

drop policy if exists "templates_update_moderator" on public.chat_message_templates;
create policy "templates_update_moderator" on public.chat_message_templates
for update to authenticated
using (public.has_streamer_permission(streamer_id, auth.uid(), 'manage_settings'))
with check (public.has_streamer_permission(streamer_id, auth.uid(), 'manage_settings'));

drop policy if exists "templates_insert_moderator" on public.chat_message_templates;
create policy "templates_insert_moderator" on public.chat_message_templates
for insert to authenticated
with check (public.has_streamer_permission(streamer_id, auth.uid(), 'manage_settings'));

-- Film polls can change the chat experience, so only the selected channel staff can manage them.
drop policy if exists "film polls managed by channel members" on public.film_polls;
create policy "film polls managed by channel staff" on public.film_polls
for all to authenticated
using (public.has_streamer_permission(streamer_id, auth.uid(), 'manage_settings'))
with check (public.has_streamer_permission(streamer_id, auth.uid(), 'manage_settings'));

drop policy if exists "film poll options managed by channel members" on public.film_poll_options;
create policy "film poll options managed by channel staff" on public.film_poll_options
for all to authenticated
using (exists (select 1 from public.film_polls p where p.id = poll_id and public.has_streamer_permission(p.streamer_id, auth.uid(), 'manage_settings')))
with check (exists (select 1 from public.film_polls p where p.id = poll_id and public.has_streamer_permission(p.streamer_id, auth.uid(), 'manage_settings')));

create or replace function public.notify_streamer_of_moderator_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  channel_id uuid;
  owner_id uuid;
  moderator_name text;
  changed_area text := tg_argv[0];
begin
  if tg_table_name = 'streamers' then
    channel_id := case when tg_op = 'INSERT' then new.id else old.id end;
  else
    channel_id := case when tg_op = 'INSERT' then new.streamer_id else old.streamer_id end;
  end if;
  if auth.uid() is null then return new; end if;
  select owner_id into owner_id from public.streamers where id = channel_id;
  if owner_id is null or owner_id = auth.uid() or not public.has_streamer_permission(channel_id, auth.uid(), 'manage_settings') then
    return new;
  end if;
  select display_name into moderator_name from public.profiles where id = auth.uid();
  insert into public.streamer_notifications (streamer_id, user_id, type, title, message, target_path)
  values (channel_id, owner_id, 'moderator_change', 'Alteração do moderador', coalesce(moderator_name, 'Seu moderador') || ' alterou ' || changed_area || ' do canal.', '/dashboard/streamer');
  return new;
end;
$$;

drop trigger if exists tr_moderator_settings_notification on public.streamer_settings;
create trigger tr_moderator_settings_notification after update on public.streamer_settings
for each row execute function public.notify_streamer_of_moderator_change('as configurações');
drop trigger if exists tr_moderator_channel_notification on public.streamers;
create trigger tr_moderator_channel_notification after update on public.streamers
for each row execute function public.notify_streamer_of_moderator_change('as informações');
drop trigger if exists tr_moderator_templates_notification on public.chat_message_templates;
create trigger tr_moderator_templates_notification after insert or update on public.chat_message_templates
for each row execute function public.notify_streamer_of_moderator_change('as mensagens do chat');
drop trigger if exists tr_moderator_poll_notification on public.film_polls;
create trigger tr_moderator_poll_notification after insert or update on public.film_polls
for each row execute function public.notify_streamer_of_moderator_change('a votação de filmes');

create or replace function public.notify_streamer_of_moderator_suggestion_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  owner_id uuid;
  moderator_name text;
begin
  if auth.uid() is null or old.status is not distinct from new.status then return new; end if;
  select owner_id into owner_id from public.streamers where id = new.streamer_id;
  if owner_id is null or owner_id = auth.uid() or not public.has_streamer_permission(new.streamer_id, auth.uid(), 'approve') then return new; end if;
  select display_name into moderator_name from public.profiles where id = auth.uid();
  insert into public.streamer_notifications (streamer_id, user_id, suggestion_id, type, title, message, target_path)
  values (new.streamer_id, owner_id, new.id, 'moderator_change', 'Alteração do moderador', coalesce(moderator_name, 'Seu moderador') || ' mudou “' || new.title || '” para ' || new.status || '.', '/dashboard/streamer');
  return new;
end;
$$;
drop trigger if exists tr_moderator_suggestion_notification on public.suggestions;
create trigger tr_moderator_suggestion_notification after update of status on public.suggestions
for each row execute function public.notify_streamer_of_moderator_suggestion_change();

-- A safe, RLS-backed list for the moderator's own dashboard.
create or replace function public.get_my_moderated_channels()
returns table(id uuid, channel_name text, slug text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select s.id, s.channel_name, s.slug, s.avatar_url
  from public.streamer_members m
  join public.streamers s on s.id = m.streamer_id
  where m.user_id = auth.uid() and m.role = 'moderator'
    and 'manage_settings' = any(m.permissions) and s.is_active;
$$;
revoke all on function public.get_my_moderated_channels() from public, anon;
grant execute on function public.get_my_moderated_channels() to authenticated;
