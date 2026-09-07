create table public.chat_command_counters (
  id uuid primary key default gen_random_uuid(), streamer_id uuid not null references public.streamers(id) on delete cascade,
  command text not null check (command ~ '^![a-z0-9][a-z0-9_-]{1,30}$'), label text not null check (char_length(label) between 1 and 80), count bigint not null default 0, created_at timestamptz not null default now(), unique(streamer_id, command)
);
alter table public.chat_command_counters enable row level security;
create policy "chat counters managed by channel staff" on public.chat_command_counters for all to authenticated using (public.has_streamer_permission(streamer_id, auth.uid(), 'manage_settings')) with check (public.has_streamer_permission(streamer_id, auth.uid(), 'manage_settings'));
create or replace function public.increment_chat_command_counter(p_streamer_id uuid, p_command text) returns boolean language plpgsql security definer set search_path=public as $$ declare found_counter boolean; begin update public.chat_command_counters set count=count+1 where streamer_id=p_streamer_id and command=lower(p_command); get diagnostics found_counter=row_count; return found_counter; end; $$;
revoke all on function public.increment_chat_command_counter(uuid,text) from public, anon, authenticated; grant execute on function public.increment_chat_command_counter(uuid,text) to service_role;
