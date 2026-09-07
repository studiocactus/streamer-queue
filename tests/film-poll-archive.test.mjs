import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const migrationUrl = new URL('../supabase/migrations/0054_archive_film_polls.sql', import.meta.url)

test('0054 accepts archived polls without treating them as open polls', async (t) => {
  const db = await PGlite.create()
  t.after(() => db.close())
  await db.exec(`
    create table film_polls(id uuid primary key default gen_random_uuid(), streamer_id uuid not null, status text not null check (status in ('scheduled', 'active', 'ended')));
    create unique index film_polls_one_open_per_streamer on film_polls(streamer_id) where status in ('scheduled', 'active');
  `)
  await db.exec(await readFile(migrationUrl, 'utf8'))
  await db.exec("insert into film_polls(streamer_id, status) values ('00000000-0000-0000-0000-000000000001', 'archived'), ('00000000-0000-0000-0000-000000000001', 'scheduled')")
  assert.equal((await db.query("select count(*)::int as count from film_polls where status='archived'")).rows[0].count, 1)
})
