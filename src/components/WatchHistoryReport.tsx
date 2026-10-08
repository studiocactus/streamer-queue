import { useEffect, useState } from 'react'
import { Clock, Download, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useWatchReport, type WatchEntry, type WatchReport } from '@/hooks/useWatchReport'
import { csvCell, formatWatchDuration, parseWatchDuration, REPORT_TIMEZONE, reportToday, shiftReportDate, watchDurationInput } from '@/lib/watch-report'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'

export function WatchTimeCard({ streamerId, onOpen }: { streamerId: string; onOpen: () => void }) {
  const [today, setToday] = useState(reportToday)
  useEffect(() => { const timer = window.setInterval(() => setToday(reportToday()), 30000); return () => clearInterval(timer) }, [])
  const { data, error, refresh } = useWatchReport(streamerId, today, today)
  return <WatchTodaySummary data={data} error={error} onOpen={onOpen} onRetry={() => void refresh()} />
}

export function WatchTodaySummary({ data, error, onOpen, onRetry }: { data: WatchReport | null; error: boolean; onOpen: () => void; onRetry: () => void }) {
  const duration = error ? '—' : data ? data.known || !data.unknown ? formatWatchDuration(data.seconds) : 'Não disponível' : '…'
  return <section aria-label="Resultados de hoje" className="overflow-hidden rounded-2xl border border-brand-purple/20 bg-bg-secondary/90">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
      <div className="flex items-center gap-2"><Clock size={16} className="text-brand-purple" /><h3 className="text-sm font-semibold text-content-primary">Hoje no canal</h3><span className="text-xs text-content-secondary">Brasília</span></div>
      <button type="button" onClick={onOpen} className="min-h-9 rounded-lg px-2 text-xs font-semibold text-brand-purple hover:bg-brand-purple/10 focus-visible:outline focus-visible:outline-brand-purple">Ver histórico e relatório →</button>
    </div>
    <div className="grid gap-5 p-5 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.2fr]">
      <div><p className="text-xs text-content-secondary">Tempo assistido hoje</p><p className="mt-2 text-2xl font-bold tabular-nums leading-tight text-content-primary">{duration}</p><p className="mt-1 text-xs text-content-secondary">Duração original dos concluídos</p></div>
      <div><p className="text-xs text-content-secondary">Conteúdos concluídos hoje</p><p className="mt-2 text-2xl font-bold tabular-nums text-content-primary">{error ? '—' : data?.completed ?? '…'}</p><p className="mt-1 text-xs text-content-secondary">Inclui novas exibições do mesmo conteúdo</p></div>
      <div className="self-center text-sm text-content-secondary sm:col-span-2 xl:col-span-1">
        {error ? <p role="alert">Não foi possível atualizar os dados. <button onClick={onRetry} className="min-h-9 text-brand-purple underline">Tentar novamente</button></p> : !data ? <p role="status">Carregando resultados do dia…</p> : data.unknown ? <><p className="font-medium text-status-pending">{data.unknown} {data.unknown === 1 ? 'conteúdo sem duração' : 'conteúdos sem duração'}</p><p className="mt-1 text-xs leading-relaxed">O tempo é parcial: {data.known} de {data.completed} conclusões entram na soma.</p><button onClick={onOpen} className="mt-1 min-h-9 text-xs font-semibold text-brand-purple underline">Conferir durações no histórico</button></> : <p className="text-xs leading-relaxed">{data.completed ? 'Todas as conclusões de hoje têm duração registrada.' : 'Ao concluir conteúdos, a quantidade e a duração aparecem aqui.'} O histórico é preservado ao limpar a fila.</p>}
      </div>
    </div>
  </section>
}

