import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Send, Clock, ThumbsUp, Tv2, LayoutDashboard, Plus, Search, UserRound, Pencil, Save } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { supabase } from '@/lib/supabase'
import { Avatar } from '@/components/ui/Avatar'
import { Card, CardHeader, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input, Textarea } from '@/components/ui/Input'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { formatRelativeDate } from '@/lib/utils'
import type { Suggestion } from '@/types'
import { streamerPath } from '@/lib/routes'
import { useContentThumbnail } from '@/hooks/useContentThumbnail'
import { normalizeProfileLink } from '@/lib/profileLinks'

interface ViewerStats {
  suggestions: Suggestion[]
  votes_count: number
}

function ViewerSuggestionRow({ suggestion }: { suggestion: Suggestion }) {
  const thumbnail = useContentThumbnail(suggestion.source_url, suggestion.poster_url, {
    title: suggestion.title, category: suggestion.category, releaseYear: suggestion.release_year,
  })
  const joined = suggestion as unknown as { streamer: { channel_name: string; slug: string } | null; votes: { id: string }[] }
  return (
    <div className="flex items-center gap-3 p-3 transition-colors hover:bg-bg-tertiary/50 sm:gap-4 sm:p-4">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-bg-tertiary">
        {thumbnail ? <img src={thumbnail} alt={`Thumbnail de ${suggestion.title}`} className="h-full w-full object-cover" loading="lazy" /> : <Tv2 size={19} className="text-content-muted" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-medium text-content-primary">{suggestion.title}</p><Badge variant="status" status={suggestion.status} size="sm" /><Badge variant="category" category={suggestion.category as never} size="sm" /></div>
        <div className="mt-1 flex items-center gap-2">{joined.streamer && <Link to={streamerPath(joined.streamer.slug)} className="text-xs text-brand-purple hover:underline">{joined.streamer.channel_name}</Link>}<span className="text-xs text-content-muted">· {formatRelativeDate(suggestion.submitted_at)}</span></div>
      </div>
      <div className="flex shrink-0 items-center gap-1 text-xs text-content-muted"><ThumbsUp size={11} />{joined.votes?.length ?? 0}</div>
    </div>
  )
}

export default function ViewerDashboard() {
  const { profile, streamerProfile, refreshProfile } = useAuthStore()
  const [stats, setStats] = useState<ViewerStats>({ suggestions: [], votes_count: 0 })
  const [isLoading, setIsLoading] = useState(true)
  const [profileEditorOpen, setProfileEditorOpen] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [viewerBio, setViewerBio] = useState(profile?.bio ?? '')
  const [viewerSocialLinks, setViewerSocialLinks] = useState<Record<string, string>>(profile?.social_links ?? {})

  useEffect(() => {
    setViewerBio(profile?.bio ?? '')
    setViewerSocialLinks(profile?.social_links ?? {})
  }, [profile?.bio, profile?.social_links])

  const handleSaveViewerProfile = async () => {
    if (!profile) return
    setProfileSaving(true)
    try {
      const normalizedLinks: Record<string, string> = Object.fromEntries(Object.entries(viewerSocialLinks).map(([network, value]): [string, string] => {
        const trimmed = value.trim()
        const normalized = normalizeProfileLink(trimmed)
        if (trimmed && !normalized) throw new Error('Link inválido')
        return [network, normalized ?? '']
      }).filter(([, value]) => Boolean(value)))
      if (Object.values(normalizedLinks).some((value) => !/^https?:\/\//i.test(value))) throw new Error('Link inválido')
      const { error } = await supabase.from('profiles').update({ bio: viewerBio.trim() || null, social_links: normalizedLinks }).eq('id', profile.id)
      if (error) throw error
      await refreshProfile()
      setProfileEditorOpen(false)
      toast.success('Perfil público atualizado!')
    } catch (error) {
      console.error(error)
      toast.error('Confira os links e tente novamente.')
    } finally {
      setProfileSaving(false)
    }
  }

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
    <div className="min-h-screen page-section">
      <div className="app-shell space-y-6 lg:space-y-8">

        {/* Perfil */}
        <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-border bg-bg-secondary p-4 sm:flex-row sm:items-center sm:p-6">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <Avatar
              src={profile.avatar_url}
              alt={profile.display_name}
              fallback={profile.display_name}
              size="xl"
            />
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold text-content-primary sm:text-2xl">{profile.display_name}</h1>
              {!streamerProfile && (
                <p className="text-content-secondary text-sm">@{profile.twitch_login}</p>
              )}
              <div className="flex items-center gap-2 mt-2">
                <div className="flex items-center gap-1.5 text-xs bg-brand-purple/10 text-brand-purple border border-brand-purple/20 rounded-full px-2.5 py-1 font-medium">
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
                    <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
                  </svg>
                  {streamerProfile ? 'Streamer da comunidade' : 'Viewer da comunidade'}
                </div>
              </div>
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2.5 border-t border-border pt-3 sm:w-auto sm:border-t-0 sm:pt-0">
              <Link to={`/viewer/${profile.twitch_login}`} className="min-w-[9rem] flex-1 sm:flex-none">
                <Button className="w-full" variant="outline" size="sm" leftIcon={<UserRound size={14} />}>Ver meu perfil</Button>
              </Link>
              <Button className="min-w-[9rem] flex-1 sm:flex-none" variant="secondary" size="sm" onClick={() => setProfileEditorOpen(true)} leftIcon={<Pencil size={14} />}>Editar perfil</Button>
            {streamerProfile && <>
              <Link to={streamerPath(streamerProfile.slug)} className="w-full sm:w-auto">
                <Button className="w-full" variant="secondary" size="sm" leftIcon={<Tv2 size={14} />}>
                  Ver meu canal
                </Button>
              </Link>
              <Link to="/dashboard/streamer" className="w-full sm:w-auto">
                <Button className="w-full" variant="primary" size="sm" leftIcon={<LayoutDashboard size={14} />}>
                  Gerenciar minha fila
                </Button>
              </Link>
            </>}
          </div>
        </div>

        <Modal isOpen={profileEditorOpen} onClose={() => setProfileEditorOpen(false)} title="Editar perfil de viewer" description="Tudo é opcional. Essas informações aparecerão no seu perfil público." size="md">
          <div className="space-y-4">
            <Textarea label="Sobre você" value={viewerBio} onChange={(event) => setViewerBio(event.target.value)} maxLength={500} rows={4} placeholder="Conte um pouco sobre você e o que gosta de assistir..." />
            <div className="grid gap-3 sm:grid-cols-2">{['instagram', 'youtube', 'tiktok', 'discord'].map((network) => <Input key={network} label={network.charAt(0).toUpperCase() + network.slice(1)} value={viewerSocialLinks[network] ?? ''} onChange={(event) => setViewerSocialLinks((current) => ({ ...current, [network]: event.target.value }))} placeholder={`https://${network}.com/...`} />)}</div>
            <Button className="w-full" loading={profileSaving} onClick={handleSaveViewerProfile} leftIcon={<Save size={15} />}>Salvar perfil</Button>
          </div>
        </Modal>

        {!streamerProfile && (
          <div className="rounded-2xl border border-brand-purple/20 bg-brand-purple/5 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-brand-purple/20 bg-brand-purple/10">
                <Search size={16} className="text-brand-purple" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-content-primary">Seu espaço de viewer</h2>
                <p className="mt-1 text-sm leading-relaxed text-content-secondary">
                  Explore os canais da comunidade, envie sugestões e acompanhe aqui cada decisão dos streamers.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 min-[430px]:grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
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
              <Link to={streamerProfile ? streamerPath(streamerProfile.slug) : '/explore'}>
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
                {stats.suggestions.map((suggestion) => <ViewerSuggestionRow key={suggestion.id} suggestion={suggestion} />)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
