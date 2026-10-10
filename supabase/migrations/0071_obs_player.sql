-- Optional OBS playback. No public table access: the receiver has a revocable capability,
-- scoped to one channel and one leased browser instance. Commands require channel staff.
create table public.obs_playback (
 streamer_id uuid primary key references public.streamers(id) on delete cascade,
 token text not null unique default (replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','')),
 client_id uuid, lease_until timestamptz,
 revision integer not null default 0, generation integer not null default 0,
 suggestion_id uuid references public.suggestions(id) on delete set null,
 video_id text, source_url text, title text, started boolean not null default false,
 desired text not null default 'idle', state text not null default 'idle',
 automatic boolean not null default false, gap_seconds integer not null default 3 check(gap_seconds between 1 and 30),
 volume integer not null default 70 check(volume between 0 and 100),
 position_seconds integer not null default 0, duration_seconds integer not null default 0,
 next_at timestamptz, error text, last_seen timestamptz
);
alter table public.obs_playback enable row level security;
revoke all on public.obs_playback from public,anon,authenticated;
grant all on public.obs_playback to service_role;

create function public.obs_video_id(p_url text) returns text language sql immutable set search_path=public as $$
 select coalesce(
 (regexp_match(p_url,'^https?://(?:www\.|m\.)?youtube\.com/watch\?(?:[^#]*&)?v=([A-Za-z0-9_-]{11})(?:[&#]|$)'))[1],
 (regexp_match(p_url,'^https?://youtu\.be/([A-Za-z0-9_-]{11})(?:[?#]|$)'))[1],
 (regexp_match(p_url,'^https?://(?:www\.|m\.)?youtube\.com/(?:shorts|embed|live)/([A-Za-z0-9_-]{11})(?:[?#]|$)'))[1]);
$$;
create function public.obs_snapshot(p_id uuid) returns jsonb language sql security definer set search_path=public as $$
 select (to_jsonb(p)-'token'-'client_id'-'lease_until') || jsonb_build_object('connected',coalesce(lease_until>now(),false), 'countdown',case when next_at is null then 0 else greatest(0,ceil(extract(epoch from next_at-now()))) end) from public.obs_playback p where streamer_id=p_id;
$$;
-- Caller must hold the playback row lock. Never mark watching until PLAYING arrives.
create function public.obs_pick_next(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare item public.suggestions%rowtype; vid text;
begin
 select * into item from public.suggestions where streamer_id=p_id and status in ('watching','queued')
 order by (status='watching') desc,queue_position nulls last,submitted_at,id limit 1 for update;
 if not found then
  update public.obs_playback set suggestion_id=null,video_id=null,title=null,source_url=null,desired='idle',state='idle',automatic=false,next_at=null,error=null,revision=revision+1 where streamer_id=p_id; return;
 end if;
 vid:=public.obs_video_id(item.source_url);
 update public.obs_playback set suggestion_id=item.id,video_id=vid,source_url=item.source_url,title=item.title,
  desired=case when vid is null then 'paused' else 'playing' end,state=case when vid is null then 'error' else 'loading' end,
  error=case when vid is null then 'O próximo conteúdo não é um link de vídeo do YouTube compatível. Organize a fila antes de continuar.' else null end,
  automatic=case when vid is null then false else automatic end,generation=generation+1,started=false,position_seconds=0,duration_seconds=0,next_at=null,revision=revision+1 where streamer_id=p_id;
end; $$;

create function public.obs_manage(p_streamer_id uuid,p_action text default 'get',p_value integer default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p public.obs_playback%rowtype;
begin
 if not coalesce(public.can_manage_streamer(p_streamer_id),false) then raise exception 'Acesso negado' using errcode='42501'; end if;
 if p_action='get' then return public.obs_snapshot(p_streamer_id); end if;
 if p_action not in ('enable','link','rotate','start','pause','resume','automatic','gap','volume','stop') then raise exception 'Comando inválido'; end if;
 if p_action='enable' then insert into public.obs_playback(streamer_id) values(p_streamer_id) on conflict do nothing; end if;
 select * into p from public.obs_playback where streamer_id=p_streamer_id for update;
 if not found then raise exception 'Ative o player primeiro'; end if;
 if p_action in ('link','enable') then return public.obs_snapshot(p_streamer_id)||jsonb_build_object('token',p.token); end if;
 if p_action='rotate' then
  update public.obs_playback set token=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),client_id=null,lease_until=null,desired='paused',state='paused',automatic=false,next_at=null,revision=revision+1 where streamer_id=p_streamer_id returning * into p;
  return public.obs_snapshot(p_streamer_id)||jsonb_build_object('token',p.token);
 elsif p_action='start' then
  if p.lease_until is null or p.lease_until<=now() then raise exception 'Conecte a fonte OBS antes de iniciar'; end if;
  if p.state not in ('idle','ended','error') then raise exception 'Pause ou pare a reprodução atual primeiro'; end if;
  perform public.obs_pick_next(p_streamer_id);
 elsif p_action='resume' then
  if p.video_id is null or p.state not in ('paused','blocked','error') or p.lease_until is null or p.lease_until<=now() then raise exception 'Player indisponível para continuar'; end if;
  update public.obs_playback set desired='playing',state='loading',error=null,revision=revision+1 where streamer_id=p_streamer_id;
 elsif p_action='pause' then
  update public.obs_playback set desired=case when state='countdown' then 'idle' else 'paused' end,state=case when state='countdown' then 'ended' else 'paused' end,next_at=null,revision=revision+1 where streamer_id=p_streamer_id;
 elsif p_action='automatic' then
  if p_value is null or p_value not in (0,1) then raise exception 'Valor inválido'; end if;
  update public.obs_playback set automatic=p_value=1,next_at=case when p_value=0 then null else next_at end,
   state=case when p_value=0 and state='countdown' then 'ended' else state end,desired=case when p_value=0 and state='countdown' then 'idle' else desired end where streamer_id=p_streamer_id;
 elsif p_action='gap' then
  if p_value is null or p_value not between 1 and 30 then raise exception 'Intervalo: 1 a 30 segundos'; end if;
  update public.obs_playback set gap_seconds=p_value where streamer_id=p_streamer_id;
 elsif p_action='volume' then
  if p_value is null or p_value not between 0 and 100 then raise exception 'Volume inválido'; end if;
  update public.obs_playback set volume=p_value where streamer_id=p_streamer_id;
 elsif p_action='stop' then
  -- Interrupted content stays in the queue, never in completed history.
  update public.suggestions set status='queued' where id=p.suggestion_id and streamer_id=p_streamer_id and status='watching';
  update public.obs_playback set desired='idle',state='idle',automatic=false,next_at=null,suggestion_id=null,video_id=null,title=null,source_url=null,position_seconds=0,duration_seconds=0,error=null,revision=revision+1 where streamer_id=p_streamer_id;
 end if;
 return public.obs_snapshot(p_streamer_id);
end; $$;

create function public.obs_receiver(p_token text,p_client uuid,p_revision integer default -1,p_event text default 'tick',p_position integer default 0,p_duration integer default 0)
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
 if p.suggestion_id is not null and p.state not in ('ended','countdown','idle') then
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
revoke all on function public.obs_video_id(text), public.obs_snapshot(uuid), public.obs_pick_next(uuid) from public,anon,authenticated;
revoke all on function public.obs_manage(uuid,text,integer) from public,anon;
grant execute on function public.obs_manage(uuid,text,integer) to authenticated;
revoke all on function public.obs_receiver(text,uuid,integer,text,integer,integer) from public;
grant execute on function public.obs_receiver(text,uuid,integer,text,integer,integer) to anon,authenticated;