const displayDate = (value: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: REPORT_TIMEZONE, dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
const safeLink = (value: string | null) => { try { const url = new URL(value ?? ''); return ['https:', 'http:'].includes(url.protocol) ? url.href : null } catch { return null } }

export function WatchHistoryReport({ streamerId, isPlatformAdmin }: { streamerId: string; isPlatformAdmin: boolean }) {
  const [from, setFrom] = useState(() => shiftReportDate(reportToday(), -6))
  const [to, setTo] = useState(reportToday)
  const [period, setPeriod] = useState({ from, to })
  const [allChannels, setAllChannels] = useState(false)
  const [offset, setOffset] = useState(0)
  const [editing, setEditing] = useState<WatchEntry | null>(null)
  const [duration, setDuration] = useState('')
  const [saving, setSaving] = useState(false)
  const { data, error, refresh } = useWatchReport(allChannels && isPlatformAdmin ? null : streamerId, period.from, period.to, offset)
  const apply = () => {
    const difference = Date.parse(to) - Date.parse(from)
    if (!from || !to || !Number.isFinite(difference) || difference < 0 || difference > 365 * 86400000) { toast.error('Selecione um período de até 366 dias.'); return }
    setPeriod({ from, to }); setOffset(0)
  }
  const save = async () => {
    const seconds = parseWatchDuration(duration)
    if (!editing || seconds === null) { toast.error('Informe a duração no formato minutos:segundos ou horas:minutos:segundos.'); return }
    setSaving(true)
    try {
      const { error } = await supabase.rpc('set_watch_duration', { p_history_id: editing.id, p_seconds: seconds })
      if (error) throw error
      setEditing(null)
      window.dispatchEvent(new Event('watchqueue:duration-updated'))
      toast.success('Duração original atualizada.')
    } catch { toast.error('Não foi possível salvar a duração.') }
    finally { setSaving(false) }
  }
  const exportPage = () => {
    if (!data) return
    const rows = [['Conclusão (Brasília)', 'Streamer', 'Conteúdo', 'Categoria', 'Duração (segundos)', 'Origem da duração', 'Link'], ...data.entries.map(entry => [displayDate(entry.completed_at), entry.channel_name, entry.title, entry.category, entry.duration_seconds ?? '', entry.duration_source ?? 'Não disponível', entry.source_url ?? ''])]
    const url = URL.createObjectURL(new Blob(['\ufeff' + rows.map(row => row.map(csvCell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = `historico-${period.from}-${period.to}-pagina-${offset / 50 + 1}.csv`; link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <Card>
    <CardHeader><h2 className="font-semibold text-content-primary">Histórico de conteúdos vistos</h2><p className="mt-1 text-sm text-content-secondary">Soma da duração original dos conteúdos concluídos, no dia da conclusão (horário de Brasília). Cada nova conclusão conta novamente.</p></CardHeader>
    <CardContent className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <Input label="Data inicial" type="date" value={from} onChange={event => setFrom(event.target.value)} />
        <Input label="Data final" type="date" value={to} onChange={event => setTo(event.target.value)} />
        <Button size="sm" onClick={apply}>Aplicar período</Button>
        {isPlatformAdmin && <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={allChannels} onChange={event => { setAllChannels(event.target.checked); setOffset(0) }} className="accent-brand-purple" />Todos os streamers</label>}
      </div>
      {error && <div role="alert" className="text-sm text-status-rejected">Não foi possível atualizar o relatório. <button className="underline" onClick={() => void refresh()}>Tentar novamente</button></div>}
      {!data && !error && <p role="status" className="text-sm text-content-muted">Carregando histórico…</p>}
      {data && <>
        <div className="grid gap-4 sm:grid-cols-3">
          {[['Duração total conhecida', data.known || !data.unknown ? formatWatchDuration(data.seconds) : 'Não disponível'], ['Conteúdos concluídos', data.completed], ['Sem duração disponível', data.unknown]].map(([label, value]) => <div key={label} className="rounded-xl border border-border bg-bg-tertiary/40 p-4"><p className="text-xl font-bold">{value}</p><p className="mt-1 text-xs text-content-muted">{label}</p></div>)}
        </div>
        <p className="text-xs text-content-muted">{data.known} de {data.completed} conclusões têm duração. As demais não entram na soma. O histórico permanece após limpar sugestões. Registros anteriores só incluem conclusões ainda existentes na plataforma.{data.undated > 0 && ` Há ${data.undated} registros antigos sem data, fora dos totais por dia.`}</p>
        <details open={period.from === period.to} className="rounded-xl border border-border p-4"><summary className="cursor-pointer text-sm font-semibold">Resumo por dia</summary><div className="mt-3 max-h-80 overflow-auto"><table className="w-full text-left text-sm"><thead><tr className="text-content-muted"><th className="p-2">Dia</th><th className="p-2">Duração</th><th className="p-2">Conclusões</th><th className="p-2">Sem duração</th></tr></thead><tbody>{data.daily.map(day => <tr key={day.day} className="border-t border-border"><td className="p-2">{day.day.split('-').reverse().join('/')}</td><td className="p-2">{formatWatchDuration(day.seconds)}</td><td className="p-2">{day.completed}</td><td className="p-2">{day.unknown}</td></tr>)}</tbody></table></div></details>
        <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-semibold">Conteúdos do período</h3><Button size="sm" variant="outline" leftIcon={<Download size={14} />} disabled={!data.entries.length || error} onClick={exportPage}>Exportar esta página (CSV)</Button></div>
        {data.entries.length === 0 ? <p className="py-6 text-center text-sm text-content-muted">Nenhum conteúdo concluído neste período.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr className="text-content-muted"><th className="p-3">Conclusão</th><th className="p-3">Streamer / conteúdo</th><th className="p-3">Duração original</th><th className="p-3">Ação</th></tr></thead><tbody>{data.entries.map(entry => <tr key={entry.id} className="border-t border-border"><td className="whitespace-nowrap p-3 text-xs">{displayDate(entry.completed_at)}</td><td className="max-w-md p-3"><p className="text-xs text-content-muted">{entry.channel_name}</p><p className="mt-1 break-words font-medium">{entry.title}</p>{safeLink(entry.source_url) && <a href={safeLink(entry.source_url)!} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-brand-purple">Abrir conteúdo <ExternalLink size={12} /></a>}</td><td className="p-3"><p className="whitespace-nowrap">{entry.duration_seconds ? formatWatchDuration(entry.duration_seconds) : 'Não disponível'}</p><p className="mt-1 text-xs text-content-muted">{entry.duration_source === 'manual' ? 'Informada pelo canal' : entry.duration_source === 'youtube' ? 'YouTube' : 'Fora da soma'}</p></td><td className="p-3"><Button size="sm" variant="ghost" disabled={error} onClick={() => { setEditing(entry); setDuration(watchDurationInput(entry.duration_seconds)) }}>{entry.duration_seconds ? 'Corrigir' : 'Informar duração'}</Button></td></tr>)}</tbody></table></div>}
        <div className="flex items-center justify-between gap-3 text-xs text-content-muted"><span>{data.completed ? `${offset + 1}–${Math.min(offset + 50, data.completed)} de ${data.completed}` : '0 registros'}</span><div className="flex gap-2"><Button size="sm" variant="ghost" disabled={!offset} onClick={() => setOffset(value => Math.max(0, value - 50))}>Anterior</Button><Button size="sm" variant="ghost" disabled={offset + 50 >= data.completed} onClick={() => setOffset(value => value + 50)}>Próxima</Button></div></div>
      </>}
      <Modal isOpen={Boolean(editing)} onClose={() => { if (!saving) setEditing(null) }} title="Duração original do conteúdo" description={editing?.title} footer={<Button loading={saving} onClick={save}>Salvar duração</Button>}><Input label="Duração" placeholder="12:30 ou 1:25:00" value={duration} onChange={event => setDuration(event.target.value)} /><p className="mt-3 text-xs text-content-muted">Informe a duração do vídeo, não o tempo gasto na live. A correção será aplicada às conclusões vinculadas a essa sugestão.</p></Modal>
    </CardContent>
  </Card>
}
