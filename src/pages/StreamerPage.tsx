import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  Tv2, ThumbsUp, Send, Filter, Clock,
  Trophy, History, Play, ExternalLink, AlertCircle
} from 'lucide-react'
import { toast } from 'sonner'
import { useStreamer } from '@/hooks/useStreamer'
import { useSuggestions } from '@/hooks/useSuggestions'
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
  return (
    <div className="bg-bg-secondary border border-border rounded-2xl p-4 flex gap-4 hover:border-border-light transition-colors">
      {/* Poster placeholder */}
      <div className="w-14 h-20 rounded-lg bg-bg-tertiary shrink-0 flex items-center justify-center overflow-hidden">
        {suggestion.poster_url ? (
          <img src={suggestion.poster_url} alt={suggestion.title} className="w-full h-full object-cover" />
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
          {suggestion.submitter && (
            <span className="text-xs text-content-muted">
              por <span className="text-content-secondary">{suggestion.submitter.display_name}</span>
            </span>
          )}
        </div>

        {suggestion.description && (
          <p className="text-xs text-content-secondary line-clamp-2 mb-2">
            {suggestion.description}
          </p>
        )}

        <div className="flex items-center justify-between">
          <span className="text-xs text-content-muted">
            {formatRelativeDate(suggestion.submitted_at)}
          </span>

          {canVote && onVote && suggestion.status !== 'completed' && suggestion.status !== 'rejected' && (
            <button
              onClick={() => onVote(suggestion.id, !!suggestion.user_voted)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
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
  streamerId,
  onSubmit,
}: {
  isOpen: boolean
  onClose: () => void
  streamerId: string
  onSubmit: (data: { title: string; category: SuggestionCategory; description?: string; release_year?: number }) => Promise<boolean>
}) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<SuggestionCategory>('movie')
  const [description, setDescription] = useState('')
  const [releaseYear, setReleaseYear] = useState('')
  const [loading, setLoading] = useState(false)
  const [duplicates, setDuplicates] = useState<{ id: string; title: string; status: string }[]>([])

  const { checkDuplicates } = useSuggestions(streamerId)

  const handleTitleBlur = async () => {
    if (title.trim().length > 2) {
      const found = await checkDuplicates(title)
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
    })
    setLoading(false)
    if (ok) {
      setTitle('')
      setDescription('')
      setReleaseYear('')
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
            { value: 'other', label: 'Outro' },
          ]}
        />

        <Input
          label="Ano de lançamento"
          type="number"
          placeholder="Ex: 2014"
          value={releaseYear}
          onChange={(e) => setReleaseYear(e.target.value)}
          min={1888}
          max={2100}
        />

        <Textarea
          label="Descrição (opcional)"
          placeholder="Conte um pouco sobre o conteúdo..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />

        <div className="flex justify-end gap-3 pt-2">
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
type TabType = 'queue' | 'top' | 'recent' | 'completed'
type CategoryFilter = SuggestionCategory | 'all'

export default function StreamerPage() {
  const { slug } = useParams<{ slug: string }>()
  const { streamer, isLoading: streamerLoading, error: streamerError } = useStreamer(slug)
  const [tab, setTab] = useState<TabType>('queue')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [suggestOpen, setSuggestOpen] = useState(false)
  const { user } = useAuthStore()

  // Hook busca TODAS as sugestões; filtragem é feita localmente para evitar loop infinito
  const {
    suggestions, watching, queued, pending: _pending,
    completed, isLoading: suggestionsLoading, vote, submit,
  } = useSuggestions(streamer?.id)

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
        <div className="max-w-4xl mx-auto px-4 -mt-12">
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

  // Filtrar por categoria localmente
  const allSuggestions = categoryFilter === 'all'
    ? suggestions
    : suggestions.filter((s) => s.category === categoryFilter)

  const topVoted = [...allSuggestions]
    .filter((s) => !['completed', 'rejected'].includes(s.status))
    .sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0))
    .slice(0, 10)

  const recentSuggestions = [...allSuggestions]
    .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())
    .slice(0, 10)

  const tabs: { id: TabType; label: string; icon: typeof Play }[] = [
    { id: 'queue', label: 'Fila', icon: Play },
    { id: 'top', label: 'Mais Votados', icon: Trophy },
    { id: 'recent', label: 'Recentes', icon: Clock },
    { id: 'completed', label: 'Concluídos', icon: History },
  ]

  const categories: { value: CategoryFilter; label: string }[] = [
    { value: 'all', label: 'Todos' },
    { value: 'movie', label: 'Filmes' },
    { value: 'series', label: 'Séries' },
    { value: 'anime', label: 'Animes' },
    { value: 'other', label: 'Outros' },
  ]

  const getTabItems = (): Suggestion[] => {
    switch (tab) {
      case 'queue': return queued
      case 'top': return topVoted
      case 'recent': return recentSuggestions
      case 'completed': return completed
      default: return []
    }
  }

  return (
    <div className="min-h-screen">
      {/* Capa */}
      <div className="relative h-52 bg-bg-secondary overflow-hidden">
        {streamer.cover_url ? (
          <img
            src={streamer.cover_url}
            alt={`Capa de ${streamer.channel_name}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-brand-purple/20 via-bg-tertiary to-bg-secondary" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-bg-primary/80 to-transparent" />
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        {/* Avatar e info */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 -mt-14 mb-8">
          <div className="flex items-end gap-4">
            <Avatar
              src={streamer.avatar_url}
              alt={streamer.channel_name}
              fallback={streamer.channel_name}
              size="xl"
              className="ring-4 ring-bg-primary"
            />
            <div className="pb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-content-primary">{streamer.channel_name}</h1>
                <Badge variant="purple" size="sm">@{streamer.slug}</Badge>
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

          <div className="flex items-center gap-2 pb-2">
            {streamer.twitch_broadcaster_id && (
              <a
                href={`https://twitch.tv/${streamer.slug}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="secondary" size="sm" leftIcon={<ExternalLink size={14} />}>
                  Twitch
                </Button>
              </a>
            )}
            <Button
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
                <span className="font-medium">{watching.submitter?.display_name ?? 'viewer'}</span>
              </p>
            </div>
          </div>
        )}

        {/* Filtros de categoria */}
        <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1">
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
        <div className="flex gap-1 mb-6 bg-bg-secondary border border-border rounded-xl p-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200',
                tab === id
                  ? 'bg-bg-primary text-content-primary shadow'
                  : 'text-content-muted hover:text-content-secondary'
              )}
            >
              <Icon size={14} />
              <span className="hidden sm:block">{label}</span>
            </button>
          ))}
        </div>

        {/* Lista de sugestões */}
        <div className="space-y-3 mb-12">
          {suggestionsLoading ? (
            Array.from({ length: 3 }).map((_, i) => <SkeletonSuggestion key={i} />)
          ) : getTabItems().length === 0 ? (
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
                    ? `Envie a primeira sugestão de filme, série ou anime para ${streamer.channel_name} assistir na live!`
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
            getTabItems().map((suggestion) => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                onVote={vote}
                canVote={!!user}
              />
            ))
          )}
        </div>
      </div>

      {/* Modal de sugestão */}
      {streamer && (
        <SuggestModal
          isOpen={suggestOpen}
          onClose={() => setSuggestOpen(false)}
          streamerId={streamer.id}
          onSubmit={submit}
        />
      )}
    </div>
  )
}
