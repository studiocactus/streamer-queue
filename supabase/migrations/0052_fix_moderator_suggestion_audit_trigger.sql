-- O gatilho roda em toda mudança de status, inclusive quando o próprio streamer
-- inicia um filme. Qualificar a coluna evita a colisão com a variável local.
create or replace function public.notify_streamer_of_moderator_suggestion_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  channel_owner_id uuid;
  moderator_name text;
begin
  if auth.uid() is null or old.status is not distinct from new.status then
    return new;
  end if;

  select s.owner_id into channel_owner_id
  from public.streamers s
  where s.id = new.streamer_id;

  if channel_owner_id is null
    or channel_owner_id = auth.uid()
    or not public.has_streamer_permission(new.streamer_id, auth.uid(), 'approve') then
    return new;
  end if;

  select p.display_name into moderator_name
  from public.profiles p
  where p.id = auth.uid();

  insert into public.streamer_notifications(streamer_id, user_id, suggestion_id, type, title, message, target_path)
  values (
    new.streamer_id,
    channel_owner_id,
    new.id,
    'moderator_change',
    'Alteração do moderador',
    coalesce(moderator_name, 'Seu moderador') || ' mudou “' || new.title || '” para ' || new.status || '.',
    '/dashboard/streamer'
  );
  return new;
end;
$$;
