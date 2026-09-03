import { cn } from '@/lib/utils'

interface BrandLogoProps {
  className?: string
}

export function BrandLogo({ className }: BrandLogoProps) {
  return (
    <span className={cn('brand-logo relative block', className)}>
      <img src="/watch-queue.svg" alt="WatchQueue" className="block h-auto w-full" />
      <img
        src="/watch-queue.svg"
        alt=""
        aria-hidden="true"
        className="brand-logo__queue-glow pointer-events-none absolute inset-0 h-auto w-full"
      />
    </span>
  )
}
