type Candidate = { l?: string; y?: number; qid?: string; i?: { imageUrl?: string } }

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// Search ranking alone is not evidence of identity, especially for translated titles.
export function selectCatalogMatch(items: Candidate[], title: string, category: string, year?: number) {
  const kinds = category === 'movie' ? ['movie', 'tvMovie']
    : category === 'series' || category === 'anime' ? ['tvSeries', 'tvMiniSeries', ...(category === 'anime' ? ['movie', 'tvMovie'] : [])] : []
  const matches = items.filter((item) => {
    if (!item.l || normalize(item.l) !== normalize(title) || !kinds.includes(item.qid ?? '')) return false
    if (year != null && item.y !== year) return false
    try {
      const image = new URL(item.i?.imageUrl ?? '')
      return image.protocol === 'https:' && image.hostname === 'm.media-amazon.com'
    } catch { return false }
  })
  return matches.length === 1 ? matches[0] : undefined
}
