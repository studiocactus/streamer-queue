-- Compare submitted content, not a metadata provider's generic title.
-- Compute keys for existing rows too; no historical data is rewritten.
create or replace function public.suggestion_content_key(source text, title text)
returns text language plpgsql immutable set search_path = public as $$
declare
  link text := nullif(trim(source), '');
  host text;
  video_id text;
begin
  if link is null then
    return 'title:' || lower(regexp_replace(trim(title), '\s+', ' ', 'g'));
  end if;
  host := lower(substring(link from '^https?://([^/:?#]+)'));
  if host in ('youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtu.be') then
    if host in ('youtu.be', 'www.youtu.be') then
      video_id := substring(link from '^https?://[^/]+/([A-Za-z0-9_-]{11})(?:[/?#]|$)');
    else
      video_id := substring(split_part(link, '#', 1) from '[?&]v=([A-Za-z0-9_-]{11})(?:[&#]|$)');
      if video_id is null then
        video_id := substring(link from '^https?://[^/]+/(?:shorts|embed|live)/([A-Za-z0-9_-]{11})(?:[/?#]|$)');
      end if;
    end if;
    if video_id is not null then return 'youtube:' || video_id; end if;
  end if;
  return 'url:' || link;
end;
$$;

create or replace function public.guard_duplicate_suggestion()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  identity_key text;
begin
  identity_key := coalesce(new.submitted_by::text, 'twitch:' || new.chat_user_id);
  if identity_key is null or new.status in ('completed', 'rejected') then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.streamer_id::text || ':' || identity_key, 0));
  if exists (
    select 1 from public.suggestions s
    where s.streamer_id = new.streamer_id
      and coalesce(s.submitted_by::text, 'twitch:' || s.chat_user_id) = identity_key
      and s.status not in ('completed', 'rejected')
      and public.suggestion_content_key(s.source_url, s.title) = public.suggestion_content_key(new.source_url, new.title)
  ) then
    raise exception using errcode = 'P0001', message = 'SUGGESTION_ALREADY_ACTIVE';
  end if;
  return new;
end;
$$;
