import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Play, Radio, SkipForward } from 'lucide-react'
import { useStreamer } from '@/hooks/useStreamer'
import { useSuggestions } from '@/hooks/useSuggestions'
import { QRCode } from '@/components/ui/QRCode'
import { categoryLabel } from '@/lib/utils'
import type { SuggestionCategory } from '@/types'

export default function OverlayPage() {
  const { slug } = useParams<{ slug: string }>()
  const { streamer, isLoading } = useStreamer(slug)
  const { watching, queued, approved } = useSuggestions(streamer?.id)
  const next = queued[0] ?? approved[0]
  const channelUrl = `${window.location.origin}/${streamer?.slug ?? slug ?? ''}`

  useEffect(() => {
    const previousBodyBackground = document.body.style.background
    const previousRootBackground = document.getElementById('root')?.style.background ?? ''
    document.body.style.background = 'transparent'
    if (document.getElementById('root')) document.getElementById('root')!.style.background = 'transparent'
    return () => {
      document.body.style.background = previousBodyBackground
      if (document.getElementById('root')) document.getElementById('root')!.style.background = previousRootBackground
    }
  }, [])

  if (isLoading) return null
  if (!streamer) return <div className="fixed bottom-6 left-6 rounded-2xl bg-bg-secondary/95 px-5 py-4 text-white">Canal indisponível</div>

  return (
    <main className="fixed inset-0 overflow-hidden bg-transparent p-[clamp(18px,3vw,56px)] text-white">
      <section className="absolute bottom-[clamp(18px,3vw,56px)] left-[clamp(18px,3vw,56px)] flex max-w-[min(920px,calc(100vw-36px))] items-stretch overflow-hidden rounded-3xl border border-white/15 bg-[#111119]/90 shadow-[0_30px_100px_rgba(0,0,0,.55),0_0_70px_rgba(145,70,255,.22)] backdrop-blur-xl">
        <div className="min-w-0 flex-1 p-[clamp(18px,2.3vw,30px)]">
          <div className="mb-5 flex items-center gap-2 text-[clamp(11px,1.1vw,14px)] font-semibold uppercase tracking-[.16em] text-brand-green">
            <Radio size={16} className="animate-pulse" /> Fila da comunidade
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <OverlayItem icon={<Play size={18} className="fill-current" />} label="Assistindo agora" title={watching?.title ?? 'A live vai começar'} category={watching?.category} active />
            <OverlayItem icon={<SkipForward size={18} />} label="Próximo da fila" title={next?.title ?? 'Envie sua sugestão'} category={next?.category} />
          </div>
        </div>
        <div className="hidden w-[clamp(150px,17vw,210px)] shrink-0 flex-col items-center justify-center border-l border-white/10 bg-brand-purple/10 p-5 sm:flex">
          <QRCode value={channelUrl} size={150} className="h-auto w-full" />
          <p className="mt-2 text-center text-[11px] font-medium text-content-secondary">Aponte a câmera e participe</p>
        </div>
      </section>
    </main>
  )
}

function OverlayItem({ icon, label, title, category, active = false }: { icon: React.ReactNode; label: string; title: string; category?: SuggestionCategory; active?: boolean }) {
  return (
    <div className={`min-w-0 rounded-2xl border p-4 ${active ? 'border-brand-purple/35 bg-brand-purple/15' : 'border-white/10 bg-white/[.035]'}`}>
      <p className="mb-2 flex items-center gap-2 text-[clamp(11px,1vw,13px)] text-content-secondary">{icon}{label}</p>
      <p className="truncate text-[clamp(17px,1.7vw,24px)] font-bold">{title}</p>
      {category && <p className="mt-1 text-xs text-content-muted">{categoryLabel(category)}</p>}
    </div>
  )
}
