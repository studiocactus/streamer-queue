import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const migrationUrl = new URL('../supabase/migrations/0052_fix_moderator_suggestion_audit_trigger.sql', import.meta.url)

test('0052 lets a streamer change suggestion statuses without the audit trigger blocking it', async (t) => {
  const db = await PGlite.create()
  t.after(() => db.close())
  const owner = '00000000-0000-0000-0000-000000000001'
  const streamer = '00000000-0000-0000-0000-000000000002'
  const suggestion = '00000000-0000-0000-0000-000000000003'
  await db.exec(`
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select '${owner}'::uuid $$;
    create table streamers(id uuid primary key, owner_id uuid not null);
    create table profiles(id uuid primary key, display_name text);
    create table streamer_members(streamer_id uuid, user_id uuid, role text, permissions text[]);
    create function has_streamer_permission(p_streamer_id uuid, p_user_id uuid, p_permission text) returns boolean language sql stable as $$ select exists(select 1 from streamer_members where streamer_id=p_streamer_id and user_id=p_user_id and role='owner') $$;
    create table streamer_notifications(streamer_id uuid, user_id uuid, suggestion_id uuid, type text, title text, message text, target_path text);
    create table suggestions(id uuid primary key, streamer_id uuid not null, title text not null, status text not null);
    insert into streamers values ('${streamer}', '${owner}');
    insert into streamer_members values ('${streamer}', '${owner}', 'owner', '{}');
    insert into suggestions values ('${suggestion}', '${streamer}', 'Filme de teste', 'queued');
  `)
  await db.exec(await readFile(migrationUrl, 'utf8'))
  await db.exec('create trigger tr_moderator_suggestion_notification after update of status on suggestions for each row execute function notify_streamer_of_moderator_suggestion_change()')
  for (const status of ['watching', 'completed', 'queued', 'rejected']) {
    await db.query('update suggestions set status=$1 where id=$2', [status, suggestion])
  }
  assert.equal((await db.query('select status from suggestions where id=$1', [suggestion])).rows[0].status, 'rejected')
  assert.equal((await db.query('select * from streamer_notifications')).rows.length, 0)
})
