import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { PGlite } from '@electric-sql/pglite'

test('0037 queue recovery, terminal outcomes and restricted access', async (t) => {
  const db = await PGlite.create()
  t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create function auth.uid() returns uuid language sql as $$select null::uuid$$;
    create table streamers(id uuid primary key, owner_id uuid);
    create table suggestions(id uuid primary key, streamer_id uuid, submitted_by uuid, status text, submission_source text);
    create table streamer_members(streamer_id uuid,user_id uuid);
    create table chat_message_logs(status text constraint chat_message_logs_status_check check(status in ('sent','failed','simulated')));
  `)
  for (const file of ['0027_durable_chat_delivery_queue.sql', '0037_chat_delivery_recovery.sql']) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'))
  }
  const channel = '00000000-0000-0000-0000-000000000001'
  const suggestion = '00000000-0000-0000-0000-000000000002'
  await db.query('insert into streamers(id) values ($1)', [channel])
  await db.query("insert into suggestions(id,streamer_id,status,submission_source) values ($1,$2,'pending','chat')", [suggestion, channel])
  await db.query("update suggestions set status='completed' where id=$1", [suggestion])
  const claim = async () => (await db.query('select * from claim_chat_delivery()')).rows[0]
  const settle = async (item, status, attempt = item.attempts) => (await db.query(
    'select settle_chat_delivery($1,$2,$3,$4) as ok', [item.id, attempt, status, 'Test reason'])).rows[0].ok

  await t.test('completion enqueues once, claims exclude already processing deliveries', async () => {
    const item = await claim()
    assert.equal(item.event_type, 'completed')
    assert.equal(item.attempts, 1)
    assert.equal(await claim(), undefined)
    assert.equal(await settle(item, 'failed'), true)
    assert.equal(await claim(), undefined) // Backoff is respected.
  })
  await t.test('expired leases recover; stale workers cannot settle a newer attempt', async () => {
    await db.exec("update chat_delivery_queue set next_attempt_at=now()-interval '1 second'")
    const old = await claim()
    await db.exec("update chat_delivery_queue set locked_at=now()-interval '3 minutes'")
    const current = await claim()
    assert.equal(current.attempts, old.attempts + 1)
    assert.equal(await settle(old, 'sent'), false)
    assert.equal(await settle(current, 'skipped'), true)
    assert.equal(await claim(), undefined)
    assert.equal((await db.query('select status from chat_delivery_queue')).rows[0].status, 'skipped')
  })
  await t.test('crash on final attempt becomes visible failure, not a permanently stuck item', async () => {
    await db.exec("update chat_delivery_queue set status='processing', attempts=max_attempts, locked_at=now()-interval '3 minutes'")
    assert.equal(await claim(), undefined)
    const row = (await db.query('select * from chat_delivery_queue')).rows[0]
    assert.equal(row.status, 'failed')
    assert.match(row.last_error, /interrompido/)
  })
  await t.test('only backend roles can claim and settle', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`)
      try { await assert.rejects(db.query('select * from public.claim_chat_delivery()'), /permission denied/) }
      finally { await db.exec('reset role') }
      assert.equal((await db.query("select has_function_privilege($1,'public.settle_chat_delivery(uuid,integer,text,text)','EXECUTE') as ok", [role])).rows[0].ok, false)
    }
  })
})

async function handlerFor(file, client, fakeFetch) {
  const source = (await readFile(new URL(`../supabase/functions/${file}/index.ts`, import.meta.url), 'utf8'))
    .replace(/^import .* from .*\r?\n/gm, '')
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
  let handler
  const deno = { env: { get: (key) => key === 'CHAT_WORKER_SECRET' ? 'test-secret' : 'https://example.invalid' }, serve: (fn) => { handler = fn } }
  new Function('createClient', 'Deno', 'fetch', js)(() => client, deno, fakeFetch)
  return handler
}

