import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

export type StreamerNotification = {
  id: string
  streamer_id: string
  suggestion_id: string | null
  type: string
  title: string
  message: string
  read_at: string | null
  created_at: string
}

export function useStreamerNotifications(streamerId?: string) {
  const [notifications, setNotifications] = useState<StreamerNotification[]>([])

  const refresh = useCallback(async () => {
    if (!streamerId) return setNotifications([])
    const { data, error } = await supabase
      .from('streamer_notifications')
      .select('*')
      .eq('streamer_id', streamerId)
      .order('created_at', { ascending: false })
      .limit(50)
    if (!error) setNotifications((data ?? []) as StreamerNotification[])
  }, [streamerId])

  useEffect(() => {
    refresh()
    if (!streamerId) return

    const channel = supabase
      .channel(`streamer-inbox-${streamerId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'streamer_notifications', filter: `streamer_id=eq.${streamerId}`,
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const notification = payload.new as StreamerNotification
          setNotifications((current) => [notification, ...current.filter((item) => item.id !== notification.id)].slice(0, 50))
          toast.info(notification.title, { description: notification.message })
        } else {
          refresh()
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [streamerId, refresh])

  const markAllRead = useCallback(async () => {
    if (!streamerId || !notifications.some((item) => !item.read_at)) return
    const readAt = new Date().toISOString()
    setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? readAt })))
    await supabase.from('streamer_notifications').update({ read_at: readAt }).eq('streamer_id', streamerId).is('read_at', null)
  }, [notifications, streamerId])

  const removeOne = useCallback(async (id: string) => {
    setNotifications((current) => current.filter((item) => item.id !== id))
    const { error } = await supabase.from('streamer_notifications').delete().eq('id', id)
    if (error) {
      toast.error('Não foi possível excluir a notificação.')
      refresh()
    }
  }, [refresh])

  const removeAll = useCallback(async () => {
    if (!streamerId || notifications.length === 0) return
    const previous = notifications
    setNotifications([])
    const { error } = await supabase.from('streamer_notifications').delete().eq('streamer_id', streamerId)
    if (error) {
      toast.error('Não foi possível limpar as notificações.')
      setNotifications(previous)
    }
  }, [notifications, streamerId])

  return {
    notifications,
    unreadCount: notifications.filter((item) => !item.read_at).length,
    markAllRead,
    removeOne,
    removeAll,
  }
}
