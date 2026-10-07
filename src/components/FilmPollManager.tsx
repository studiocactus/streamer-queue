import { useEffect, useState } from 'react'
import { Archive, Clock3, Film, Trash2, Vote } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Input, Textarea } from '@/components/ui/Input'
import type { Suggestion } from '@/types'

// New tables are introduced by migration 0048; this keeps the UI compatible until generated types are refreshed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db: any = supabase

type Option = { id: string; title: string; command: string; votes?: number; film_poll_votes?: { count: number }[] }
type Poll = { id: string; streamer_id: string; starts_at: string; ends_at: string; status: string; vote_message_template: string; result_message_template: string; film_poll_options: Option[]; film_poll_announcements?: { sent_at: string | null; last_error: string | null }[] }
const localDate = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)


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

export function FilmPollManager({ streamerId, suggestions = [] }: { streamerId: string; suggestions?: Suggestion[] }) {
  const [poll, setPoll] = useState<Poll | null>(null)
  const [history, setHistory] = useState<Poll[]>([])
  const [options, setOptions] = useState([{ title: '', command: '!filme1' }, { title: '', command: '!filme2' }])
  const [startsAt, setStartsAt] = useState(localDate(new Date()))
  const [endsAt, setEndsAt] = useState(localDate(new Date(Date.now() + 60 * 60 * 1000)))
  const [voteTemplate, setVoteTemplate] = useState('🎬 {viewer} votou em “{titulo}”! Agora são {votos} votos.')
  const [resultTemplate, setResultTemplate] = useState('🏁 A votação terminou! O filme escolhido foi “{titulo}” com {votos} votos.')
  const [filmSearch, setFilmSearch] = useState('')
  const [onlyFilms, setOnlyFilms] = useState(true)
  const [saving, setSaving] = useState(false)
  const [managingPoll, setManagingPoll] = useState<'ending' | 'archiving' | 'deleting' | null>(null)
  const [now, setNow] = useState(Date.now())
  const [loadError, setLoadError] = useState(false)

  const load = async () => {
    const { data, error } = await db.from('film_polls').select('*, film_poll_options(*, film_poll_votes(count)), film_poll_announcements(sent_at,last_error)').eq('streamer_id', streamerId).neq('status', 'archived').order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (error) { setLoadError(true); return }
    setLoadError(false)
    const { data: historyRows } = await db.from('film_polls').select('*, film_poll_options(*)').eq('streamer_id', streamerId).in('status', ['ended', 'archived']).order('created_at', { ascending: false }).limit(12)
    setHistory((historyRows ?? []) as Poll[])
    if (!data) { setPoll(null); return }
    const raw = data as Poll
    const voteRows = raw.film_poll_options.map(option => ({ ...option, votes: option.film_poll_votes?.[0]?.count ?? 0 }))
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
    if (options.length < 2 || options.some(option => !option.title.trim() || option.title.trim().length > 200)) { toast.error('Escolha pelo menos dois filmes, com títulos de até 200 caracteres.'); return }
    if (new Set(options.map(option => option.title.trim().toLowerCase())).size !== options.length) { toast.error('Selecione filmes diferentes.'); return }
    if (!Number.isFinite(new Date(startsAt).getTime()) || !Number.isFinite(new Date(endsAt).getTime()) || new Date(endsAt) <= new Date(startsAt) || new Date(endsAt).getTime() <= Date.now()) { toast.error('Informe um período válido, com término no futuro.'); return }
    setSaving(true)
    try {
      const { error } = await db.rpc('create_film_poll', {
        p_streamer_id: streamerId, p_starts_at: new Date(startsAt).toISOString(), p_ends_at: new Date(endsAt).toISOString(),
        p_titles: options.map(option => option.title.trim()), p_vote_template: voteTemplate.trim(), p_result_template: resultTemplate.trim(),
      })
      if (error) throw error
      toast.success('Votação programada. O bot anunciará os filmes e comandos no início.')
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
    if (!window.confirm('Arquivar esta votação? Ela continuará disponível no histórico e você poderá excluí-la depois.')) return
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
  const isOpen = poll && ['scheduled', 'active'].includes(poll.status) && new Date(poll.starts_at).getTime() <= now && new Date(poll.ends_at).getTime() > now
  const chooseFilm = (title: string) => {
    setOptions(current => {
      if (current.some(item => item.title.trim().toLowerCase() === title.trim().toLowerCase())) return current
      const emptyIndex = current.findIndex(item => !item.title.trim())
      return emptyIndex < 0 ? [...current, { title, command: '!filme' + (current.length + 1) }] : current.map((item, index) => index === emptyIndex ? { ...item, title } : item)
    })
  }
  const candidates = suggestions.filter(item => (!onlyFilms || item.category === 'movie') && !['completed', 'rejected', 'watching'].includes(item.status) && item.title.toLowerCase().includes(filmSearch.toLowerCase()))
  const votePreview = voteTemplate.split('{viewer}').join('@mari').split('{titulo}').join(options[0].title || 'Nome do filme').split('{votos}').join('12').split('{comando}').join(options[0].command)
  const resultPreview = resultTemplate.split('{titulo}').join(options[0].title || 'Nome do filme').split('{votos}').join('12')
  return <Card className="overflow-hidden">
    <CardHeader><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-purple/15 text-brand-purple"><Vote size={19} /></span><div><h2 className="font-semibold text-content-primary">Votação de filme no chat</h2><p className="mt-1 text-sm text-content-secondary">Escolha os filmes recebidos com !filme. O bot anuncia as opções e os comandos no chat.</p></div></div></CardHeader>
    <CardContent className="space-y-5">
      {loadError && <div role="alert" className="rounded-xl border border-status-rejected/30 bg-status-rejected/5 p-4 text-sm text-content-secondary">Não foi possível carregar uma votação existente. Você ainda pode preencher e programar uma nova votação.</div>}
      {poll && <section className="rounded-xl border border-border bg-bg-tertiary/50 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium text-content-primary">{poll.status === 'ended' ? 'Votação encerrada' : isOpen ? 'Votação em andamento' : 'Votação programada'}</p><p className="mt-1 text-xs text-content-muted">De {new Date(poll.starts_at).toLocaleString('pt-BR')} até {new Date(poll.ends_at).toLocaleString('pt-BR')}</p></div>{isOpen && <span className="inline-flex items-center gap-2 rounded-full border border-brand-purple/30 bg-brand-purple/10 px-3 py-1.5 text-sm font-semibold text-brand-purple"><Clock3 size={15} />{remainingTime(poll.ends_at, now)}</span>}</div><div className="mt-4 grid gap-2 sm:grid-cols-3">{[...poll.film_poll_options].sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0)).map((option, index) => <div key={option.id} className="rounded-lg border border-border bg-bg-secondary p-3"><p className="truncate text-sm font-medium">{index === 0 && isOpen ? 'Na frente · ' : ''}{option.title}</p><p className="mt-1 text-xs text-brand-purple">{option.command}</p><p className="mt-3 text-lg font-semibold">{option.votes ?? 0} votos</p></div>)}</div><div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">{poll.status !== 'ended' && <Button size="sm" variant="secondary" loading={managingPoll === 'ending'} disabled={managingPoll !== null} onClick={endPoll}>Encerrar agora</Button>}{poll.status === 'ended' && <Button size="sm" variant="secondary" leftIcon={<Archive size={14} />} loading={managingPoll === 'archiving'} disabled={managingPoll !== null} onClick={archivePoll}>Arquivar</Button>}<Button size="sm" variant="danger" leftIcon={<Trash2 size={14} />} loading={managingPoll === 'deleting'} disabled={managingPoll !== null} onClick={deletePoll}>Excluir</Button></div><p className="mt-4 text-xs text-content-muted">Os votos recebidos no chat aparecem aqui imediatamente.</p>{Boolean(poll.film_poll_announcements?.length) && <p className="mt-2 text-xs text-content-secondary">{poll.film_poll_announcements?.every(part => part.sent_at) ? 'Filmes e comandos anunciados no chat.' : poll.film_poll_announcements?.some(part => part.last_error) ? 'Anúncio pendente: confira a conexão Twitch. O bot tentará novamente enquanto a votação estiver aberta.' : 'O bot anunciará os filmes e comandos após o início, no próximo ciclo automático.'}</p>}</section>}
      {poll && poll.status !== 'ended' && <PollMessageEditor key={poll.id} poll={poll} />}
      {!poll || poll.status === 'ended' ? <section className="space-y-4 border-t border-border pt-5"><div><h3 className="font-medium text-content-primary">Criar próxima votação</h3><p className="mt-1 text-xs text-content-muted">Cada viewer pode votar uma vez. Se votar novamente, o primeiro voto continua valendo.</p></div><div className="grid gap-3 sm:grid-cols-2"><Input label="Início" type="datetime-local" value={startsAt} onChange={event => setStartsAt(event.target.value)} /><Input label="Término" type="datetime-local" value={endsAt} onChange={event => setEndsAt(event.target.value)} /></div><section className="space-y-3 rounded-xl border border-border p-4"><h4 className="font-medium text-content-primary">Escolher entre os envios</h4><p className="text-xs text-content-muted">Viewers enviam com !filme Nome do filme. Selecione as opções abaixo ou digite um título manualmente.</p><Input label="Buscar nos envios" value={filmSearch} onChange={event => setFilmSearch(event.target.value)} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyFilms} onChange={event => setOnlyFilms(event.target.checked)} />Mostrar apenas filmes</label><div className="max-h-64 space-y-2 overflow-y-auto">{candidates.length === 0 && <p className="text-sm text-content-muted">Nenhum envio encontrado. Desmarque o filtro para procurar filmes antigos enviados como outro conteúdo.</p>}{candidates.map(item => { const selected = options.some(option => option.title.trim().toLowerCase() === item.title.trim().toLowerCase()); return <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-bg-tertiary p-3"><span className="min-w-0 break-words text-sm">{item.title}</span><Button size="sm" variant="secondary" disabled={selected} onClick={() => chooseFilm(item.title)}>{selected ? 'Selecionado' : 'Incluir na votação'}</Button></div> })}</div></section><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">{options.length} opções na votação</p><Button variant="secondary" size="sm" onClick={() => setOptions(current => [...current, { title: '', command: '!filme' + (current.length + 1) }])}>Adicionar filme</Button></div><div className="grid gap-3 md:grid-cols-3">{options.map((option, index) => <div key={index} className="space-y-2 rounded-xl border border-border p-3"><Input label={`Filme ${index + 1}`} value={option.title} onChange={event => setOptions(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item))} placeholder="Nome do filme" /><p className="text-sm font-semibold text-brand-purple">!filme{index + 1}</p><Button size="sm" variant="ghost" disabled={options.length <= 2} onClick={() => setOptions(current => current.filter((_, itemIndex) => itemIndex !== index).map((item, itemIndex) => ({ ...item, command: '!filme' + (itemIndex + 1) })))}>Remover opção</Button></div>)}</div><Textarea label="Mensagem a cada voto" value={voteTemplate} onChange={event => setVoteTemplate(event.target.value)} hint="Use {viewer}, {titulo}, {votos} e {comando}." /><p className="rounded-lg border border-border bg-bg-secondary px-3 py-2 text-xs text-content-secondary">Prévia: {votePreview}</p><Textarea label="Mensagem de resultado" value={resultTemplate} onChange={event => setResultTemplate(event.target.value)} hint="Use {titulo} e {votos}." /><p className="rounded-lg border border-border bg-bg-secondary px-3 py-2 text-xs text-content-secondary">Prévia: {resultPreview}</p><Button loading={saving} onClick={create} leftIcon={<Film size={15} />}>Programar votação</Button></section> : <p className="text-xs text-content-muted">Encerre, arquive ou exclua a votação atual para criar a próxima.</p>}
      {history.length > 0 && <section className="border-t border-border pt-5"><h3 className="font-medium text-content-primary">Histórico de votações</h3><p className="mt-1 text-xs text-content-muted">Resultados encerrados e arquivados para consulta.</p><div className="mt-3 space-y-2">{history.map(item => <details key={item.id} className="rounded-xl border border-border bg-bg-tertiary/50 p-3"><summary className="cursor-pointer text-sm font-medium text-content-primary">{item.status === 'archived' ? 'Arquivada' : 'Encerrada'} · {new Date(item.ends_at).toLocaleDateString('pt-BR')}</summary><div className="mt-3 grid gap-2 sm:grid-cols-3">{item.film_poll_options.map(option => <p key={option.id} className="rounded-lg bg-bg-secondary p-2 text-xs text-content-secondary">{option.title} <span className="text-brand-purple">{option.command}</span></p>)}</div>{item.status === 'archived' && <Button className="mt-3" size="sm" variant="danger" onClick={async () => { if (!window.confirm('Excluir este arquivamento permanentemente?')) return; const { error } = await db.from('film_polls').delete().eq('id', item.id); if (error) return toast.error('Não foi possível excluir o arquivamento.'); toast.success('Arquivamento excluído.'); await load() }} leftIcon={<Trash2 size={13} />}>Excluir arquivamento</Button>}</details>)}</div></section>}
    </CardContent>
  </Card>
}

function PollMessageEditor({ poll }: { poll: Poll }) {
  const [vote, setVote] = useState(poll.vote_message_template)
  const [result, setResult] = useState(poll.result_message_template)
  const [saving, setSaving] = useState(false)
  const save = async () => {
    setSaving(true)
    try {
      const { error } = await db.from('film_polls').update({ vote_message_template: vote.trim(), result_message_template: result.trim() }).eq('id', poll.id).eq('streamer_id', poll.streamer_id).select('id').single()
      if (error) throw error
      toast.success('Mensagens da votação atualizadas.')
    } catch { toast.error('Não foi possível salvar as mensagens da votação.') }
    finally { setSaving(false) }
  }
  return <details className="rounded-xl border border-border p-4">
    <summary className="cursor-pointer text-sm font-semibold">Editar mensagens desta votação</summary>
    <div className="mt-4 space-y-3">
      <p className="text-xs text-content-muted">Variáveis opcionais: {'{viewer}'}, {'{titulo}'}, {'{votos}'} e {'{comando}'}. Deixe uma mensagem vazia para não enviá-la. O anúncio de abertura pode ser alterado em Twitch e overlay → Mensagens automáticas.</p>
      <Textarea label="Resposta ao voto" value={vote} onChange={event => setVote(event.target.value)} maxLength={500} />
      <Textarea label="Resultado" value={result} onChange={event => setResult(event.target.value)} maxLength={500} />
      <Button size="sm" loading={saving} onClick={save}>Salvar mensagens da votação</Button>
    </div>
  </details>
}
