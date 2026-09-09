import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const initializer = source.slice(source.indexOf('function AppInitializer('), source.indexOf('export default function App()'))
const js = ts.transpileModule(initializer, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText

function harness() {
  let callback
  let initializations = 0
  let refreshes = 0
  const timers = []
  const loading = []
  const state = {
    user: { id: 'viewer-a' },
    initialize: () => { initializations++ },
    setSession: () => {},
    setUser: (user) => { state.user = user },
    refreshProfile: async () => { refreshes++ },
    setLoading: (value) => loading.push(value),
  }
  const store = Object.assign(() => state, { getState: () => state })
  const channel = { on: () => channel, subscribe: () => channel }
  const client = { auth: { onAuthStateChange: (fn) => { callback = fn; return { data: { subscription: { unsubscribe() {} } } } } }, channel: () => channel }
  const window = { setTimeout: (fn) => timers.push(fn), addEventListener() {} }
  const document = { addEventListener() {} }
  new Function('useEffect', 'useAuthStore', 'supabase', 'window', 'document', 'React', `${js}; AppInitializer({children: null})`)(
    (effect) => effect(), store, client, window, document, { createElement() {} },
  )
  return {
    emit: (event, id = 'viewer-a') => callback(event, id ? { user: { id } } : null),
    flush: async () => { while (timers.length) timers.shift()(); await Promise.resolve() },
    loading, state,
    get initializations() { return initializations },
    get refreshes() { return refreshes },
  }
}

test('returning to the same session and renewing tokens refresh in background without restarting the app', async () => {
  const app = harness()
  app.emit('SIGNED_IN')
  app.emit('TOKEN_REFRESHED')
  assert.equal(app.refreshes, 0, 'database work must wait until outside the auth callback')
  await app.flush()
  assert.equal(app.initializations, 1)
  assert.equal(app.refreshes, 2)
  assert.deepEqual(app.loading, [])
})

test('switching accounts still waits for the new profile', async () => {
  const app = harness()
  app.emit('SIGNED_IN', 'viewer-b')
  assert.deepEqual(app.loading, [true])
  await app.flush()
  assert.deepEqual(app.loading, [true, false])
  assert.equal(app.state.user.id, 'viewer-b')
})

test('signing out cancels deferred profile work and releases the account loader', async () => {
  const app = harness()
  app.emit('SIGNED_IN', 'viewer-b')
  app.emit('SIGNED_OUT', null)
  await app.flush()
  assert.equal(app.refreshes, 0)
  assert.equal(app.state.user, null)
  assert.deepEqual(app.loading, [true, false])
})
