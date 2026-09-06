-- ============================================================
-- Excluir canal (Rebaixar de Streamer para Viewer via Admin)
-- ============================================================
create or replace function public.admin_demote_streamer_account(target_streamer_id uuid)
returns void as $$
begin
  -- Verifica se quem chamou é um administrador da plataforma
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'Não autorizado';
  end if;

  -- Deleta o canal. Como as chaves estrangeiras usam ON DELETE CASCADE,
  -- isso apagará suggestions, votes, streamer_members, streamer_settings, etc.
  delete from public.streamers where id = target_streamer_id;
  
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function public.admin_demote_streamer_account(uuid) from public, anon;
grant execute on function public.admin_demote_streamer_account(uuid) to authenticated;
