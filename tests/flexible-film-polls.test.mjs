import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const migration = name => readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8')
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`

test('flexible polls are atomic, scoped, announce all films and preserve vote rules', async t => {
  const db = await PGlite.create(); t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create table streamers(id uuid primary key,owner_id uuid);
    create table suggestions(id uuid primary key,streamer_id uuid references streamers(id));
    create function is_streamer_member(uuid,uuid) returns boolean language sql stable as $$select exists(select 1 from streamers where id=$1 and owner_id=$2)$$;
    create function can_manage_streamer(uuid) returns boolean language sql stable security definer as $$select is_streamer_member($1,auth.uid())$$;
  `)
  for (const file of ['0048_film_chat_polls.sql','0053_fix_film_poll_vote_count_and_end_state.sql','0054_archive_film_polls.sql','0066_flexible_film_polls.sql']) await db.exec(await migration(file))
  await db.query('insert into streamers values ($1,$2),($3,$4)',[id(1),id(2),id(3),id(4)])
  await db.query("select set_config('test.uid',$1,false)",[id(2)])
  const create = async (titles, channel = id(1), delay = '-1 minute') => (await db.query(
    "select create_film_poll($1,now()+$2::interval,now()+interval '1 hour',$3,'Vote {titulo}','Winner {titulo}') as id",[channel,delay,titles])).rows[0].id
  await assert.rejects(create(['One']),/at least two/)
  await assert.rejects(create(['One',' one ']),/distinct/)
  await assert.rejects(create(['One','Two'],id(3)),/Not authorized/)
  assert.equal((await db.query('select count(*)::int as n from film_polls')).rows[0].n,0)
  const titles = Array.from({length:9},(_,i) => `Film ${i+1}: ${'x'.repeat(170)}`)
  const poll = await create(titles)
  const options = (await db.query('select title,command from film_poll_options where poll_id=$1 order by position',[poll])).rows
  assert.equal(options.length,9); assert.equal(options[8].command,'!filme9')
  await assert.rejects(create(['Another','Other']),/unique/)
  assert.equal((await db.query('select count(*)::int as n from film_polls')).rows[0].n,1)
  const chunks = (await db.query('select message from film_poll_announcements where poll_id=$1 order by position',[poll])).rows
  assert.ok(chunks.length > 1); assert.ok(chunks.every(x => x.message.length <= 450))
  for (const title of titles) assert.ok(chunks.some(x => x.message.includes(title)))
  const first = (await db.query('select * from claim_film_poll_announcement()')).rows[0]
  assert.equal((await db.query('select * from claim_film_poll_announcement()')).rows.length,0,'concurrent workers cannot overtake the locked first chunk')
  await db.query('select settle_film_poll_announcement($1,$2,false,$3)',[first.id,first.attempt,'Twitch unavailable'])
  assert.equal((await db.query('select * from claim_film_poll_announcement()')).rows.length,0,'failed sends back off')
  await db.query("update film_poll_announcements set locked_at=now()-interval '3 minutes' where id=$1",[first.id])
  const retry = (await db.query('select * from claim_film_poll_announcement()')).rows[0]
  assert.equal(retry.id,first.id); assert.equal(retry.attempt,2)
  assert.equal((await db.query('select settle_film_poll_announcement($1,$2,true,null) as ok',[first.id,first.attempt])).rows[0].ok,false)
  await db.query('select settle_film_poll_announcement($1,$2,true,null)',[retry.id,retry.attempt])
  assert.notEqual((await db.query('select * from claim_film_poll_announcement()')).rows[0].id,first.id)
  assert.equal((await db.query('select * from cast_film_poll_vote($1,$2,$3)',[id(1),'viewer','!filme9'])).rows[0].accepted,true)
  assert.equal((await db.query('select * from cast_film_poll_vote($1,$2,$3)',[id(1),'viewer','!filme2'])).rows[0].accepted,false)
  await db.query("update film_polls set status='archived' where id=$1",[poll])
  assert.equal((await db.query('select * from claim_film_poll_announcement()')).rows.length,0)
  await create(['Next one','Next two'],id(1),'10 minutes')
  assert.equal((await db.query('select * from claim_film_poll_announcement()')).rows.length,0,'scheduled announcements wait for opening')
  await db.query('insert into suggestions values ($1,$2),($3,$2),($4,$5)',[id(11),id(1),id(12),id(13),id(3)])
  await assert.rejects(db.query('select delete_channel_suggestions($1,$2)',[id(1),[id(11),id(13)]]),/another channel/)
  assert.equal((await db.query('select count(*)::int as n from suggestions')).rows[0].n,3)
  assert.equal((await db.query('select delete_channel_suggestions($1,$2) as n',[id(1),[id(11),id(12)]])).rows[0].n,2)
  assert.equal((await db.query('select count(*)::int as n from film_poll_options')).rows[0].n,11,'cleanup does not erase poll history')
  await db.exec('set role authenticated')
  await assert.rejects(db.query('select claim_film_poll_announcement()'),/permission denied/)
  await db.exec('reset role')
  await db.query("select set_config('test.uid',$1,false)",[id(4)])
  await assert.rejects(db.query('select delete_channel_suggestions($1,$2)',[id(1),[id(11)]]),/Not authorized/)
})
