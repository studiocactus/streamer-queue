import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const migrationUrl = new URL('../supabase/migrations/0051_fix_moderator_poll_audit_trigger.sql', import.meta.url)

test('0051 allows the channel owner to create a poll without failing the audit trigger', async (t) => {
  const db = await PGlite.create()
  t.after(() => db.close())
  const owner = '00000000-0000-0000-0000-000000000001'
  const streamer = '00000000-0000-0000-0000-000000000002'
  await db.exec(`
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select '${owner}'::uuid $$;
    create table streamers(id uuid primary key, owner_id uuid not null);
    create table profiles(id uuid primary key, display_name text);
    create table streamer_members(streamer_id uuid, user_id uuid, role text, permissions text[]);
    create function has_streamer_permission(p_streamer_id uuid, p_user_id uuid, p_permission text) returns boolean language sql stable as $$ select exists(select 1 from streamer_members where streamer_id=p_streamer_id and user_id=p_user_id and role='owner') $$;
    create table streamer_notifications(streamer_id uuid, user_id uuid, type text, title text, message text, target_path text);
    create table film_polls(id uuid primary key default gen_random_uuid(), streamer_id uuid not null, starts_at timestamptz not null, ends_at timestamptz not null);
    insert into streamers values ('${streamer}', '${owner}');
    insert into streamer_members values ('${streamer}', '${owner}', 'owner', '{}');
  `)
  await db.exec(await readFile(migrationUrl, 'utf8'))
  await db.exec(`create trigger tr_moderator_poll_notification after insert on film_polls for each row execute function notify_streamer_of_moderator_change('a votação de filmes')`)
  const inserted = await db.query(`insert into film_polls(streamer_id, starts_at, ends_at) values ('${streamer}', now(), now() + interval '1 hour') returning id`)
  assert.equal(inserted.rows.length, 1)
  assert.equal((await db.query('select * from streamer_notifications')).rows.length, 0)
})
