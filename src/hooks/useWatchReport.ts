import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
export type WatchEntry = { id: string; streamer_id: string; suggestion_id: string | null; title: string; category: string; source_url: string | null; duration_seconds: number | null; duration_source: string | null; completed_at: string; channel_name: string; imported: boolean }
export type WatchReport = { seconds: number; completed: number; known: number; unknown: number; undated: number; daily: { day: string; seconds: number; completed: number; unknown: number }[]; entries: WatchEntry[] }
export function useWatchReport(streamerId: string | null, from: string, to: string, offset = 0) {
  const key = `${streamerId}:${from}:${to}:${offset}`
  const activeKey = useRef(key)
  activeKey.current = key
  const request = useRef(0)
  const [state, setState] = useState<{ key: string; data: WatchReport | null; error: boolean }>({ key: '', data: null, error: false })
  const refresh = useCallback(async () => {
    const version = ++request.current
    try {
      const { data, error } = await supabase.rpc('get_watch_report', { p_streamer_id: streamerId, p_from: from, p_to: to, p_offset: offset })
      if (error) throw error
      if (activeKey.current === key && request.current === version) setState({ key, data: data as WatchReport, error: false })
    } catch {
      if (activeKey.current === key && request.current === version) setState(current => ({ key, data: current.key === key ? current.data : null, error: true }))
    }
  }, [key, streamerId, from, to, offset])
  useEffect(() => {
    void refresh()
    const visibleRefresh = () => { if (document.visibilityState === 'visible') void refresh() }
    const interval = window.setInterval(visibleRefresh, 30000)
    document.addEventListener('visibilitychange', visibleRefresh)
    window.addEventListener('watchqueue:duration-updated', visibleRefresh)
    const channel = supabase.channel(`watch-report-${key}-${Math.random()}`).on('postgres_changes', {
      event: '*', schema: 'public', table: 'suggestions', ...(streamerId ? { filter: `streamer_id=eq.${streamerId}` } : {}),
    }, visibleRefresh).subscribe()
    return () => {
      request.current++
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', visibleRefresh)
      window.removeEventListener('watchqueue:duration-updated', visibleRefresh)
      void supabase.removeChannel(channel)
    }
  }, [key, streamerId, refresh])
  return { data: state.key === key ? state.data : null, error: state.key === key && state.error, refresh }
}
