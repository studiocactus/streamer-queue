import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('0036 enforces viewer permissions under actual restricted database roles', async (t) => {
  const db = await PGlite.create()
  t.after(() => db.close())
  const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
  const [viewer, owner, other, a, b] = [1, 2, 3, 4, 5].map(id)
  // Minimal schema and pre-existing RLS; the production migration is executed below.
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    create table profiles(id uuid primary key, twitch_user_id text, twitch_login text,
      display_name text, bio text, social_links jsonb default '{}');
    create table streamers(id uuid primary key, owner_id uuid, is_public boolean default true,
      is_active boolean default true, accepting_suggestions boolean default true);
    create table banned_users(streamer_id uuid, user_id uuid);
    create table streamer_settings(streamer_id uuid primary key, allow_votes boolean);
    create table suggestions(id uuid primary key default gen_random_uuid(), streamer_id uuid,
      submitted_by uuid, status text default 'pending', title text);
    create table votes(id uuid default gen_random_uuid(), streamer_id uuid, suggestion_id uuid, user_id uuid);
    grant all on all tables in schema public to authenticated, service_role;
    alter table profiles enable row level security;
    alter table banned_users enable row level security;
    alter table suggestions enable row level security;
    alter table votes enable row level security;
    create policy profiles_select_public on profiles for select using (true);
    create policy profiles_update_own on profiles for update using (id=auth.uid());
    create policy profiles_insert_own on profiles for insert with check (id=auth.uid());
    create policy bans_select_owner on banned_users for select using (
      exists(select 1 from streamers s where s.id=streamer_id and s.owner_id=auth.uid()));
    create policy suggestions_select on suggestions for select using (
      submitted_by=auth.uid() or status not in ('pending','rejected') or
      exists(select 1 from streamers s where s.id=streamer_id and s.owner_id=auth.uid()));
    create policy suggestions_update_moderator on suggestions for update using (
      exists(select 1 from streamers s where s.id=streamer_id and s.owner_id=auth.uid()));
    insert into profiles(id,twitch_user_id,twitch_login) values
      ('${viewer}','viewer-id','viewer'),('${owner}','owner-id','owner'),('${other}','other-id','other');
    insert into streamers(id,owner_id) values ('${a}','${owner}'),('${b}','${owner}');
    insert into streamer_settings values ('${a}',false),('${b}',true);
    insert into suggestions(id,streamer_id,submitted_by,status,title) values
      ('${id(10)}','${a}','${other}','approved','A'),
      ('${id(11)}','${b}','${other}','approved','B'),
      ('${id(12)}','${b}','${viewer}','approved','Own'),
      ('${id(13)}','${b}',null,'approved','Chat');
  `)
  await db.exec(await readFile(new URL('../supabase/migrations/0036_harden_viewer_permissions.sql', import.meta.url), 'utf8'))
  const asUser = async (who, sql, params = [], role = 'authenticated') => {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [who])
    await db.exec(`set role ${role}`)
    try { return await db.query(sql, params) } finally { await db.exec('reset role') }
  }
  const submit = (who, channel, status = 'pending') => asUser(who,
    'insert into suggestions(streamer_id,submitted_by,status,title) values ($1,$2,$3,$4) returning id',
    [channel, who, status, 'Test'])
  const vote = (channel, suggestion) => asUser(viewer,
    'insert into votes(streamer_id,suggestion_id,user_id) values ($1,$2,$3)', [channel, suggestion, viewer])
  const denied = (action) => assert.rejects(action, /row-level security|permission denied|SUGGESTION_OWNERSHIP_IMMUTABLE/)

  await t.test('viewers cannot skip approval; owners can add approved content', async () => {
    for (const status of ['approved', 'queued', 'watching', 'completed', 'rejected']) {
      await denied(submit(viewer, a, status))
    }
    const pending = (await submit(viewer, a)).rows[0].id
    await denied(asUser(viewer, "update suggestions set status='approved' where id=$1", [pending]))
    await denied(asUser(viewer, 'update suggestions set streamer_id=$1 where id=$2', [b, pending]))
    await asUser(viewer, "update suggestions set title='Edited' where id=$1", [pending])
    await asUser(owner, "update suggestions set status='approved' where id=$1", [pending])
    await submit(owner, a, 'approved')
    await db.query('update streamers set accepting_suggestions=false where id=$1', [a])
    await denied(submit(viewer, a))
    await submit(owner, a, 'approved')
    await db.query('update streamers set accepting_suggestions=true where id=$1', [a])
  })
  await t.test('votes respect the exact channel, authorship and suggestion-channel pair', async () => {
    await denied(vote(a, id(10)))
    await denied(vote(b, id(10)))
    await denied(vote(b, id(12)))
    await vote(b, id(11))
    await vote(b, id(13))
  })
  await t.test('bans block submissions, edits and votes without revealing private ban lists', async () => {
    const pending = (await submit(viewer, b)).rows[0].id
    await db.query('insert into banned_users values ($1,$2)', [b, viewer])
    assert.equal((await asUser(viewer, 'select * from banned_users')).rows.length, 0)
    assert.equal((await asUser(viewer, 'select is_banned_from_channel($1) as banned', [b])).rows[0].banned, true)
    await denied(submit(viewer, b))
    await denied(vote(b, id(11)))
    assert.equal((await asUser(viewer, "update suggestions set title='Blocked' where id=$1 returning id", [pending])).rows.length, 0)
    await submit(viewer, a)
    await db.query('delete from banned_users where streamer_id=$1', [b])
    await submit(viewer, b)
    await vote(b, id(11))
  })
  await t.test('profile editing stays available but Twitch identity is backend-only', async () => {
    await asUser(viewer, "update profiles set bio='About me',social_links='{}' where id=$1", [viewer])
    for (const column of ['twitch_user_id', 'twitch_login', 'display_name']) {
      await denied(asUser(viewer, `update profiles set ${column}='forged' where id=$1`, [viewer]))
    }
    await denied(asUser(viewer, 'insert into profiles(id) values ($1)', [id(50)]))
    assert.equal((await asUser(viewer, "update profiles set bio='Other' where id=$1 returning id", [other])).rows.length, 0)
    await asUser(owner, "update profiles set twitch_login='refreshed' where id=$1", [viewer], 'service_role')
  })
  await t.test('anonymous clients cannot submit or vote', async () => {
    await denied(asUser('', "insert into suggestions(title) values ('Anon')", [], 'anon'))
    await denied(asUser('', 'insert into votes(user_id) values ($1)', [viewer], 'anon'))
  })
})
