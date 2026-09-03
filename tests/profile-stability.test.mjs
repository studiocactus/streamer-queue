import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeProfileLink } from '../src/lib/profileLinks.ts'
import { selectCatalogMatch } from '../supabase/functions/_shared/catalog-match.ts'

test('normalizes valid social links and rejects malformed or unsafe inputs', () => {
  assert.equal(normalizeProfileLink(' instagram.com/viewer '), 'https://instagram.com/viewer')
  for (const input of ['javascript:alert(1)', 'ftp://host.com/a', 'https://', 'https://user:pass@example.com', 'hello world', null, {}, 'localhost']) {
    assert.equal(normalizeProfileLink(input), null)
  }
})

const film = { l: 'Example', y: 1998, qid: 'movie', i: { imageUrl: 'https://m.media-amazon.com/images/example.jpg' } }
test('requires matching title, category, year and image host', () => {
  assert.equal(selectCatalogMatch([film], 'Example', 'movie', 1998), film)
  assert.equal(selectCatalogMatch([film], 'Example', 'movie', 2004), undefined)
  assert.equal(selectCatalogMatch([film], 'Example', 'series'), undefined)
  assert.equal(selectCatalogMatch([film], 'Other', 'movie'), undefined)
  assert.equal(selectCatalogMatch([film], 'Example', 'music'), undefined)
  assert.equal(selectCatalogMatch([{ ...film, i: { imageUrl: 'https://other.example/img' } }], 'Example', 'movie'), undefined)
})
test('does not guess between remakes or translated titles', () => {
  const remake = { ...film, y: 2020 }
  assert.equal(selectCatalogMatch([film, remake], 'Example', 'movie'), undefined)
  assert.equal(selectCatalogMatch([film, remake], 'Example', 'movie', 2020), remake)
  assert.equal(selectCatalogMatch([{ ...film, l: "You've Got Mail" }], 'Uma mensagem para você', 'movie', 2004), undefined)
})
