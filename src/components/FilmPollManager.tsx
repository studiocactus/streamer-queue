import { useEffect, useState } from 'react'
import { Archive, Clock3, Film, Trash2, Vote } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Input, Textarea } from '@/components/ui/Input'

// New tables are introduced by migration 0048; this keeps the UI compatible until generated types are refreshed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db: any = supabase

type Option = { id: string; title: string; command: string; votes?: number }
type Poll = { id: string; starts_at: string; ends_at: string; status: string; vote_message_template: string; result_message_template: string; film_poll_options: Option[] }
const localDate = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
const RESERVED_COMMANDS = new Set(['!fila', '!proximo', '!sugerir'])

function pollCreationError(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
  if (code === '23505') return 'Já existe uma votação programada ou em andamento neste canal.'
  if (code === '42501') return 'Sua conta não tem permissão para criar uma votação neste canal.'
  if (code === '42P01' || code === 'PGRST205') return 'O sistema de votações ainda está sendo configurado. Tente novamente em instantes.'
  return 'Não foi possível criar a votação agora. Tente novamente.'
}

function remainingTime(endsAt: string, now: number) {
  const totalSeconds = Math.max(0, Math.ceil((new Date(endsAt).getTime() - now) / 1000))
  return `${String(Math.floor(totalSeconds / 3600)).padStart(2, '0')}:${String(Math.floor(totalSeconds % 3600 / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`
}

