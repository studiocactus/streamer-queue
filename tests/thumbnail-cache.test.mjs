import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile(new URL('../src/lib/thumbnailCache.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const exports = {}
new Function('exports', js)(exports)
const { createThumbnailCache } = exports

test('thumbnail requests are shared and successful images reused', async () => {
  const lookup = createThumbnailCache()
  let calls = 0
  const fetch = async () => { calls++; return 'poster.jpg' }
  assert.deepEqual(await Promise.all([lookup('film', fetch), lookup('film', fetch)]), ['poster.jpg', 'poster.jpg'])
  assert.equal(await lookup('film', fetch), 'poster.jpg')
  assert.equal(calls, 1)
})

test('temporary thumbnail failures do not become permanently missing images', async () => {
  const lookup = createThumbnailCache()
  await assert.rejects(lookup('film', async () => { throw new Error('Offline') }), /Offline/)
  assert.equal(await lookup('film', async () => 'recovered.jpg'), 'recovered.jpg')
})

test('empty results and successful images expire at different intervals', async () => {
  let now = 0
  const lookup = createThumbnailCache(() => now)
  await lookup('missing', async () => null)
  await lookup('found', async () => 'first.jpg')
  now = 60_001
  assert.equal(await lookup('missing', async () => 'available.jpg'), 'available.jpg')
  assert.equal(await lookup('found', async () => 'second.jpg'), 'first.jpg')
  now = 30 * 60_000 + 1
  assert.equal(await lookup('found', async () => 'second.jpg'), 'second.jpg')
})

test('thumbnail cache stays bounded while different titles remain separate', async () => {
  const lookup = createThumbnailCache()
  for (let i = 0; i < 201; i++) await lookup(`film-${i}`, async () => `poster-${i}`)
  assert.equal(await lookup('film-0', async () => 'refetched'), 'refetched')
  assert.equal(await lookup('film-200', async () => 'unexpected'), 'poster-200')
})
