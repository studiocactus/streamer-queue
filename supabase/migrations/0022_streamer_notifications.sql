-- Persistent notification inbox for streamer owners.
create table if not exists public.streamer_notifications (
  id uuid primary key default gen_random_uuid(),
  streamer_id uuid not null references public.streamers(id) on delete cascade,
  suggestion_id uuid references public.suggestions(id) on delete cascade,
  type text not null default 'new_suggestion',
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_streamer_notifications_inbox
  on public.streamer_notifications(streamer_id, created_at desc);

alter table public.streamer_notifications enable row level security;

create policy "notifications_select_member" on public.streamer_notifications
  for select using (
    auth.uid() is not null and public.is_streamer_member(streamer_id, auth.uid())
  );

create policy "notifications_update_owner" on public.streamer_notifications
  for update using (
    auth.uid() is not null and public.is_streamer_owner(streamer_id, auth.uid())
  );

create policy "notifications_delete_owner" on public.streamer_notifications
  for delete using (
    auth.uid() is not null and public.is_streamer_owner(streamer_id, auth.uid())
  );

create or replace function public.create_streamer_suggestion_notification()
returns trigger as $$
declare
  v_viewer_name text;
begin
  if new.status <> 'pending' then return new; end if;

  if new.submitted_by is not null then
    select display_name into v_viewer_name from public.profiles where id = new.submitted_by;
  else
    v_viewer_name := coalesce(new.chat_display_name, new.chat_user_login, 'Viewer da Twitch');
  end if;

  insert into public.streamer_notifications (streamer_id, suggestion_id, title, message)
  values (
    new.streamer_id,
    new.id,
    'Nova sugestão recebida',
    coalesce(v_viewer_name, 'Viewer') || ' enviou “' || new.title || '”.'
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists tr_suggestion_notification on public.suggestions;
create trigger tr_suggestion_notification
  after insert on public.suggestions
  for each row execute function public.create_streamer_suggestion_notification();

-- Seed the inbox with currently pending suggestions, without duplicating rows.
insert into public.streamer_notifications (streamer_id, suggestion_id, title, message, created_at)
select
  sg.streamer_id,
  sg.id,
  'Nova sugestão recebida',
  coalesce(p.display_name, sg.chat_display_name, sg.chat_user_login, 'Viewer') || ' enviou “' || sg.title || '”.',
  sg.submitted_at
from public.suggestions sg
left join public.profiles p on p.id = sg.submitted_by
where sg.status = 'pending'
  and not exists (
    select 1 from public.streamer_notifications n where n.suggestion_id = sg.id
  );

alter publication supabase_realtime add table public.streamer_notifications;

