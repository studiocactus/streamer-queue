import { useEffect, useState } from 'react'
import { MonitorPlay, Pause, Play, Square, Copy } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { type ObsState, obsLabels, obsTime } from '@/lib/obs-player'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'

export function ObsPlayerControls({ streamerId }: { streamerId: string }) {
 const [state, setState] = useState<ObsState | null>(null)
 const [loading, setLoading] = useState(true)
 const [busy, setBusy] = useState(false)
 const [error, setError] = useState('')
 const [notice, setNotice] = useState('')
 const [gap, setGap] = useState('3')
 useEffect(() => {
  let alive = true, inflight = false
  const refresh = async () => {
   if (inflight) return
   inflight = true
   const result = await supabase.rpc('obs_manage', { p_streamer_id: streamerId })
   if (alive) { if (result.error) setError('Não foi possível consultar o player.'); else { setState(result.data); setError('') }; setLoading(false) }
   inflight = false
  }
  void refresh(); const timer = window.setInterval(refresh, 2000)
  return () => { alive = false; window.clearInterval(timer) }
 }, [streamerId])
 const command = async (action: string, value?: number) => {
  setBusy(true); setError(''); setNotice('')
  try {
   const { data, error: failure } = await supabase.rpc('obs_manage', { p_streamer_id: streamerId, p_action: action, ...(value === undefined ? {} : { p_value: value }) })
   if (failure) throw failure
   setState(data)
   if (data?.token) {
    await navigator.clipboard.writeText(`${window.location.origin}/obs-player#${data.token}`)
    setNotice('Link privado copiado. Cole na Fonte de navegador do OBS.')
   }
  } catch (failure) { setError(failure instanceof Error ? failure.message : (failure as { message?: string })?.message ?? 'Não foi possível enviar o comando. Tente novamente.') }
  finally { setBusy(false) }
 }
 return <Card className="border-brand-purple/25"><CardContent className="space-y-4">
  <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 font-semibold"><MonitorPlay size={19} className="text-brand-purple" />Player para OBS <span className="rounded bg-brand-purple/10 px-2 py-1 text-xs text-brand-purple">Em teste</span></h2><p className="mt-1 text-sm text-content-secondary">Controle os vídeos do YouTube da sua fila sem abrir outra aba.</p></div>{state && <span className={`text-xs ${state.connected ? 'text-status-completed' : 'text-content-secondary'}`}>{state.connected ? 'Fonte conectada' : 'Fonte desconectada'}</span>}</div>
  {loading ? <p role="status">Consultando player…</p> : !state ? <Button size="sm" loading={busy} onClick={() => void command('enable')}>Configurar e copiar link do player</Button> : <>
   <div className="rounded-xl bg-bg-tertiary p-4"><p className="text-sm text-brand-purple">{obsLabels[state.state] ?? state.state}{state.state === 'countdown' ? ` · ${state.countdown}s` : ''}</p><p className="mt-1 break-words font-semibold">{state.title ?? 'O primeiro conteúdo da fila será reproduzido aqui.'}</p><p className="mt-2 text-sm tabular-nums text-content-secondary">{obsTime(state.position_seconds)} / {state.duration_seconds ? obsTime(state.duration_seconds) : '—'}</p></div>
   <div className="flex flex-wrap gap-2">
    {['idle', 'ended', 'error'].includes(state.state) && <Button size="sm" leftIcon={<Play size={14}/>} disabled={!state.connected || busy} onClick={() => void command('start')}>Reproduzir próximo no OBS</Button>}
    {['paused', 'blocked'].includes(state.state) && state.video_id && <Button size="sm" leftIcon={<Play size={14}/>} disabled={!state.connected || busy} onClick={() => void command('resume')}>Continuar</Button>}
    {['playing', 'loading', 'countdown'].includes(state.state) && <Button size="sm" variant="secondary" leftIcon={<Pause size={14}/>} disabled={busy} onClick={() => void command('pause')}>{state.state === 'countdown' ? 'Cancelar próximo' : 'Pausar'}</Button>}
    {state.video_id && <Button size="sm" variant="outline" leftIcon={<Square size={14}/>} disabled={busy} onClick={() => void command('stop')}>Parar sem concluir</Button>}
   </div>
   <div className="flex flex-wrap items-end gap-5">
    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-purple" checked={state.automatic} disabled={busy} onChange={event => void command('automatic', event.target.checked ? 1 : 0)}/>Iniciar próximo automaticamente</label>
    <form onSubmit={event => { event.preventDefault(); void command('gap', Number(gap)) }} className="flex items-end gap-2"><label className="text-xs text-content-secondary">Intervalo: {state.gap_seconds}s<input aria-label="Intervalo em segundos" type="number" min="1" max="30" required value={gap} onChange={event => setGap(event.target.value)} className="mt-1 block h-10 w-20 rounded-lg border border-border bg-bg-primary px-3 text-content-primary"/></label><Button size="sm" variant="secondary" disabled={busy}>Aplicar</Button></form>
    <label className="text-xs text-content-secondary">Volume: {state.volume}%<input aria-label="Volume do player" type="range" min="0" max="100" defaultValue={state.volume} onPointerUp={event => void command('volume', Number(event.currentTarget.value))} onKeyUp={event => void command('volume', Number(event.currentTarget.value))} className="mt-3 block accent-brand-purple"/></label>
   </div>
   <p className="text-xs text-content-secondary">O modo automático respeita a ordem da fila e para em caso de falha. Parar devolve o vídeo à fila, sem registrar uma conclusão.</p>
   {state.error && <p role="alert" className="text-sm text-status-pending">{state.error}</p>}
   {state.source_url && /^https?:\/\//.test(state.source_url) && <a className="inline-block text-sm text-brand-purple underline" href={state.source_url} target="_blank" rel="noopener noreferrer">Abrir conteúdo original</a>}
   <details className="border-t border-border pt-3 text-sm"><summary className="cursor-pointer text-content-secondary">Configurar fonte e áudio no OBS</summary><div className="mt-3 space-y-3 text-content-secondary"><p>Adicione uma Fonte de navegador com 1920 × 1080 e cole o link privado. Ative “Controlar áudio via OBS”. Para também ouvir, configure o monitoramento no mixer, evitando captar o mesmo áudio duas vezes.</p><p>Reutilize a mesma fonte nas cenas. Se ela for descarregada ou perder conexão, o player pausa e desativa o automático. Se o YouTube bloquear o início, use “Interagir” na fonte.</p><p>O link concede acesso a esta sessão de reprodução. Não o compartilhe. Gerar um novo link desconecta a fonte anterior.</p><div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" disabled={busy} leftIcon={<Copy size={14}/>} onClick={() => void command('link')}>Copiar link privado</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => { if (window.confirm('Desconectar a fonte atual e gerar outro link? Será necessário atualizar o OBS.')) void command('rotate') }}>Gerar novo link</Button></div></div></details>
  </>}
  {error && <p role="alert" className="text-sm text-status-rejected">{error}</p>}{notice && <p role="status" className="text-sm text-status-completed">{notice}</p>}
 </CardContent></Card>
}
