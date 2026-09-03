import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('streamer dashboard follows live state without requiring a reload', async () => {
  const source = await readFile(new URL('../src/pages/dashboard/StreamerDashboard.tsx', import.meta.url), 'utf8')
  assert.match(source, /streamer-dashboard-live-/)
  assert.match(source, /postgres_changes/)
  assert.match(source, /twitch-status/)
  assert.match(source, /Ao vivo agora/)
  assert.match(source, /Canal offline/)
})

test('public channel uses the Twitch identity and highlights a live broadcast', async () => {
  const source = await readFile(new URL('../src/pages/StreamerPage.tsx', import.meta.url), 'utf8')
  assert.match(source, /streamer\.owner\?\.twitch_login \|\| streamer\.slug/)
  assert.match(source, /Assistir ao vivo/)
})