test('browser endpoint can only wake existing, authorized queue deliveries', async (t) => {
  for (const scenario of ['pending', 'sent', 'skipped', 'missing', 'forbidden', 'unauthorized']) {
    await t.test(scenario, async () => {
      const wakes = []
      const client = {
        auth: { getUser: async () => ({ data: { user: scenario === 'unauthorized' ? null : { id: 'viewer' } }, error: null }) },
        from(table) {
          const query = {
            select() { return query }, eq() { return query }, in() { return query },
            maybeSingle() { return query }, single() { return query },
            then(resolve, reject) {
              const data = table === 'suggestions' ? { submitted_by: 'viewer' }
                : table === 'streamer_members' ? null
                : scenario === 'missing' ? null : { id: 'delivery', status: scenario, last_error: null }
              return Promise.resolve({ data, error: null }).then(resolve, reject)
            },
          }
          return query
        },
      }
      const handler = await handlerFor('twitch-chat', client, async (url, options) => {
        assert.match(url, /\/chat-delivery-worker$/)
        wakes.push(JSON.parse(options.body))
        return new Response('{}')
      })
      const response = await handler(new Request('https://example.invalid', { method: 'POST', headers: { Authorization: 'Bearer fake' }, body: JSON.stringify({
        streamer_id: 'channel', suggestion_id: 'suggestion', event_type: scenario === 'forbidden' ? 'completed' : 'suggestion_received',
      }) }))
      assert.equal(response.status, scenario === 'missing' ? 404 : scenario === 'forbidden' ? 403 : scenario === 'unauthorized' ? 401 : 200)
      assert.equal(wakes.length, scenario === 'pending' ? 1 : 0)
      if (wakes.length) assert.deepEqual(wakes[0], { delivery_id: 'delivery', limit: 1 })
    })
  }
})

test('actual delivery worker handles completion, skips and failures without real Twitch access', async (t) => {
  for (const scenario of ['sent', 'disabled', 'template-disabled', 'settings-error', 'previous-error', 'dropped', 'already-sent']) {
    await t.test(scenario, async () => {
      const logs = [], settlements = [], requests = []
      const item = { id: 'delivery', streamer_id: 'channel', suggestion_id: 'suggestion', event_type: 'completed', attempts: 1 }
      const client = {
        rpc: async (name, args) => {
          if (name === 'claim_chat_delivery') return { data: [item], error: null }
          settlements.push(args); return { data: true, error: null }
        },
        from(table) {
          let operation = 'select'
          const query = {
            select() { return query }, eq() { return query }, limit() { return query },
            insert(value) { operation = 'insert'; logs.push(value); return query },
            update() { operation = 'update'; return query },
            maybeSingle() { return query },
            then(resolve, reject) {
              let data = null, error = null
              if (operation === 'select') {
                if (table === 'suggestions') data = { ...item, title: 'Filme concluído', category: 'movie', submitted_by: 'viewer' }
                if (table === 'profiles') data = { display_name: 'Viewer Teste' }
                if (table === 'twitch_connections') data = { broadcaster_id: 'channel', token_status: 'active' }
                if (table === 'twitch_chat_credentials') data = { access_token: 'fake', expires_at: '2099-01-01' }
                if (table === 'streamer_settings') data = { chat_notifications_enabled: scenario !== 'disabled' }
                if (table === 'chat_message_templates' && scenario === 'template-disabled') data = { enabled: false }
                if (table === 'chat_message_logs' && scenario === 'already-sent') data = { id: 'previous' }
                if ((table === 'streamer_settings' && scenario === 'settings-error') || (table === 'chat_message_logs' && scenario === 'previous-error')) error = new Error('Database unavailable')
              }
              return Promise.resolve({ data, error }).then(resolve, reject)
            },
          }
          return query
        },
      }
      const handler = await handlerFor('chat-delivery-worker', client, async (url, options) => {
        requests.push(JSON.parse(options.body))
        return new Response(JSON.stringify({ data: [{ is_sent: scenario !== 'dropped', drop_reason: { message: 'Not allowed' } }] }))
      })
      const response = await handler(new Request('https://example.invalid', { method: 'POST', headers: { 'x-chat-worker-secret': 'test-secret' }, body: JSON.stringify({ delivery_id: item.id }) }))
      assert.equal(response.status, 200)
      const expected = ['disabled', 'template-disabled'].includes(scenario) ? 'skipped'
        : ['settings-error', 'previous-error', 'dropped'].includes(scenario) ? 'failed' : 'sent'
      assert.equal(settlements[0].p_status, expected)
      assert.equal(requests.length, ['sent', 'dropped'].includes(scenario) ? 1 : 0)
      if (scenario === 'sent') {
        assert.match(requests[0].message, /Filme concluído/)
        assert.match(requests[0].message, /Viewer Teste/)
        assert.equal(logs[0].status, 'sent')
      }
      if (expected === 'skipped') assert.equal(logs[0].status, 'skipped')
    })
  }
})
