alter table public.chat_command_counters add column if not exists cooldown_seconds integer not null default 60 check (cooldown_seconds between 0 and 86400);
create or replace function public.increment_personal_chat_counter(p_streamer_id uuid, p_command text, p_target text)
returns table(response_template text, target_display_name text, count bigint) language plpgsql security definer set search_path=public as $$
declare counter_row public.chat_command_counters%rowtype; normalized text := lower(trim(p_target)); current_value public.chat_command_counter_values%rowtype;
begin
  select * into counter_row from public.chat_command_counters where streamer_id=p_streamer_id and command=lower(p_command);
  if not found or normalized='' then return; end if;
  select * into current_value from public.chat_command_counter_values where counter_id=counter_row.id and target_login=normalized;
  if found and current_value.updated_at > now() - make_interval(secs => counter_row.cooldown_seconds) then return; end if;
  insert into public.chat_command_counter_values(counter_id,target_login,target_display_name,count) values(counter_row.id,normalized,trim(p_target),1)
  on conflict(counter_id,target_login) do update set count=chat_command_counter_values.count+1, target_display_name=excluded.target_display_name, updated_at=now()
  returning chat_command_counter_values.count into count;
  update public.chat_command_counters set count=chat_command_counters.count+1 where id=counter_row.id;
  response_template:=counter_row.response_template; target_display_name:=trim(p_target); return next;
end; $$;
