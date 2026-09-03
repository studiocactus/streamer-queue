import { cn } from '@/lib/utils'

interface BrandLogoProps {
  className?: string
}

export function BrandLogo({ className }: BrandLogoProps) {
  return (
    <span className={cn('block', className)}>
      <img src="/watch-queue.svg" alt="WatchQueue" className="block h-auto w-full" />
    </span>
  )
}
