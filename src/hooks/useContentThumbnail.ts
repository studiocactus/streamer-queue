import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const thumbnailCache = new Map<string, string | null>()

export function useContentThumbnail(sourceUrl?: string | null, storedThumbnail?: string | null) {
  const [thumbnail, setThumbnail] = useState<string | null>(storedThumbnail ?? null)

  useEffect(() => {
    if (storedThumbnail) return setThumbnail(storedThumbnail)
    if (!sourceUrl) return setThumbnail(null)
    if (thumbnailCache.has(sourceUrl)) return setThumbnail(thumbnailCache.get(sourceUrl) ?? null)

    let active = true
    supabase.functions.invoke('content-metadata', { body: { url: sourceUrl } })
      .then(({ data, error }) => {
        const result = error ? null : data?.thumbnail_url ?? null
        thumbnailCache.set(sourceUrl, result)
        if (active) setThumbnail(result)
      })
      .catch(() => {
        thumbnailCache.set(sourceUrl, null)
        if (active) setThumbnail(null)
      })
    return () => { active = false }
  }, [sourceUrl, storedThumbnail])

  return thumbnail
}
