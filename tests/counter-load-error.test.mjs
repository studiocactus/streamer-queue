import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

test('counter load errors preserve the list; retry clears error and updates counts', async () => {
  const source = await readFile(new URL('../src/components/ChatAutomationManager.tsx', import.meta.url), 'utf8')
  const body = source.slice(source.indexOf('  const loadAutomations ='), source.indexOf('  useEffect(() =>'))
  const js = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  let mode = 'success', rows = [], error = false, loading = true
  const db = { from(table) { const q = { select() { return q }, eq() { return q }, order: async () => {
    if (table !== 'chat_command_counters') return { data: [] }
    if (mode === 'throw') throw new Error('offline')
    return mode === 'error' ? { error: new Error('unavailable'), data: null } : { data: [{ id: 'lurk', count: mode === 'retry' ? 39 : 38 }], error: null }
  } }; return q } }
  const load = new Function('db','streamerId','setTimers','setCommands','setCounters','setCountersLoading','setCountersError',js+';return loadAutomations')(
    db,'channel',()=>{},()=>{},value=>{rows=value},value=>{loading=value},value=>{error=value},
  )
  await load()
  assert.equal(rows[0].count,38)
  for (mode of ['error','throw']) {
    await load()
    assert.equal(error,true); assert.equal(loading,false); assert.equal(rows[0].count,38)
  }
  mode='retry'; await load()
  assert.equal(error,false); assert.equal(loading,false); assert.equal(rows[0].count,39)
})
