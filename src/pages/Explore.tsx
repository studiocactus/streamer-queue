import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Tv2, ThumbsUp, Play, X, RefreshCw } from 'lucide-react'
import { useStreamers } from '@/hooks/useStreamer'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { SkeletonStreamerCard } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/utils'
import type { Streamer } from '@/types'

function StreamerCard({ streamer }: { streamer: Streamer }) {
  return (
    <Link to={`/streamer/${streamer.slug.toLowerCase()}`} className="block group">
      <Card
        hover
        className="overflow-hidden h-full flex flex-col"
      >
        {/* Cover */}
        <div className="relative h-28 bg-bg-tertiary overflow-hidden">
          {streamer.cover_url ? (
            <img
              src={streamer.cover_url}
              alt={`Capa de ${streamer.channel_name}`}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-brand-purple/20 to-bg-tertiary flex items-center justify-center">
              <Tv2 size={32} className="text-brand-purple/30" />
            </div>
          )}
          {streamer.watching_now_title && (
            <div className="absolute top-3 right-3">
              <Badge variant="purple" size="sm" className="text-xs">
                <Play size={10} className="mr-1 fill-current" />
                Assistindo agora
              </Badge>
            </div>
          )}
        </div>

        <div className="p-4 flex flex-col gap-3 flex-1">
          <div className="flex items-center gap-3">
            <Avatar
              src={streamer.avatar_url}
              alt={streamer.channel_name}
              fallback={streamer.channel_name}
              size="md"
              className="-mt-8 ring-2 ring-bg-secondary"
            />
            <div className="min-w-0">
              <h3 className="font-semibold text-content-primary truncate">
                {streamer.channel_name}
              </h3>
              <p className="text-xs text-content-muted">@{streamer.slug}</p>
            </div>
          </div>

          {streamer.bio && (
            <p className="text-xs text-content-secondary line-clamp-2">{streamer.bio}</p>
          )}

          {streamer.watching_now_title && (
            <p className="truncate rounded-lg border border-brand-purple/20 bg-brand-purple/10 px-2.5 py-2 text-xs text-content-secondary">
              <span className="text-content-muted">Agora:</span>{' '}
              <span className="font-medium text-content-primary">{streamer.watching_now_title}</span>
            </p>
          )}

          <div className="flex items-center justify-between mt-auto pt-2 border-t border-border">
            <div className="flex items-center gap-3 text-xs text-content-muted">
              <span className="flex items-center gap-1">
                <ThumbsUp size={11} />
                {(streamer.suggestion_count ?? 0)} sugestões
              </span>
            </div>
            <span className="text-xs text-brand-purple font-medium group-hover:underline">
              Ver canal →
            </span>
          </div>
        </div>
      </Card>
    </Link>
  )
}

export default function ExplorePage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 350)
    return () => window.clearTimeout(timeout)
  }, [search])

  const { streamers, isLoading, error } = useStreamers(debouncedSearch || undefined)

  return (
    <div className="min-h-screen py-12 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-content-primary mb-3">
            Explorar Streamers
          </h1>
          <p className="text-content-secondary">
            Encontre canais e sugira seu próximo conteúdo favorito.
          </p>
        </div>

        {/* Search */}
        <div className="max-w-xl mx-auto mb-8">
          <Input
            placeholder="Buscar por nome do streamer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search size={16} />}
            rightIcon={search ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Limpar busca"
                className="rounded-md p-1 text-content-muted hover:bg-bg-tertiary hover:text-content-primary"
              >
                <X size={14} />
              </button>
            ) : undefined}
          />
        </div>

        {!isLoading && !error && streamers.length > 0 && (
          <div className="mb-5 flex items-center justify-between gap-4 border-b border-border pb-4">
            <p className="text-sm text-content-secondary">
              <span className="font-semibold text-content-primary">{streamers.length}</span>{' '}
              {streamers.length === 1 ? 'canal encontrado' : 'canais encontrados'}
              {debouncedSearch && <> para “{debouncedSearch}”</>}
            </p>
            <p className="hidden text-xs text-content-muted sm:block">
              Escolha um canal para sugerir e votar
            </p>
          </div>
        )}

        {/* Grid */}
        {error ? (
          <EmptyState
            icon={<RefreshCw size={24} />}
            title="Não foi possível carregar os canais"
            description="Verifique sua conexão e tente novamente em alguns instantes."
          />
        ) : isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonStreamerCard key={i} />
            ))}
          </div>
        ) : streamers.length === 0 ? (
          <EmptyState
            icon={<Search size={24} />}
            title={debouncedSearch ? 'Nenhum streamer encontrado' : 'Nenhum canal disponível'}
            description={
              debouncedSearch
                ? `Não encontramos nenhum canal com "${debouncedSearch}".`
                : 'Seja o primeiro a criar um canal no WatchQueue!'
            }
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {streamers.map((streamer) => (
              <StreamerCard key={streamer.id} streamer={streamer} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
