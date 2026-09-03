-- Reuse the existing inbox for personal viewer updates, keeping one simple bell.
alter table public.streamer_notifications
  add column if not exists user_id uuid references public.profiles(id) on delete cascade,
  add column if not exists target_path text;

create index if not exists idx_streamer_notifications_user_inbox
  on public.streamer_notifications(user_id, created_at desc)
  where user_id is not null;

drop policy if exists "notifications_select_member" on public.streamer_notifications;
drop policy if exists "notifications_update_owner" on public.streamer_notifications;
drop policy if exists "notifications_delete_owner" on public.streamer_notifications;

create policy "notifications_select_recipient" on public.streamer_notifications
  for select using (
    auth.uid() = user_id
    or (user_id is null and auth.uid() is not null and public.is_streamer_member(streamer_id, auth.uid()))
  );

create policy "notifications_update_recipient" on public.streamer_notifications
  for update using (
    auth.uid() = user_id
    or (user_id is null and auth.uid() is not null and public.is_streamer_owner(streamer_id, auth.uid()))
  ) with check (
    auth.uid() = user_id
    or (user_id is null and auth.uid() is not null and public.is_streamer_owner(streamer_id, auth.uid()))
  );

create policy "notifications_delete_recipient" on public.streamer_notifications
  for delete using (
    auth.uid() = user_id
    or (user_id is null and auth.uid() is not null and public.is_streamer_owner(streamer_id, auth.uid()))
  );

create or replace function public.create_viewer_status_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  notification_title text;
  notification_message text;
  channel_slug text;
  channel_name text;
begin
  if new.submitted_by is null or old.status is not distinct from new.status then return new; end if;

  select slug, streamers.channel_name into channel_slug, channel_name
  from public.streamers where id = new.streamer_id;

  notification_title := case new.status
    when 'approved' then 'Sua sugestão foi aprovada'
    when 'queued' then 'Sua sugestão entrou na fila'
    when 'watching' then 'Sua sugestão começou'
    when 'completed' then 'Conteúdo concluído'
    when 'rejected' then 'Sugestão não aprovada'
    else null
  end;
  if notification_title is null then return new; end if;

  notification_message := case new.status
    when 'approved' then '“' || new.title || '” foi aprovada por ' || channel_name || '.'
    when 'queued' then '“' || new.title || '” agora está na fila de ' || channel_name || '.'
    when 'watching' then channel_name || ' começou a assistir “' || new.title || '”.'
    when 'completed' then channel_name || ' concluiu “' || new.title || '”. Obrigado por participar!'
    when 'rejected' then '“' || new.title || '” não foi aprovada desta vez.'
  end;

  insert into public.streamer_notifications (
    streamer_id, suggestion_id, user_id, type, title, message, target_path
  ) values (
    new.streamer_id, new.id, new.submitted_by, 'suggestion_' || new.status,
    notification_title, notification_message, '/' || channel_slug
  );
  return new;
end;
$$;

drop trigger if exists tr_viewer_status_notification on public.suggestions;
create trigger tr_viewer_status_notification
  after update of status on public.suggestions
  for each row
  when (old.status is distinct from new.status)
  execute function public.create_viewer_status_notification();
