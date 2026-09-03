import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('0043 marks Twitch reconnect once and restricts the recovery action to the backend', async (t) => {
  const db = await PGlite.create()
  t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table streamers(id uuid primary key);
    create table twitch_connections(streamer_id uuid primary key references streamers(id), token_status text, updated_at timestamptz);
    create table streamer_notifications(
      id uuid primary key default gen_random_uuid(), streamer_id uuid references streamers(id), type text,
      title text, message text, target_path text, read_at timestamptz, created_at timestamptz default now()
    );
  `)
  await db.exec(await readFile(new URL('../supabase/migrations/0043_twitch_reconnect_recovery.sql', import.meta.url), 'utf8'))
  const channel = '00000000-0000-0000-0000-000000000001'
  await db.query('insert into streamers values ($1)', [channel])
  await db.query("insert into twitch_connections values ($1,'active',now())", [channel])

  await db.query("select mark_twitch_reconnect_required($1,'expired')", [channel])
  await db.query("select mark_twitch_reconnect_required($1,'revoked')", [channel])
  assert.equal((await db.query('select token_status from twitch_connections')).rows[0].token_status, 'revoked')
  assert.equal((await db.query('select count(*)::integer as total from streamer_notifications')).rows[0].total, 1)
  assert.equal((await db.query('select target_path from streamer_notifications')).rows[0].target_path, '/dashboard/streamer')
  await assert.rejects(db.query("select mark_twitch_reconnect_required($1,'unknown')", [channel]), /Invalid Twitch connection status/)

  for (const role of ['anon', 'authenticated']) {
    assert.equal((await db.query(
      "select has_function_privilege($1,'public.mark_twitch_reconnect_required(uuid,text)','EXECUTE') as ok", [role]
    )).rows[0].ok, false)
  }
  assert.equal((await db.query(
    "select has_function_privilege('service_role','public.mark_twitch_reconnect_required(uuid,text)','EXECUTE') as ok"
  )).rows[0].ok, true)
})

test('Twitch recovery is connected to revocation, delivery and successful reconnection flows', async () => {
  const eventsub = await readFile(new URL('../supabase/functions/twitch-eventsub/index.ts', import.meta.url), 'utf8')
  const worker = await readFile(new URL('../supabase/functions/chat-delivery-worker/index.ts', import.meta.url), 'utf8')
  const auth = await readFile(new URL('../supabase/functions/twitch-auth/index.ts', import.meta.url), 'utf8')

  assert.match(eventsub, /authorization_revoked/)
  assert.match(eventsub, /mark_twitch_reconnect_required/)
  assert.match(worker, /mark_twitch_reconnect_required/)
  assert.match(auth, /twitch_reconnect_required/)
  assert.match(auth, /chat_delivery_queue/)
})
