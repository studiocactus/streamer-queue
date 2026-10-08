export function youtubeVideoId(value: string): string | null {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    const host = url.hostname.toLowerCase()
    let id: string | null = null
    if (host === 'youtu.be') id = url.pathname.split('/')[1]
    if (['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com'].includes(host)) {
      id = url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(shorts|embed|live)\//.test(url.pathname) ? url.pathname.split('/')[2] : null
    }
    return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null
  } catch { return null }
}

// Read only the selected video's player data, not durations of suggested videos.
export function parseYoutubeDuration(html: string, id: string): number | null {
  const marker = /(?:var\s+)?ytInitialPlayerResponse\s*=\s*/g
  let match: RegExpExecArray | null
  while ((match = marker.exec(html))) {
    const start = marker.lastIndex
    if (html[start] !== '{') continue
    let depth = 0, quoted = false, escaped = false
    for (let i = start; i < html.length; i++) {
      const char = html[i]
      if (quoted) {
        if (escaped) escaped = false
        else if (char === '\\') escaped = true
        else if (char === '"') quoted = false
        continue
      }
      if (char === '"') quoted = true
      else if (char === '{') depth++
      else if (char === '}' && --depth === 0) {
        try {
          const data = JSON.parse(html.slice(start, i + 1))
          const video = data.videoDetails
          const seconds = Number(video?.lengthSeconds)
          if (video?.videoId === id && data.playabilityStatus?.status === 'OK' && !video.isLive && !video.isUpcoming && !data.microformat?.playerMicroformatRenderer?.liveBroadcastDetails?.isLiveNow && Number.isSafeInteger(seconds) && seconds > 0 && seconds <= 604800) return seconds
        } catch { /* Missing or changed metadata stays unknown. */ }
        break
      }
    }
  }
  return null
}

export async function fetchOriginalDuration(url: string): Promise<number | null> {
  const id = youtubeVideoId(url)
  if (!id) return null
  try {
    const response = await fetch(`https://www.youtube.com/watch?v=${id}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WatchQueue/1.0)', 'Accept-Language': 'pt-BR,pt;q=0.9' },
      signal: AbortSignal.timeout(4000), redirect: 'error',
    })
    if (!response.ok || !response.body) return null
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let length = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        length += value.length
        if (length > 3_000_000) return null
        chunks.push(value)
      }
    } finally { await reader.cancel().catch(() => {}) }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    return parseYoutubeDuration(new TextDecoder().decode(bytes), id)
  } catch { return null }
}