export function FilmPollManager({ streamerId }: { streamerId: string }) {
  const [poll, setPoll] = useState<Poll | null>(null)
  const [history, setHistory] = useState<Poll[]>([])
  const [options, setOptions] = useState([{ title: '', command: '!filme1' }, { title: '', command: '!filme2' }, { title: '', command: '!filme3' }])
  const [startsAt, setStartsAt] = useState(localDate(new Date()))
  const [endsAt, setEndsAt] = useState(localDate(new Date(Date.now() + 60 * 60 * 1000)))
  const [voteTemplate, setVoteTemplate] = useState('🎬 {viewer} votou em “{titulo}”! Agora são {votos} votos.')
  const [resultTemplate, setResultTemplate] = useState('🏁 A votação terminou! O filme escolhido foi “{titulo}” com {votos} votos.')
  const [saving, setSaving] = useState(false)
  const [managingPoll, setManagingPoll] = useState<'ending' | 'archiving' | 'deleting' | null>(null)
  const [now, setNow] = useState(Date.now())
  const [loadError, setLoadError] = useState(false)

  const load = async () => {
    const { data, error } = await db.from('film_polls').select('*, film_poll_options(*)').eq('streamer_id', streamerId).neq('status', 'archived').order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (error) { setLoadError(true); return }
    setLoadError(false)
    const { data: historyRows } = await db.from('film_polls').select('*, film_poll_options(*)').eq('streamer_id', streamerId).in('status', ['ended', 'archived']).order('created_at', { ascending: false }).limit(12)
    setHistory((historyRows ?? []) as Poll[])
    if (!data) { setPoll(null); return }
    const raw = data as Poll
    const voteRows = await Promise.all(raw.film_poll_options.map(async option => {
      const { count } = await db.from('film_poll_votes').select('*', { count: 'exact', head: true }).eq('option_id', option.id)
      return { ...option, votes: count ?? 0 }
    }))
    setPoll({ ...raw, film_poll_options: voteRows })
  }
  useEffect(() => {
    void load()
    const refresh = window.setInterval(() => { setNow(Date.now()); void load() }, 15_000)
    return () => window.clearInterval(refresh)
  }, [streamerId])

  useEffect(() => {
    if (!poll?.id) return
    const channel = supabase
      .channel(`film-poll-votes-${poll.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'film_poll_votes', filter: `poll_id=eq.${poll.id}`,
      }, () => { void load() })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'film_polls', filter: `id=eq.${poll.id}`,
      }, () => { void load() })
      .subscribe()
    return () => {
      channel.unsubscribe()
      supabase.removeChannel(channel)
    }
  }, [poll?.id])

  const create = async () => {
    const commands = options.map(option => option.command.trim().toLowerCase())
    if (options.some(option => !option.title.trim() || !/^![a-z0-9][a-z0-9_-]{1,30}$/.test(option.command))) { toast.error('Informe três filmes e comandos válidos, como !matrix.'); return }
    if (new Set(commands).size !== 3 || commands.some(command => RESERVED_COMMANDS.has(command))) { toast.error('Cada filme precisa de um comando diferente que não seja reservado.'); return }
    if (new Date(endsAt) <= new Date(startsAt)) { toast.error('O término deve ser depois do início.'); return }
    setSaving(true)
    try {
      const { data, error } = await db.from('film_polls').insert({ streamer_id: streamerId, starts_at: new Date(startsAt).toISOString(), ends_at: new Date(endsAt).toISOString(), vote_message_template: voteTemplate.trim(), result_message_template: resultTemplate.trim() }).select('id').single()
      if (error) throw error
      const pollId = (data as { id: string }).id
      const { error: optionsError } = await db.from('film_poll_options').insert(options.map((option, index) => ({ poll_id: pollId, position: index + 1, title: option.title.trim(), command: option.command.toLowerCase() })))
      if (optionsError) throw optionsError
      toast.success('Votação programada.')
      await load()
    } catch (error) { console.error(error); toast.error(pollCreationError(error)) } finally { setSaving(false) }
  }
  const endPoll = async () => {
    if (!poll) return
    setManagingPoll('ending')
    const { error } = await db.from('film_polls').update({ status: 'ended', ends_at: new Date().toISOString() }).eq('id', poll.id)
    setManagingPoll(null)
    if (error) { toast.error('Não foi possível encerrar a votação.'); return }
    toast.success('Votação encerrada. O resultado será enviado ao chat.')
    await load()
  }
  const archivePoll = async () => {
    if (!poll) return
    setManagingPoll('archiving')
    const { error } = await db.from('film_polls').update({ status: 'archived' }).eq('id', poll.id)
    setManagingPoll(null)
    if (error) { toast.error('Não foi possível arquivar a votação.'); return }
    setPoll(null)
    toast.success('Votação arquivada.')
  }
  const deletePoll = async () => {
    if (!poll || !window.confirm('Excluir esta votação e todos os votos? Esta ação não pode ser desfeita.')) return
    setManagingPoll('deleting')
    const { error } = await db.from('film_polls').delete().eq('id', poll.id)
    setManagingPoll(null)
    if (error) { toast.error('Não foi possível excluir a votação.'); return }
    setPoll(null)
    toast.success('Votação excluída.')
  }
  const isOpen = poll && new Date(poll.starts_at).getTime() <= now && new Date(poll.ends_at).getTime() > now
  const votePreview = voteTemplate.split('{viewer}').join('@mari').split('{titulo}').join(options[0].title || 'Nome do filme').split('{votos}').join('12').split('{comando}').join(options[0].command)
  const resultPreview = resultTemplate.split('{titulo}').join(options[0].title || 'Nome do filme').split('{votos}').join('12')
  return <Card className="overflow-hidden">
    <CardHeader><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-purple/15 text-brand-purple"><Vote size={19} /></span><div><h2 className="font-semibold text-content-primary">Votação de filme no chat</h2><p className="mt-1 text-sm text-content-secondary">Três filmes, três comandos e um resultado anunciado pela Twitch.</p></div></div></CardHeader>
    <CardContent className="space-y-5">
      {loadError && <div role="alert" className="rounded-xl border border-status-rejected/30 bg-status-rejected/5 p-4 text-sm text-content-secondary">Não foi possível carregar uma votação existente. Você ainda pode preencher e programar uma nova votação.</div>}
      {poll && <section className="rounded-xl border border-border bg-bg-tertiary/50 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium text-content-primary">{poll.status === 'ended' ? 'Votação encerrada' : isOpen ? 'Votação em andamento' : 'Votação programada'}</p><p className="mt-1 text-xs text-content-muted">De {new Date(poll.starts_at).toLocaleString('pt-BR')} até {new Date(poll.ends_at).toLocaleString('pt-BR')}</p></div>{isOpen && <span className="inline-flex items-center gap-2 rounded-full border border-brand-purple/30 bg-brand-purple/10 px-3 py-1.5 text-sm font-semibold text-brand-purple"><Clock3 size={15} />{remainingTime(poll.ends_at, now)}</span>}</div><div className="mt-4 grid gap-2 sm:grid-cols-3">{[...poll.film_poll_options].sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0)).map((option, index) => <div key={option.id} className="rounded-lg border border-border bg-bg-secondary p-3"><p className="truncate text-sm font-medium">{index === 0 && isOpen ? 'Na frente · ' : ''}{option.title}</p><p className="mt-1 text-xs text-brand-purple">{option.command}</p><p className="mt-3 text-lg font-semibold">{option.votes ?? 0} votos</p></div>)}</div><div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">{poll.status !== 'ended' && <Button size="sm" variant="secondary" loading={managingPoll === 'ending'} disabled={managingPoll !== null} onClick={endPoll}>Encerrar agora</Button>}{poll.status === 'ended' && <Button size="sm" variant="secondary" leftIcon={<Archive size={14} />} loading={managingPoll === 'archiving'} disabled={managingPoll !== null} onClick={archivePoll}>Arquivar</Button>}<Button size="sm" variant="danger" leftIcon={<Trash2 size={14} />} loading={managingPoll === 'deleting'} disabled={managingPoll !== null} onClick={deletePoll}>Excluir</Button></div><p className="mt-4 text-xs text-content-muted">Os votos recebidos no chat aparecem aqui imediatamente.</p></section>}
      {!poll || poll.status === 'ended' ? <section className="space-y-4 border-t border-border pt-5"><div><h3 className="font-medium text-content-primary">Criar próxima votação</h3><p className="mt-1 text-xs text-content-muted">Cada viewer pode votar uma vez. Se votar novamente, o primeiro voto continua valendo.</p></div><div className="grid gap-3 sm:grid-cols-2"><Input label="Início" type="datetime-local" value={startsAt} onChange={event => setStartsAt(event.target.value)} /><Input label="Término" type="datetime-local" value={endsAt} onChange={event => setEndsAt(event.target.value)} /></div><div className="grid gap-3 md:grid-cols-3">{options.map((option, index) => <div key={index} className="space-y-2 rounded-xl border border-border p-3"><Input label={`Filme ${index + 1}`} value={option.title} onChange={event => setOptions(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item))} placeholder="Nome do filme" /><Input label="Comando" value={option.command} onChange={event => setOptions(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, command: event.target.value.toLowerCase() } : item))} hint="Ex.: !matrix. Não use !fila, !proximo ou !sugerir." /></div>)}</div><Textarea label="Mensagem a cada voto" value={voteTemplate} onChange={event => setVoteTemplate(event.target.value)} hint="Use {viewer}, {titulo}, {votos} e {comando}." /><p className="rounded-lg border border-border bg-bg-secondary px-3 py-2 text-xs text-content-secondary">Prévia: {votePreview}</p><Textarea label="Mensagem de resultado" value={resultTemplate} onChange={event => setResultTemplate(event.target.value)} hint="Use {titulo} e {votos}." /><p className="rounded-lg border border-border bg-bg-secondary px-3 py-2 text-xs text-content-secondary">Prévia: {resultPreview}</p><Button loading={saving} onClick={create} leftIcon={<Film size={15} />}>Programar votação</Button></section> : <p className="text-xs text-content-muted">Encerre, arquive ou exclua a votação atual para criar a próxima.</p>}
      {history.length > 0 && <section className="border-t border-border pt-5"><h3 className="font-medium text-content-primary">Histórico de votações</h3><p className="mt-1 text-xs text-content-muted">Resultados encerrados e arquivados para consulta.</p><div className="mt-3 space-y-2">{history.map(item => <details key={item.id} className="rounded-xl border border-border bg-bg-tertiary/50 p-3"><summary className="cursor-pointer text-sm font-medium text-content-primary">{item.status === 'archived' ? 'Arquivada' : 'Encerrada'} · {new Date(item.ends_at).toLocaleDateString('pt-BR')}</summary><div className="mt-3 grid gap-2 sm:grid-cols-3">{item.film_poll_options.map(option => <p key={option.id} className="rounded-lg bg-bg-secondary p-2 text-xs text-content-secondary">{option.title} <span className="text-brand-purple">{option.command}</span></p>)}</div></details>)}</div></section>}
    </CardContent>
  </Card>
}
