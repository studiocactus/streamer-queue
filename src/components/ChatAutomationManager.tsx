import { useEffect, useState } from 'react'
import {
  Bot,
  ChevronDown,
  ChevronUp,
  Clock3,
  Hash,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Trophy,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Input, Textarea } from '@/components/ui/Input'

type AutomationTab = 'timers' | 'commands' | 'counters'

interface Timer {
  id: string
  kind: 'message' | 'poll_leader'
  message: string
  interval_minutes: number
}

interface ChatCommand {
  id: string
  command: string
  response: string
}

interface Counter {
  id: string
  command: string
  label: string
  count: number
  response_template: string
  cooldown_seconds: number
}

interface CounterValue {
  target_login: string
  target_display_name: string
  count: number
  updated_at: string
}

const db: any = supabase
const DEFAULT_COUNTER_MESSAGE = '@{target}, essa é a {count}ª vez registrada.'

const tabs: Array<{ id: AutomationTab; label: string; icon: typeof Clock3 }> = [
  { id: 'timers', label: 'Timers', icon: Clock3 },
  { id: 'commands', label: 'Comandos', icon: MessageCircle },
  { id: 'counters', label: 'Contadores', icon: Hash },
]

export function ChatAutomationManager({ streamerId }: { streamerId: string }) {
  const [activeTab, setActiveTab] = useState<AutomationTab>('timers')
  const [timers, setTimers] = useState<Timer[]>([])
  const [commands, setCommands] = useState<ChatCommand[]>([])
  const [counters, setCounters] = useState<Counter[]>([])
  const [counterValues, setCounterValues] = useState<Record<string, CounterValue[]>>({})
  const [expandedCounterId, setExpandedCounterId] = useState<string | null>(null)
  const [loadingCounterValues, setLoadingCounterValues] = useState<string | null>(null)

  const [timerMessage, setTimerMessage] = useState('')
  const [timerMinutes, setTimerMinutes] = useState('15')
  const [command, setCommand] = useState('')
  const [commandResponse, setCommandResponse] = useState('')
  const [counterCommand, setCounterCommand] = useState('')
  const [counterLabel, setCounterLabel] = useState('')
  const [counterMessage, setCounterMessage] = useState(DEFAULT_COUNTER_MESSAGE)
  const [counterCooldown, setCounterCooldown] = useState('60')
  const [editingCounter, setEditingCounter] = useState<Counter | null>(null)

  const loadAutomations = async () => {
    const [timersResult, commandsResult, countersResult] = await Promise.all([
      db.from('chat_timed_messages').select('*').eq('streamer_id', streamerId).order('created_at'),
      db.from('chat_custom_commands').select('*').eq('streamer_id', streamerId).order('created_at'),
      db.from('chat_command_counters').select('*').eq('streamer_id', streamerId).order('created_at'),
    ])

    setTimers(timersResult.data ?? [])
    setCommands(commandsResult.data ?? [])
    setCounters(countersResult.data ?? [])
  }

  useEffect(() => {
    void loadAutomations()
  }, [streamerId])

  const loadCounterValues = async (counterId: string) => {
    setLoadingCounterValues(counterId)
    const { data, error } = await db
      .from('chat_command_counter_values')
      .select('target_login, target_display_name, count, updated_at')
      .eq('counter_id', counterId)
      .order('count', { ascending: false })
      .order('updated_at', { ascending: false })

    setLoadingCounterValues(null)
    if (error) {
      toast.error('Não foi possível carregar as contagens individuais.')
      return
    }
    setCounterValues((current) => ({ ...current, [counterId]: data ?? [] }))
  }

  const toggleCounterDetails = (counterId: string) => {
    if (expandedCounterId === counterId) {
      setExpandedCounterId(null)
      return
    }
    setExpandedCounterId(counterId)
    void loadCounterValues(counterId)
  }

  const normalizeCommand = (value: string) => `!${value.trim().replace(/^!+/, '').toLowerCase()}`

  const removeAutomation = async (table: string, id: string) => {
    const { error } = await db.from(table).delete().eq('id', id)
    if (error) {
      toast.error('Não foi possível remover este item.')
      return
    }
    toast.success('Item removido.')
    void loadAutomations()
  }

  const addTimer = async () => {
    const minutes = Number(timerMinutes)
    if (!timerMessage.trim() || !Number.isFinite(minutes) || minutes < 1) {
      toast.error('Defina a mensagem e um intervalo válido para o timer.')
      return
    }

    const { error } = await db.from('chat_timed_messages').insert({
      streamer_id: streamerId,
      kind: 'message',
      message: timerMessage.trim(),
      interval_minutes: minutes,
    })
    if (error) {
      toast.error('Não foi possível criar o timer.')
      return
    }

    setTimerMessage('')
    toast.success('Timer criado.')
    void loadAutomations()
  }

  const addLeaderTimer = async () => {
    const { error } = await db.from('chat_timed_messages').insert({
      streamer_id: streamerId,
      kind: 'poll_leader',
      message: '🏆 {viewer} é quem mais participou desta votação, com {votos} votos!',
      interval_minutes: 15,
    })
    if (error) {
      toast.error('Não foi possível criar o timer do líder.')
      return
    }

    toast.success('Timer do líder criado.')
    void loadAutomations()
  }

  const addCommand = async () => {
    if (!command.trim() || !commandResponse.trim()) {
      toast.error('Preencha o comando e a resposta do bot.')
      return
    }

    const { error } = await db.from('chat_custom_commands').insert({
      streamer_id: streamerId,
      command: normalizeCommand(command),
      response: commandResponse.trim(),
    })
    if (error) {
      toast.error('Não foi possível criar o comando. Ele pode já existir.')
      return
    }

    setCommand('')
    setCommandResponse('')
    toast.success('Comando criado.')
    void loadAutomations()
  }

  const resetCounterForm = () => {
    setEditingCounter(null)
    setCounterCommand('')
    setCounterLabel('')
    setCounterMessage(DEFAULT_COUNTER_MESSAGE)
    setCounterCooldown('60')
  }

  const saveCounter = async () => {
    const cooldown = Number(counterCooldown)
    if (
      (!editingCounter && !counterCommand.trim()) ||
      !counterLabel.trim() ||
      !counterMessage.trim() ||
      !Number.isFinite(cooldown) ||
      cooldown < 0
    ) {
      toast.error('Preencha todos os campos e informe um cooldown válido.')
      return
    }

    const payload = {
      label: counterLabel.trim(),
      response_template: counterMessage.trim(),
      cooldown_seconds: cooldown,
    }
    const { error } = editingCounter
      ? await db.from('chat_command_counters').update(payload).eq('id', editingCounter.id)
      : await db.from('chat_command_counters').insert({
          streamer_id: streamerId,
          command: normalizeCommand(counterCommand),
          ...payload,
        })

    if (error) {
      toast.error('Não foi possível salvar o contador. O comando pode já existir.')
      return
    }

    resetCounterForm()
    toast.success(editingCounter ? 'Contador atualizado.' : 'Contador criado.')
    void loadAutomations()
  }

  const previewCounterMessage = counterMessage
    .split('{target}')
    .join('Thenees')
    .split('{count}')
    .join('10')

  const tabCount = (tab: AutomationTab) => {
    if (tab === 'timers') return timers.length
    if (tab === 'commands') return commands.length
    return counters.length
  }

  return (
    <Card className="mt-6 overflow-hidden">
      <CardHeader className="border-b border-border/80 bg-gradient-to-r from-bg-secondary to-bg-tertiary/20">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-brand-purple/25 bg-brand-purple/10 text-brand-purple">
            <Bot size={17} />
          </span>
          <div>
            <h2 className="font-semibold text-content-primary">Automações do chat</h2>
            <p className="mt-0.5 text-xs text-content-muted">
              Configure respostas, mensagens recorrentes e contadores do seu canal.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="grid min-h-[420px] md:grid-cols-[13.5rem_minmax(0,1fr)]">
          <aside className="border-b border-border/80 bg-bg-tertiary/25 p-3 md:border-b-0 md:border-r">
            <p className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-content-muted">
              Chat
            </p>
            <nav className="flex gap-2 overflow-x-auto md:flex-col md:overflow-visible" aria-label="Automações do chat">
              {tabs.map((tab) => {
                const Icon = tab.icon
                const selected = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`group flex min-w-[9.5rem] items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition-all md:min-w-0 ${
                      selected
                        ? 'bg-brand-purple text-white shadow-lg shadow-brand-purple/20'
                        : 'text-content-secondary hover:bg-bg-secondary hover:text-content-primary'
                    }`}
                  >
                    <Icon size={17} className={selected ? 'text-white' : 'text-content-muted group-hover:text-brand-purple'} />
                    <span className="flex-1 font-medium">{tab.label}</span>
                    <span
                      className={`grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[10px] font-semibold ${
                        selected ? 'bg-white/15 text-white' : 'bg-bg-secondary text-content-muted'
                      }`}
                    >
                      {tabCount(tab.id)}
                    </span>
                  </button>
                )
              })}
            </nav>
            <div className="mt-5 hidden rounded-xl border border-border/80 bg-bg-secondary/70 p-3 md:block">
              <Sparkles size={15} className="mb-2 text-brand-purple" />
              <p className="text-xs font-medium text-content-primary">Tudo no seu ritmo</p>
              <p className="mt-1 text-[11px] leading-relaxed text-content-muted">
                As alterações ficam disponíveis para o bot no chat do canal.
              </p>
            </div>
          </aside>

          <div className="p-4 sm:p-6">
            {activeTab === 'timers' && (
              <section className="space-y-5" aria-labelledby="timers-title">
                <div>
                  <div className="flex items-center gap-2">
                    <Clock3 size={18} className="text-brand-purple" />
                    <h3 id="timers-title" className="text-base font-semibold text-content-primary">Timers</h3>
                  </div>
                  <p className="mt-1 text-sm text-content-muted">
                    Envie uma mensagem automaticamente em um intervalo definido.
                  </p>
                </div>

                <div className="rounded-2xl border border-border/80 bg-bg-tertiary/30 p-4">
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_9rem_auto] lg:items-end">
                    <Textarea
                      label="Mensagem do timer"
                      value={timerMessage}
                      onChange={(event) => setTimerMessage(event.target.value)}
                      placeholder="Ex.: Siga o canal para não perder a próxima votação!"
                      rows={2}
                    />
                    <Input
                      label="Intervalo"
                      type="number"
                      min="1"
                      value={timerMinutes}
                      onChange={(event) => setTimerMinutes(event.target.value)}
                      hint="Em minutos"
                    />
                    <Button onClick={addTimer} leftIcon={<Plus size={16} />}>Adicionar timer</Button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={addLeaderTimer}
                  className="flex w-full items-start gap-3 rounded-xl border border-brand-purple/25 bg-brand-purple/[0.05] p-4 text-left transition-colors hover:bg-brand-purple/[0.09]"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-purple/15 text-brand-purple">
                    <Trophy size={16} />
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-content-primary">Adicionar timer do líder da votação</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-content-muted">
                      A cada 15 minutos, o bot destaca quem mais participou da votação ativa.
                    </span>
                  </span>
                </button>

                {timers.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-content-muted">Timers ativos</p>
                    {timers.map((timer) => (
                      <div key={timer.id} className="flex items-center gap-3 rounded-xl border border-border/80 bg-bg-secondary/60 px-4 py-3">
                        <Clock3 size={16} className="shrink-0 text-brand-purple" />
                        <p className="min-w-0 flex-1 truncate text-sm text-content-primary">
                          {timer.kind === 'poll_leader' ? 'Líder da votação' : timer.message}
                        </p>
                        <span className="rounded-full bg-bg-tertiary px-2.5 py-1 text-xs text-content-secondary">
                          {timer.interval_minutes} min
                        </span>
                        <Button size="sm" variant="ghost" onClick={() => removeAutomation('chat_timed_messages', timer.id)}>
                          <Trash2 size={14} />
                          <span className="sr-only">Remover timer</span>
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {activeTab === 'commands' && (
              <section className="space-y-5" aria-labelledby="commands-title">
                <div>
                  <div className="flex items-center gap-2">
                    <MessageCircle size={18} className="text-brand-purple" />
                    <h3 id="commands-title" className="text-base font-semibold text-content-primary">Comandos</h3>
                  </div>
                  <p className="mt-1 text-sm text-content-muted">
                    Crie respostas para comandos enviados no chat. A sintaxe do StreamElements também funciona aqui.
                  </p>
                </div>

                <details className="group rounded-xl border border-border/80 bg-bg-tertiary/25 px-4 py-3">
                  <summary className="cursor-pointer text-sm font-medium text-content-primary marker:text-brand-purple">
                    Variáveis e comandos pelo chat
                  </summary>
                  <div className="mt-3 grid gap-3 text-xs leading-relaxed text-content-muted sm:grid-cols-2">
                    <p><strong className="text-content-primary">Pessoa e argumentos:</strong> <code>{'$(sender)'}</code>, <code>{'$(user)'}</code>, <code>{'$(touser)'}</code>, <code>{'$(1)'}</code>, <code>{'$(1:)'}</code>, <code>{'$(msgid)'}</code>.</p>
                    <p><strong className="text-content-primary">Canal e utilidades:</strong> <code>{'$(channel)'}</code>, <code>{'$(provider)'}</code>, <code>{'$(random)'}</code>, <code>{'$(count)'}</code>, <code>{'$(queryescape ...)'}</code>.</p>
                    <p className="sm:col-span-2"><strong className="text-content-primary">Moderadores autorizados:</strong> use <code>!command add !nome resposta</code>, <code>!command edit !nome nova resposta</code>, <code>!command remove !nome</code> ou <code>!command show !nome</code>. <code>!cmd</code> é um atalho.</p>
                  </div>
                </details>

                <div className="rounded-2xl border border-border/80 bg-bg-tertiary/30 p-4">
                  <div className="grid gap-3 lg:grid-cols-[10rem_minmax(0,1fr)_auto] lg:items-end">
                    <Input
                      label="Comando"
                      value={command}
                      onChange={(event) => setCommand(event.target.value)}
                      placeholder="!discord"
                    />
                    <Input
                      label="Resposta do bot"
                      value={commandResponse}
                      onChange={(event) => setCommandResponse(event.target.value)}
                      placeholder="Entre no Discord: ..."
                    />
                    <Button onClick={addCommand} leftIcon={<Plus size={16} />}>Novo comando</Button>
                  </div>
                </div>

                {commands.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-content-muted">Comandos ativos</p>
                    {commands.map((item) => (
                      <div key={item.id} className="flex items-center gap-3 rounded-xl border border-border/80 bg-bg-secondary/60 px-4 py-3">
                        <code className="rounded-lg bg-brand-purple/10 px-2 py-1 text-xs font-semibold text-brand-purple">{item.command}</code>
                        <p className="min-w-0 flex-1 truncate text-sm text-content-secondary">{item.response}</p>
                        <Button size="sm" variant="ghost" onClick={() => removeAutomation('chat_custom_commands', item.id)}>
                          <Trash2 size={14} />
                          <span className="sr-only">Remover comando</span>
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {activeTab === 'counters' && (
              <section className="space-y-5" aria-labelledby="counters-title">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Hash size={18} className="text-brand-purple" />
                      <h3 id="counters-title" className="text-base font-semibold text-content-primary">Contadores</h3>
                    </div>
                    <p className="mt-1 text-sm text-content-muted">
                      Cada pessoa acumula sua própria contagem ao usar o comando no chat.
                    </p>
                  </div>
                  {editingCounter && (
                    <Button size="sm" variant="ghost" onClick={resetCounterForm}>Cancelar edição</Button>
                  )}
                </div>

                <div className="rounded-2xl border border-border/80 bg-bg-tertiary/30 p-4">
                  <div className="grid gap-3 lg:grid-cols-[10rem_minmax(0,1fr)_9rem]">
                    <Input
                      label="Comando"
                      value={counterCommand}
                      onChange={(event) => setCounterCommand(event.target.value)}
                      placeholder="!lurker"
                      disabled={Boolean(editingCounter)}
                    />
                    <Input
                      label="Nome interno"
                      value={counterLabel}
                      onChange={(event) => setCounterLabel(event.target.value)}
                      placeholder="Modo lurker"
                    />
                    <Input
                      label="Cooldown"
                      type="number"
                      min="0"
                      value={counterCooldown}
                      onChange={(event) => setCounterCooldown(event.target.value)}
                      hint="Em segundos"
                    />
                  </div>

                  <div className="mt-4 rounded-xl border border-border/80 bg-bg-secondary/70 p-3">
                    <Textarea
                      label="Mensagem enviada pelo bot"
                      value={counterMessage}
                      onChange={(event) => setCounterMessage(event.target.value)}
                      placeholder={DEFAULT_COUNTER_MESSAGE}
                      rows={2}
                    />
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-content-muted">
                      <span>Variáveis:</span>
                      <code className="rounded-md bg-bg-tertiary px-2 py-1 text-brand-purple">{'{target}'}</code>
                      <code className="rounded-md bg-bg-tertiary px-2 py-1 text-brand-purple">{'{count}'}</code>
                    </div>
                    <div className="mt-3 rounded-lg border border-brand-purple/15 bg-brand-purple/[0.05] px-3 py-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-purple">Prévia no chat</p>
                      <p className="mt-1 text-sm text-content-primary">{previewCounterMessage || 'Escreva a mensagem que o bot deverá enviar.'}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex justify-end">
                    <Button onClick={saveCounter} leftIcon={editingCounter ? <Pencil size={16} /> : <Plus size={16} />}>
                      {editingCounter ? 'Salvar alterações' : 'Novo contador'}
                    </Button>
                  </div>
                </div>

                {counters.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-content-muted">Contadores configurados</p>
                    {counters.map((counter) => (
                      <article key={counter.id} className="rounded-xl border border-border/80 bg-bg-secondary/60 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <code className="rounded-lg bg-brand-purple/10 px-2 py-1 text-xs font-semibold text-brand-purple">{counter.command}</code>
                          <span className="text-sm font-medium text-content-primary">{counter.label}</span>
                          <span className="rounded-full bg-bg-tertiary px-2.5 py-1 text-xs text-content-secondary">{counter.count} usos</span>
                          <span className="rounded-full bg-bg-tertiary px-2.5 py-1 text-xs text-content-secondary">{counter.cooldown_seconds}s de cooldown</span>
                          <span className="ml-auto flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingCounter(counter)
                                setCounterCommand(counter.command)
                                setCounterLabel(counter.label)
                                setCounterMessage(counter.response_template)
                                setCounterCooldown(String(counter.cooldown_seconds))
                              }}
                              leftIcon={<Pencil size={14} />}
                            >
                              Editar
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => removeAutomation('chat_command_counters', counter.id)}>
                              <Trash2 size={14} />
                              <span className="sr-only">Remover contador</span>
                            </Button>
                          </span>
                        </div>
                        <p className="mt-3 text-sm text-content-secondary">{counter.response_template}</p>
                        <div className="mt-4 border-t border-border/70 pt-3">
                          <button
                            type="button"
                            onClick={() => toggleCounterDetails(counter.id)}
                            className="inline-flex items-center gap-2 text-xs font-medium text-brand-purple transition-colors hover:text-brand-purple-light"
                          >
                            {expandedCounterId === counter.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                            {expandedCounterId === counter.id ? 'Ocultar contagem individual' : 'Ver contagem por pessoa'}
                          </button>

                          {expandedCounterId === counter.id && (
                            <div className="mt-3 overflow-hidden rounded-xl border border-border/80 bg-bg-tertiary/30">
                              <div className="flex items-center justify-between border-b border-border/70 px-3 py-2.5">
                                <div>
                                  <p className="text-xs font-semibold text-content-primary">Ativações por pessoa</p>
                                  <p className="mt-0.5 text-[11px] text-content-muted">Cada pessoa começa sua própria contagem ao usar {counter.command}.</p>
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  loading={loadingCounterValues === counter.id}
                                  onClick={() => {
                                    void loadAutomations()
                                    void loadCounterValues(counter.id)
                                  }}
                                  leftIcon={<RefreshCw size={14} />}
                                >
                                  Atualizar
                                </Button>
                              </div>
                              {loadingCounterValues === counter.id ? (
                                <p className="px-3 py-4 text-sm text-content-muted">Atualizando contagens…</p>
                              ) : (counterValues[counter.id] ?? []).length > 0 ? (
                                <div className="divide-y divide-border/70">
                                  {(counterValues[counter.id] ?? []).map((value, index) => (
                                    <div key={value.target_login} className="flex items-center gap-3 px-3 py-2.5">
                                      <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-purple/10 text-[11px] font-semibold text-brand-purple">
                                        {index + 1}
                                      </span>
                                      <span className="min-w-0 flex-1 truncate text-sm text-content-primary">{value.target_display_name}</span>
                                      <span className="rounded-full bg-bg-secondary px-2.5 py-1 text-xs font-medium text-content-secondary">
                                        {value.count} {value.count === 1 ? 'vez' : 'vezes'}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="px-3 py-4 text-sm text-content-muted">Ainda ninguém ativou este contador.</p>
                              )}
                            </div>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
