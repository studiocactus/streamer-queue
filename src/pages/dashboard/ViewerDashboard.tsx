import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Send, Clock, ThumbsUp, Tv2, LayoutDashboard, Plus, Search } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { supabase } from '@/lib/supabase'
import { Avatar } from '@/components/ui/Avatar'
import { Card, CardHeader, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { formatRelativeDate } from '@/lib/utils'
import type { Suggestion } from '@/types'

interface ViewerStats {
  suggestions: Suggestion[]
  votes_count: number
}

export default function ViewerDashboard() {
  const { profile, streamerProfile } = useAuthStore()
  const [stats, setStats] = useState<ViewerStats>({ suggestions: [], votes_count: 0 })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      if (!profile) return
      setIsLoading(true)

      try {
        const [suggestionsRes, votesRes] = await Promise.all([
          supabase
            .from('suggestions')
            .select(`
              *,
              streamer:streamers!streamer_id(id, channel_name, slug, avatar_url),
              votes(id)
            `)
            .eq('submitted_by', profile.id)
            .order('submitted_at', { ascending: false })
            .limit(20),
          supabase
            .from('votes')
            .select('id', { count: 'exact' })
            .eq('user_id', profile.id),
        ])

        setStats({
          suggestions: (suggestionsRes.data ?? []) as unknown as Suggestion[],
          votes_count: votesRes.count ?? 0,
        })
      } catch (err) {
        console.error(err)
      } finally {
        setIsLoading(false)
      }
    }

    load()
  }, [profile])

  if (!profile) return null

  const pending = stats.suggestions.filter((s) => s.status === 'pending').length
  const approved = stats.suggestions.filter((s) => ['approved', 'queued', 'watching'].includes(s.status)).length

  return (
    <div className="min-h-screen py-10 px-4">
      <div className="max-w-4xl mx-auto space-y-8">

        {/* Perfil */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-bg-secondary border border-border p-6 rounded-2xl">
          <div className="flex items-center gap-4">
            <Avatar
              src={profile.avatar_url}
              alt={profile.display_name}
              fallback={profile.display_name}
              size="xl"
            />
            <div>
              <h1 className="text-2xl font-bold text-content-primary">{profile.display_name}</h1>
              <p className="text-content-secondary text-sm">@{profile.twitch_login}</p>
              <div className="flex items-center gap-2 mt-2">
                <div className="flex items-center gap-1.5 text-xs bg-brand-purple/10 text-brand-purple border border-brand-purple/20 rounded-full px-2.5 py-1 font-medium">
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
                    <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
                  </svg>
                  Conectado via Twitch
                </div>
              </div>
            </div>
          </div>

          {streamerProfile && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-border">
              <Link to={`/streamer/${streamerProfile.slug}`}>
                <Button variant="secondary" size="sm" leftIcon={<Tv2 size={14} />}>
                  Ver meu canal
                </Button>
              </Link>
              <Link to="/dashboard/streamer">
                <Button variant="primary" size="sm" leftIcon={<LayoutDashboard size={14} />}>
                  Gerenciar minha fila
                </Button>
              </Link>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Sugestões', value: stats.suggestions.length, icon: Send, color: 'text-brand-purple' },
            { label: 'Pendentes', value: pending, icon: Clock, color: 'text-status-pending' },
            { label: 'Aprovadas', value: approved, icon: Tv2, color: 'text-status-approved' },
            { label: 'Votos dados', value: stats.votes_count, icon: ThumbsUp, color: 'text-brand-green' },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label}>
              <CardContent className="py-4">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg bg-bg-tertiary flex items-center justify-center`}>
                    <Icon size={16} className={color} />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-content-primary">{value}</p>
                    <p className="text-xs text-content-muted">{label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Minhas sugestões */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-content-primary flex items-center gap-2">
                <Send size={16} className="text-brand-purple" />
                Minhas Sugestões
              </h2>
              <Link to={streamerProfile ? `/streamer/${streamerProfile.slug}` : '/explore'}>
                <Button size="sm" variant="ghost" leftIcon={<Plus size={14} />}>
                  Nova sugestão
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-5 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : stats.suggestions.length === 0 ? (
              <EmptyState
                icon={<Send size={22} />}
                title="Nenhuma sugestão enviada"
                description="Explore streamers e sugira seu conteúdo favorito!"
                action={
                  <Link to="/explore">
                    <Button size="sm" leftIcon={<Search size={14} />}>
                      Explorar streamers
                    </Button>
                  </Link>
                }
              />
            ) : (
              <div className="divide-y divide-border">
                {stats.suggestions.map((s) => {
                  const streamer = s as unknown as { streamer: { channel_name: string; slug: string } }
                  return (
                    <div key={s.id} className="flex items-center gap-4 p-4 hover:bg-bg-tertiary/50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm text-content-primary truncate">{s.title}</p>
                          <Badge variant="status" status={s.status} size="sm" />
                          <Badge variant="category" category={s.category as never} size="sm" />
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          {streamer.streamer && (
                            <Link
                              to={`/streamer/${streamer.streamer.slug}`}
                              className="text-xs text-brand-purple hover:underline"
                            >
                              {streamer.streamer.channel_name}
                            </Link>
                          )}
                          <span className="text-xs text-content-muted">
                            · {formatRelativeDate(s.submitted_at)}
                          </span>
                        </div>
                      </div>
                      <div className="text-xs text-content-muted flex items-center gap-1 shrink-0">
                        <ThumbsUp size={11} />
                        {(s as unknown as { votes: { id: string }[] }).votes?.length ?? 0}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
