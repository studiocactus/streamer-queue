import { useEffect, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { supabaseUrl } from '@/lib/supabase'
import { type ObsState, obsLabels, obsTime } from '@/lib/obs-player'
import { loadYoutubeApi, type YoutubePlayer } from '@/lib/youtube-player'

// No account session is needed or shared with the OBS browser. The fragment is never
// sent as a URL query/referrer; only the scoped RPC receives the revocable capability.
const receiver = createClient(supabaseUrl, import.meta.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'obs-receiver' } })
export default function ObsPlayer() {
 const host = useRef<HTMLDivElement>(null)
 const clientId = useRef(crypto.randomUUID())
 const [state, setState] = useState<ObsState | null>(null)
 const [failure, setFailure] = useState('')
 const [clock, setClock] = useState({ position: 0, duration: 0 })
 const playRef = useRef<() => void>(() => {})
 useEffect(() => {
  const token = window.location.hash.slice(1)
  if (!/^[a-f0-9]{64}$/.test(token)) { setFailure('Link inválido. Copie o link privado na Central do canal.'); return }
  let stopped = false, player: YoutubePlayer | undefined, ready = false, generation = -1, applied = -1
  let current: ObsState | null = null, pending: string | null = null, failed = false, timeout = 0, requestSequence = 0, loadingSince = 0
  const client = clientId.current
  const destroy = () => { ready = false; player?.destroy(); player = undefined; if (host.current) host.current.replaceChildren() }
  playRef.current = () => { if (ready) player?.playVideo() }
  const apply = async (next: ObsState) => {
   if (stopped) return
   if (next.state === 'loading' && (current?.state !== 'loading' || current?.revision !== next.revision)) loadingSince = Date.now()
   current = next; setState(next)
   if (!next.video_id || ['idle','ended','countdown'].includes(next.state)) { destroy(); generation = -1; return }
   if (generation !== next.generation || !player) {
    destroy(); generation = next.generation; applied = -1; pending = null
    const selected = generation
    try {
     const api = await loadYoutubeApi()
     if (stopped || generation !== selected || !host.current) return
     const mount = document.createElement('div'); host.current.append(mount)
     player = new api.Player(mount, { width: '100%', height: '100%', videoId: next.video_id,
      playerVars: { origin: window.location.origin, playsinline: 1, autoplay: 0, controls: 1, start: next.position_seconds },
      events: {
       onReady: () => { if (!stopped && generation === selected) { ready = true; applied = -1 } },
       onError: () => { if (!stopped && generation === selected) pending = 'error' },
       onAutoplayBlocked: () => { if (!stopped && generation === selected) pending = 'blocked' },
      },
     })
    } catch (error) { pending = 'error'; setFailure(error instanceof Error ? error.message : 'Falha ao carregar player.') }
   }
   if (ready && player) {
    player.setVolume(next.volume)
    if (applied !== next.revision) {
     applied = next.revision
     if (next.desired === 'playing') player.playVideo()
     else player.pauseVideo()
    }
   }
  }
  const loop = async () => {
   if (stopped) return
   const position = ready ? Math.floor(player?.getCurrentTime() ?? 0) : current?.position_seconds ?? 0
   const duration = ready ? Math.floor(player?.getDuration() ?? 0) : current?.duration_seconds ?? 0
   const playerState = ready ? player?.getPlayerState() : undefined
   if (current?.state === 'loading' && loadingSince && Date.now() - loadingSince > 25000) pending = 'error'
   const event = pending ?? (playerState === 1 ? 'playing' : playerState === 2 ? 'paused' : playerState === 0 && current?.state === 'playing' ? 'ended' : 'tick')
   pending = null
   const sequence = ++requestSequence
   const abort = new AbortController()
   const limit = window.setTimeout(() => abort.abort(), 5000)
   try {
    const { data, error } = await receiver.rpc('obs_receiver', { p_token: token, p_client: client, p_revision: current?.revision ?? -1, p_event: event, p_position: position, p_duration: duration }).abortSignal(abort.signal)
    if (stopped || sequence !== requestSequence) return
    if (error) throw error
    setFailure(''); setClock({ position, duration })
    // A transient connection failure already silenced this browser. Tell the server
    // to pause before accepting any old play command on the next successful request.
    if (failed) { failed = false; pending = 'error'; current = data; setState(data); return }
    await apply(data as ObsState)
   } catch (error) {
    if (!stopped) { player?.pauseVideo(); applied = -1; failed = true; setFailure((error as {message?: string})?.message ?? 'Conexão interrompida. A reprodução foi pausada.') }
   } finally {
    window.clearTimeout(limit)
    if (!stopped) timeout = window.setTimeout(loop, 1000)
   }
  }
  void loop()
  const clockTimer = window.setInterval(() => { if (ready && player) setClock({ position: player.getCurrentTime(), duration: player.getDuration() }) }, 250)
  return () => { stopped = true; requestSequence++; window.clearTimeout(timeout); window.clearInterval(clockTimer); destroy() }
 }, [])
 return <main className="fixed inset-0 flex flex-col overflow-hidden bg-black text-white">
  <div className="relative min-h-0 flex-1">
   <div ref={host} className="h-full w-full [&_iframe]:h-full [&_iframe]:w-full" />
   {(!state?.video_id || ['idle','ended','countdown'].includes(state.state)) && <div className="absolute inset-0 flex items-center justify-center bg-[#0d0d12] p-8 text-center"><div><p className="text-[clamp(24px,3vw,64px)] font-bold">{state?.state === 'countdown' ? `Próximo vídeo em ${state.countdown}…` : state?.state === 'ended' ? 'Vídeo concluído' : 'Player para OBS'}</p><p className="mt-4 text-[clamp(16px,1.5vw,32px)] text-white/70">{state?.state === 'countdown' ? 'A sequência pode ser cancelada no painel.' : 'Controle a reprodução pela Central do canal.'}</p></div></div>}
  </div>
  <footer className="shrink-0 border-t border-white/15 bg-[#17171f] px-[3vw] py-[1.5vh]">
   <div className="flex items-center justify-between gap-6"><p className="min-w-0 truncate text-[clamp(18px,2vw,40px)] font-semibold">{state?.title ?? 'Aguardando vídeo'}</p><span className="shrink-0 text-[clamp(18px,2vw,40px)] tabular-nums">{obsTime(clock.position)} / {clock.duration ? obsTime(clock.duration) : '—'}</span></div>
   <p className="mt-1 text-[clamp(14px,1.2vw,24px)] text-white/70">{failure || state?.error || (state ? obsLabels[state.state] : 'Conectando…')}</p>
   {state?.state === 'blocked' && <button onClick={() => playRef.current()} className="mt-2 rounded-lg bg-brand-purple px-5 py-2">Ativar reprodução com áudio</button>}
  </footer>
 </main>
}
