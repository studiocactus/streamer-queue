import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
async function setup(t){
 const db=await PGlite.create();t.after(()=>db.close())
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.user',true),'')::uuid$$;
 create table streamers(id uuid primary key); create table profiles(id uuid primary key,display_name text,twitch_login text);
 create function can_manage_streamer(uuid) returns boolean language sql stable as $$ select coalesce(auth.uid()='${id(10)}'::uuid and $1='${id(1)}'::uuid,false) $$;
 create table suggestions(id uuid primary key,streamer_id uuid references streamers(id),title text,submitted_by uuid,source_url text,status text,queue_position integer,submitted_at timestamptz default now(),started_at timestamptz,completed_at timestamptz);
 create table completions(id uuid);
 create function record_end() returns trigger language plpgsql as $$begin if new.status='completed' and old.status<>'completed' then insert into completions values(new.id);end if;return new;end;$$;
 create trigger record_end after update on suggestions for each row execute function record_end();
 insert into streamers values('${id(1)}'),('${id(2)}');
 insert into suggestions(id,streamer_id,title,source_url,status,queue_position) values
 ('${id(20)}','${id(1)}','Primeiro','https://m.youtube.com/watch?v=_kD37ytFU10','queued',1),
 ('${id(21)}','${id(1)}','Segundo','https://youtu.be/ZY9X0JhDXQs','queued',2);
 grant usage on schema public,auth to anon,authenticated;`)
 await db.exec(await readFile(new URL('../supabase/migrations/0071_obs_player.sql',import.meta.url),'utf8'))
 await db.exec(await readFile(new URL('../supabase/migrations/0072_obs_deleted_item.sql',import.meta.url),'utf8'))
 await db.exec(await readFile(new URL('../supabase/migrations/0073_obs_submitter.sql',import.meta.url),'utf8'))
 const manage=async(action='get',value=null,channel=id(1))=>(await db.query('select obs_manage($1,$2,$3) r',[channel,action,value])).rows[0].r
 const receive=async(token,revision=-1,event='tick',position=0,duration=0,client=id(30))=>(await db.query('select obs_receiver($1,$2,$3,$4,$5,$6) r',[token,client,revision,event,position,duration])).rows[0].r
 const staff=()=>db.exec(`set "app.user"='${id(10)}';set role authenticated`)
 const anonymous=()=>db.exec('reset role;set role anon')
 await staff();return{db,manage,receive,staff,anonymous}
}
test('OBS capability and staff permissions are channel-scoped; only one receiver holds the lease',async t=>{
 const{db,manage,receive,staff,anonymous}=await setup(t)
 assert.equal(await manage(),null)
 await assert.rejects(manage('enable',null,id(2)),/Acesso negado/)
 const p=await manage('enable');assert.match(p.token,/^[a-f0-9]{64}$/)
 assert.equal((await manage()).token,undefined)
 await assert.rejects(db.query('select * from obs_playback'),/permission denied/)
 await anonymous();await assert.rejects(manage(),/permission denied/)
 await assert.rejects(receive('bad'),/inválido/)
 let r=await receive(p.token);assert.equal(r.connected,true);assert.equal(r.automatic,false)
 await assert.rejects(receive(p.token,-1,'tick',0,0,id(31)),/Outra fonte/)
 await assert.rejects(db.query('select obs_pick_next($1)',[id(1)]),/permission denied/)
 await staff();const fresh=await manage('rotate');assert.notEqual(fresh.token,p.token)
 await anonymous();await assert.rejects(receive(p.token),/revogado/);assert.equal((await receive(fresh.token)).state,'idle')
})
test('PLAYING acknowledges queue start; only a genuine end completes once, then delay and auto advance',async t=>{
 const{db,manage,receive,staff,anonymous}=await setup(t);const p=await manage('enable')
 await assert.rejects(manage('start'),/Conecte/)
 await anonymous();await receive(p.token);await staff();let r=await manage('start');assert.equal(r.state,'loading')
 await db.exec('reset role');assert.equal((await db.query('select status from suggestions where id=$1',[id(20)])).rows[0].status,'queued')
 await anonymous();r=await receive(p.token,r.revision,'playing',1,100);assert.equal(r.state,'playing')
 await staff();await manage('automatic',1);await anonymous()
 let early=await receive(p.token,r.revision,'ended',2,100);assert.equal(early.state,'playing')
 let end=await receive(p.token,r.revision,'ended',100,100);assert.equal(end.state,'countdown');assert.equal(end.countdown,3)
 assert.equal((await receive(p.token,r.revision,'ended',100,100)).state,'countdown')
 await db.exec('reset role');assert.equal((await db.query('select count(*) n from completions')).rows[0].n,1)
 await db.query("update obs_playback set next_at=now()-interval '1 second' where streamer_id=$1",[id(1)])
 await anonymous();r=await receive(p.token,end.revision);assert.equal(r.suggestion_id,id(21));assert.equal(r.state,'loading')
 assert.equal((await receive(p.token,end.revision,'ended',100,100)).state,'loading')
 r=await receive(p.token,r.revision,'playing',1,30);r=await receive(p.token,r.revision,'ended',30,30)
 await db.exec('reset role');await db.query("update obs_playback set next_at=now()-interval '1 second' where streamer_id=$1",[id(1)])
 await anonymous();r=await receive(p.token,r.revision);assert.equal(r.state,'idle');assert.equal(r.automatic,false)
})
test('pause, cancellation, errors, lease expiry and external queue changes never fabricate completion',async t=>{
 const{db,manage,receive,staff,anonymous}=await setup(t);const p=await manage('enable');await anonymous();await receive(p.token);await staff()
 let r=await manage('start');await anonymous();r=await receive(p.token,r.revision,'playing',10,100);await staff()
 const old=r.revision;r=await manage('pause');await anonymous();assert.equal((await receive(p.token,old,'ended',100,100)).state,'paused')
 await staff();r=await manage('resume');await anonymous();r=await receive(p.token,r.revision,'blocked');assert.equal(r.automatic,false);assert.equal(r.state,'blocked')
 r=await receive(p.token,r.revision,'playing',11,100);assert.equal(r.state,'playing')
 await staff();await manage('automatic',1);await anonymous();r=await receive(p.token,r.revision,'ended',100,100)
 await staff();r=await manage('automatic',0);assert.equal(r.state,'ended');assert.equal(r.next_at,null)
 r=await manage('start');await anonymous();r=await receive(p.token,r.revision,'error');assert.equal(r.state,'error')
 await staff();r=await manage('start');await db.exec('reset role');await db.query("update obs_playback set lease_until=now()-interval '1 second' where streamer_id=$1",[id(1)])
 await anonymous();r=await receive(p.token,r.revision,'playing',1,100);assert.equal(r.state,'paused');assert.equal(r.automatic,false)
 await staff();r=await manage('resume');await db.exec('reset role');await db.query("update suggestions set status='rejected' where id=$1",[id(21)])
 await anonymous();r=await receive(p.token,r.revision,'playing');assert.equal(r.state,'idle')
 await db.exec('reset role');assert.equal((await db.query('select count(*) n from completions')).rows[0].n,1)
})
test('URL validation rejects lookalike hosts and non-video input; options enforce bounds',async t=>{
 const{db,manage}=await setup(t);await manage('enable')
 for(const [action,value] of [['gap',0],['gap',31],['volume',101],['automatic',2]])await assert.rejects(manage(action,value))
 await db.exec('reset role')
 for(const url of ['https://youtube.com.evil.org/watch?v=_kD37ytFU10','file:///watch?v=_kD37ytFU10','https://evil.com/?v=_kD37ytFU10','https://youtube.com/watch?v=short'])assert.equal((await db.query('select obs_video_id($1) v',[url])).rows[0].v,null)
 for(const url of ['https://youtube.com/watch?v=_kD37ytFU10&t=10','https://m.youtube.com/watch?x=1&v=_kD37ytFU10','https://youtube.com/shorts/_kD37ytFU10'])assert.equal((await db.query('select obs_video_id($1) v',[url])).rows[0].v,'_kD37ytFU10')
})

test('deleting or requeueing a playing item stops the receiver without a completion',async t=>{
 const{db,manage,receive,staff,anonymous}=await setup(t);const p=await manage('enable');await anonymous();await receive(p.token);await staff();let r=await manage('start');await anonymous();r=await receive(p.token,r.revision,'playing',10,100);
 await db.exec('reset role');await db.query("update suggestions set status='queued' where id=$1",[id(20)]);await anonymous();r=await receive(p.token,r.revision,'playing',11,100);assert.equal(r.state,'idle');
 await staff();r=await manage('start');await anonymous();r=await receive(p.token,r.revision,'playing',10,100);await db.exec('reset role');await db.query('delete from suggestions where id=$1',[id(20)]);await anonymous();r=await receive(p.token,r.revision,'ended',100,100);assert.equal(r.state,'idle');
 await db.exec('reset role');assert.equal((await db.query('select count(*) n from completions')).rows[0].n,0);
})

test('receiver exposes only the display name of the selected submitter',async t=>{
 const{db,manage,receive,staff,anonymous}=await setup(t);const p=await manage('enable');await db.exec('reset role');await db.query('insert into profiles values($1,$2,$3)',[id(50),'Viewer de teste','viewer']);await db.query('update suggestions set submitted_by=$1 where id=$2',[id(50),id(20)]);await anonymous();await receive(p.token);await staff();const r=await manage('start');assert.equal(r.submitted_by_name,'Viewer de teste');assert.equal(r.submitted_by,undefined);await anonymous();assert.equal((await receive(p.token)).submitted_by_name,'Viewer de teste');
})
