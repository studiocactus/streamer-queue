import { Tv2 } from 'lucide-react'

export function PageLoading({ label = 'Preparando seu canal' }: { label?: string }) {
  return (
    <div className="min-h-[65vh]" aria-busy="true">
      <div role="status" aria-live="polite" className="fixed inset-0 z-[80] flex items-center justify-center bg-bg-primary/80 px-6 backdrop-blur-md animate-fade-in motion-reduce:animate-none">
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-7 flex h-24 w-24 items-center justify-center" aria-hidden="true">
            <div className="absolute inset-0 rounded-full border border-brand-purple/15" />
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-brand-purple border-r-brand-purple/40 motion-reduce:animate-none" />
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-brand-purple/25 bg-brand-purple/10 text-brand-purple shadow-[0_0_32px_rgba(145,70,255,0.12)]">
              <Tv2 size={28} strokeWidth={1.7} />
            </div>
          </div>
          <p className="text-lg font-semibold tracking-tight text-content-primary">{label}</p>
          <p className="mt-2 text-sm text-content-secondary">Só um instante, estamos carregando as informações.</p>
        </div>
      </div>
    </div>
  )
}
