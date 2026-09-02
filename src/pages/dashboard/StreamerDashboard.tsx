import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Send, Clock, ThumbsUp, Play, CheckCircle, XCircle,
  LayoutGrid, List, Settings, Users, Zap, ExternalLink,
  ChevronRight, AlertCircle, Trash2
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/authStore'
import { useSuggestions } from '@/hooks/useSuggestions'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { cn, formatRelativeDate, categoryLabel } from '@/lib/utils'
import type { Suggestion, SuggestionStatus } from '@/types'

// ============================================================
// Kanban Column
// ============================================================
interface KanbanColumnProps {
  title: string
  status: SuggestionStatus
  suggestions: Suggestion[]
  color: string
  onAction?: (id: string, status: SuggestionStatus) => void
  onReject?: (s: Suggestion) => void
  onWatch?: (id: string) => void
  onDelete?: (suggestion: Suggestion) => void
}

function KanbanColumn({
  title,
  status,
  suggestions,
  color,
  onAction,
  onReject,
  onWatch,
  onDelete,
}: KanbanColumnProps) {
  return (
    <div className="bg-bg-tertiary border border-border rounded-2xl min-h-[200px] w-72 shrink-0 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className={cn('w-2 h-2 rounded-full', color)} />
          <span className="text-sm font-semibold text-content-primary">{title}</span>
        </div>
        <span className="text-xs text-content-muted bg-bg-secondary border border-border rounded-full px-2 py-0.5">
          {suggestions.length}
        </span>
      </div>

      <div className="flex-1 p-3 space-y-2 overflow-y-auto max-h-96">
        {suggestions.length === 0 ? (
          <div className="text-center py-8 text-xs text-content-muted">
            Nenhuma sugestão
          </div>
        ) : (
          suggestions.map((s) => (
            <div
              key={s.id}
              className="bg-bg-secondary border border-border rounded-xl p-3 group hover:border-border-light transition-colors"
            >
              <p className="text-xs font-semibold text-content-primary line-clamp-2 mb-1">{s.title}</p>
              <div className="flex items-center gap-1.5 mb-2">
                <Badge variant="category" category={s.category as never} size="sm" />
                <span className="text-xs text-content-muted flex items-center gap-0.5">
                  <ThumbsUp size={9} />
                  {s.vote_count ?? 0}
                </span>
              </div>
              <p className="text-xs text-content-muted mb-2">
                {s.submitter?.display_name} · {formatRelativeDate(s.submitted_at)}
              </p>

              {/* Ações por status */}
              <div className="flex gap-1.5 flex-wrap">
                {status === 'pending' && (
                  <>
                    <button
                      onClick={() => onAction?.(s.id, 'approved')}
                      className="text-xs text-status-completed hover:underline"
                    >
                      Aprovar
                    </button>
                    <span className="text-content-muted text-xs">·</span>
                    <button
                      onClick={() => onReject?.(s)}
                      className="text-xs text-status-rejected hover:underline"
                    >
                      Rejeitar
                    </button>
                  </>
                )}
                {status === 'approved' && (
                  <button
                    onClick={() => onAction?.(s.id, 'queued')}
                    className="text-xs text-brand-purple hover:underline"
                  >
                    Adicionar à fila
                  </button>
                )}
                {status === 'queued' && (
                  <button
                    onClick={() => onWatch?.(s.id)}
                    className="text-xs text-status-watching hover:underline"
                  >
                    Assistir agora
                  </button>
                )}
                {status === 'watching' && (
                  <button
                    onClick={() => onAction?.(s.id, 'completed')}
                    className="text-xs text-status-completed hover:underline"
                  >
                    Marcar concluído
                  </button>
                )}
                <button
                  onClick={() => onDelete?.(s)}
                  className="ml-auto inline-flex items-center gap-1 text-xs text-content-muted transition-colors hover:text-status-rejected"
                  aria-label={`Excluir ${s.title}`}
                >
                  <Trash2 size={11} />
                  Excluir
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ============================================================
// Modal de rejeição
// ============================================================
function RejectModal({
  suggestion,
  isOpen,
  onClose,
  onReject,
}: {
  suggestion: Suggestion | null
  isOpen: boolean
  onClose: () => void
  onReject: (id: string, reason: string) => void
}) {
  const [reason, setReason] = useState('')

  const handleSubmit = () => {
    if (!suggestion) return
    onReject(suggestion.id, reason)
    setReason('')
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Rejeitar sugestão" size="sm">
      {suggestion && (
        <div className="space-y-4">
          <div className="bg-bg-tertiary rounded-xl p-3">
            <p className="text-sm font-medium text-content-primary">{suggestion.title}</p>
            <p className="text-xs text-content-muted mt-1">
              por {suggestion.submitter?.display_name}
            </p>
          </div>
          <Input
            label="Motivo (opcional)"
            placeholder="Ex: Fora do tema do canal, já assistimos..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button variant="danger" onClick={handleSubmit}>Rejeitar</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ============================================================
// Dashboard do Streamer
// ============================================================
type DashTab = 'kanban' | 'settings' | 'moderators' | 'twitch'

export default function StreamerDashboard() {
  const { streamerProfile, profile } = useAuthStore()
  const [activeTab, setActiveTab] = useState<DashTab>('kanban')
  const [rejectTarget, setRejectTarget] = useState<Suggestion | null>(null)

  const {
    suggestions, watching, queued, pending, approved,
    completed, rejected, isLoading, updateStatus, remove
  } = useSuggestions(streamerProfile?.id)

  const handleAction = async (id: string, status: SuggestionStatus) => {
    try {
      await updateStatus(id, status)
      toast.success(`Sugestão ${status === 'approved' ? 'aprovada' : status === 'queued' ? 'adicionada à fila' : 'atualizada'}!`)
    } catch {
      toast.error('Erro ao atualizar sugestão')
    }
  }

  const handleWatch = async (id: string) => {
    // Se já há algo sendo assistido, confirmar
    if (watching) {
      const ok = window.confirm(`Já há "${watching.title}" sendo assistido. Deseja trocar?`)
      if (!ok) return
      await updateStatus(watching.id, 'queued')
    }
    await handleAction(id, 'watching')
    toast.success('Status "Assistindo agora" ativado!')
  }

  const handleReject = async (id: string, reason: string) => {
    await updateStatus(id, 'rejected', { rejection_reason: reason || undefined })
    toast.success('Sugestão rejeitada.')
  }

  const handleDelete = async (suggestion: Suggestion) => {
    const confirmed = window.confirm(
      `Excluir “${suggestion.title}” definitivamente? Esta ação não pode ser desfeita.`
    )
    if (!confirmed) return

    try {
      await remove(suggestion.id)
      toast.success('Sugestão excluída definitivamente.')
    } catch {
      // O hook já apresenta a mensagem de erro.
    }
  }

  if (!streamerProfile) {
    return (
      <div className="min-h-screen py-16 px-4">
        <div className="max-w-lg mx-auto">
          <EmptyState
            icon={<Zap size={28} />}
            title="Você ainda não tem um canal"
            description="Crie seu canal no WatchQueue para receber sugestões da sua comunidade."
            action={
              <Button leftIcon={<ExternalLink size={15} />}>
                Criar meu canal
              </Button>
            }
          />
        </div>
      </div>
    )
  }

  const stats = [
    { label: 'Pendentes', value: pending.length, icon: Clock, color: 'text-status-pending' },
    { label: 'Aprovadas', value: approved.length, icon: CheckCircle, color: 'text-status-approved' },
    { label: 'Na fila', value: queued.length, icon: List, color: 'text-status-queued' },
    { label: 'Concluídas', value: completed.length, icon: CheckCircle, color: 'text-status-completed' },
  ]

  const tabs: { id: DashTab; label: string; icon: typeof LayoutGrid }[] = [
    { id: 'kanban', label: 'Kanban', icon: LayoutGrid },
    { id: 'moderators', label: 'Moderadores', icon: Users },
    { id: 'twitch', label: 'Twitch', icon: Zap },
    { id: 'settings', label: 'Configurações', icon: Settings },
  ]

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Avatar
              src={streamerProfile.avatar_url}
              alt={streamerProfile.channel_name}
              fallback={streamerProfile.channel_name}
              size="md"
            />
            <div>
              <h1 className="text-xl font-bold text-content-primary">{streamerProfile.channel_name}</h1>
              <Link
                to={`/streamer/${streamerProfile.slug}`}
                className="text-xs text-brand-purple hover:underline flex items-center gap-1"
              >
                {window.location.host}/streamer/{streamerProfile.slug}
                <ExternalLink size={10} />
              </Link>
            </div>
          </div>

          {/* Assistindo agora */}
          {watching && (
            <div className="flex items-center gap-2 bg-status-watching/10 border border-status-watching/20 rounded-xl px-4 py-2">
              <span className="live-dot" />
              <span className="text-sm text-content-primary font-medium">Assistindo:</span>
              <span className="text-sm text-status-watching font-semibold">{watching.title}</span>
              <button
                onClick={() => handleAction(watching.id, 'completed')}
                className="ml-2 text-xs text-content-muted hover:text-status-completed transition-colors"
              >
                Concluir
              </button>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {stats.map(({ label, value, icon: Icon, color }) => (
            <Card key={label}>
              <CardContent className="py-4">
                <div className="flex items-center gap-3">
                  <Icon size={18} className={color} />
                  <div>
                    <p className="text-2xl font-bold text-content-primary">{value}</p>
                    <p className="text-xs text-content-muted">{label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-bg-secondary border border-border rounded-xl p-1 w-fit">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                'flex items-center gap-2 py-2 px-4 rounded-lg text-sm font-medium transition-all duration-200',
                activeTab === id
                  ? 'bg-bg-primary text-content-primary shadow'
                  : 'text-content-muted hover:text-content-secondary'
              )}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        {/* Kanban */}
        {activeTab === 'kanban' && (
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-4 w-max">
              <KanbanColumn
                title="Pendente"
                status="pending"
                suggestions={pending}
                color="bg-status-pending"
                onAction={handleAction}
                onReject={setRejectTarget}
                onDelete={handleDelete}
              />
              <KanbanColumn
                title="Aprovado"
                status="approved"
                suggestions={approved}
                color="bg-status-approved"
                onAction={handleAction}
                onReject={setRejectTarget}
                onDelete={handleDelete}
              />
              <KanbanColumn
                title="Na Fila"
                status="queued"
                suggestions={queued}
                color="bg-status-queued"
                onAction={handleAction}
                onReject={setRejectTarget}
                onWatch={handleWatch}
                onDelete={handleDelete}
              />
              <KanbanColumn
                title="Assistindo"
                status="watching"
                suggestions={watching ? [watching] : []}
                color="bg-status-watching"
                onAction={handleAction}
                onReject={setRejectTarget}
                onDelete={handleDelete}
              />
              <KanbanColumn
                title="Concluído"
                status="completed"
                suggestions={completed.slice(0, 10)}
                color="bg-status-completed"
                onAction={handleAction}
                onReject={setRejectTarget}
                onDelete={handleDelete}
              />
              <KanbanColumn
                title="Rejeitado"
                status="rejected"
                suggestions={rejected.slice(0, 5)}
                color="bg-status-rejected"
                onAction={handleAction}
                onReject={setRejectTarget}
                onDelete={handleDelete}
              />
            </div>
          </div>
        )}

        {/* Moderadores */}
        {activeTab === 'moderators' && (
          <Card>
            <CardHeader>
              <h2 className="font-semibold text-content-primary flex items-center gap-2">
                <Users size={16} className="text-brand-purple" />
                Moderadores
              </h2>
            </CardHeader>
            <CardContent>
              <EmptyState
                icon={<Users size={22} />}
                title="Nenhum moderador"
                description="Adicione moderadores para ajudar a gerenciar as sugestões do seu canal."
                compact
                action={<Button size="sm" variant="outline">Convidar moderador</Button>}
              />
            </CardContent>
          </Card>
        )}

        {/* Integração Twitch */}
        {activeTab === 'twitch' && (
          <Card>
            <CardHeader>
              <h2 className="font-semibold text-content-primary flex items-center gap-2">
                <Zap size={16} className="text-brand-purple" />
                Integração Twitch
              </h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-brand-purple/10 border border-brand-purple/20 rounded-xl p-4 flex gap-3">
                <CheckCircle size={18} className="text-brand-purple shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-content-primary mb-1">
                    Autenticação Twitch Ativa & Conectada
                  </p>
                  <p className="text-xs text-content-secondary">
                    Seu canal está sincronizado com sua conta Twitch. Os viewers autenticados podem enviar sugestões e votar na sua fila.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-content-primary">Mensagens automáticas</p>
                {[
                  { event: 'Nova sugestão', msg: '🎬 {viewer} adicionou "{titulo}" à lista!' },
                  { event: 'Aprovação', msg: '✅ A sugestão "{titulo}" foi aprovada!' },
                  { event: 'Assistindo agora', msg: '🍿 Começamos a assistir "{titulo}"!' },
                  { event: 'Concluído', msg: '🎉 Terminamos de assistir "{titulo}"!' },
                ].map((item) => (
                  <div key={item.event} className="flex items-center gap-3 bg-bg-tertiary border border-border rounded-xl p-3">
                    <div className="flex-1">
                      <p className="text-xs font-medium text-content-primary">{item.event}</p>
                      <p className="text-xs text-content-muted font-mono">{item.msg}</p>
                    </div>
                    <div className="text-xs text-content-muted">Simulado</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Configurações */}
        {activeTab === 'settings' && (
          <Card>
            <CardHeader>
              <h2 className="font-semibold text-content-primary flex items-center gap-2">
                <Settings size={16} className="text-brand-purple" />
                Configurações do Canal
              </h2>
            </CardHeader>
            <CardContent>
              <EmptyState
                icon={<Settings size={22} />}
                title="Configurações em breve"
                description="Aqui você poderá configurar aprovação automática, limite de sugestões por viewer, regras e aparência."
                compact
              />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Modal de rejeição */}
      <RejectModal
        suggestion={rejectTarget}
        isOpen={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        onReject={handleReject}
      />
    </div>
  )
}
