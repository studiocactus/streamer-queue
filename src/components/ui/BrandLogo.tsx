import { cn } from '@/lib/utils'

interface BrandLogoProps {
  className?: string
}

export function BrandLogo({ className }: BrandLogoProps) {
  return (
    <img
      src="/watchqueue.svg"
      alt="WatchQueue"
      className={cn('block h-auto w-full', className)}
    />
  )
}
