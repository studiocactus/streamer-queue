import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const migrationUrl = new URL('../supabase/migrations/0049_moderator_channel_access.sql', import.meta.url)

test('0049 confines moderator settings to the assigned channel and notifies its owner', async (t) => {
  const db = await PGlite.create()
  t.after(() => db.close())
  const ids = [1, 2, 3, 4].map((n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`)
  const [owner, moderator, outsider, channelA] = ids
  const channelB = '00000000-0000-0000-0000-000000000005'
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table profiles(id uuid primary key, display_name text);
    create table streamers(id uuid primary key, owner_id uuid, channel_name text, slug text, avatar_url text, is_active boolean default true, accepting_suggestions boolean default true);
    create table streamer_members(id uuid primary key default gen_random_uuid(), streamer_id uuid, user_id uuid, role text, permissions text[] default '{}');
    create table streamer_settings(streamer_id uuid primary key, require_approval boolean default true, allow_votes boolean default true, public_list boolean default true, chat_command text default '!sugerir', chat_command_enabled boolean default true);
    create table chat_message_templates(streamer_id uuid, event_type text, template text, enabled boolean, unique(streamer_id,event_type));
    create table film_polls(id uuid primary key default gen_random_uuid(), streamer_id uuid, starts_at timestamptz, ends_at timestamptz, status text, vote_message_template text, result_message_template text);
    create table film_poll_options(id uuid primary key default gen_random_uuid(), poll_id uuid, position smallint, title text, command text);
    create table suggestions(id uuid primary key default gen_random_uuid(), streamer_id uuid, title text, status text default 'pending');
    create table streamer_notifications(id uuid primary key default gen_random_uuid(), streamer_id uuid, user_id uuid, suggestion_id uuid, type text, title text, message text, target_path text, read_at timestamptz, created_at timestamptz default now());
    grant usage on schema public, auth to authenticated, service_role;
    grant all on all tables in schema public to authenticated, service_role;
    alter table streamers enable row level security; alter table streamer_settings enable row level security; alter table chat_message_templates enable row level security; alter table film_polls enable row level security; alter table film_poll_options enable row level security;
    create function is_streamer_member(p_streamer_id uuid, p_user_id uuid) returns boolean language sql stable security definer as $$ select exists(select 1 from streamer_members where streamer_id=p_streamer_id and user_id=p_user_id) $$;
    create function has_streamer_permission(p_streamer_id uuid, p_user_id uuid, p_permission text) returns boolean language sql stable security definer as $$ select exists(select 1 from streamer_members where streamer_id=p_streamer_id and user_id=p_user_id and (role='owner' or p_permission=any(permissions))) $$;
    insert into profiles values ('${owner}','Streamer'),('${moderator}','Mod A'),('${outsider}','Mod B');
    insert into streamers(id,owner_id,channel_name,slug) values ('${channelA}','${owner}','Canal A','a'),('${channelB}','${owner}','Canal B','b');
    insert into streamer_members(streamer_id,user_id,role,permissions) values ('${channelA}','${owner}','owner','{}'),('${channelB}','${owner}','owner','{}'),('${channelA}','${moderator}','moderator','{manage_settings,approve}');
    insert into streamer_settings(streamer_id) values ('${channelA}'),('${channelB}');
  `)
  const migration = await readFile(migrationUrl, 'utf8')
  await db.exec(migration)
  const asModerator = async (sql, params = []) => {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [moderator])
    await db.exec('set role authenticated')
    try { return await db.query(sql, params) } finally { await db.exec('reset role') }
  }
  await asModerator('update streamer_settings set allow_votes=false where streamer_id=$1', [channelA])
  assert.equal((await asModerator('update streamer_settings set allow_votes=false where streamer_id=$1 returning streamer_id', [channelB])).rows.length, 0)
  await asModerator('update streamers set accepting_suggestions=false where id=$1', [channelA])
  assert.equal((await asModerator('update streamers set accepting_suggestions=false where id=$1 returning id', [channelB])).rows.length, 0)
  assert.match(migration, /notify_streamer_of_moderator_change/)
  assert.match(migration, /channel_id, owner_id, 'moderator_change'/)
  const channels = await asModerator('select * from get_my_moderated_channels()')
  assert.deepEqual(channels.rows.map((item) => item.id), [channelA])
})
