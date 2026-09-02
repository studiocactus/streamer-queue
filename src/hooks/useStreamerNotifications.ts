import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

export function useStreamerNotifications(streamerId?: string) {
  const [pendingCount, setPendingCount] = useState(0)

  const refresh = useCallback(async () => {
    if (!streamerId) return setPendingCount(0)
    const { count } = await supabase
      .from('suggestions')
      .select('id', { count: 'exact', head: true })
      .eq('streamer_id', streamerId)
      .eq('status', 'pending')
    setPendingCount(count ?? 0)
  }, [streamerId])

  useEffect(() => {
    refresh()
    if (!streamerId) return

    const channel = supabase
      .channel(`streamer-alerts-${streamerId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'suggestions', filter: `streamer_id=eq.${streamerId}`,
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const title = (payload.new as { title?: string }).title
          toast.info('Nova sugestão recebida', {
            description: title ? `“${title}” aguarda sua aprovação.` : 'Uma sugestão aguarda sua aprovação.',
          })
        }
        window.dispatchEvent(new CustomEvent('watchqueue:suggestions-changed', {
          detail: { streamerId },
        }))
        refresh()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [streamerId, refresh])

  return { pendingCount }
}
