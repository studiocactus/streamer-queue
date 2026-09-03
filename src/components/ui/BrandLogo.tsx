import { cn } from '@/lib/utils'

interface BrandLogoProps {
  className?: string
}

export function BrandLogo({ className }: BrandLogoProps) {
  return (
    <img
      src="/watch-queue.svg?v=original-20260903"
      alt="WatchQueue"
      className={cn('block h-auto w-full', className)}
    />
  )
}
