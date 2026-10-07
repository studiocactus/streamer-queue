alter table public.chat_message_templates drop constraint if exists chat_message_templates_event_type_check;
alter table public.chat_message_templates add constraint chat_message_templates_event_type_check check(event_type in ('suggestion_received','suggestion_approved','queued','watching_now','completed','rejected','streamer_added','chat_suggestion_received','suggestions_paused','suggestion_usage','suggestion_too_long','suggestion_duplicate','queue_list','queue_empty','queue_next','queue_next_empty','queue_idle','queue_item','poll_opening','command_usage','command_forbidden','command_invalid','command_reserved','command_response_invalid','command_exists','command_added','command_updated','command_removed','command_missing','command_show','command_action_invalid'));
create or replace function public.manage_chat_command_from_twitch_v2(
  p_streamer_id uuid,
  p_twitch_user_id text,
  p_action text,
  p_command text,
  p_response text default null
)
returns table(success boolean, message text, event_type text, command_response text)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_command text := lower(trim(p_command));
  configured_suggestion_command text;
begin
  if not public.is_twitch_chat_manager(p_streamer_id, p_twitch_user_id) then
    return query select false, 'Você não tem permissão para gerenciar comandos deste canal.', 'command_forbidden'::text, ''::text;
    return;
  end if;

  if normalized_command !~ '^![a-z0-9][a-z0-9_-]{1,30}$' then
    return query select false, 'Use um comando válido, como !discord.', 'command_invalid'::text, ''::text;
    return;
  end if;

  select lower(chat_command) into configured_suggestion_command
  from public.streamer_settings where streamer_id = p_streamer_id;

  if normalized_command in ('!command', '!cmd', '!fila', '!proximo', '!filme') or normalized_command = configured_suggestion_command then
    return query select false, 'Esse comando é reservado pela plataforma.', 'command_reserved'::text, ''::text;
    return;
  end if;

  case lower(trim(p_action))
    when 'add' then
      if coalesce(char_length(trim(p_response)), 0) not between 1 and 500 then
        return query select false, 'A resposta precisa ter entre 1 e 500 caracteres.', 'command_response_invalid'::text, ''::text;
      elsif exists (select 1 from public.chat_custom_commands where streamer_id = p_streamer_id and command = normalized_command) then
        return query select false, 'Esse comando já existe.', 'command_exists'::text, ''::text;
      else
        insert into public.chat_custom_commands(streamer_id, command, response)
        values (p_streamer_id, normalized_command, trim(p_response));
        return query select true, 'Comando ' || normalized_command || ' adicionado.', 'command_added'::text, ''::text;
      end if;
    when 'edit', 'update' then
      if coalesce(char_length(trim(p_response)), 0) not between 1 and 500 then
        return query select false, 'A resposta precisa ter entre 1 e 500 caracteres.', 'command_response_invalid'::text, ''::text;
      end if;
      update public.chat_custom_commands set response = trim(p_response)
      where streamer_id = p_streamer_id and command = normalized_command;
      if found then return query select true, 'Comando ' || normalized_command || ' atualizado.', 'command_updated'::text, ''::text;
      else return query select false, 'Não encontrei esse comando.', 'command_missing'::text, ''::text; end if;
    when 'remove', 'delete', 'del', 'rem' then
      delete from public.chat_custom_commands where streamer_id = p_streamer_id and command = normalized_command;
      if found then return query select true, 'Comando ' || normalized_command || ' removido.', 'command_removed'::text, ''::text;
      else return query select false, 'Não encontrei esse comando.', 'command_missing'::text, ''::text; end if;
    when 'show', 'debug' then
      return query select true, 'Comando ' || normalized_command || ': ' || response, 'command_show'::text, response
      from public.chat_custom_commands where streamer_id = p_streamer_id and command = normalized_command;
      if not found then return query select false, 'Não encontrei esse comando.', 'command_missing'::text, ''::text; end if;
    else
      return query select false, 'Use add, edit, remove ou show.', 'command_action_invalid'::text, ''::text;
  end case;
end;
$$;


revoke all on function public.manage_chat_command_from_twitch_v2(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.manage_chat_command_from_twitch_v2(uuid,text,text,text,text) to service_role;
