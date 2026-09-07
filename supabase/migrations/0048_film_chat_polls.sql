-- A Twitch-first film poll. The server owns votes and the final result.
create table public.film_polls (
  id uuid primary key default gen_random_uuid(),
  streamer_id uuid not null references public.streamers(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'active', 'ended')),
  vote_message_template text not null default '🎬 {viewer} votou em “{titulo}”! Agora são {votos} votos. Vote com {comando}.',
  result_message_template text not null default '🏁 A votação terminou! O filme escolhido foi “{titulo}” com {votos} votos.',
  result_announced_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create unique index film_polls_one_open_per_streamer on public.film_polls(streamer_id) where status in ('scheduled', 'active');

create table public.film_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.film_polls(id) on delete cascade,
  position smallint not null check (position between 1 and 3),
  title text not null check (char_length(trim(title)) between 1 and 200),
  command text not null check (command ~ '^![a-z0-9][a-z0-9_-]{1,30}$'),
  unique (poll_id, position), unique (poll_id, command)
);
create table public.film_poll_votes (
  poll_id uuid not null references public.film_polls(id) on delete cascade,
  option_id uuid not null references public.film_poll_options(id) on delete cascade,
  twitch_user_id text not null,
  created_at timestamptz not null default now(),
  primary key (poll_id, twitch_user_id)
);
create index film_poll_votes_option on public.film_poll_votes(option_id);

alter table public.film_polls enable row level security;
alter table public.film_poll_options enable row level security;
alter table public.film_poll_votes enable row level security;
create policy "film polls managed by channel members" on public.film_polls for all to authenticated using (public.is_streamer_member(streamer_id, auth.uid())) with check (public.is_streamer_member(streamer_id, auth.uid()));
create policy "film poll options managed by channel members" on public.film_poll_options for all to authenticated using (exists (select 1 from public.film_polls p where p.id = poll_id and public.is_streamer_member(p.streamer_id, auth.uid()))) with check (exists (select 1 from public.film_polls p where p.id = poll_id and public.is_streamer_member(p.streamer_id, auth.uid())));

create or replace function public.cast_film_poll_vote(p_streamer_id uuid, p_twitch_user_id text, p_command text)
returns table(title text, command text, votes bigint, viewer_template text, accepted boolean)
language plpgsql security definer set search_path = public as $$
declare selected_poll uuid; selected_option uuid; was_inserted boolean;
begin
  select p.id, o.id into selected_poll, selected_option
  from public.film_polls p join public.film_poll_options o on o.poll_id = p.id
  where p.streamer_id = p_streamer_id and now() >= p.starts_at and now() < p.ends_at and lower(o.command) = lower(p_command)
  order by p.created_at desc limit 1;
  if selected_poll is null then return; end if;
  update public.film_polls set status = 'active' where id = selected_poll and status = 'scheduled';
  insert into public.film_poll_votes(poll_id, option_id, twitch_user_id) values(selected_poll, selected_option, p_twitch_user_id) on conflict do nothing;
  was_inserted := found;
  return query select o.title, o.command, count(v.id), p.vote_message_template, was_inserted
  from public.film_polls p join public.film_poll_options o on o.id=selected_option left join public.film_poll_votes v on v.option_id=o.id where p.id=selected_poll group by o.title,o.command,p.vote_message_template;
end; $$;
revoke all on function public.cast_film_poll_vote(uuid,text,text) from public, anon, authenticated;
grant execute on function public.cast_film_poll_vote(uuid,text,text) to service_role;
