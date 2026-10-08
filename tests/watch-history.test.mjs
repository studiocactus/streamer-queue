import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { youtubeVideoId, parseYoutubeDuration, fetchOriginalDuration } from '../supabase/functions/_shared/video-duration.ts'
import { reportToday, formatWatchDuration, parseWatchDuration, csvCell } from '../src/lib/watch-report.ts'
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`

test('original durations are independent of elapsed time, retained after cleanup and restricted by channel',async t=>{
 const db=await PGlite.create();t.after(()=>db.close())
 await db.exec(`create role anon; create role authenticated; create role service_role;
 create schema auth; create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.user',true),'')::uuid$$;
 create table streamers(id uuid primary key,channel_name text);
 create table streamer_members(streamer_id uuid,user_id uuid);
 create function is_platform_admin(uuid) returns boolean language sql stable security definer as $$select $1='${id(99)}'::uuid$$;
 create function can_manage_streamer(uuid) returns boolean language sql stable security definer as $$select coalesce(is_platform_admin(auth.uid()),false) or exists(select 1 from streamer_members where streamer_id=$1 and user_id=auth.uid())$$;
 create table suggestions(id uuid primary key,streamer_id uuid references streamers(id),title text,category text,source_url text,status text,started_at timestamptz,completed_at timestamptz);
 insert into streamers values('${id(1)}','Canal 1'),('${id(2)}','Canal 2');
 insert into streamer_members values('${id(1)}','${id(10)}');
 insert into suggestions values('${id(20)}','${id(1)}','Legado','other',null,'completed',now()-interval '2 hours',null);
 grant usage on schema public,auth to authenticated;
 grant select,insert,update,delete on suggestions to authenticated;`)
 await db.exec(await readFile(new URL('../supabase/migrations/0070_watch_history.sql',import.meta.url),'utf8'))
 await db.exec(`set "app.user"='${id(10)}'; set role authenticated`)
 const report=async(channel=id(1),from='2026-10-01',to='2026-10-08')=>(await db.query('select get_watch_report($1,$2,$3) as r',[channel,from,to])).rows[0].r
 assert.equal((await report()).undated,1)
 await assert.rejects(report(id(2)),/Not authorized/)
 await assert.rejects(report(null),/Not authorized/)
 await assert.rejects(report(id(1),'2026-10-08','2026-10-01'),/Invalid period/)
 await db.query("insert into suggestions(id,streamer_id,title,category,source_url,status,duration_seconds) values($1,$2,'Vídeo','other','https://youtu.be/_kD37ytFU10','watching',9999)",[id(21),id(1)])
 assert.equal((await db.query('select duration_seconds from suggestions where id=$1',[id(21)])).rows[0].duration_seconds,null)
 await assert.rejects(db.query('update suggestions set duration_seconds=9999 where id=$1',[id(21)]),/duration editor/)
 await db.exec('reset role')
 await db.query("update suggestions set duration_seconds=272,duration_source='youtube' where id=$1",[id(21)])
 await db.query("update suggestions set status='queued' where id=$1",[id(21)])
 assert.equal((await db.query('select count(*) from watch_history where suggestion_id=$1',[id(21)])).rows[0].count,0)
 await db.query("update suggestions set status='watching',started_at=now()-interval '2 hours' where id=$1",[id(21)])
 await db.query("update suggestions set status='completed' where id=$1",[id(21)])
 await db.query("update suggestions set status='completed' where id=$1",[id(21)])
 let entries=(await db.query('select * from watch_history where suggestion_id=$1',[id(21)])).rows
 assert.equal(entries.length,1);assert.equal(entries[0].duration_seconds,272)
 await db.query("update watch_history set completed_at='2026-10-08T02:59:59Z' where id=$1",[entries[0].id])
 await db.query("update suggestions set status='watching' where id=$1",[id(21)])
 await db.query("update suggestions set status='completed' where id=$1",[id(21)])
 await db.query("update watch_history set completed_at='2026-10-08T03:00:00Z' where suggestion_id=$1 and id<>$2",[id(21),entries[0].id])
 await db.exec('set role authenticated')
 let r=await report();assert.equal(r.seconds,544);assert.equal(r.completed,2)
 assert.equal(r.daily.find(x=>x.day==='2026-10-07').seconds,272)
 assert.equal(r.daily.find(x=>x.day==='2026-10-08').seconds,272)
 await db.query('select set_watch_duration($1,300)',[entries[0].id])
 assert.equal((await report()).seconds,600)
 await db.query('delete from suggestions where id=$1',[id(21)])
 r=await report();assert.equal(r.completed,2);assert.equal(r.seconds,600);assert.ok(r.entries.every(x=>x.suggestion_id===null))
 await db.query('select set_watch_duration($1,310)',[entries[0].id])
 assert.equal((await report()).seconds,610)
 await db.exec(`reset role; insert into watch_history(streamer_id,title,category,completed_at) values('${id(2)}','Outro canal','other','2026-10-08T12:00:00Z'); set role authenticated;`)
 assert.equal((await db.query('select count(*) from watch_history where streamer_id=$1',[id(2)])).rows[0].count,0)
 await db.exec(`set "app.user"='${id(99)}'`)
 r=await report(null);assert.equal(r.completed,3);assert.equal(r.unknown,1);assert.equal(r.seconds,610)
 await assert.rejects(db.query("insert into watch_history(streamer_id,title,category) values($1,'Fake','other')",[id(1)]),/permission denied/)
})

test('YouTube parsing binds duration to the requested video and excludes live/private or invalid metadata',async()=>{
 const video='_kD37ytFU10'
 for(const url of [`https://m.youtube.com/watch?v=${video}`,`https://youtu.be/${video}`,`https://www.youtube.com/shorts/${video}`]) assert.equal(youtubeVideoId(url),video)
 for(const url of ['https://youtube.com.evil.test/watch?v='+video,'file:///watch?v='+video,'https://youtube.com/watch?v=bad'])assert.equal(youtubeVideoId(url),null)
 const html=(details,status='OK')=>'var ytInitialPlayerResponse = '+JSON.stringify({playabilityStatus:{status},videoDetails:{videoId:video,lengthSeconds:'272',title:'braces } { and "',...details}})+';'
 assert.equal(parseYoutubeDuration(html({}),video),272)
 for(const details of [{videoId:'other'},{lengthSeconds:'0'},{lengthSeconds:'garbage'},{isLive:true},{isUpcoming:true}])assert.equal(parseYoutubeDuration(html(details),video),null)
 assert.equal(parseYoutubeDuration(html({},'LOGIN_REQUIRED'),video),null)
 assert.equal(parseYoutubeDuration('{"lengthSeconds":"9999"}',video),null)
 assert.equal(await fetchOriginalDuration('http://127.0.0.1/admin'),null)
})

