import { cn, statusColor, statusLabel, categoryLabel } from '@/lib/utils'
import type { SuggestionStatus, SuggestionCategory } from '@/types'
import type { HTMLAttributes } from 'react'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'status' | 'category' | 'purple' | 'green'
  status?: SuggestionStatus
  category?: SuggestionCategory
  size?: 'sm' | 'md'
}

export function Badge({
  className,
  variant = 'default',
  status,
  category,
  size = 'sm',
  children,
  ...props
}: BadgeProps) {
  const sizes = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-3 py-1',
  }

  if (variant === 'status' && status) {
    return (
      <span
        className={cn(
          'inline-flex items-center font-medium rounded-full border',
          statusColor(status),
          sizes[size],
          className
        )}
        {...props}
      >
        {statusLabel(status)}
      </span>
    )
  }

  if (variant === 'category' && category) {
    const categoryColors: Record<SuggestionCategory, string> = {
      movie: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      series: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      anime: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
      other: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
    }
    return (
      <span
        className={cn(
          'inline-flex items-center font-medium rounded-full border',
          categoryColors[category],
          sizes[size],
          className
        )}
        {...props}
      >
        {categoryLabel(category)}
      </span>
    )
  }

  const variantStyles = {
    default: 'bg-bg-tertiary text-content-secondary border-border',
    purple: 'bg-brand-purple/10 text-brand-purple border-brand-purple/20',
    green: 'bg-brand-green/10 text-brand-green border-brand-green/20',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-full border',
        variantStyles[variant as keyof typeof variantStyles] ?? variantStyles.default,
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}
