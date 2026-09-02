-- Chat templates now cover every queue transition visible to the streamer.
alter table public.chat_message_templates drop constraint if exists chat_message_templates_event_type_check;
alter table public.chat_message_templates add constraint chat_message_templates_event_type_check
  check (event_type in (
    'suggestion_received', 'suggestion_approved', 'queued',
    'watching_now', 'completed', 'rejected', 'streamer_added'
  ));

insert into public.chat_message_templates (streamer_id, event_type, template, enabled)
select id, 'queued', '📋 “{titulo}”, ideia de {viewer}, entrou na fila do canal!', true
from public.streamers on conflict (streamer_id, event_type) do nothing;

create or replace function public.handle_new_streamer_queue_templates()
returns trigger as $$
begin
  insert into public.chat_message_templates (streamer_id, event_type, template, enabled) values
    (new.id, 'queued', '📋 “{titulo}”, ideia de {viewer}, entrou na fila do canal!', true),
    (new.id, 'rejected', 'ℹ️ A ideia “{titulo}”, enviada por {viewer}, não foi aprovada desta vez.', true)
  on conflict (streamer_id, event_type) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists tr_new_streamer_queue_templates on public.streamers;
create trigger tr_new_streamer_queue_templates
  after insert on public.streamers
  for each row execute function public.handle_new_streamer_queue_templates();

insert into public.chat_message_templates (streamer_id, event_type, template, enabled)
select id, 'rejected', 'ℹ️ A ideia “{titulo}”, enviada por {viewer}, não foi aprovada desta vez.', true
from public.streamers on conflict (streamer_id, event_type) do nothing;
