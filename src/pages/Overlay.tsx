import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Play, Radio, SkipForward } from 'lucide-react'
import { useStreamer } from '@/hooks/useStreamer'
import { useSuggestions } from '@/hooks/useSuggestions'
import { QRCode } from '@/components/ui/QRCode'
import { categoryLabel } from '@/lib/utils'
import { normalizeOverlayConfig } from '@/lib/overlay'

export default function OverlayPage() {
  const { slug } = useParams<{ slug: string }>()
  const { streamer, isLoading } = useStreamer(slug)
  const { watching, queued } = useSuggestions(streamer?.id)
  const next = queued.slice(0, 3)
  const config = normalizeOverlayConfig(streamer?.overlay_config)
  const vertical = config.orientation === 'vertical'
  const channelUrl = `${window.location.origin}/${streamer?.slug ?? slug ?? ''}`
  useEffect(() => {
    const root = document.getElementById('root')
    const bodyBackground = document.body.style.background
    const rootBackground = root?.style.background ?? ''
    document.body.style.background = 'transparent'
    if (root) root.style.background = 'transparent'
    return () => {
      document.body.style.background = bodyBackground
      if (root) root.style.background = rootBackground
    }
  }, [])
  if (isLoading) return null
  if (!streamer) return <div className="fixed bottom-6 left-6 rounded-2xl bg-bg-secondary/95 px-5 py-4 text-white">Canal indisponível</div>
  return <main className="fixed inset-0 overflow-hidden bg-transparent">
    <section style={{ color: config.text, backgroundColor: config.background, width: vertical ? 400 : 1180, maxWidth: 'calc(100vw - 36px)', maxHeight: 'calc(100vh - 36px)' }} className={`absolute bottom-[18px] left-[18px] flex overflow-auto rounded-3xl border border-current/20 shadow-2xl ${vertical ? 'flex-col' : 'flex-row'}`}>
      <div className="min-w-0 flex-1 p-5">
        <h1 className="mb-4 flex items-center gap-2 text-base font-semibold"><Radio size={18} className="shrink-0" />Fila do Streamer — {streamer.channel_name}</h1>
        <div className={`grid gap-3 ${vertical ? '' : 'grid-cols-2'}`}>
          <div className="min-w-0 rounded-2xl border border-current/30 p-4">
            <p className="mb-3 flex items-center gap-2 text-sm opacity-80"><Play size={16} className="fill-current" />Assistindo agora</p>
            <p className="break-words text-xl font-bold">{watching?.title ?? 'Nenhum conteúdo em reprodução'}</p>
            {watching && <p className="mt-2 text-xs opacity-70">{categoryLabel(watching.category)}</p>}
          </div>
          <div className="min-w-0">
            <p className="mb-2 flex items-center gap-2 text-sm"><SkipForward size={16} />A seguir</p>
            <ol className="space-y-2">{next.map((item, index) => <li key={item.id} className="flex items-start gap-3 rounded-xl border border-current/15 p-3"><span className="text-sm opacity-70">{index + 1}</span><div className="min-w-0"><p className="break-words text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs opacity-70">{categoryLabel(item.category)}</p></div></li>)}</ol>
            {next.length === 0 && <p className="py-3 text-sm opacity-70">Nenhum conteúdo na fila.</p>}
          </div>
        </div>
      </div>
      <a href={channelUrl} target="_blank" rel="noopener noreferrer" className={`flex shrink-0 items-center justify-center gap-3 border-current/15 p-5 ${vertical ? 'border-t' : 'w-[180px] flex-col border-l'}`}>
        <QRCode value={channelUrl} size={140} className="h-[140px] w-[140px] shrink-0" />
        <span className="text-center text-xs font-medium">Verificar lista completa</span>
      </a>
    </section>
  </main>
}
