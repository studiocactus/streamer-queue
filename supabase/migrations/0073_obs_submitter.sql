create or replace function public.obs_snapshot(p_id uuid) returns jsonb language sql security definer set search_path=public as $$
 select (to_jsonb(p)-'token'-'client_id'-'lease_until') || jsonb_build_object(
 'connected',coalesce(p.lease_until>now(),false),
 'countdown',case when p.next_at is null then 0 else greatest(0,ceil(extract(epoch from p.next_at-now()))) end,
 'submitted_by_name',coalesce(nullif(btrim(u.display_name),''),nullif(btrim(u.twitch_login),'')))
 from public.obs_playback p
 left join public.suggestions s on s.id=p.suggestion_id and s.streamer_id=p.streamer_id
 left join public.profiles u on u.id=s.submitted_by
 where p.streamer_id=p_id;
$$;
revoke all on function public.obs_snapshot(uuid) from public,anon,authenticated;
