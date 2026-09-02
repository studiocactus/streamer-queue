import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Streamer } from '@/types'

export function useStreamer(slug: string | undefined) {
  const [streamer, setStreamer] = useState<Streamer | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!slug || !slug.trim()) {
      setIsLoading(false)
      setError('Canal não especificado.')
      return
    }
    setIsLoading(true)
    setError(null)

    try {
      const { data, error: fetchError } = await supabase
        .from('streamers')
        .select(`
          *,
          owner:profiles!owner_id(id, display_name, avatar_url, twitch_login),
          settings:streamer_settings(*)
        `)
        .ilike('slug', slug.trim())
        .eq('is_public', true)
        .eq('is_active', true)
        .maybeSingle()

      if (fetchError) throw fetchError

      if (!data) {
        setError('Canal não encontrado ou indisponível.')
        setStreamer(null)
      } else {
        setStreamer(data as unknown as Streamer)
      }
    } catch (err) {
      console.error('Erro ao buscar streamer:', err)
      setError('Canal não encontrado ou indisponível.')
      setStreamer(null)
    } finally {
      setIsLoading(false)
    }
  }, [slug])

  useEffect(() => { fetch() }, [fetch])

  return { streamer, isLoading, error, refetch: fetch }
}

export function useStreamers(search?: string) {
  const [streamers, setStreamers] = useState<Streamer[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      try {
        let query = supabase
          .from('streamers')
          .select('id, channel_name, slug, avatar_url, cover_url, bio')
          .eq('is_public', true)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(40)

        if (search && search.trim()) {
          query = query.ilike('channel_name', `%${search.trim()}%`)
        }

        const { data } = await query
        setStreamers((data ?? []) as unknown as Streamer[])
      } catch (err) {
        console.error(err)
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [search])

  return { streamers, isLoading }
}
