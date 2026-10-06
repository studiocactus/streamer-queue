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
    <section style={{ color: config.text, backgroundColor: `${config.background}eb`, borderColor: `${config.text}20`, width: vertical ? 400 : 1180, maxWidth: 'calc(100vw - 36px)', maxHeight: 'calc(100vh - 36px)' }} className={`absolute bottom-[18px] left-[18px] flex overflow-auto rounded-3xl border shadow-[0_24px_70px_rgba(0,0,0,.45),0_0_45px_rgba(145,70,255,.12)] backdrop-blur-xl ${vertical ? 'flex-col' : 'flex-row'}`}>
      <div className="min-w-0 flex-1 p-6">
        <h1 className="mb-5 flex items-center gap-2.5 text-sm font-semibold"><Radio size={18} className="shrink-0 text-brand-green" />Fila do Streamer — {streamer.channel_name}</h1>
        <div className={`grid gap-4 ${vertical ? '' : 'grid-cols-2'}`}>
          <div style={{ borderColor: 'rgba(145,70,255,.3)', backgroundColor: 'rgba(145,70,255,.12)' }} className="min-w-0 rounded-2xl border p-5">
            <p className="mb-3 flex items-center gap-2 text-sm opacity-80"><Play size={16} className="fill-current text-brand-purple" />Assistindo agora</p>
            <p className="break-words text-xl font-bold">{watching?.title ?? 'Nenhum conteúdo em reprodução'}</p>
            {watching && <p className="mt-2 text-xs opacity-70">{categoryLabel(watching.category)}</p>}
          </div>
          <div className="min-w-0">
            <p className="mb-3 flex items-center gap-2 text-xs font-medium opacity-70"><SkipForward size={16} />A seguir</p>
            <ol className="space-y-2">{next.map((item, index) => <li key={item.id} style={{ borderColor: `${config.text}14`, backgroundColor: `${config.text}06` }} className="flex items-start gap-3 rounded-xl border px-4 py-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-brand-purple/10 text-xs font-semibold text-brand-purple">{index + 1}</span><div className="min-w-0"><p className="break-words text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs opacity-70">{categoryLabel(item.category)}</p></div></li>)}</ol>
            {next.length === 0 && <p className="py-3 text-sm opacity-70">Nenhum conteúdo na fila.</p>}
          </div>
        </div>
      </div>
      <a href={channelUrl} target="_blank" rel="noopener noreferrer" style={{ borderColor: `${config.text}14`, backgroundColor: 'rgba(145,70,255,.06)' }} className={`flex shrink-0 flex-col items-center justify-center gap-3 p-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-purple ${vertical ? 'border-t' : 'w-[200px] border-l'}`}>
        <QRCode value={channelUrl} size={140} className="h-[140px] w-[140px] shrink-0" />
        <span className="text-center text-xs font-medium opacity-75">Verificar lista completa</span>
      </a>
    </section>
  </main>
}
