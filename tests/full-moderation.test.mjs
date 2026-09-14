import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('full moderation follows channel membership and revocation without granting global access', async (t) => {
  const db = await PGlite.create()
  t.after(() => db.close())
  const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
  await db.exec(`
    create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create function is_platform_admin(uuid) returns boolean language sql stable as $$select false$$;
    create table streamers(id uuid,owner_id uuid,channel_name text,slug text,avatar_url text,twitch_broadcaster_id text);
    create table streamer_members(streamer_id uuid,user_id uuid,role text,permissions text[]);
    create table profiles(id uuid,twitch_user_id text);
    create function is_streamer_owner(uuid,uuid) returns boolean language sql stable security definer as $$select exists(select 1 from streamers where id=$1 and owner_id=$2)$$;
    create function can_manage_streamer(uuid) returns boolean language sql stable security definer as $$select is_streamer_owner($1,auth.uid()) or exists(select 1 from streamer_members where streamer_id=$1 and user_id=auth.uid() and role in ('owner','moderator'))$$;
    create table suggestions(streamer_id uuid,submitted_by uuid);
    create schema storage;
    create table storage.objects(bucket_id text,name text);
    create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
  `)
  for (const table of ['chat_message_templates','banned_users','chat_delivery_queue','streamer_notifications']) {
    await db.exec(`create table ${table}(streamer_id uuid, value text); alter table ${table} enable row level security;`)
  }
  await db.exec(await readFile(new URL('../supabase/migrations/0064_full_channel_moderation.sql',import.meta.url),'utf8'))
  await db.query('insert into streamers(id,owner_id) values ($1,$3),($2,$3)',[id(1),id(2),id(9)])
  await db.query("insert into streamer_members values ($1,$2,'moderator','{}')",[id(1),id(3)])
  await db.query("insert into chat_message_templates values ($1,'old'),($2,'other')",[id(1),id(2)])
  await db.exec('grant usage on schema auth,public to authenticated; grant all on all tables in schema public to authenticated;')
  await db.query("select set_config('test.uid',$1,false)",[id(3)])
  await db.exec('set role authenticated')
  assert.equal((await db.query("select has_streamer_permission($1,auth.uid(),'manage_settings') as allowed",[id(1)])).rows[0].allowed,true)
  assert.equal((await db.query("update chat_message_templates set value='custom bot message' where streamer_id=$1 returning value",[id(1)])).rows.length,1)
  assert.equal((await db.query("update chat_message_templates set value='forbidden' where streamer_id=$1 returning value",[id(2)])).rows.length,0)
  await assert.rejects(db.query("insert into chat_message_templates values ($1,'forbidden')",[id(2)]),/row-level security/)
  assert.equal((await db.query('select * from get_my_moderated_channels()')).rows.length,1)
  await assert.rejects(db.query('update streamers set owner_id=$1 where id=$2',[id(3),id(1)]),/CHANNEL_IDENTITY_IMMUTABLE/)
  await db.exec('reset role')
  await db.query('delete from streamer_members where user_id=$1',[id(3)])
  await db.exec('set role authenticated')
  assert.equal((await db.query("update chat_message_templates set value='revoked' returning value")).rows.length,0)
  assert.equal((await db.query('select * from get_my_moderated_channels()')).rows.length,0)
})
