const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

const allowedHosts = new Set(['youtube.com', 'www.youtube.com', 'youtu.be', 'music.youtube.com', 'open.spotify.com'])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders })

  try {
    const { url, title, category, release_year } = await req.json()
    if (!url && typeof title === 'string' && title.trim()) {
      const cleanTitle = title.trim().slice(0, 200)
      const searchKey = cleanTitle.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase()
      const response = await fetch(`https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(searchKey)}.json`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WatchQueue/1.0)' },
      })
      if (!response.ok) throw new Error(`Catalog returned ${response.status}`)
      const metadata = await response.json() as { d?: Array<{ l?: string; y?: number; qid?: string; i?: { imageUrl?: string } }> }
      const allowedKinds = category === 'series' ? new Set(['tvSeries', 'tvMiniSeries']) : category === 'movie' ? new Set(['movie', 'tvMovie']) : null
      const candidates = metadata.d?.slice(0, 3) ?? []
      const match = candidates.find((item) => item.i?.imageUrl && (!allowedKinds || allowedKinds.has(item.qid ?? '')))
        ?? candidates.find((item) => item.i?.imageUrl)
      return new Response(JSON.stringify({
        title: match?.l ?? cleanTitle,
        release_year: match?.y ?? release_year ?? null,
        thumbnail_url: match?.i?.imageUrl ?? null,
        provider_name: 'IMDb',
      }), { headers: { ...corsHeaders, 'Cache-Control': 'public, max-age=86400' } })
    }

    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || !allowedHosts.has(parsed.hostname.toLowerCase())) {
      return new Response(JSON.stringify({ error: 'Unsupported content URL' }), { status: 400, headers: corsHeaders })
    }

    const endpoint = parsed.hostname.includes('spotify')
      ? `https://open.spotify.com/oembed?url=${encodeURIComponent(parsed.toString())}`
      : `https://www.youtube.com/oembed?url=${encodeURIComponent(parsed.toString())}&format=json`
    const response = await fetch(endpoint, { headers: { 'User-Agent': 'WatchQueue/1.0' } })
    if (!response.ok) throw new Error(`Metadata provider returned ${response.status}`)
    const metadata = await response.json()

    return new Response(JSON.stringify({
      title: metadata.title ?? null,
      author_name: metadata.author_name ?? null,
      thumbnail_url: metadata.thumbnail_url ?? null,
      provider_name: metadata.provider_name ?? (parsed.hostname.includes('spotify') ? 'Spotify' : 'YouTube'),
    }), { headers: corsHeaders })
  } catch (error) {
    console.error('content-metadata:', error)
    return new Response(JSON.stringify({ error: 'Metadata unavailable' }), { status: 422, headers: corsHeaders })
  }
})
