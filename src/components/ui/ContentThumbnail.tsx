import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ContentThumbnailProps {
  src?: string | null
  alt: string
  fallback: ReactNode
  className?: string
}

export function ContentThumbnail({ src, alt, fallback, className }: ContentThumbnailProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null)

  useEffect(() => {
    if (src !== failedSource) setFailedSource(null)
  }, [src, failedSource])

  if (!src || failedSource === src) return <>{fallback}</>

  return (
    <img
      src={src}
      alt={alt}
      className={cn('h-full w-full object-cover', className)}
      loading="lazy"
      onError={() => setFailedSource(src)}
    />
  )
}
