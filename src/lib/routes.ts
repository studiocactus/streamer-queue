const RESERVED_PROFILE_PATHS = new Set(['auth', 'dashboard', 'explore', 'streamer'])

export function streamerPath(slug: string) {
  return `/${slug.toLowerCase()}`
}

export function normalizeStreamerReturnPath(path: string | null | undefined) {
  if (!path) return undefined

  const legacyMatch = path.match(/^\/streamer\/([a-z0-9_-]+)$/i)
  const slug = legacyMatch?.[1] ?? path.match(/^\/([a-z0-9_-]+)$/i)?.[1]
  if (!slug || RESERVED_PROFILE_PATHS.has(slug.toLowerCase())) return undefined

  return streamerPath(slug)
}
