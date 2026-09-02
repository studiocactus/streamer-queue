import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Tv2, Play, X, RefreshCw, ArrowUpRight, ArrowRight, ListVideo, Radio } from 'lucide-react'
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
  const profilePath = `/streamer/${streamer.slug.toLowerCase()}`

  return (
    <article className="group block h-full rounded-3xl">
      <Card
        className="relative flex h-full flex-col overflow-hidden rounded-3xl border-brand-purple/35 bg-bg-secondary/95 shadow-[0_18px_55px_rgba(145,70,255,0.12)] ring-1 ring-brand-purple/10 transition-all duration-300 group-hover:-translate-y-1.5 group-hover:border-brand-purple/70 group-hover:shadow-[0_24px_70px_rgba(145,70,255,0.24)]"
      >
        <div className="pointer-events-none absolute -right-20 -top-20 z-10 h-48 w-48 rounded-full bg-brand-purple/15 blur-3xl transition-opacity duration-300 group-hover:opacity-90" />
        <div className="pointer-events-none absolute inset-x-8 top-0 z-20 h-px bg-gradient-to-r from-transparent via-brand-purple/80 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
        {/* Cover */}
        <div className="relative h-36 overflow-hidden bg-bg-tertiary">
          {streamer.cover_url ? (
            <img
              src={streamer.cover_url}
              alt={`Capa de ${streamer.channel_name}`}
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_25%_20%,rgba(145,70,255,0.4),transparent_42%),linear-gradient(135deg,#211735,#12121a)]">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-brand-purple/25 bg-brand-purple/10 shadow-[0_12px_35px_rgba(145,70,255,0.18)] transition-transform duration-300 group-hover:rotate-3 group-hover:scale-105">
                <Tv2 size={27} className="text-brand-purple" />
              </div>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-bg-secondary via-bg-secondary/5 to-transparent" />
          {streamer.watching_now_title && (
            <div className="absolute top-3 right-3">
              <Badge variant="purple" size="sm" className="border-brand-purple/30 bg-brand-purple/90 text-[10px] text-white shadow-lg backdrop-blur-md">
                <Play size={10} className="mr-1 fill-current" />
                Assistindo agora
              </Badge>
            </div>
          )}
        </div>

        <div className="relative flex flex-1 flex-col gap-4 p-5 pt-3">
          <div className="flex items-start gap-3">
            <Avatar
              src={streamer.avatar_url}
              alt={streamer.channel_name}
              fallback={streamer.channel_name}
              size="md"
              className="-mt-10 ring-4 ring-bg-secondary shadow-[0_10px_25px_rgba(0,0,0,0.35)] transition-transform duration-300 group-hover:scale-105"
            />
            <div className="-mt-8 min-w-0 flex-1 pt-0.5">
              <div className="flex min-w-0 items-center gap-2">
                <Link
                  to={profilePath}
                  className="focus-ring min-w-0 rounded-md text-base font-bold text-content-primary transition-colors hover:text-brand-purple-light"
                >
                  <h3 className="truncate">{streamer.channel_name}</h3>
                </Link>
                <span className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[9px] font-semibold uppercase leading-none tracking-wide backdrop-blur-md',
                  streamer.is_live
                    ? 'border-red-400/30 bg-red-500/90 text-white shadow-[0_5px_18px_rgba(239,68,68,0.25)]'
                    : 'border-white/10 bg-bg-tertiary/90 text-content-muted'
                )}>
                  {streamer.is_live ? <Radio size={9} /> : <span className="h-1.5 w-1.5 rounded-full bg-content-muted" />}
                  {streamer.is_live ? 'Ao vivo' : 'Offline'}
                </span>
              </div>
              <Link
                to={profilePath}
                className="focus-ring mt-0.5 inline-block rounded text-xs text-content-muted transition-colors hover:text-brand-purple-light"
              >
                @{streamer.slug}
              </Link>
            </div>
          </div>

          {streamer.bio && (
            <p className="min-h-10 text-xs leading-relaxed text-content-secondary line-clamp-2">{streamer.bio}</p>
          )}

          {streamer.watching_now_title && (
            <div className="relative overflow-hidden rounded-xl border border-brand-purple/30 bg-gradient-to-r from-brand-purple/15 to-brand-purple/5 px-3 py-2.5">
              <div className="absolute inset-y-0 left-0 w-0.5 bg-brand-purple" />
              <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-purple">Em destaque agora</p>
              <p className="mt-0.5 truncate text-xs font-semibold text-content-primary">{streamer.watching_now_title}</p>
            </div>
          )}

          <div className="mt-auto border-t border-border/80 pt-3">
            <div className="mb-3 flex items-center justify-between gap-3 text-xs text-content-muted">
              <span className="flex items-center gap-1.5 rounded-full bg-bg-tertiary px-2.5 py-1.5">
                <ListVideo size={12} className="text-brand-purple" />
                {(streamer.suggestion_count ?? 0)}{' '}
                {(streamer.suggestion_count ?? 0) === 1 ? 'sugestão' : 'sugestões'}
              </span>
              <Link
                to={profilePath}
                aria-label={`Ver perfil de ${streamer.channel_name} na plataforma`}
                className="focus-ring inline-flex items-center gap-1 rounded-md font-semibold text-content-secondary transition-colors hover:text-brand-purple-light"
              >
                Ver perfil <ArrowRight size={12} />
              </Link>
            </div>
            <a
              href={`https://www.twitch.tv/${encodeURIComponent(streamer.slug.toLowerCase())}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Abrir canal de ${streamer.channel_name} na Twitch`}
              className="focus-ring inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-purple to-purple-500 px-4 text-xs font-semibold text-white shadow-[0_8px_22px_rgba(145,70,255,0.25)] transition-all duration-300 hover:brightness-110 hover:shadow-[0_10px_28px_rgba(145,70,255,0.4)]"
            >
              Ver canal <ArrowUpRight size={13} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </a>
          </div>
        </div>
      </Card>
    </article>
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
    <div className="min-h-screen page-section">
      <div className="app-shell">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="section-heading mb-3">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-5 lg:gap-6">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-5 lg:gap-6">
            {streamers.map((streamer) => (
              <StreamerCard key={streamer.id} streamer={streamer} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
