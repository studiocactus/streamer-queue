import { SYSTEM_BOT_MESSAGES, renderBotMessage } from '../supabase/functions/_shared/bot-messages.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const compile = text => ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText

test('film submissions are categorized separately; votes and ordinary messages are not suggestions', async () => {
  const source = await readFile(new URL('../supabase/functions/twitch-eventsub/index.ts',import.meta.url),'utf8')
  const body = source.slice(source.indexOf('async function processNotification('),source.indexOf('async function handleChatCommandManagement('))
  const inserted = [], sent = []
  const client = {
    rpc: async name => ({ data: name === 'claim_twitch_event_command' ? true : [], error:null }),
    from(table) {
      let row
      const query = { select(){return query},eq(){return query},in(){return query},limit(){return query},maybeSingle(){return query},single(){return query},insert(value){row=value;return query},then(resolve){
        if(table === 'suggestions' && row) inserted.push(row)
        return Promise.resolve({error:null,data:table === 'streamers' ? {id:'channel',is_active:true,settings:{chat_command:'!sugerir',chat_command_enabled:true}} : table === 'suggestions' && row ? {id:'saved'} : null}).then(resolve)
      }}
      return query
    },
  }
  const run = new Function('botReply','normalizeContentReference','sendChatMessage',compile(body)+';return processNotification')(
    async (_admin,_channel,event,values)=>renderBotMessage(SYSTEM_BOT_MESSAGES[event].template,values),
    async title=>({title,sourceUrl:null,thumbnailUrl:null}), async(...args)=>{sent.push(args[3]);return {sent:true}},
  )
  for (const text of ['!filme Matrix','!sugerir A video','hello there','!filme2','!filme']) {
    await run(client,{subscription:{type:'channel.chat.message'},event:{broadcaster_user_id:'channel',chatter_user_id:'viewer',chatter_user_login:'viewer',message:{text}}},text,1)
  }
  assert.deepEqual(inserted.map(x=>[x.title,x.category]),[['Matrix','movie'],['A video','other']])
  assert.ok(sent.at(-1).includes('use !filme'))
})

test('opening announcements settle only after Twitch accepts and retain failed chunks for retry', async () => {
  const source = await readFile(new URL('../supabase/functions/chat-delivery-worker/index.ts',import.meta.url),'utf8')
  const body = source.slice(source.indexOf('async function announceStartedFilmPolls()'),source.indexOf('async function announceEndedFilmPolls()'))
  for (const accepted of [true,false]) {
    let claimed = false
    const settled = [], messages = []
    const admin = {
      rpc:async(name,args)=>{
        if(name==='claim_film_poll_announcement') {const data=claimed?[]:[{id:'part',attempt:2,streamer_id:'channel',message:'!filme1 — Matrix | !filme2 — Alien'}];claimed=true;return {data}}
        settled.push(args);return {data:true}
      },
      from(table){const q={select(){return q},eq(){return q},maybeSingle:async()=>({data:table==='twitch_connections'?{broadcaster_id:'owner'}:{access_token:'token'}})};return q},
    }
    const run = new Function('SYSTEM_BOT_MESSAGES','renderBotMessage','admin','validAccessToken','fetch','TWITCH_CLIENT_ID',compile(body)+';return announceStartedFilmPolls')(
      SYSTEM_BOT_MESSAGES,renderBotMessage,admin,async()=> 'token',async(_url,options)=>{messages.push(JSON.parse(options.body).message);return {ok:true,status:200,json:async()=>({data:[{is_sent:accepted}]})}},'client',
    )
    await run()
    assert.equal(messages.length,1);assert.ok(messages[0].includes('!filme2 — Alien'))
    assert.equal(settled[0].p_sent,accepted);assert.equal(settled[0].p_attempt,2)
    assert.equal(Boolean(settled[0].p_error),!accepted)
  }
})
