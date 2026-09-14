import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import ts from 'typescript'

test('link identity protects real duplicates without blocking different videos or generic titles', async (t) => {
  const db = await PGlite.create()
  t.after(() => db.close())
  await db.exec(`create table suggestions (streamer_id uuid, submitted_by uuid, chat_user_id text, title text, source_url text, status text);
    insert into suggestions values ('00000000-0000-0000-0000-000000000001', null, 'viewer', 'Conteúdo em m.youtube.com', 'https://m.youtube.com/watch?v=abcdefghijk', 'pending');`)
  await db.exec(await readFile(new URL('../supabase/migrations/0063_link_duplicate_identity.sql', import.meta.url), 'utf8'))
  await db.exec('create trigger guard before insert on suggestions for each row execute function guard_duplicate_suggestion()')
  const insert = (url, title = 'Conteúdo em m.youtube.com', who = 'viewer', status = 'pending') => db.query(
    "insert into suggestions values ('00000000-0000-0000-0000-000000000001',null,$1,$2,$3,$4)", [who, title, url, status])
  await insert('https://m.youtube.com/watch?v=lmnopqrstuv')
  for (const url of ['https://www.youtube.com/watch?si=tracking&v=abcdefghijk&t=10', 'https://youtu.be/abcdefghijk?si=tracking', 'https://m.youtube.com/shorts/abcdefghijk', 'https://music.youtube.com/watch?v=abcdefghijk']) {
    await assert.rejects(insert(url, 'Real video title'), /SUGGESTION_ALREADY_ACTIVE/)
  }
  await insert('https://m.youtube.com/watch?v=Abcdefghijk') // IDs are case sensitive.
  await insert('https://example.com/one')
  await insert('https://example.com/two')
  await insert(null, 'Example Film')
  await assert.rejects(insert(null, ' EXAMPLE   film '), /SUGGESTION_ALREADY_ACTIVE/)
  await insert('https://youtu.be/abcdefghijk', 'Different viewer', 'other')
  await db.exec("update suggestions set status='completed' where chat_user_id='viewer'")
  await insert('https://youtu.be/abcdefghijk')
})

test('mobile YouTube metadata uses the supported canonical host and preserves the video', async () => {
  const source = await readFile(new URL('../supabase/functions/_shared/content-reference.ts', import.meta.url), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  let requested
  new Function('exports', 'fetch', js)(exports, async (url) => { requested = url; return { ok: true, json: async () => ({ title: 'Video title' }) } })
  const content = await exports.normalizeContentReference('https://m.youtube.com/watch?v=abcdefghijk')
  assert.equal(content.title, 'Video title')
  assert.equal(content.sourceUrl, 'https://www.youtube.com/watch?v=abcdefghijk')
  assert.equal(new URL(requested).searchParams.get('url'), content.sourceUrl)
})
