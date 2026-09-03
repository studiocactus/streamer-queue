import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('migration 0035: duplicate submissions, cooldown and access control', async (t) => {
  const db = await PGlite.create()
  t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.streamers (id uuid primary key);
    create table public.suggestions (
      id uuid primary key default gen_random_uuid(), streamer_id uuid not null,
      submitted_by uuid, chat_user_id text, title text not null, status text not null
    );
  `)
  await db.exec(await readFile(new URL('../supabase/migrations/0035_submission_and_chat_guards.sql', import.meta.url), 'utf8'))
  const channel = '00000000-0000-0000-0000-000000000001'
  const otherChannel = '00000000-0000-0000-0000-000000000002'
  const viewer = '00000000-0000-0000-0000-000000000003'
  const otherViewer = '00000000-0000-0000-0000-000000000004'
  await db.query('insert into streamers values ($1), ($2)', [channel, otherChannel])
  const insert = (who, title, where = channel, chatId = null) => db.query(
    "insert into suggestions(streamer_id,submitted_by,chat_user_id,title,status) values ($1,$2,$3,$4,'pending')", [where, who, chatId, title])
  await t.test('same active title is blocked despite whitespace/case; others remain allowed', async () => {
    await insert(viewer, 'Example Film')
    await assert.rejects(insert(viewer, '  EXAMPLE   film '), /SUGGESTION_ALREADY_ACTIVE/)
    await insert(otherViewer, 'Example Film')
    await insert(viewer, 'Example Film', otherChannel)
    assert.equal((await db.query('select count(*)::int as n from suggestions')).rows[0].n, 3)
  })
  await t.test('completed suggestions can be resubmitted', async () => {
    await db.query("update suggestions set status='completed' where submitted_by=$1 and streamer_id=$2", [viewer, channel])
    await insert(viewer, 'Example Film')
  })
  await t.test('unregistered Twitch authors are protected too', async () => {
    await insert(null, 'Chat Film', channel, 'twitch-test')
    await assert.rejects(insert(null, 'Chat Film', channel, 'twitch-test'), /SUGGESTION_ALREADY_ACTIVE/)
  })
  const claim = async (id, where = channel) => (await db.query('select claim_chat_command($1,$2) as allowed', [where, id])).rows[0].allowed
  await t.test('cooldown isolates people and channels and allows again after expiry', async () => {
    assert.equal(await claim('one'), true)
    assert.equal(await claim('one'), false)
    assert.equal(await claim('two'), true)
    assert.equal(await claim('one', otherChannel), true)
    await db.exec("update chat_command_cooldowns set allowed_at = now() - interval '1 second'")
    assert.equal(await claim('one'), true)
  })
  await t.test('browser roles cannot call the private cooldown function', async () => {
    const result = await db.query(`select
      has_function_privilege('anon','public.claim_chat_command(uuid,text)','EXECUTE') as anon,
      has_function_privilege('authenticated','public.claim_chat_command(uuid,text)','EXECUTE') as viewer,
      has_function_privilege('service_role','public.claim_chat_command(uuid,text)','EXECUTE') as worker`)
    assert.deepEqual(result.rows[0], { anon: false, viewer: false, worker: true })
  })
})
