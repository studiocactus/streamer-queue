import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Tv2, ThumbsUp, Eye, Play } from 'lucide-react'
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
          {/* Live indicator */}
          <div className="absolute top-3 right-3">
            <Badge variant="purple" size="sm" className="text-xs">
              <span className="live-dot mr-1.5" />
              Live
            </Badge>
          </div>
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

  // Debounce simples
  const handleSearch = (value: string) => {
    setSearch(value)
    clearTimeout(window._searchTimeout)
    window._searchTimeout = setTimeout(() => setDebouncedSearch(value), 400)
  }

  const { streamers, isLoading } = useStreamers(debouncedSearch || undefined)

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
        <div className="max-w-lg mx-auto mb-10">
          <Input
            placeholder="Buscar streamer..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            leftIcon={<Search size={16} />}
          />
        </div>

        {/* Grid */}
        {isLoading ? (
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

// Tipagem para o timeout global
declare global {
  interface Window { _searchTimeout: ReturnType<typeof setTimeout> }
}
