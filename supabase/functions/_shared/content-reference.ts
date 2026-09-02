const metadataHosts = new Set([
  'youtube.com', 'www.youtube.com', 'youtu.be', 'music.youtube.com', 'open.spotify.com',
])

export type NormalizedContent = {
  title: string
  sourceUrl: string | null
  thumbnailUrl: string | null
}

export async function normalizeContentReference(rawValue: string): Promise<NormalizedContent> {
  const value = rawValue.trim()
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return { title: value, sourceUrl: null, thumbnailUrl: null }
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { title: value, sourceUrl: null, thumbnailUrl: null }
  }

  const sourceUrl = parsed.toString()
  const host = parsed.hostname.toLowerCase()
  const hostLabel = host.replace(/^www\./, '')
  if (!metadataHosts.has(host)) {
    return { title: `Conteúdo em ${hostLabel}`, sourceUrl, thumbnailUrl: null }
  }

  try {
    const endpoint = host.includes('spotify')
      ? `https://open.spotify.com/oembed?url=${encodeURIComponent(sourceUrl)}`
      : `https://www.youtube.com/oembed?url=${encodeURIComponent(sourceUrl)}&format=json`
    const response = await fetch(endpoint, { headers: { 'User-Agent': 'WatchQueue/1.0' } })
    if (!response.ok) throw new Error(`Metadata provider returned ${response.status}`)
    const metadata = await response.json()
    return {
      title: (metadata.title?.trim() || `Conteúdo em ${hostLabel}`).slice(0, 200),
      sourceUrl,
      thumbnailUrl: metadata.thumbnail_url ?? null,
    }
  } catch (error) {
    console.warn('[content-reference] Metadata unavailable:', error)
    return { title: `Conteúdo em ${hostLabel}`, sourceUrl, thumbnailUrl: null }
  }
}