test('dates use Brasília and manual duration/CSV formatting does not guess unknown values',()=>{
 assert.equal(reportToday(new Date('2026-10-08T02:59:59Z')),'2026-10-07')
 assert.equal(reportToday(new Date('2026-10-08T03:00:00Z')),'2026-10-08')
 assert.equal(parseWatchDuration('4:32'),272);assert.equal(parseWatchDuration('1:04:32'),3872)
 for(const invalid of ['4','0:00','-1:02','1:60:00','2:90','abc'])assert.equal(parseWatchDuration(invalid),null)
 assert.equal(formatWatchDuration(272),'4min 32s')
 assert.equal(csvCell('=SUM(A1)'), '"\'=SUM(A1)"')
})

test('duration enrichment uses bounded batches and cannot overwrite a manual value or a changed link', async()=>{
 const source=await readFile(new URL('../supabase/functions/chat-delivery-worker/index.ts',import.meta.url),'utf8')
 const body=source.slice(source.indexOf('async function refreshVideoDurations()'))
 const ts=await import('typescript')
 const calls=[]
 const admin={from(table){let update=null;const filters=[];const q={select(){return q},is(...args){filters.push(['is',...args]);return q},not(){return q},or(){return q},order(){return q},limit(n){assert.equal(n,3);return q},eq(...args){filters.push(['eq',...args]);return q},update(value){update=value;return q},then(resolve){if(update)calls.push({table,update,filters});return Promise.resolve({data:update?null:[{id:table,source_url:'https://youtu.be/_kD37ytFU10'}],error:null}).then(resolve)}};return q}}
 const js=ts.default.transpileModule(body,{compilerOptions:{target:ts.default.ScriptTarget.ES2022}}).outputText
 const run=new Function('admin','fetchOriginalDuration',js+';return refreshVideoDurations')(admin,async()=>272)
 await run()
 assert.equal(calls.length,2)
 for(const call of calls){assert.equal(call.update.duration_seconds,272);assert.ok(call.filters.some(x=>x[0]==='is'&&x[1]==='duration_seconds'&&x[2]===null));assert.ok(call.filters.some(x=>x[0]==='eq'&&x[1]==='source_url'))}
})
