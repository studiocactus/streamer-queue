import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const workerUrl = new URL('../supabase/functions/twitch-eventsub-sync/index.ts', import.meta.url)
const migrationUrl = new URL('../supabase/migrations/0041_frequent_eventsub_reconciliation.sql', import.meta.url)

test('EventSub reconciliation inventories paginated subscriptions before creating missing ones', async () => {
  const worker = await readFile(workerUrl, 'utf8')
  const inventoryPosition = worker.indexOf('eventsub/subscriptions?')
  const creationPosition = worker.indexOf("fetch('https://api.twitch.tv/helix/eventsub/subscriptions',", inventoryPosition)

  assert.ok(inventoryPosition > 0)
  assert.ok(creationPosition > inventoryPosition)
  assert.match(worker, /pagination\?: \{ cursor\?: string \}/)
  assert.match(worker, /webhook_callback_verification_pending/)
  assert.match(worker, /if \(!subscriptionInventoryComplete\) continue/)
})

test('EventSub reconciliation runs every fifteen minutes', async () => {
  const migration = await readFile(migrationUrl, 'utf8')
  assert.match(migration, /'\*\/15 \* \* \* \*'/)
  assert.match(migration, /watchqueue-eventsub-sync/)
})
