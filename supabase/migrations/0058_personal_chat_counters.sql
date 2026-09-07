alter table public.chat_command_counters add column if not exists response_template text not null default '@{target}, essa é a {count}ª vez registrada.';
create table public.chat_command_counter_values (
  counter_id uuid not null references public.chat_command_counters(id) on delete cascade,
  target_login text not null, target_display_name text not null, count bigint not null default 0,
  updated_at timestamptz not null default now(), primary key(counter_id, target_login)
);
alter table public.chat_command_counter_values enable row level security;
create policy "counter values visible to channel staff" on public.chat_command_counter_values for select to authenticated using (exists (select 1 from public.chat_command_counters c where c.id=counter_id and public.has_streamer_permission(c.streamer_id, auth.uid(), 'manage_settings')));
create or replace function public.increment_personal_chat_counter(p_streamer_id uuid, p_command text, p_target text)
returns table(response_template text, target_display_name text, count bigint) language plpgsql security definer set search_path=public as $$
declare counter_row public.chat_command_counters%rowtype; normalized text := lower(trim(p_target));
begin
  select * into counter_row from public.chat_command_counters where streamer_id=p_streamer_id and command=lower(p_command);
  if not found or normalized='' then return; end if;
  insert into public.chat_command_counter_values(counter_id,target_login,target_display_name,count) values(counter_row.id,normalized,trim(p_target),1)
  on conflict(counter_id,target_login) do update set count=chat_command_counter_values.count+1, target_display_name=excluded.target_display_name, updated_at=now()
  returning chat_command_counter_values.count into count;
  update public.chat_command_counters set count=chat_command_counters.count+1 where id=counter_row.id;
  response_template:=counter_row.response_template; target_display_name:=trim(p_target); return next;
end; $$;
revoke all on function public.increment_personal_chat_counter(uuid,text,text) from public, anon, authenticated; grant execute on function public.increment_personal_chat_counter(uuid,text,text) to service_role;
