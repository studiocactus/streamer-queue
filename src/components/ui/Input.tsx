import { cn } from '@/lib/utils'
import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

export function Input({
  className,
  label,
  error,
  hint,
  leftIcon,
  rightIcon,
  id,
  ...props
}: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-content-primary">
          {label}
          {props.required && <span className="text-status-rejected ml-1">*</span>}
        </label>
      )}
      <div className="relative flex items-center">
        {leftIcon && (
          <span className="absolute left-3 text-content-muted">{leftIcon}</span>
        )}
        <input
          id={inputId}
          className={cn(
            'w-full bg-bg-tertiary border border-border rounded-xl px-3 py-2.5 text-sm text-content-primary',
            'placeholder:text-content-muted',
            'focus:outline-none focus:ring-2 focus:ring-brand-purple/50 focus:border-brand-purple',
            'transition-colors duration-200',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            error && 'border-status-rejected focus:ring-status-rejected/50 focus:border-status-rejected',
            leftIcon ? 'pl-9' : '',
            rightIcon ? 'pr-9' : '',
            className
          )}
          {...props}
        />
        {rightIcon && (
          <span className="absolute right-3 text-content-muted">{rightIcon}</span>
        )}
      </div>
      {error && <p className="text-xs text-status-rejected">{error}</p>}
      {hint && !error && <p className="text-xs text-content-muted">{hint}</p>}
    </div>
  )
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  hint?: string
}

export function Textarea({
  className,
  label,
  error,
  hint,
  id,
  ...props
}: TextareaProps) {
  const textareaId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={textareaId} className="text-sm font-medium text-content-primary">
          {label}
          {props.required && <span className="text-status-rejected ml-1">*</span>}
        </label>
      )}
      <textarea
        id={textareaId}
        className={cn(
          'w-full bg-bg-tertiary border border-border rounded-xl px-3 py-2.5 text-sm text-content-primary',
          'placeholder:text-content-muted resize-none',
          'focus:outline-none focus:ring-2 focus:ring-brand-purple/50 focus:border-brand-purple',
          'transition-colors duration-200',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          error && 'border-status-rejected',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-status-rejected">{error}</p>}
      {hint && !error && <p className="text-xs text-content-muted">{hint}</p>}
    </div>
  )
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: { value: string; label: string }[]
}

export function Select({ className, label, error, options, id, ...props }: SelectProps) {
  const selectId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={selectId} className="text-sm font-medium text-content-primary">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={cn(
          'w-full bg-bg-tertiary border border-border rounded-xl px-3 py-2.5 text-sm text-content-primary',
          'focus:outline-none focus:ring-2 focus:ring-brand-purple/50 focus:border-brand-purple',
          'transition-colors duration-200 cursor-pointer',
          error && 'border-status-rejected',
          className
        )}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-bg-secondary">
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-status-rejected">{error}</p>}
    </div>
  )
}
