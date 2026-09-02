import { useEffect, useState, type CSSProperties } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  Tv2, ThumbsUp, Send, Filter, Clock,
  Trophy, History, Play, ExternalLink, AlertCircle, Link as LinkIcon
} from 'lucide-react'
import { toast } from 'sonner'
import { updateSeoContent } from '@/components/Seo'
import { useStreamer } from '@/hooks/useStreamer'
import { useSuggestions } from '@/hooks/useSuggestions'
import { useContentThumbnail } from '@/hooks/useContentThumbnail'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { Modal } from '@/components/ui/Modal'
import { Input, Textarea, Select } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonSuggestion } from '@/components/ui/Skeleton'
import { formatRelativeDate, categoryLabel, cn } from '@/lib/utils'
import type { Suggestion, SuggestionCategory } from '@/types'

const PROFILE_THEME_STYLES = {
  neon: {
    primary: '145 70 255',
    primaryLight: '169 112 255',
    primaryDark: '122 53 224',
    page: 'bg-[radial-gradient(circle_at_20%_0%,rgba(145,70,255,0.12),transparent_35%)]',
    fallback: 'bg-gradient-to-br from-brand-purple/35 via-bg-tertiary to-bg-secondary',
    overlay: 'bg-gradient-to-t from-bg-primary via-brand-purple/5 to-transparent',
  },
  aurora: {
    primary: '20 184 166',
    primaryLight: '45 212 191',
    primaryDark: '13 148 136',
    page: 'bg-[radial-gradient(circle_at_20%_0%,rgba(45,212,191,0.12),transparent_35%)]',
    fallback: 'bg-gradient-to-br from-teal-500/35 via-cyan-950/40 to-bg-secondary',
    overlay: 'bg-gradient-to-t from-bg-primary via-teal-500/5 to-transparent',
  },
  sunset: {
    primary: '244 63 94',
    primaryLight: '251 113 133',
    primaryDark: '225 29 72',
    page: 'bg-[radial-gradient(circle_at_20%_0%,rgba(251,113,133,0.12),transparent_35%)]',
    fallback: 'bg-gradient-to-br from-orange-500/35 via-rose-950/40 to-bg-secondary',
    overlay: 'bg-gradient-to-t from-bg-primary via-rose-500/5 to-transparent',
  },
  midnight: {
    primary: '59 130 246',
    primaryLight: '96 165 250',
    primaryDark: '37 99 235',
    page: 'bg-[radial-gradient(circle_at_20%_0%,rgba(59,130,246,0.12),transparent_35%)]',
    fallback: 'bg-gradient-to-br from-blue-600/30 via-slate-900 to-bg-secondary',
    overlay: 'bg-gradient-to-t from-bg-primary via-blue-500/5 to-transparent',
  },
} as const

