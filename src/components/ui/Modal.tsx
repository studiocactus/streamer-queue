import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './Button'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  description?: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  footer?: ReactNode
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'md',
  footer,
}: ModalProps) {
  // Fechar com ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      document.addEventListener('keydown', handler)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-2xl',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-2 sm:items-center sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        className={cn(
          'relative flex max-h-[calc(100dvh-1rem)] w-full flex-col overflow-hidden rounded-2xl border border-border bg-bg-secondary shadow-2xl sm:max-h-[calc(100dvh-2rem)]',
          'animate-slide-up',
          sizes[size]
        )}
      >
        {/* Header */}
        {(title || description) && (
          <div className="flex items-start justify-between border-b border-border p-4 sm:p-6">
            <div>
              {title && (
                <h2 id="modal-title" className="text-lg font-semibold text-content-primary">
                  {title}
                </h2>
              )}
              {description && (
                <p className="text-sm text-content-secondary mt-1">{description}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="ml-4 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-content-muted transition-colors hover:bg-bg-tertiary hover:text-content-primary sm:h-9 sm:w-9"
              aria-label="Fechar"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {/* Body */}
        <div className="overflow-y-auto p-4 sm:p-6">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="flex flex-wrap justify-end gap-3 border-t border-border px-4 py-4 sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
