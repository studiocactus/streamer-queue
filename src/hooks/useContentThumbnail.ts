import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { createThumbnailCache } from '@/lib/thumbnailCache'

const lookupThumbnail = createThumbnailCache()

export function useContentThumbnail(
  sourceUrl?: string | null,
  storedThumbnail?: string | null,
  content?: { title?: string; category?: string; releaseYear?: number | null },
) {
  const cacheKey = sourceUrl ? JSON.stringify(['url', sourceUrl]) : content?.title
    ? JSON.stringify(['title', content.title, content.category ?? null, content.releaseYear ?? null]) : ''
  const [result, setResult] = useState<{ key: string; value: string | null }>({ key: '', value: null })

  useEffect(() => {
    if (storedThumbnail || !cacheKey) return

    let active = true
    let attempts = 0
    let loading = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      if (!active || loading || !navigator.onLine) return
      loading = true
      attempts++
      try {
        const value = await lookupThumbnail(cacheKey, async () => {
          const { data, error } = await supabase.functions.invoke('content-metadata', {
            signal: AbortSignal.timeout(10000),
            body: sourceUrl ? { url: sourceUrl } : {
              title: content?.title, category: content?.category, release_year: content?.releaseYear,
            },
          })
          if (error) throw error
          return data?.thumbnail_url ?? null
        })
        if (active) setResult({ key: cacheKey, value })
      } catch {
        if (active && attempts < 3) timer = setTimeout(load, attempts * 2000)
      } finally { loading = false }
    }
    const online = () => { clearTimeout(timer); attempts = 0; void load() }
    void load()
    window.addEventListener('online', online)
    return () => { active = false; clearTimeout(timer); window.removeEventListener('online', online) }
  }, [cacheKey, sourceUrl, storedThumbnail, content?.title, content?.category, content?.releaseYear])

  return storedThumbnail || (result.key === cacheKey ? result.value : null)
}
