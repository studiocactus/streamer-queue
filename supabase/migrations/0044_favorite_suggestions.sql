-- Adiciona campo de favorito nas sugestões
alter table public.suggestions 
  add column if not exists is_favorite boolean not null default false;
