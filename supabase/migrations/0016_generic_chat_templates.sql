-- Replace only untouched legacy defaults; preserve every customized message.
update public.chat_message_templates set template = '🎬 {viewer} adicionou “{titulo}” à comunidade! Veja a categoria e participe também pelo WatchQueue.'
where event_type = 'suggestion_received' and template = '🎬 {viewer} adicionou "{titulo}" à lista do canal!';

update public.chat_message_templates set template = '✅ “{titulo}”, ideia de {viewer}, foi aprovada! Vote e participe também pelo WatchQueue.'
where event_type = 'suggestion_approved' and template = '✅ A sugestão "{titulo}" de {viewer} foi aprovada!';

update public.chat_message_templates set template = '▶️ Agora é a vez de “{titulo}”, ideia enviada por {viewer}!'
where event_type = 'watching_now' and template = '🍿 O streamer começou a assistir "{titulo}", sugestão de {viewer}!';

update public.chat_message_templates set template = '🎉 Concluímos “{titulo}”, ideia de {viewer}! Envie a próxima pelo WatchQueue.'
where event_type = 'completed' and template = '🎉 Terminamos de assistir "{titulo}"! Obrigado, {viewer}!';

create or replace function public.handle_new_streamer()
returns trigger as $$
begin
  insert into public.streamer_settings (streamer_id) values (new.id)
  on conflict (streamer_id) do nothing;

  insert into public.chat_message_templates (streamer_id, event_type, template) values
    (new.id, 'suggestion_received', '🎬 {viewer} adicionou “{titulo}” à comunidade! Veja a categoria e participe também pelo WatchQueue.'),
    (new.id, 'suggestion_approved', '✅ “{titulo}”, ideia de {viewer}, foi aprovada! Vote e participe também pelo WatchQueue.'),
    (new.id, 'watching_now', '▶️ Agora é a vez de “{titulo}”, ideia enviada por {viewer}!'),
    (new.id, 'completed', '🎉 Concluímos “{titulo}”, ideia de {viewer}! Envie a próxima pelo WatchQueue.'),
    (new.id, 'streamer_added', '📌 {viewer} adicionou “{titulo}” em {categoria}. Vote na sua ideia favorita pelo WatchQueue!')
  on conflict (streamer_id, event_type) do nothing;

  insert into public.streamer_members (streamer_id, user_id, role, permissions)
  values (new.id, new.owner_id, 'owner', array['approve', 'reject', 'manage_queue', 'manage_members', 'manage_settings'])
  on conflict (streamer_id, user_id) do nothing;

  return new;
end;
$$ language plpgsql security definer;
