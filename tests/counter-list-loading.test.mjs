import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

test('counter refresh preserves saved rows on errors and opens existing lurk participants', async () => {
  const source = await readFile(new URL('../src/components/ChatAutomationManager.tsx', import.meta.url), 'utf8')
  const body = source.slice(source.indexOf('  const loadAutomations ='), source.indexOf('  useEffect(() =>'))
  const js = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  const lurk = { id: 'lurk', command: '!lurk', count: 38 }
  let failed = false, rows = [lurk], error = false, expanded = null
  const requested = []
  const db = { from(table) { const query = { select() { return query }, eq() { return query }, order: async () => table === 'chat_command_counters' ? { data: failed ? null : [lurk], error: failed ? new Error('offline') : null } : { data: [] } }; return query } }
  const load = new Function('db','streamerId','setTimers','setCommands','setCountersLoading','setCountersError','setCounters','openedLurk','setExpandedCounterId','loadCounterValues', js + '; return loadAutomations')(
    db, 'channel', () => {}, () => {}, () => {}, value => { error = value }, value => { rows = value }, { current: false }, value => { expanded = value }, async value => { requested.push(value) },
  )
  await load()
  assert.equal(expanded, 'lurk')
  assert.deepEqual(requested, ['lurk'])
  failed = true
  await load()
  assert.equal(error, true)
  assert.equal(rows[0].count, 38)
  failed = false
  await load()
  assert.equal(error, false)
  assert.deepEqual(requested, ['lurk'], 'refresh does not forcibly reopen a collapsed list')
})
