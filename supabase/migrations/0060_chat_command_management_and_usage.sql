alter table public.chat_custom_commands
  add column if not exists usage_count bigint not null default 0,
  add column if not exists global_cooldown_seconds integer not null default 0 check (global_cooldown_seconds between 0 and 86400),
  add column if not exists user_cooldown_seconds integer not null default 0 check (user_cooldown_seconds between 0 and 86400),
  add column if not exists last_used_at timestamptz;

create table if not exists public.chat_custom_command_user_cooldowns (
  command_id uuid not null references public.chat_custom_commands(id) on delete cascade,
  twitch_user_id text not null,
  allowed_at timestamptz not null,
  primary key (command_id, twitch_user_id)
);

alter table public.chat_custom_command_user_cooldowns enable row level security;
revoke all on public.chat_custom_command_user_cooldowns from anon, authenticated;

create or replace function public.is_twitch_chat_manager(p_streamer_id uuid, p_twitch_user_id text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
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

create or replace function public.manage_chat_command_from_twitch(
  p_streamer_id uuid,
  p_twitch_user_id text,
  p_action text,
  p_command text,
  p_response text default null
)
returns table(success boolean, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_command text := lower(trim(p_command));
  configured_suggestion_command text;
begin
  if not public.is_twitch_chat_manager(p_streamer_id, p_twitch_user_id) then
    return query select false, 'Você não tem permissão para gerenciar comandos deste canal.';
    return;
  end if;

  if normalized_command !~ '^![a-z0-9][a-z0-9_-]{1,30}$' then
    return query select false, 'Use um comando válido, como !discord.';
    return;
  end if;

  select lower(chat_command) into configured_suggestion_command
  from public.streamer_settings where streamer_id = p_streamer_id;

  if normalized_command in ('!command', '!cmd', '!fila', '!proximo') or normalized_command = configured_suggestion_command then
    return query select false, 'Esse comando é reservado pela plataforma.';
    return;
  end if;

  case lower(trim(p_action))
    when 'add' then
      if coalesce(char_length(trim(p_response)), 0) not between 1 and 500 then
        return query select false, 'A resposta precisa ter entre 1 e 500 caracteres.';
      elsif exists (select 1 from public.chat_custom_commands where streamer_id = p_streamer_id and command = normalized_command) then
        return query select false, 'Esse comando já existe.';
      else
        insert into public.chat_custom_commands(streamer_id, command, response)
        values (p_streamer_id, normalized_command, trim(p_response));
        return query select true, 'Comando ' || normalized_command || ' adicionado.';
      end if;
    when 'edit', 'update' then
      if coalesce(char_length(trim(p_response)), 0) not between 1 and 500 then
        return query select false, 'A resposta precisa ter entre 1 e 500 caracteres.';
      end if;
      update public.chat_custom_commands set response = trim(p_response)
      where streamer_id = p_streamer_id and command = normalized_command;
      if found then return query select true, 'Comando ' || normalized_command || ' atualizado.';
      else return query select false, 'Não encontrei esse comando.'; end if;
    when 'remove', 'delete', 'del', 'rem' then
      delete from public.chat_custom_commands where streamer_id = p_streamer_id and command = normalized_command;
      if found then return query select true, 'Comando ' || normalized_command || ' removido.';
      else return query select false, 'Não encontrei esse comando.'; end if;
    when 'show', 'debug' then
      return query select true, 'Comando ' || normalized_command || ': ' || response
      from public.chat_custom_commands where streamer_id = p_streamer_id and command = normalized_command;
      if not found then return query select false, 'Não encontrei esse comando.'; end if;
    else
      return query select false, 'Use add, edit, remove ou show.';
  end case;
end;
$$;

create or replace function public.claim_chat_custom_command(
  p_streamer_id uuid,
  p_command text,
  p_twitch_user_id text
)
returns table(response text, usage_count bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  command_row public.chat_custom_commands%rowtype;
begin
  select * into command_row
  from public.chat_custom_commands
  where streamer_id = p_streamer_id and command = lower(p_command) and enabled = true
  for update;

  if not found then return; end if;
  if command_row.last_used_at is not null and command_row.last_used_at > now() - make_interval(secs => command_row.global_cooldown_seconds) then return; end if;
  if exists (
    select 1 from public.chat_custom_command_user_cooldowns
    where command_id = command_row.id and twitch_user_id = p_twitch_user_id and allowed_at > now()
  ) then return; end if;

  update public.chat_custom_commands
  set usage_count = chat_custom_commands.usage_count + 1, last_used_at = now()
  where id = command_row.id
  returning chat_custom_commands.usage_count into usage_count;

  insert into public.chat_custom_command_user_cooldowns(command_id, twitch_user_id, allowed_at)
  values (command_row.id, p_twitch_user_id, now() + make_interval(secs => command_row.user_cooldown_seconds))
  on conflict(command_id, twitch_user_id) do update set allowed_at = excluded.allowed_at;

  response := command_row.response;
  return next;
end;
$$;

revoke all on function public.is_twitch_chat_manager(uuid, text) from public, anon, authenticated;
revoke all on function public.manage_chat_command_from_twitch(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.claim_chat_custom_command(uuid, text, text) from public, anon, authenticated;
grant execute on function public.is_twitch_chat_manager(uuid, text) to service_role;
grant execute on function public.manage_chat_command_from_twitch(uuid, text, text, text, text) to service_role;
grant execute on function public.claim_chat_custom_command(uuid, text, text) to service_role;