// ============================================================
// SuggestionCard
// ============================================================
function SuggestionCard({
  suggestion,
  onVote,
  canVote = true,
}: {
  suggestion: Suggestion
  onVote?: (id: string, voted: boolean) => void
  canVote?: boolean
}) {
  const thumbnail = useContentThumbnail(suggestion.source_url, suggestion.poster_url)

  return (
    <div className="flex gap-3 rounded-2xl border border-border bg-bg-secondary p-3 transition-colors hover:border-border-light sm:gap-4 sm:p-4">
      {/* Thumbnail sempre quadrada */}
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-bg-tertiary flex items-center justify-center">
        {thumbnail ? (
          <img src={thumbnail} alt={`Thumbnail de ${suggestion.title}`} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <Tv2 size={20} className="text-content-muted" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-semibold text-content-primary text-sm leading-tight line-clamp-2">
            {suggestion.title}
            {suggestion.release_year && (
              <span className="text-content-muted font-normal ml-1">({suggestion.release_year})</span>
            )}
          </h3>
          <Badge variant="status" status={suggestion.status} />
        </div>

        <div className="flex items-center gap-2 mb-2">
          <Badge variant="category" category={suggestion.category as SuggestionCategory} size="sm" />
          {(suggestion.submitter || suggestion.chat_display_name) && (
            <span className="text-xs text-content-muted">
              por <span className="text-content-secondary">{suggestion.submitter?.display_name ?? suggestion.chat_display_name}</span>
            </span>
          )}
        </div>

        {suggestion.description && (
          <p className="text-xs text-content-secondary line-clamp-2 mb-2">
            {suggestion.description}
          </p>
        )}

        {suggestion.source_url && (
          <a href={suggestion.source_url} target="_blank" rel="noreferrer" className="mb-2 inline-flex items-center gap-1 text-xs text-brand-purple hover:underline">
            <LinkIcon size={11} /> Abrir conteúdo
          </a>
        )}

        <div className="flex items-center justify-between">
          <span className="text-xs text-content-muted">
            {formatRelativeDate(suggestion.submitted_at)}
          </span>

          {canVote && onVote && suggestion.status !== 'completed' && suggestion.status !== 'rejected' && (
            <button
              onClick={() => onVote(suggestion.id, !!suggestion.user_voted)}
              className={cn(
                'flex min-h-11 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 sm:min-h-0',
                suggestion.user_voted
                  ? 'bg-brand-purple/20 text-brand-purple border border-brand-purple/30 hover:bg-brand-purple/10'
                  : 'bg-bg-tertiary text-content-secondary border border-border hover:border-border-light hover:text-content-primary'
              )}
            >
              <ThumbsUp size={12} className={suggestion.user_voted ? 'fill-brand-purple' : ''} />
              {suggestion.vote_count ?? 0}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Formulário de sugestão
// ============================================================
function SuggestModal({
  isOpen,
  onClose,
  onSubmit,
  onCheckDuplicates,
}: {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: { title: string; category: SuggestionCategory; description?: string; release_year?: number; source_url?: string }) => Promise<boolean>
  onCheckDuplicates: (title: string) => Promise<{ id: string; title: string; status: string }[]>
}) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<SuggestionCategory>('movie')
  const [description, setDescription] = useState('')
  const [releaseYear, setReleaseYear] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [duplicates, setDuplicates] = useState<{ id: string; title: string; status: string }[]>([])

  const handleTitleBlur = async () => {
    if (title.trim().length > 2) {
      const found = await onCheckDuplicates(title)
      setDuplicates(found)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setLoading(true)
    const ok = await onSubmit({
      title: title.trim(),
      category,
      description: description.trim() || undefined,
      release_year: releaseYear ? parseInt(releaseYear) : undefined,
      source_url: sourceUrl.trim() || undefined,
    })
    setLoading(false)
    if (ok) {
      setTitle('')
      setDescription('')
      setReleaseYear('')
      setSourceUrl('')
      setDuplicates([])
      onClose()
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Sugerir conteúdo" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Título"
          required
          placeholder="Ex: Interestelar, Breaking Bad, Attack on Titan..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleTitleBlur}
        />

        {duplicates.length > 0 && (
          <div className="bg-status-pending/10 border border-status-pending/20 rounded-xl p-3">
            <p className="text-xs font-medium text-status-pending mb-2 flex items-center gap-1.5">
              <AlertCircle size={13} />
              Conteúdo similar já sugerido:
            </p>
            {duplicates.map((d) => (
              <p key={d.id} className="text-xs text-content-secondary">
                • {d.title} <Badge variant="status" status={d.status as never} size="sm" />
              </p>
            ))}
          </div>
        )}

        <Select
          label="Categoria"
          value={category}
          onChange={(e) => setCategory(e.target.value as SuggestionCategory)}
          options={[
            { value: 'movie', label: 'Filme' },
            { value: 'series', label: 'Série' },
            { value: 'anime', label: 'Anime' },
            { value: 'react', label: 'React / Vídeo' },
            { value: 'music', label: 'Música' },
            { value: 'other', label: 'Outro' },
          ]}
        />

        {(category === 'movie' || category === 'series' || category === 'anime') && <Input
          label="Ano de lançamento"
          type="number"
          placeholder="Ex: 2014"
          value={releaseYear}
          onChange={(e) => setReleaseYear(e.target.value)}
          min={1888}
          max={2100}
        />}

        {(category === 'react' || category === 'music') && <Input
          label={category === 'react' ? 'Link do YouTube' : 'Link do Spotify ou YouTube'}
          type="url"
          required
          placeholder={category === 'react' ? 'https://youtube.com/watch?...' : 'https://open.spotify.com/...'}
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
        />}

        <Textarea
          label="Descrição (opcional)"
          placeholder="Conte um pouco sobre o conteúdo..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end sm:gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={loading} leftIcon={<Send size={15} />}>
            Enviar Sugestão
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ============================================================
// Página Principal do Streamer
// ============================================================
type TabType = 'all' | 'queue' | 'top' | 'completed'
type CategoryFilter = SuggestionCategory | 'all'

export default function StreamerPage() {
  const { slug } = useParams<{ slug: string }>()
  const { streamer, isLoading: streamerLoading, error: streamerError } = useStreamer(slug)
  const [tab, setTab] = useState<TabType>('all')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [visibleCount, setVisibleCount] = useState(8)
  const { user } = useAuthStore()

  // Hook busca TODAS as sugestões; filtragem é feita localmente para evitar loop infinito
  const {
    suggestions, watching, queued, pending: _pending,
    completed, isLoading: suggestionsLoading, vote, submit, checkDuplicates,
  } = useSuggestions(streamer?.id)

  useEffect(() => {
    setVisibleCount(8)
  }, [tab, categoryFilter])

  useEffect(() => {
    if (!streamer) return
    updateSeoContent(
      `${streamer.channel_name} — sugestões e fila | WatchQueue`,
      `Envie sugestões, vote nas favoritas e acompanhe a fila do canal ${streamer.channel_name} no WatchQueue.`,
    )
  }, [streamer])

  const handleSuggest = () => {
    if (!user) {
      toast.error('Faça login com a Twitch para sugerir conteúdo.')
      return
    }
    setSuggestOpen(true)
  }

  if (streamerLoading) {
    return (
      <div className="min-h-screen">
        <div className="h-48 bg-bg-secondary animate-pulse" />
        <div className="app-shell -mt-12">
          <div className="flex items-end gap-4 mb-8">
            <div className="w-24 h-24 rounded-full bg-bg-tertiary animate-pulse ring-4 ring-bg-primary" />
          </div>
        </div>
      </div>
    )
  }

  if (streamerError || !streamer) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <EmptyState
          icon={<Tv2 size={28} />}
          title="Canal não encontrado"
          description="Este canal não existe ou não está disponível."
          action={<Link to="/explore"><Button>Explorar streamers</Button></Link>}
        />
      </div>
    )
  }

  const profileTheme = PROFILE_THEME_STYLES[streamer.profile_theme ?? 'neon']

  // Filtrar por categoria localmente
  const allSuggestions = categoryFilter === 'all'
    ? suggestions
    : suggestions.filter((s) => s.category === categoryFilter)

  const topVoted = [...allSuggestions]
    .filter((s) => !['completed', 'rejected'].includes(s.status))
    .sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0))
    .slice(0, 10)

  const allFilteredSuggestions = [...allSuggestions]
    .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())
  const queuedFiltered = allFilteredSuggestions
    .filter((s) => s.status === 'queued')
    .sort((a, b) => (a.queue_position ?? 999) - (b.queue_position ?? 999))
  const completedFiltered = allFilteredSuggestions.filter((s) => s.status === 'completed')

  const tabs: { id: TabType; label: string; icon: typeof Play }[] = [
    { id: 'all', label: 'Todas', icon: Clock },
    { id: 'queue', label: 'Fila', icon: Play },
    { id: 'top', label: 'Mais Votados', icon: Trophy },
    { id: 'completed', label: 'Concluídos', icon: History },
  ]

  const categories: { value: CategoryFilter; label: string }[] = [
    { value: 'all', label: 'Todos' },
    { value: 'movie', label: 'Filmes' },
    { value: 'series', label: 'Séries' },
    { value: 'anime', label: 'Animes' },
    { value: 'react', label: 'Reacts' },
    { value: 'music', label: 'Músicas' },
    { value: 'other', label: 'Outros' },
  ]

  const getTabItems = (): Suggestion[] => {
    switch (tab) {
      case 'all': return allFilteredSuggestions
      case 'queue': return queuedFiltered
      case 'top': return topVoted
      case 'completed': return completedFiltered
      default: return []
    }
  }

  const tabItems = getTabItems()
  const visibleItems = tabItems.slice(0, visibleCount)

  const profileThemeVariables = {
    '--theme-primary': profileTheme.primary,
    '--theme-primary-light': profileTheme.primaryLight,
    '--theme-primary-dark': profileTheme.primaryDark,
  } as CSSProperties

  return (
    <div className={cn('min-h-screen', profileTheme.page)} style={profileThemeVariables}>
      {/* Capa */}
      <div className="relative h-40 overflow-hidden bg-bg-secondary sm:h-52">
        {streamer.cover_url ? (
          <img
            src={streamer.cover_url}
            alt={`Capa de ${streamer.channel_name}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className={cn('h-full w-full', profileTheme.fallback)} />
        )}
        <div className={cn('absolute inset-0', profileTheme.overlay)} />
      </div>

      <div className="app-shell relative z-10">
        {/* Avatar e info */}
        <div className="mt-4 mb-8 flex flex-col gap-4 sm:-mt-14 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 items-end gap-3 sm:gap-4">
            <Avatar
              src={streamer.avatar_url}
              alt={streamer.channel_name}
              fallback={streamer.channel_name}
              size="xl"
              className="ring-4 ring-bg-primary shadow-xl"
            />
            <div className="min-w-0 pb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="truncate text-xl font-bold text-content-primary sm:text-2xl">{streamer.channel_name}</h1>
                <span className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
                  streamer.is_live
                    ? 'border-red-500/30 bg-red-500/10 text-red-400'
                    : 'border-border bg-bg-secondary text-content-muted'
                )}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', streamer.is_live ? 'bg-red-500 animate-pulse' : 'bg-content-muted')} />
                  {streamer.is_live ? 'Online' : 'Offline'}
                </span>
              </div>
              {watching && (
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="live-dot" />
                  <span className="text-xs text-content-secondary">
                    Assistindo: <span className="font-medium text-content-primary">{watching.title}</span>
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="grid w-full grid-cols-2 gap-2 pb-2 sm:w-[22rem]">
            {streamer.twitch_broadcaster_id && (
              <a
                href={`https://twitch.tv/${streamer.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full"
              >
                <Button className="w-full" variant="outline" size="sm" leftIcon={<ExternalLink size={14} />}>
                  Twitch
                </Button>
              </a>
            )}
            <Button
              className="w-full"
              onClick={handleSuggest}
              size="sm"
              leftIcon={<Send size={14} />}
            >
              Sugerir conteúdo
            </Button>
          </div>
        </div>

        {/* Bio */}
        {streamer.bio && (
          <p className="text-sm text-content-secondary mb-8 max-w-2xl">{streamer.bio}</p>
        )}

        {streamer.social_links && Object.values(streamer.social_links).some(Boolean) && (
          <div className="mb-8 flex flex-wrap gap-2">
            {Object.entries(streamer.social_links).map(([network, url]) => {
              if (!url || !/^https?:\/\//i.test(url)) return null
              return (
                <a
                  key={network}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-secondary px-3 py-1.5 text-xs font-medium capitalize text-content-secondary transition-colors hover:border-brand-purple/30 hover:text-content-primary"
                >
                  {network}
                  <ExternalLink size={11} />
                </a>
              )
            })}
          </div>
        )}

        {/* Assistindo agora */}
        {watching && (
          <div className="bg-status-watching/5 border border-status-watching/20 rounded-2xl p-4 mb-8 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-status-watching/10 flex items-center justify-center shrink-0">
              <Play size={18} className="text-status-watching fill-status-watching" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-content-muted mb-0.5">Assistindo agora</p>
              <p className="font-semibold text-content-primary truncate">{watching.title}</p>
              <p className="text-xs text-content-secondary">
                {categoryLabel(watching.category as SuggestionCategory)} · sugestão de{' '}
                <span className="font-medium">{watching.submitter?.display_name ?? watching.chat_display_name ?? 'viewer'}</span>
              </p>
            </div>
          </div>
        )}

        {/* Filtros de categoria */}
        <div className="mobile-scroll mb-5 flex items-center gap-2 overflow-x-auto pb-1">
          <Filter size={14} className="text-content-muted shrink-0" />
          {categories.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setCategoryFilter(cat.value)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
                categoryFilter === cat.value
                  ? 'bg-brand-purple text-white'
                  : 'bg-bg-secondary border border-border text-content-secondary hover:text-content-primary'
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Tabs */}
        <div className="mobile-scroll mb-6 flex gap-1 overflow-x-auto rounded-xl border border-border bg-bg-secondary p-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                'flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-all duration-200',
                tab === id
                  ? 'bg-brand-purple/15 text-brand-purple shadow'
                  : 'text-content-muted hover:text-content-secondary'
              )}
            >
              <Icon size={14} />
              <span className="hidden sm:block">{label}</span>
            </button>
          ))}
        </div>

        {/* Lista de sugestões */}
        <div className="mb-16 space-y-3 pb-4">
          {suggestionsLoading ? (
            Array.from({ length: 3 }).map((_, i) => <SkeletonSuggestion key={i} />)
          ) : tabItems.length === 0 ? (
            <div className="bg-bg-secondary border border-border rounded-2xl p-8 text-center space-y-4 my-4">
              <div className="w-14 h-14 rounded-2xl bg-brand-purple/10 border border-brand-purple/20 flex items-center justify-center mx-auto">
                <Tv2 size={28} className="text-brand-purple" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-content-primary">
                  {tab === 'completed'
                    ? 'Nenhum conteúdo concluído ainda'
                    : tab === 'queue'
                    ? 'A fila deste canal está vazia!'
                    : 'Nenhuma sugestão encontrada'}
                </h3>
                <p className="text-sm text-content-secondary max-w-md mx-auto mt-1">
                  {tab === 'queue'
                    ? `Envie a primeira sugestão de filme, série, anime, react ou música para ${streamer.channel_name}!`
                    : 'Ajuste os filtros acima para ver outras sugestões.'}
                </p>
              </div>
              {tab === 'queue' && (
                <Button size="md" onClick={handleSuggest} leftIcon={<Send size={16} />}>
                  Sugerir conteúdo agora
                </Button>
              )}
            </div>
          ) : (
            <>
              {visibleItems.map((suggestion) => (
                <SuggestionCard
                  key={suggestion.id}
                  suggestion={suggestion}
                  onVote={vote}
                  canVote={!!user && suggestion.submitted_by !== user.id}
                />
              ))}
              {visibleCount < tabItems.length && (
                <div className="flex flex-col items-center gap-2 pt-5">
                  <Button variant="secondary" onClick={() => setVisibleCount((count) => count + 8)}>
                    Carregar mais sugestões
                  </Button>
                  <p className="text-xs text-content-muted">Exibindo {visibleItems.length} de {tabItems.length}</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modal de sugestão */}
      {streamer && (
        <SuggestModal
          isOpen={suggestOpen}
          onClose={() => setSuggestOpen(false)}
          onSubmit={submit}
          onCheckDuplicates={checkDuplicates}
        />
      )}
    </div>
  )
}
