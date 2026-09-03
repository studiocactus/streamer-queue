import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHmac } from 'node:crypto'
import ts from 'typescript'
import { PGlite } from '@electric-sql/pglite'

test('0038 receipt lifecycle preserves cooldown decisions and blocks stale workers', async (t) => {
  const db = await PGlite.create()
  t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table streamers(id uuid primary key);
    create table suggestions(id uuid primary key default gen_random_uuid(),streamer_id uuid,submitted_by uuid,chat_user_id text,title text,status text);
    create table twitch_eventsub_messages(message_id text primary key,event_type text not null,received_at timestamptz default now());
    insert into twitch_eventsub_messages values ('historic','chat',now());
  `)
  for (const file of ['0035_submission_and_chat_guards.sql', '0038_eventsub_retry_lifecycle.sql']) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'))
  }
  const channel = '00000000-0000-0000-0000-000000000001'
  await db.query('insert into streamers values ($1)', [channel])
  const claim = async (id) => (await db.query("select claim_twitch_event($1,'chat') as n", [id])).rows[0].n
  const finish = async (id, n, completed) => (await db.query('select finish_twitch_event($1,$2,$3) as ok', [id, n, completed])).rows[0].ok
  const command = async (id, n) => (await db.query('select claim_twitch_event_command($1,$2,$3,$4) as ok', [id, n, channel, 'viewer'])).rows[0].ok
  assert.equal(await claim('historic'), 0)
  assert.equal(await claim('one'), 1)
  assert.equal(await claim('one'), -1)
  assert.equal(await command('one', 1), true)
  assert.equal(await finish('one', 1, false), true)
  assert.equal(await claim('one'), 2)
  assert.equal(await command('one', 2), true) // Same event bypasses its own cooldown.
  assert.equal(await claim('two'), 1)
  assert.equal(await command('two', 1), false) // Different event still rate-limited.
  await db.exec("update chat_command_cooldowns set allowed_at=now()-interval '1 second'")
  assert.equal(await command('two', 1), false) // A blocked command cannot sneak in later.
  await db.exec("update twitch_eventsub_messages set locked_at=now()-interval '3 minutes' where message_id='one'")
  assert.equal(await claim('one'), 3)
  assert.equal(await finish('one', 2, true), false)
  await assert.rejects(command('one', 2), /lease unavailable/)
  assert.equal(await finish('one', 3, true), true)
  assert.equal(await claim('one'), 0)
  await db.exec('grant insert,update,select on suggestions to authenticated; set role authenticated')
  try {
    await assert.rejects(db.query("insert into suggestions(title,status,twitch_event_message_id) values ('Forgery','completed','forged')"), /server-managed/)
    await assert.rejects(claim('forged'), /permission denied/)
  } finally { await db.exec('reset role') }
  for (const fn of ['claim_twitch_event(text,text)', 'finish_twitch_event(text,integer,boolean)', 'claim_twitch_event_command(text,integer,uuid,text)']) {
    assert.equal((await db.query('select has_function_privilege($1,$2,$3) as ok', ['anon', fn, 'EXECUTE'])).rows[0].ok, false)
  }
})

test('signed handler retries failed confirmations without creating another suggestion', async () => {
  let handler, stored = null, logged = false, insertions = 0, sends = 0, attempt = 0, completed = false, failLookup = false
  const finishes = []
  const client = {
    async rpc(name, args) {
      if (name === 'claim_twitch_event') return { data: completed ? 0 : ++attempt, error: null }
      if (name === 'claim_twitch_event_command') return { data: true, error: null }
      finishes.push(args.p_completed); completed = args.p_completed
      return { data: true, error: null }
    },
    from(table) {
      let value, operation = 'select'
      const query = {
        select() { return query }, eq() { return query }, limit() { return query },
        maybeSingle() { return query }, single() { return query },
        insert(input) { operation='insert'; value=input; return query },
        then(resolve,reject) {
          let data = null, error = null
          if (table === 'streamers') {
            if (failLookup) error = new Error('Database unavailable')
            else data = { id:'channel',is_active:true,settings:{ chat_command:'!sugerir',chat_command_enabled:true } }
          }
          if (table === 'suggestions') {
            if (operation === 'insert') { stored={ id:'suggestion', ...value }; insertions++ }
            data=stored
          }
          if (table === 'chat_message_logs') {
            if (operation === 'insert') logged=true
            data=logged ? { id:'log' } : null
          }
          if (table === 'twitch_chat_credentials') data={ access_token:'fake',expires_at:'2099-01-01' }
          return Promise.resolve({data,error}).then(resolve,reject)
        },
      }
      return query
    },
  }
  const source=(await readFile(new URL('../supabase/functions/twitch-eventsub/index.ts',import.meta.url),'utf8')).replace(/^import .* from .*\r?\n/gm,'')
  const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
  const deno={env:{get:()=> 'test-secret'},serve:fn=>{handler=fn}}
  new Function('createClient','Deno','fetch','normalizeContentReference','console',js)(
    ()=>client,deno,async()=>{
      sends++
      if(sends===1) throw new Error('Network failure')
      return new Response(JSON.stringify({data:[{is_sent:true}]}))
    },async title=>({title,sourceUrl:null,thumbnailUrl:null}),{error(){},warn(){}},
  )
  const request=(signatureValid=true)=>{
    const timestamp=new Date().toISOString()
    const body=JSON.stringify({subscription:{type:'channel.chat.message'},event:{broadcaster_user_id:'channel',chatter_user_id:'viewer',chatter_user_login:'viewer',chatter_user_name:'Viewer',message:{text:'!sugerir Test film'}}})
    const signature=createHmac('sha256','test-secret').update('event'+timestamp+body).digest('hex')
    return new Request('https://example.invalid',{method:'POST',headers:{
      'Twitch-Eventsub-Message-Id':'event','Twitch-Eventsub-Message-Timestamp':timestamp,
      'Twitch-Eventsub-Message-Type':'notification','Twitch-Eventsub-Message-Signature':`sha256=${signatureValid?signature:'invalid'}`,
    },body})
  }
  assert.equal((await handler(request(false))).status,403)
  assert.equal(attempt,0)
  failLookup=true
  assert.equal((await handler(request())).status,503)
  assert.equal(insertions,0)
  failLookup=false
  assert.equal((await handler(request())).status,503)
  assert.equal(insertions,1)
  assert.equal((await handler(request())).status,204)
  assert.equal(insertions,1)
  assert.equal(sends,2)
  assert.equal(stored.twitch_event_message_id,'event')
  assert.equal((await handler(request())).status,204)
  assert.equal(sends,2)
  assert.deepEqual(finishes,[false,false,true])
})
