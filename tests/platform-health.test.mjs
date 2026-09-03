import assert from 'node:assert/strict'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'

const migrationUrl = new URL('../supabase/migrations/0040_public_platform_health.sql', import.meta.url)
const eventsubHealthMigrationUrl = new URL('../supabase/migrations/0042_eventsub_health_heartbeat.sql', import.meta.url)
const workerUrl = new URL('../supabase/functions/chat-delivery-worker/index.ts', import.meta.url)

async function createDatabase() {
  const db = new PGlite()
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create table profiles (id uuid primary key);
    create table streamers (id uuid primary key, is_active boolean not null default true);
    create function get_platform_stats()
    returns table (users_count bigint, streamers_count bigint)
    language sql as $$ select 0::bigint, 0::bigint $$;
  `)
  await db.exec(await readFile(migrationUrl, 'utf8'))
  await db.exec(await readFile(eventsubHealthMigrationUrl, 'utf8'))
  return db
}

test('public status reflects a recent private worker heartbeat', async () => {
  const db = await createDatabase()
  await db.exec(`
    insert into profiles values ('00000000-0000-0000-0000-000000000001');
    insert into streamers values
      ('00000000-0000-0000-0000-000000000002', true),
      ('00000000-0000-0000-0000-000000000003', false);
  `)

  const before = await db.query('select * from get_platform_stats()')
  assert.deepEqual(before.rows[0], { users_count: 1, streamers_count: 1, platform_status: 'attention' })

  await db.query("select record_system_heartbeat('chat-delivery-worker')")
  const chatOnly = await db.query('select * from get_platform_stats()')
  assert.equal(chatOnly.rows[0].platform_status, 'attention')

  await db.query("select record_system_heartbeat('twitch-eventsub-sync')")
  const after = await db.query('select * from get_platform_stats()')
  assert.deepEqual(after.rows[0], { users_count: 1, streamers_count: 1, platform_status: 'operational' })

  await db.exec("update system_health set last_success_at = now() - interval '36 minutes' where component = 'twitch-eventsub-sync'")
  const stale = await db.query('select * from get_platform_stats()')
  assert.equal(stale.rows[0].platform_status, 'attention')
})

test('heartbeat details stay private and worker records successful runs', async () => {
  const db = await createDatabase()
  const privileges = await db.query(`
    select
      has_table_privilege('anon', 'system_health', 'select') as anon_table,
      has_function_privilege('anon', 'record_system_heartbeat(text)', 'execute') as anon_function,
      has_function_privilege('service_role', 'record_system_heartbeat(text)', 'execute') as service_function
  `)
  assert.deepEqual(privileges.rows[0], { anon_table: false, anon_function: false, service_function: true })

  const worker = await readFile(workerUrl, 'utf8')
  assert.match(worker, /record_system_heartbeat/)
  assert.match(worker, /chat-delivery-worker/)
})
