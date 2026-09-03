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
  assert.match(source, /Central da live/)
  assert.match(source, /Prepare a próxima live/)
  assert.match(source, /Concluir e avançar/)
  assert.match(source, /Página do canal/)
  assert.match(source, /Ver overlay/)
  assert.match(source, /Mais ações/)
  assert.match(source, /\[&::-webkit-details-marker\]:hidden/)
  assert.match(source, /Marcar concluído/)
})

test('public channel uses the Twitch identity and highlights a live broadcast', async () => {
  const source = await readFile(new URL('../src/pages/StreamerPage.tsx', import.meta.url), 'utf8')
  assert.match(source, /streamer\.owner\?\.twitch_login \|\| streamer\.slug/)
  assert.match(source, /Assistir ao vivo/)
  assert.match(source, /Acontecendo na live/)
  assert.match(source, /Fila preparada pelo canal/)
  assert.match(source, /Ver fila completa/)
  assert.match(source, /#\{suggestion\.queue_position\} na fila/)
})

test('viewer and streamer notifications stay actionable without noisy suggestion pop-ups', async () => {
  const header = await readFile(new URL('../src/components/layout/Header.tsx', import.meta.url), 'utf8')
  const hook = await readFile(new URL('../src/hooks/useStreamerNotifications.ts', import.meta.url), 'utf8')
  assert.match(header, /\{user && \(/)
  assert.match(header, /Marcar lidas/)
  assert.match(header, /markOneRead\(notification\.id\)/)
  assert.match(hook, /notification\.type !== 'new_suggestion'/)
  assert.match(hook, /const markOneRead/)
})

test('streamer chooses each Twitch bot message or disables every announcement', async () => {
  const source = await readFile(new URL('../src/pages/dashboard/StreamerDashboard.tsx', import.meta.url), 'utf8')
  assert.match(source, /chatTemplateEnabled/)
  assert.match(source, /enabled: chatTemplateEnabled\[eventType\]/)
  assert.match(source, /Ativar todas/)
  assert.match(source, /Desativar todas/)
  assert.match(source, /Não enviar/)
  assert.match(source, /O bot ficará em silêncio neste momento/)
  assert.match(source, /\.select\('event_type, template, enabled'\)/)
})
