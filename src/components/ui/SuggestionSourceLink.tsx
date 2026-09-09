import { ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { IconAction } from './IconAction'

export function SuggestionSourceLink({ url, title, className, iconOnly = false }: {
  url?: string | null
  title: string
  className?: string
  iconOnly?: boolean
}) {
  if (!url) return null

  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
  } catch {
    return null
  }

  if (iconOnly) return <IconAction href={url} label="Abrir conteúdo" className="border-brand-purple/25 text-brand-purple hover:text-brand-purple"><ExternalLink size={15} /></IconAction>

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={url}
      aria-label={`Abrir conteúdo: ${title} (nova aba)`}
      className={cn('inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-brand-purple/25 bg-brand-purple/10 px-3 text-xs font-semibold text-brand-purple transition-colors hover:bg-brand-purple/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary', className)}
    >
      <ExternalLink size={13} aria-hidden="true" /> Abrir conteúdo
    </a>
  )
}
