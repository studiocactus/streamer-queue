-- Evita a colisão entre a variável PL/pgSQL e a coluna owner_id.
-- O gatilho também é executado ao criar uma votação pelo próprio streamer.
create or replace function public.notify_streamer_of_moderator_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  channel_id uuid;
  channel_owner_id uuid;
  moderator_name text;
begin
  if tg_table_name = 'streamers' then
    channel_id := coalesce(new.id, old.id);
  else
    channel_id := coalesce(new.streamer_id, old.streamer_id);
  end if;

  select s.owner_id into channel_owner_id
  from public.streamers s
  where s.id = channel_id;

  if channel_owner_id is null
    or channel_owner_id = auth.uid()
    or not public.has_streamer_permission(channel_id, auth.uid(), 'manage_settings') then
    return new;
  end if;

  select p.display_name into moderator_name
  from public.profiles p
  where p.id = auth.uid();

  insert into public.streamer_notifications(streamer_id, user_id, type, title, message, target_path)
  values (
    channel_id,
    channel_owner_id,
    'moderator_change',
    'Alteração do moderador',
    coalesce(moderator_name, 'Seu moderador') || ' alterou ' || tg_argv[0] || ' no painel do canal.',
    '/dashboard/streamer'
  );
  return new;
end;
$$;
