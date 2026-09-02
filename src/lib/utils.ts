import type { SuggestionCategory, SuggestionStatus } from '@/types'

export function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateString))
}

export function formatRelativeDate(dateString: string): string {
  const now = new Date()
  const date = new Date(dateString)
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 60) return 'agora mesmo'
  if (diffMins < 60) return `há ${diffMins} min`
  if (diffHours < 24) return `há ${diffHours}h`
  if (diffDays < 7) return `há ${diffDays} dias`
  return formatDate(dateString)
}

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function categoryLabel(category: SuggestionCategory): string {
  const labels: Record<SuggestionCategory, string> = {
    movie: 'Filme',
    series: 'Série',
    anime: 'Anime',
    react: 'React',
    music: 'Música',
    other: 'Outro',
  }
  return labels[category]
}

export function statusLabel(status: SuggestionStatus): string {
  const labels: Record<SuggestionStatus, string> = {
    pending: 'Pendente',
    approved: 'Aprovado',
    queued: 'Na Fila',
    watching: 'Assistindo',
    completed: 'Concluído',
    rejected: 'Rejeitado',
  }
  return labels[status]
}

export function statusColor(status: SuggestionStatus): string {
  const colors: Record<SuggestionStatus, string> = {
    pending: 'bg-status-pending/10 text-status-pending border-status-pending/20',
    approved: 'bg-status-approved/10 text-status-approved border-status-approved/20',
    queued: 'bg-status-queued/10 text-status-queued border-status-queued/20',
    watching: 'bg-status-watching/10 text-status-watching border-status-watching/20',
    completed: 'bg-status-completed/10 text-status-completed border-status-completed/20',
    rejected: 'bg-status-rejected/10 text-status-rejected border-status-rejected/20',
  }
  return colors[status]
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}
