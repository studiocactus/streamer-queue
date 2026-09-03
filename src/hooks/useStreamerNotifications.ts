import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

export type StreamerNotification = {
  id: string
  streamer_id: string
  user_id: string | null
  suggestion_id: string | null
  type: string
  title: string
  message: string
  target_path: string | null
  read_at: string | null
  created_at: string
}

export function useStreamerNotifications(streamerId?: string, userId?: string) {
  const [notifications, setNotifications] = useState<StreamerNotification[]>([])
  const seenNotificationIds = useRef(new Set<string>())

  const refresh = useCallback(async () => {
    if (!streamerId && !userId) return setNotifications([])
    let query = supabase
      .from('streamer_notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    query = streamerId && userId
      ? query.or(`streamer_id.eq.${streamerId},user_id.eq.${userId}`)
      : streamerId ? query.eq('streamer_id', streamerId) : query.eq('user_id', userId!)
    const { data, error } = await query
    if (!error) {
      const nextNotifications = (data ?? []) as StreamerNotification[]
      seenNotificationIds.current = new Set(nextNotifications.map((item) => item.id))
      setNotifications(nextNotifications)
    }
  }, [streamerId, userId])

  useEffect(() => {
    refresh()
    if (!streamerId && !userId) return

    const receiveChange = (payload: { eventType: string; new: Record<string, unknown> }) => {
        if (payload.eventType === 'INSERT') {
          const notification = payload.new as StreamerNotification
          if (seenNotificationIds.current.has(notification.id)) return
          seenNotificationIds.current.add(notification.id)
          setNotifications((current) => [notification, ...current.filter((item) => item.id !== notification.id)].slice(0, 50))
          if (notification.suggestion_id) {
            window.dispatchEvent(new CustomEvent('watchqueue:suggestions-changed', {
              detail: { streamerId: notification.streamer_id },
            }))
          }
          // New suggestions can arrive quickly during a live. Keep them in the
          // inbox without covering the interface with repeated pop-ups.
          if (notification.type !== 'new_suggestion') {
            toast.info(notification.title, { description: notification.message })
          }
        } else {
          refresh()
        }
      }
    let channel = supabase.channel(`notification-inbox-${streamerId ?? 'viewer'}-${userId ?? 'channel'}`)
    if (streamerId) channel = channel.on('postgres_changes', {
      event: '*', schema: 'public', table: 'streamer_notifications', filter: `streamer_id=eq.${streamerId}`,
    }, receiveChange)
    if (userId) channel = channel.on('postgres_changes', {
      event: '*', schema: 'public', table: 'streamer_notifications', filter: `user_id=eq.${userId}`,
    }, receiveChange)
    channel
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [streamerId, userId, refresh])

  const markAllRead = useCallback(async () => {
    if ((!streamerId && !userId) || !notifications.some((item) => !item.read_at)) return
    const readAt = new Date().toISOString()
    setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? readAt })))
    let query = supabase.from('streamer_notifications').update({ read_at: readAt }).is('read_at', null)
    query = streamerId && userId ? query.or(`streamer_id.eq.${streamerId},user_id.eq.${userId}`) : streamerId ? query.eq('streamer_id', streamerId) : query.eq('user_id', userId!)
    await query
  }, [notifications, streamerId, userId])

  const markOneRead = useCallback(async (id: string) => {
    const notification = notifications.find((item) => item.id === id)
    if (!notification || notification.read_at) return
    const readAt = new Date().toISOString()
    setNotifications((current) => current.map((item) => item.id === id ? { ...item, read_at: readAt } : item))
    const { error } = await supabase.from('streamer_notifications').update({ read_at: readAt }).eq('id', id)
    if (error) {
      toast.error('Não foi possível marcar a notificação como lida.')
      refresh()
    }
  }, [notifications, refresh])

  const removeOne = useCallback(async (id: string) => {
    setNotifications((current) => current.filter((item) => item.id !== id))
    const { error } = await supabase.from('streamer_notifications').delete().eq('id', id)
    if (error) {
      toast.error('Não foi possível excluir a notificação.')
      refresh()
    }
  }, [refresh])

  const removeAll = useCallback(async () => {
    if ((!streamerId && !userId) || notifications.length === 0) return
    const previous = notifications
    setNotifications([])
    let query = supabase.from('streamer_notifications').delete()
    query = streamerId && userId ? query.or(`streamer_id.eq.${streamerId},user_id.eq.${userId}`) : streamerId ? query.eq('streamer_id', streamerId) : query.eq('user_id', userId!)
    const { error } = await query
    if (error) {
      toast.error('Não foi possível limpar as notificações.')
      setNotifications(previous)
    }
  }, [notifications, streamerId, userId])

  return {
    notifications,
    unreadCount: notifications.filter((item) => !item.read_at).length,
    markAllRead,
    markOneRead,
    removeOne,
    removeAll,
  }
}
