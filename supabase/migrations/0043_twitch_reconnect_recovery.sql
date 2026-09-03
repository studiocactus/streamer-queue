-- Centralize expired/revoked Twitch state and keep the inbox warning idempotent.
create or replace function public.mark_twitch_reconnect_required(
  p_streamer_id uuid,
  p_status text default 'expired'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('expired', 'revoked') then
    raise exception 'Invalid Twitch connection status';
  end if;

  update public.twitch_connections
  set token_status = p_status,
      updated_at = now()
  where streamer_id = p_streamer_id;

  if not exists (
    select 1
    from public.streamer_notifications
    where streamer_id = p_streamer_id
      and type = 'twitch_reconnect_required'
      and read_at is null
  ) then
    insert into public.streamer_notifications (
      streamer_id,
      type,
      title,
      message,
      target_path
    ) values (
      p_streamer_id,
      'twitch_reconnect_required',
      'Reconecte a Twitch',
      'A autorização do canal expirou. Reconecte para retomar os avisos e comandos automaticamente.',
      '/dashboard/streamer'
    );
  end if;
end;
$$;

revoke all on function public.mark_twitch_reconnect_required(uuid, text) from public;
grant execute on function public.mark_twitch_reconnect_required(uuid, text) to service_role;
