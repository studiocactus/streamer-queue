import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import ts from 'typescript'
import { SYSTEM_BOT_MESSAGES, renderBotMessage } from '../supabase/functions/_shared/bot-messages.ts'
const migration = name => readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8')
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`

test('approval goes directly to ordered queue, migrates old approvals silently and emits one event', async t => {
  const db=await PGlite.create();t.after(()=>db.close())
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create function auth.uid() returns uuid language sql as $$select null::uuid$$;
    create table streamers(id uuid primary key,owner_id uuid);
    create table streamer_members(streamer_id uuid,user_id uuid);
    create table suggestions(id uuid primary key,streamer_id uuid,submitted_by uuid,status text,submission_source text default 'chat',twitch_event_message_id text,queue_position integer,approved_at timestamptz,submitted_at timestamptz default now());
    insert into streamers values('${id(1)}','${id(2)}');
    insert into suggestions(id,streamer_id,status,queue_position) values('${id(10)}','${id(1)}','queued',3),('${id(11)}','${id(1)}','approved',null),('${id(12)}','${id(1)}','pending',null);`)
  await db.exec(await migration('0027_durable_chat_delivery_queue.sql'))
  await db.exec(await migration('0061_single_chat_confirmation.sql'))
  await db.exec(await migration('0068_direct_approval_queue.sql'))
  assert.equal((await db.query('select count(*) from chat_delivery_queue')).rows[0].count,0)
  assert.deepEqual((await db.query('select status,queue_position from suggestions where id=$1',[id(11)])).rows,[{status:'queued',queue_position:4}])
  await db.query("update suggestions set status='approved' where id=$1",[id(12)])
  assert.deepEqual((await db.query('select status,queue_position from suggestions where id=$1',[id(12)])).rows,[{status:'queued',queue_position:5}])
  await db.query("update suggestions set status='queued' where id=$1",[id(12)])
  assert.deepEqual((await db.query('select event_type from chat_delivery_queue')).rows,[{event_type:'queued'}])
  for(const status of ['watching','completed']) await db.query('update suggestions set status=$1 where id=$2',[status,id(12)])
  assert.equal((await db.query('select queue_position from suggestions where id=$1',[id(12)])).rows[0].queue_position,null)
  assert.deepEqual((await db.query('select event_type from chat_delivery_queue order by event_type')).rows.map(x=>x.event_type),['completed','queued','watching_now'])
  await db.query("insert into suggestions(id,streamer_id,status) values($1,$2,'queued')",[id(13),id(1)])
  assert.equal((await db.query('select queue_position from suggestions where id=$1',[id(13)])).rows[0].queue_position,5)
})

test('all command-management outcomes expose editable message keys, preserving service-only access',async t=>{
  const db=await PGlite.create();t.after(()=>db.close())
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create table chat_message_templates(event_type text);
    create table streamer_settings(streamer_id uuid,chat_command text);
    create table chat_custom_commands(streamer_id uuid,command text,response text);
    create function is_twitch_chat_manager(uuid,text) returns boolean language sql as $$select $2='manager'$$;
    insert into streamer_settings values('${id(1)}','!sugerir');`)
  await db.exec(await migration('0069_editable_bot_messages.sql'))
  const call=async(action,cmd,response=null,user='manager')=>(await db.query('select * from manage_chat_command_from_twitch_v2($1,$2,$3,$4,$5)',[id(1),user,action,cmd,response])).rows[0]
  for(const [action,cmd,response,expected] of [['add','!discord','oi','command_added'],['add','!discord','oi','command_exists'],['edit','!discord','novo','command_updated'],['show','!discord',null,'command_show'],['remove','!discord',null,'command_removed'],['show','!discord',null,'command_missing'],['add','!filme','x','command_reserved'],['add','x','x','command_invalid'],['add','!test','', 'command_response_invalid'],['bad','!test',null,'command_action_invalid']]) {
    const result=await call(action,cmd,response);assert.equal(result.event_type,expected);assert.ok(SYSTEM_BOT_MESSAGES[result.event_type]);if(expected==='command_show')assert.equal(result.command_response,'novo')
  }
  assert.equal((await call('add','!test','x','viewer')).event_type,'command_forbidden')
  await db.exec('set role authenticated')
  await assert.rejects(call('add','!test','x'),/permission denied/)
})

test('bot replies use channel customization, may be silenced, and never append forced text',async()=>{
  const source=await readFile(new URL('../supabase/functions/twitch-eventsub/index.ts',import.meta.url),'utf8')
  const code=source.slice(source.indexOf('async function botReply('),source.indexOf('async function sendChatMessage('))
  const run=new Function('SYSTEM_BOT_MESSAGES','renderBotMessage',ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+';return botReply')(SYSTEM_BOT_MESSAGES,renderBotMessage)
  for(const row of [null,{template:'OK',enabled:true},{template:'Não enviar',enabled:false}]) {
    const filters=[];const q={select(){return q},eq(...args){filters.push(args);return q},async maybeSingle(){return {data:row,error:null}}}
    const result=await run({from:()=>q},'channel','suggestion_duplicate',{viewer:'@Ana'})
    assert.equal(result,row===null?'@Ana, essa sugestão já está na lista.':row.enabled?'OK':'')
    assert.deepEqual(filters,[['streamer_id','channel'],['event_type','suggestion_duplicate']])
  }
  assert.equal(renderBotMessage('{titulo} {viewer}',{titulo:'{viewer}',viewer:'Ana'}),'{viewer} Ana')
  assert.equal(renderBotMessage('x'.repeat(501),{}).length,500)
})
