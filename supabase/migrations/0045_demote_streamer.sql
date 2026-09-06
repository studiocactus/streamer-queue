-- ============================================================
-- Desativar o próprio canal (Rebaixar de Streamer para Viewer)
-- ============================================================
create or replace function public.demote_own_streamer_account()
returns void as $$
declare
  v_streamer_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Não autorizado';
  end if;

  select id into v_streamer_id from public.streamers where owner_id = auth.uid() limit 1;

  if v_streamer_id is null then
    raise exception 'Canal de streamer não encontrado para este usuário';
  end if;

  -- Desativa o canal
  update public.streamers 
  set is_active = false, is_public = false 
  where owner_id = auth.uid();

  -- Opcional: Remover permissões de moderador de outros usuários neste canal
  delete from public.streamer_members 
  where streamer_id = v_streamer_id;
  
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function public.demote_own_streamer_account() from public, anon;
grant execute on function public.demote_own_streamer_account() to authenticated;
