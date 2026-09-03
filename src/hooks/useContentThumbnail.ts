import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const thumbnailCache = new Map<string, string | null>()

export function useContentThumbnail(
  sourceUrl?: string | null,
  storedThumbnail?: string | null,
  content?: { title?: string; category?: string; releaseYear?: number | null },
) {
  const [thumbnail, setThumbnail] = useState<string | null>(storedThumbnail ?? null)

  useEffect(() => {
    if (storedThumbnail) return setThumbnail(storedThumbnail)
    const cacheKey = sourceUrl || [content?.title, content?.category, content?.releaseYear].filter(Boolean).join('|')
    if (!cacheKey) return setThumbnail(null)
    if (thumbnailCache.has(cacheKey)) return setThumbnail(thumbnailCache.get(cacheKey) ?? null)

    let active = true
    supabase.functions.invoke('content-metadata', { body: sourceUrl ? { url: sourceUrl } : {
      title: content?.title,
      category: content?.category,
      release_year: content?.releaseYear,
    } })
      .then(({ data, error }) => {
        const result = error ? null : data?.thumbnail_url ?? null
        thumbnailCache.set(cacheKey, result)
        if (active) setThumbnail(result)
      })
      .catch(() => {
        thumbnailCache.set(cacheKey, null)
        if (active) setThumbnail(null)
      })
    return () => { active = false }
  }, [sourceUrl, storedThumbnail, content?.title, content?.category, content?.releaseYear])

  return thumbnail
}
