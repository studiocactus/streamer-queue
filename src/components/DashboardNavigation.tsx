import type { LucideIcon } from 'lucide-react'
import { ChevronRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type DashboardGroup<T extends string> = { label: string; tabs: { id: T; label: string; icon: LucideIcon }[] }
export function DashboardNavigation<T extends string>({ groups, active, onChange, loading, pending }: {
  groups: DashboardGroup<T>[]; active: T; onChange: (id: T) => void; loading: boolean; pending: number
}) {
  return <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
    <nav aria-label="Seções do painel" className="rounded-2xl border border-border bg-bg-secondary/80 p-3 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto">
      {loading ? <p role="status" className="flex min-h-11 items-center gap-2 px-2 text-sm text-content-secondary"><Loader2 size={16} className="animate-spin motion-reduce:animate-none" />Carregando menu…</p> : <>
        <div className="lg:hidden"><label htmlFor="dashboard-section" className="mb-2 block text-xs font-medium text-content-secondary">Ir para seção</label><select id="dashboard-section" value={active} onChange={event => onChange(event.target.value as T)} className="min-h-12 w-full rounded-xl border border-border bg-bg-primary px-3 text-sm text-content-primary focus-visible:outline focus-visible:outline-brand-purple">{groups.map(group => <optgroup key={group.label} label={group.label}>{group.tabs.map(tab => <option key={tab.id} value={tab.id}>{tab.label}{tab.id === 'kanban' && pending ? ` (${pending} pendentes)` : ''}</option>)}</optgroup>)}</select></div>
        <div className="hidden space-y-5 py-2 lg:block">{groups.map(group => <section key={group.label}>
          <h2 className="mb-2 px-3 text-xs font-medium text-content-secondary">{group.label}</h2>
          <div className="space-y-1">{group.tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => onChange(id)} aria-current={active === id ? 'page' : undefined} className={cn('flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-purple', active === id ? 'bg-brand-purple/15 text-content-primary ring-1 ring-inset ring-brand-purple/25' : 'text-content-secondary hover:bg-bg-tertiary hover:text-content-primary')}>
            <Icon size={17} className={cn('shrink-0', active === id && 'text-brand-purple')} /><span className="min-w-0 flex-1">{label}</span>
            {id === 'kanban' && pending > 0 ? <span aria-label={`${pending} pendentes`} className="rounded-md bg-status-pending/10 px-1.5 py-0.5 text-xs tabular-nums text-status-pending">{pending}</span> : active === id && <ChevronRight size={14} className="shrink-0 text-brand-purple" />}
          </button>)}</div>
        </section>)}</div>
      </>}
    </nav>
  </aside>
}
