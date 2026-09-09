import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const migration = async (name) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`

test('chat submissions skip the site confirmation while site submissions and status events still enqueue once', async (t) => {
  const db = await PGlite.create()
  t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create function auth.uid() returns uuid language sql as $$select null::uuid$$;
    create table streamers(id uuid primary key, owner_id uuid);
    create table streamer_members(streamer_id uuid,user_id uuid);
    create table suggestions(id uuid primary key, streamer_id uuid, submitted_by uuid, status text, submission_source text, submission_priority integer, twitch_event_message_id text);
  `)
  await db.exec(await migration('0027_durable_chat_delivery_queue.sql'))
  await db.exec(await migration('0061_single_chat_confirmation.sql'))
  await db.query('insert into streamers values ($1,$2)', [id(1),id(2)])
  for (const [n, user, source, event, priority] of [[10,id(3),'platform','chat-viewer',100],[11,id(2),'platform','chat-owner',100],[12,null,'chat','chat-guest',0],[13,id(3),'platform',null,100],[14,id(2),'platform',null,100]]) {
    await db.query("insert into suggestions values ($1,$2,$3,'pending',$4,$5,$6)", [id(n),id(1),user,source,priority,event])
  }
  assert.deepEqual((await db.query('select suggestion_id,event_type from chat_delivery_queue order by suggestion_id')).rows, [
    {suggestion_id:id(13),event_type:'suggestion_received'}, {suggestion_id:id(14),event_type:'streamer_added'},
  ])
  assert.equal((await db.query('select submission_priority from suggestions where id=$1',[id(10)])).rows[0].submission_priority,100)
  for (const status of ['approved','queued','watching','completed','rejected','rejected']) await db.query('update suggestions set status=$1 where id=$2',[status,id(10)])
  assert.equal((await db.query('select * from chat_delivery_queue where suggestion_id=$1',[id(10)])).rows.length,5)
})

test('platform admin manages current and future channels; viewers remain denied and revocation is immediate', async (t) => {
  const db = await PGlite.create()
  t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.user_id',true),'')::uuid$$;
    create table platform_admins(user_id uuid);
    create function is_platform_admin(p_user_id uuid) returns boolean language sql stable security definer as $$select exists(select 1 from platform_admins where user_id=p_user_id)$$;
    create table streamers(id uuid primary key,owner_id uuid,channel_name text,slug text,avatar_url text,is_active boolean);
    create table profiles(id uuid,twitch_user_id text);
    create table suggestions(streamer_id uuid, submitted_by uuid, status text);
    create schema storage;
    create table storage.objects(bucket_id text,name text);
    create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;
    create table streamer_members(streamer_id uuid,user_id uuid,role text,permissions text[]);
    create table chat_delivery_queue(streamer_id uuid,status text,attempts integer,next_attempt_at timestamptz,locked_at timestamptz,processed_at timestamptz,last_error text,updated_at timestamptz);
    alter table streamers enable row level security;
    alter table suggestions enable row level security;
    alter table storage.objects enable row level security;
    create policy channel_read on streamers for select using(true);
    grant usage on schema public,auth to authenticated;
    grant select,update on streamers to authenticated;
    grant insert on suggestions to authenticated;
    grant usage on schema storage to authenticated;
    grant select,insert,update on storage.objects to authenticated;
    insert into platform_admins values ('${id(1)}');
    insert into profiles values ('${id(1)}','admin-twitch'),('${id(2)}','owner-twitch'),('${id(3)}','viewer-twitch');
    insert into streamers values ('${id(10)}','${id(2)}','Existing','existing',null,true);
  `)
  await db.exec(await migration('0062_platform_admin_channel_management.sql'))
  await db.exec(`insert into streamers values ('${id(11)}','${id(2)}','Future','future',null,true)`)
  const access = async (user, channel) => (await db.query("select is_streamer_member($1,$2) as member, is_streamer_owner($1,$2) as owner, has_streamer_permission($1,$2,'manage_settings') as settings",[channel,user])).rows[0]
  for (const channel of [id(10),id(11)]) {
    assert.deepEqual(await access(id(1),channel),{member:true,owner:true,settings:true})
    assert.deepEqual(await access(id(3),channel),{member:false,owner:false,settings:false})
  }
  await db.exec(`set app.user_id='${id(1)}'; set role authenticated`)
  assert.equal((await db.query('select * from get_my_moderated_channels()')).rows.length,2)
  assert.equal((await db.query("update streamers set channel_name='Admin updated' returning id")).rows.length,2)
  await db.query("insert into suggestions values ($1,$2,'approved')",[id(10),id(1)])
  await db.query("insert into storage.objects values ('streamer-assets',$1)",[`${id(10)}/cover.png`])
  assert.equal((await db.query('select * from storage.objects')).rows.length,1)
  await db.exec(`set app.user_id='${id(3)}'`)
  assert.equal((await db.query("update streamers set channel_name='Forbidden' returning id")).rows.length,0)
  assert.equal((await db.query('select * from get_my_moderated_channels()')).rows.length,0)
  await assert.rejects(db.query("insert into suggestions values ($1,$2,'approved')",[id(10),id(3)]),/row-level security/)
  await assert.rejects(db.query("insert into storage.objects values ('streamer-assets',$1)",[`${id(10)}/cover.png`]),/row-level security/)
  await assert.rejects(db.query('select retry_failed_chat_deliveries($1)',[id(10)]),/Not authorized/)
  await db.exec('reset role')
  assert.equal((await db.query("select is_twitch_chat_manager($1,'admin-twitch') as allowed",[id(10)])).rows[0].allowed,true)
  await db.exec('delete from platform_admins')
  assert.deepEqual(await access(id(1),id(10)),{member:false,owner:false,settings:false})
  assert.equal((await db.query("select is_twitch_chat_manager($1,'admin-twitch') as allowed",[id(10)])).rows[0].allowed,false)
})
