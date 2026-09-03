import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('theme is restored before React renders and uses system preference on first visit', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')
  assert.match(html, /watchqueue-theme/)
  assert.match(html, /prefers-color-scheme: light/)
  assert.ok(html.indexOf('watchqueue-theme') < html.indexOf('/src/main.tsx'))
})

test('header exposes an accessible theme toggle and light palette', async () => {
  const [header, styles] = await Promise.all([
    readFile(new URL('../src/components/layout/Header.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/index.css', import.meta.url), 'utf8'),
  ])
  assert.match(header, /Ativar modo claro/)
  assert.match(header, /Ativar modo escuro/)
  assert.match(styles, /:root\[data-theme='light'\]/)
  assert.match(styles, /--color-bg-primary: 248 247 251/)
})
