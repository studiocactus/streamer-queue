// Share simultaneous lookups and keep memory bounded. Failed requests are not cached.
export function createThumbnailCache(now = Date.now) {
  const cache = new Map<string, { value: string | null; expires: number }>()
  const pending = new Map<string, Promise<string | null>>()
  return async (key: string, fetchThumbnail: () => Promise<string | null>) => {
    const cached = cache.get(key)
    if (cached && cached.expires > now()) return cached.value
    if (pending.has(key)) return pending.get(key)!
    const request = Promise.resolve().then(fetchThumbnail).then((value) => {
      cache.delete(key)
      cache.set(key, { value, expires: now() + (value ? 30 * 60_000 : 60_000) })
      while (cache.size > 200) cache.delete(cache.keys().next().value!)
      return value
    }).finally(() => pending.delete(key))
    pending.set(key, request)
    return request
  }
}
