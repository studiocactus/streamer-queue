-- A tabela de votos usa uma chave composta e não possui a coluna id.
-- Isso fazia a função falhar depois de receber um comando válido da Twitch.
create or replace function public.cast_film_poll_vote(p_streamer_id uuid, p_twitch_user_id text, p_command text)
returns table(title text, command text, votes bigint, viewer_template text, accepted boolean)
language plpgsql security definer set search_path = public as $$
declare
  selected_poll uuid;
  selected_option uuid;
  was_inserted boolean;
begin
  select p.id, o.id into selected_poll, selected_option
  from public.film_polls p
  join public.film_poll_options o on o.poll_id = p.id
  where p.streamer_id = p_streamer_id
    and now() >= p.starts_at
    and now() < p.ends_at
    and lower(o.command) = lower(p_command)
  order by p.created_at desc
  limit 1;
  if selected_poll is null then return; end if;
  update public.film_polls set status = 'active' where id = selected_poll and status = 'scheduled';
  insert into public.film_poll_votes(poll_id, option_id, twitch_user_id)
  values (selected_poll, selected_option, p_twitch_user_id) on conflict do nothing;
  was_inserted := found;
  return query
  select o.title, o.command, count(v.twitch_user_id), p.vote_message_template, was_inserted
  from public.film_polls p
  join public.film_poll_options o on o.id = selected_option
  left join public.film_poll_votes v on v.option_id = o.id
  where p.id = selected_poll
  group by o.title, o.command, p.vote_message_template;
end;
$$;
