-- Mantém o histórico de votações sem deixá-las bloquear a próxima programação.
alter table public.film_polls
  drop constraint if exists film_polls_status_check;
alter table public.film_polls
  add constraint film_polls_status_check
  check (status in ('scheduled', 'active', 'ended', 'archived'));
