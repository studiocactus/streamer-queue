import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const migrationUrl = new URL('../supabase/migrations/0053_fix_film_poll_vote_count_and_end_state.sql', import.meta.url)

test('0053 records a chat vote and returns the current option total', async (t) => {
  const db = await PGlite.create()
  t.after(() => db.close())
  const streamer = '00000000-0000-0000-0000-000000000001'
  const poll = '00000000-0000-0000-0000-000000000002'
  const option = '00000000-0000-0000-0000-000000000003'
  await db.exec(`
    create table film_polls(id uuid primary key, streamer_id uuid not null, starts_at timestamptz not null, ends_at timestamptz not null, status text not null default 'scheduled', vote_message_template text not null, created_at timestamptz not null default now());
    create table film_poll_options(id uuid primary key, poll_id uuid not null, title text not null, command text not null);
    create table film_poll_votes(poll_id uuid not null, option_id uuid not null, twitch_user_id text not null, primary key(poll_id, twitch_user_id));
    insert into film_polls values ('${poll}', '${streamer}', now() - interval '1 minute', now() + interval '1 hour', 'scheduled', 'Vote em {titulo}: {votos}');
    insert into film_poll_options values ('${option}', '${poll}', 'Filme 1', '!filme1');
  `)
  await db.exec(await readFile(migrationUrl, 'utf8'))
  const first = await db.query(`select * from cast_film_poll_vote('${streamer}', 'viewer-a', '!filme1')`)
  assert.deepEqual(first.rows, [{ title: 'Filme 1', command: '!filme1', votes: 1, viewer_template: 'Vote em {titulo}: {votos}', accepted: true }])
  const duplicate = await db.query(`select * from cast_film_poll_vote('${streamer}', 'viewer-a', '!filme1')`)
  assert.equal(duplicate.rows[0].votes, 1)
  assert.equal(duplicate.rows[0].accepted, false)
})
