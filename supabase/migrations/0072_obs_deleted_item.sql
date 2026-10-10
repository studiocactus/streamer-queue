-- Stop the receiver when a currently selected item is deleted (FK clears suggestion_id).
create or replace function public.obs_receiver(p_token text,p_client uuid,p_revision integer default -1,p_event text default 'tick',p_position integer default 0,p_duration integer default 0)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p public.obs_playback%rowtype; item public.suggestions%rowtype;
begin
 if p_client is null or p_event is null or p_event not in ('tick','playing','paused','ended','error','blocked') then raise exception 'Evento inválido'; end if;
 select * into p from public.obs_playback where token=p_token for update;
 if not found then raise exception 'Link do player inválido ou revogado' using errcode='42501'; end if;
 if p.client_id is distinct from p_client and p.lease_until>now() then raise exception 'Outra fonte OBS já está conectada'; end if;
 if p.client_id is distinct from p_client or p.lease_until<=now() then
  -- Reconnection never resumes sound or a countdown without a new staff command.
  update public.obs_playback set client_id=p_client,automatic=false,next_at=null,
   desired=case when video_id is null or state in ('ended','countdown','idle') then 'idle' else 'paused' end,
   state=case when video_id is null or state in ('ended','countdown','idle') then 'idle' else 'paused' end,revision=revision+1 where streamer_id=p.streamer_id returning * into p;
 end if;
 update public.obs_playback set lease_until=now()+interval '10 seconds',last_seen=now() where streamer_id=p.streamer_id;
 if p.video_id is not null and p.state not in ('ended','countdown','idle') then
  select * into item from public.suggestions where id=p.suggestion_id and streamer_id=p.streamer_id for update;
  if not found or item.status not in ('queued','watching') or (p.started and item.status<>'watching') or item.source_url is distinct from p.source_url then
   update public.obs_playback set desired='idle',state='idle',automatic=false,next_at=null,suggestion_id=null,video_id=null,title=null,revision=revision+1,error='A fila foi alterada. Selecione novamente o próximo vídeo.' where streamer_id=p.streamer_id;
   return public.obs_snapshot(p.streamer_id);
  end if;
 end if;
 if p_revision=p.revision then
  if p_event='playing' and (p.desired='playing' and p.state in ('loading','playing') or p.state='blocked') then
   update public.suggestions set status='watching',started_at=coalesce(started_at,now()) where id=p.suggestion_id and streamer_id=p.streamer_id and status='queued';
   update public.obs_playback set state='playing',desired='playing',started=true,error=null where streamer_id=p.streamer_id;
  elsif p_event='paused' and p.state='playing' then
   update public.obs_playback set desired='paused',state='paused',revision=revision+1 where streamer_id=p.streamer_id;
  elsif p_event='ended' and p.state='playing' and p.desired='playing' and p_duration>0 and p_position>=p_duration-2 then
   update public.suggestions set status='completed',completed_at=now() where id=p.suggestion_id and streamer_id=p.streamer_id and status='watching';
   update public.obs_playback set desired='idle',state=case when automatic then 'countdown' else 'ended' end,next_at=case when automatic then now()+make_interval(secs=>gap_seconds) else null end,revision=revision+1 where streamer_id=p.streamer_id;
  elsif p_event in ('error','blocked') and p.state in ('loading','playing','paused') then
   update public.obs_playback set desired='paused',state=p_event,automatic=false,next_at=null,
    error=case when p_event='blocked' then 'Reprodução automática bloqueada. Use Interagir na fonte do OBS e inicie o vídeo.' else 'O YouTube não conseguiu reproduzir este vídeo. Verifique o conteúdo ou abra no YouTube.' end,revision=revision+1 where streamer_id=p.streamer_id;
  end if;
  if p.state in ('loading','playing','paused') then
   update public.obs_playback set position_seconds=greatest(0,least(coalesce(p_position,0),604800)),duration_seconds=greatest(0,least(coalesce(p_duration,0),604800)) where streamer_id=p.streamer_id;
  end if;
 end if;
 -- Auto-advance is driven only by the currently leased receiver, after the server deadline.
 if p.state='countdown' and p.automatic and p.next_at<=now() then perform public.obs_pick_next(p.streamer_id); end if;
 return public.obs_snapshot(p.streamer_id);
end; $$;
