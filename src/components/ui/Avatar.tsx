import { cn } from '@/lib/utils'

interface AvatarProps {
  src?: string | null
  alt?: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  fallback?: string
}

export function Avatar({ src, alt = '', size = 'md', className, fallback }: AvatarProps) {
  const sizes = {
    xs: 'w-6 h-6 text-xs',
    sm: 'w-8 h-8 text-sm',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-lg',
  }

  const initial = fallback?.charAt(0).toUpperCase() ?? alt?.charAt(0).toUpperCase() ?? '?'

  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        className={cn(
          'rounded-full object-cover border-2 border-border bg-bg-tertiary shrink-0',
          sizes[size],
          className
        )}
        onError={(e) => {
          // Fallback se imagem falhar
          const target = e.currentTarget
          target.style.display = 'none'
          const next = target.nextElementSibling as HTMLElement
          if (next) next.style.display = 'flex'
        }}
      />
    )
  }

  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-semibold border-2 border-border bg-brand-purple/20 text-brand-purple shrink-0',
        sizes[size],
        className
      )}
      aria-label={alt}
    >
      {initial}
    </div>
  )
}

interface AvatarGroupProps {
  users: { src?: string | null; alt?: string }[]
  max?: number
  size?: AvatarProps['size']
}

export function AvatarGroup({ users, max = 4, size = 'sm' }: AvatarGroupProps) {
  const visible = users.slice(0, max)
  const overflow = users.length - max

  return (
    <div className="flex -space-x-2">
      {visible.map((user, i) => (
        <Avatar
          key={i}
          src={user.src}
          alt={user.alt}
          size={size}
          className="ring-2 ring-bg-primary"
        />
      ))}
      {overflow > 0 && (
        <div
          className={cn(
            'rounded-full flex items-center justify-center text-xs font-medium',
            'bg-bg-tertiary border-2 border-border text-content-secondary ring-2 ring-bg-primary',
            size === 'sm' && 'w-8 h-8',
            size === 'md' && 'w-10 h-10'
          )}
        >
          +{overflow}
        </div>
      )}
    </div>
  )
}
