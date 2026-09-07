import { Moon, Sun } from 'lucide-react'
import type { Theme } from '@/hooks/useTheme'
import { cn } from '@/lib/utils'

interface ThemeToggleProps {
  theme: Theme
  onThemeChange: (theme: Theme) => void
}

export function ThemeToggle({ theme, onThemeChange }: ThemeToggleProps) {
  return (
    <div
      className="focus-within:ring-2 focus-within:ring-brand-purple/50 flex h-10 shrink-0 items-center rounded-full border border-border bg-bg-secondary p-1 shadow-sm"
      aria-label="Escolher tema"
    >
      <button
        type="button"
        onClick={() => onThemeChange('light')}
        aria-pressed={theme === 'light'}
        title="Modo claro"
        className={cn(
          'flex h-8 items-center justify-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-all sm:px-3',
          theme === 'light'
            ? 'bg-white text-slate-800 shadow-sm'
            : 'text-content-muted hover:text-content-primary',
        )}
      >
        <Sun size={16} />
        <span className="hidden sm:inline">Claro</span>
      </button>
      <button
        type="button"
        onClick={() => onThemeChange('dark')}
        aria-pressed={theme === 'dark'}
        title="Modo escuro"
        className={cn(
          'flex h-8 items-center justify-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-all sm:px-3',
          theme === 'dark'
            ? 'bg-brand-purple text-white shadow-[0_5px_14px_rgba(122,53,224,0.28)]'
            : 'text-content-muted hover:text-content-primary',
        )}
      >
        <Moon size={15} />
        <span className="hidden sm:inline">Escuro</span>
      </button>
    </div>
  )
}
