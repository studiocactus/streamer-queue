import assert from 'node:assert/strict'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'

const migrationUrl = new URL('../supabase/migrations/0039_operational_record_retention.sql', import.meta.url)

async function createDatabase() {
  const db = new PGlite()
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create table twitch_eventsub_messages (
      message_id text primary key,
      received_at timestamptz not null,
      processing_status text not null
    );
    create table chat_command_cooldowns (
      streamer_id uuid not null,
      twitch_user_id text not null,
      allowed_at timestamptz not null,
      primary key (streamer_id, twitch_user_id)
    );
    create table chat_message_logs (
      id uuid primary key,
      created_at timestamptz not null
    );
    create table suggestions (id uuid primary key);
    create table chat_delivery_queue (id uuid primary key, suggestion_id uuid references suggestions(id));
  `)

  const migration = await readFile(migrationUrl, 'utf8')
  await db.exec(migration.slice(0, migration.indexOf('\ndo $$')))
  return db
}

test('cleanup removes only expired operational records', async () => {
  const db = await createDatabase()
  await db.exec(`
    insert into twitch_eventsub_messages values
      ('expired-completed', now() - interval '31 days', 'completed'),
      ('recent-completed', now() - interval '29 days', 'completed'),
      ('expired-retryable', now() - interval '31 days', 'retryable');
    insert into chat_command_cooldowns values
      ('00000000-0000-0000-0000-000000000001', 'expired', now() - interval '25 hours'),
      ('00000000-0000-0000-0000-000000000001', 'recent', now() - interval '23 hours');
    insert into chat_message_logs values
      ('00000000-0000-0000-0000-000000000002', now() - interval '91 days'),
      ('00000000-0000-0000-0000-000000000003', now() - interval '89 days');
    insert into suggestions values ('00000000-0000-0000-0000-000000000004');
    insert into chat_delivery_queue values (
      '00000000-0000-0000-0000-000000000005',
      '00000000-0000-0000-0000-000000000004'
    );
  `)

  const result = await db.query('select * from cleanup_operational_records()')
  assert.deepEqual(result.rows[0], {
    event_receipts_deleted: 1,
    cooldowns_deleted: 1,
    chat_logs_deleted: 1,
  })

  const receipts = await db.query('select message_id from twitch_eventsub_messages order by message_id')
  assert.deepEqual(receipts.rows.map((row) => row.message_id), ['expired-retryable', 'recent-completed'])
  assert.equal((await db.query('select count(*)::int as count from chat_command_cooldowns')).rows[0].count, 1)
  assert.equal((await db.query('select count(*)::int as count from chat_message_logs')).rows[0].count, 1)
  assert.equal((await db.query('select count(*)::int as count from suggestions')).rows[0].count, 1)
  assert.equal((await db.query('select count(*)::int as count from chat_delivery_queue')).rows[0].count, 1)
})

test('cleanup cannot be called by public application roles', async () => {
  const db = await createDatabase()
  const privileges = await db.query(`
    select
      has_function_privilege('anon', 'cleanup_operational_records()', 'execute') as anon,
      has_function_privilege('authenticated', 'cleanup_operational_records()', 'execute') as authenticated,
      has_function_privilege('service_role', 'cleanup_operational_records()', 'execute') as service_role
  `)
  assert.deepEqual(privileges.rows[0], { anon: false, authenticated: false, service_role: true })
})
