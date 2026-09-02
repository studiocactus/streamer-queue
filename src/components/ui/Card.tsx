import { cn } from '@/lib/utils'
import type { HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean
  glow?: boolean
}

export function Card({ className, hover, glow, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'bg-bg-secondary/90 border border-border rounded-2xl backdrop-blur-sm shadow-[0_18px_55px_rgba(0,0,0,0.12)]',
        hover && 'transition-all duration-300 hover:border-brand-purple/30 hover:shadow-[0_22px_70px_rgba(0,0,0,0.22)] hover:-translate-y-1 cursor-pointer',
        glow && 'shadow-lg shadow-brand-purple/10 border-brand-purple/20',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {}

export function CardHeader({ className, children, ...props }: CardHeaderProps) {
  return (
    <div className={cn('border-b border-border p-4 sm:p-5', className)} {...props}>
      {children}
    </div>
  )
}

interface CardContentProps extends HTMLAttributes<HTMLDivElement> {}

export function CardContent({ className, children, ...props }: CardContentProps) {
  return (
    <div className={cn('p-4 sm:p-5', className)} {...props}>
      {children}
    </div>
  )
}

interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {}

export function CardFooter({ className, children, ...props }: CardFooterProps) {
  return (
    <div
      className={cn('flex items-center border-t border-border px-4 py-4 sm:px-5', className)}
      {...props}
    >
      {children}
    </div>
  )
}
