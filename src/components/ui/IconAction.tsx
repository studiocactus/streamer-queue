import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { label: string; href?: string; children: ReactNode }

export function IconAction({ label, href, children, className, ...props }: Props) {
  const id = useId()
  const anchor = useRef<HTMLSpanElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const show = () => {
    const rect = anchor.current?.getBoundingClientRect()
    if (rect) setPosition({ left: Math.max(112, Math.min(window.innerWidth - 112, rect.left + rect.width / 2)), top: rect.bottom + 8 > window.innerHeight - 48 ? rect.top - 48 : rect.bottom + 8 })
  }
  useEffect(() => {
    if (!position) return
    const hide = () => setPosition(null)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    return () => {
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
    }
  }, [position])
  const styles = cn('inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-content-secondary transition-colors hover:bg-bg-tertiary hover:text-content-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple disabled:cursor-not-allowed disabled:opacity-30', className)
  return (
    <span ref={anchor} className="inline-flex shrink-0" onMouseEnter={show} onMouseLeave={() => setPosition(null)} onFocus={show} onBlur={() => setPosition(null)} onKeyDown={(event) => { if (event.key === 'Escape') setPosition(null) }}>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`${label} (nova aba)`} aria-describedby={position ? id : undefined} className={styles}>{children}</a>
      ) : (
        <button type="button" {...props} aria-label={label} aria-describedby={position ? id : undefined} className={styles}>{children}</button>
      )}
      {position && createPortal(
        <div id={id} role="tooltip" className="pointer-events-none fixed z-[100] w-max max-w-52 -translate-x-1/2" style={position}>
          <div className="animate-fade-in rounded-lg border border-border-light bg-bg-secondary px-3 py-2 text-center text-xs font-medium text-content-primary shadow-lg motion-reduce:animate-none">{label}</div>
        </div>, document.body,
      )}
    </span>
  )
}
