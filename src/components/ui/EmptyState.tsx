import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
  compact?: boolean
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'py-8 px-4' : 'py-16 px-8',
        className
      )}
    >
      {icon && (
        <div
          className={cn(
            'rounded-2xl bg-bg-tertiary border border-border flex items-center justify-center text-content-muted mb-4',
            compact ? 'w-12 h-12' : 'w-16 h-16'
          )}
        >
          {icon}
        </div>
      )}
      <h3
        className={cn(
          'font-semibold text-content-primary',
          compact ? 'text-sm' : 'text-base'
        )}
      >
        {title}
      </h3>
      {description && (
        <p
          className={cn(
            'text-content-secondary mt-1 max-w-sm',
            compact ? 'text-xs' : 'text-sm'
          )}
        >
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
