import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import type { Streamer } from '@/types'
import StreamerDashboard from './StreamerDashboard'

export default function AdminChannelDashboard() {
  const { streamerId } = useParams()
  const userId = useAuthStore((state) => state.user?.id)
  const [channel, setChannel] = useState<Streamer | null>(null)
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    if (!userId || !streamerId) return null
    const { data: allowed, error } = await supabase.rpc('is_platform_admin', { p_user_id: userId })
    if (error || !allowed) return null
    const result = await supabase.from('streamers').select('*').eq('id', streamerId).maybeSingle()
    if (result.error) throw result.error
    return result.data as Streamer | null
  }, [streamerId, userId])
  useEffect(() => {
    let active = true
    setLoading(true)
    setChannel(null)
    load().then((value) => { if (active) setChannel(value) }).catch(() => { if (active) setChannel(null) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [load])
  const refresh = useCallback(async () => { setChannel(await load()) }, [load])
  if (loading) return <div className="page-section">Carregando canal…</div>
  if (!channel) return <div className="page-section">Canal indisponível ou acesso não autorizado. <Link to="/dashboard">Voltar</Link></div>
  return <><div className="app-shell pt-5 text-sm text-content-secondary">Administrando <strong>{channel.channel_name}</strong> · <Link className="text-brand-purple" to="/dashboard">Voltar ao meu painel</Link></div><StreamerDashboard key={channel.id} managedStreamer={channel} onManagedStreamerChange={setChannel} onManagedRefresh={refresh} /></>
}
