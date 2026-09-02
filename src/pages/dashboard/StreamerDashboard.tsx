import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Send, Clock, ThumbsUp, Play, CheckCircle, XCircle,
  LayoutGrid, List, Settings, Users, Zap, ExternalLink,
  ChevronRight, AlertCircle, Trash2, Image, Save, Link as LinkIcon, Upload, UserPlus, UserMinus
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/authStore'
import { supabase } from '@/lib/supabase'
import { useSuggestions } from '@/hooks/useSuggestions'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { Modal } from '@/components/ui/Modal'
import { Input, Textarea, Select } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { cn, formatRelativeDate, categoryLabel } from '@/lib/utils'
import type { Suggestion, SuggestionStatus, SuggestionCategory } from '@/types'
import { getTwitchChatConnectUrl } from '@/lib/supabase'

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
    <div className="bg-bg-tertiary/70 border border-border rounded-2xl min-h-[220px] w-full min-w-0 flex flex-col">
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
type ChatEventType = 'suggestion_received' | 'suggestion_approved' | 'watching_now' | 'completed' | 'streamer_added'
type ModeratorMember = {
  id: string
  user_id: string
  role: string
  permissions: string[]
  profile?: { display_name: string; twitch_login: string; avatar_url: string | null }
}
type ModeratorCandidate = { id: string; display_name: string; twitch_login: string; avatar_url: string | null }

const DEFAULT_CHAT_TEMPLATES: Record<ChatEventType, string> = {
  suggestion_received: '🎬 {viewer} adicionou “{titulo}” à lista do canal! Envie sua sugestão também no WatchQueue.',
  suggestion_approved: '✅ A sugestão “{titulo}”, enviada por {viewer}, foi aprovada! Participe também pelo WatchQueue.',
  watching_now: '🍿 Agora estamos assistindo “{titulo}”, sugestão de {viewer}! Qual deveria ser a próxima?',
  completed: '🎉 Terminamos “{titulo}”, sugestão de {viewer}! Obrigado por participar da comunidade.',
  streamer_added: '📌 {viewer} adicionou “{titulo}” em {categoria}. Vote na sua ideia favorita pelo WatchQueue!',
}

const CHAT_TEMPLATE_LABELS: Record<ChatEventType, string> = {
  suggestion_received: 'Nova sugestão',
  suggestion_approved: 'Aprovação',
  watching_now: 'Assistindo agora',
  completed: 'Concluído',
  streamer_added: 'Conteúdo adicionado pelo streamer',
}

export default function StreamerDashboard() {
  const { streamerProfile, profile, refreshProfile } = useAuthStore()
  const [activeTab, setActiveTab] = useState<DashTab>('kanban')
  const [rejectTarget, setRejectTarget] = useState<Suggestion | null>(null)
  const [channelName, setChannelName] = useState(streamerProfile?.channel_name ?? '')
  const [bio, setBio] = useState(streamerProfile?.bio ?? '')
  const [coverUrl, setCoverUrl] = useState(streamerProfile?.cover_url ?? '')
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>(
    streamerProfile?.social_links ?? { instagram: '', youtube: '', tiktok: '', discord: '' }
  )
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [coverUploading, setCoverUploading] = useState(false)
  const [chatConnected, setChatConnected] = useState(false)
  const [chatStatusLoading, setChatStatusLoading] = useState(true)
  const [chatDisconnecting, setChatDisconnecting] = useState(false)
  const [chatTemplates, setChatTemplates] = useState<Record<ChatEventType, string>>(DEFAULT_CHAT_TEMPLATES)
  const [templatesSaving, setTemplatesSaving] = useState(false)
  const [moderators, setModerators] = useState<ModeratorMember[]>([])
  const [selectedModeratorId, setSelectedModeratorId] = useState('')
  const [moderatorsLoading, setModeratorsLoading] = useState(false)
  const [moderatorCandidates, setModeratorCandidates] = useState<ModeratorCandidate[]>([])
  const [addContentOpen, setAddContentOpen] = useState(false)
  const [newContentTitle, setNewContentTitle] = useState('')
  const [newContentCategory, setNewContentCategory] = useState<SuggestionCategory>('react')
  const [newContentUrl, setNewContentUrl] = useState('')
  const [newContentDescription, setNewContentDescription] = useState('')
  const [newContentSaving, setNewContentSaving] = useState(false)

  const {
    suggestions, watching, queued, pending, approved,
    completed, rejected, isLoading, updateStatus, remove
  } = useSuggestions(streamerProfile?.id)

  useEffect(() => {
    if (!streamerProfile?.id) return
    let active = true
    const loadChatStatus = async () => {
      setChatStatusLoading(true)
      const { data } = await supabase
        .from('twitch_connections')
        .select('token_status')
        .eq('streamer_id', streamerProfile.id)
        .maybeSingle()
      if (active) {
        setChatConnected(data?.token_status === 'active')
        setChatStatusLoading(false)
      }
    }
    loadChatStatus()

    const params = new URLSearchParams(window.location.search)
    if (params.get('chat') === 'connected') {
      setActiveTab('twitch')
      toast.success('Mensagens da Twitch conectadas.')
      window.history.replaceState({}, '', window.location.pathname)
    }
    return () => { active = false }
  }, [streamerProfile?.id])

  const loadModeratorData = async () => {
    if (!streamerProfile?.id) return
    const [membersResult, suggestionsResult] = await Promise.all([
      supabase
        .from('streamer_members')
        .select('id, user_id, role, permissions, profile:profiles!user_id(display_name, twitch_login, avatar_url)')
        .eq('streamer_id', streamerProfile.id)
        .eq('role', 'moderator'),
      supabase
        .from('suggestions')
        .select('submitted_by, submitter:profiles!submitted_by(id, display_name, twitch_login, avatar_url)')
        .eq('streamer_id', streamerProfile.id),
    ])
    const nextModerators = (membersResult.data ?? []) as unknown as ModeratorMember[]
    setModerators(nextModerators)

    const candidateMap = new Map<string, ModeratorCandidate>()
    ;(suggestionsResult.data ?? []).forEach((row) => {
      const viewer = row.submitter as unknown as ModeratorCandidate | null
      if (
        viewer &&
        row.submitted_by !== streamerProfile.owner_id &&
        !nextModerators.some((member) => member.user_id === row.submitted_by)
      ) candidateMap.set(row.submitted_by, viewer)
    })
    setModeratorCandidates(Array.from(candidateMap.values()))
  }

  useEffect(() => {
    loadModeratorData()
    // streamerProfile is the stable ownership boundary for this list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamerProfile?.id])

  useEffect(() => {
    if (!streamerProfile?.id) return
    const loadTemplates = async () => {
      const { data } = await supabase
        .from('chat_message_templates')
        .select('event_type, template')
        .eq('streamer_id', streamerProfile.id)
      if (!data) return
      setChatTemplates((current) => {
        const next = { ...current }
        data.forEach((row) => {
          if (row.event_type in next) next[row.event_type as ChatEventType] = row.template
        })
        return next
      })
    }
    loadTemplates()
  }, [streamerProfile?.id])

  const handleDisconnectChat = async () => {
    if (!streamerProfile) return
    setChatDisconnecting(true)
    try {
      const { error } = await supabase.functions.invoke('twitch-auth', {
        body: { action: 'disconnect_chat', streamer_id: streamerProfile.id },
      })
      if (error) throw error
      setChatConnected(false)
      toast.success('Mensagens da Twitch desconectadas.')
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível desconectar as mensagens da Twitch.')
    } finally {
      setChatDisconnecting(false)
    }
  }

  const handleSaveChatTemplates = async () => {
    if (!streamerProfile) return
    setTemplatesSaving(true)
    try {
      let viewerVariableAdded = false
      const rows = (Object.keys(chatTemplates) as ChatEventType[]).map((eventType) => {
        let template = chatTemplates[eventType].trim() || DEFAULT_CHAT_TEMPLATES[eventType]
        if (!template.includes('{viewer}')) {
          template += ' — sugestão de {viewer}'
          viewerVariableAdded = true
        }
        return { streamer_id: streamerProfile.id, event_type: eventType, template, enabled: true }
      })
      const { error } = await supabase
        .from('chat_message_templates')
        .upsert(rows as never, { onConflict: 'streamer_id,event_type' })
      if (error) throw error
      setChatTemplates(Object.fromEntries(rows.map((row) => [row.event_type, row.template])) as Record<ChatEventType, string>)
      toast.success(viewerVariableAdded
        ? 'Mensagens salvas. A variável {viewer} foi mantida automaticamente.'
        : 'Mensagens automáticas salvas.')
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível salvar as mensagens automáticas.')
    } finally {
      setTemplatesSaving(false)
    }
  }

  const handleAddModerator = async () => {
    if (!streamerProfile || !selectedModeratorId) return
    setModeratorsLoading(true)
    try {
      const { error } = await supabase.from('streamer_members').upsert({
        streamer_id: streamerProfile.id,
        user_id: selectedModeratorId,
        role: 'moderator',
        permissions: [],
      } as never, { onConflict: 'streamer_id,user_id' })
      if (error) throw error
      setSelectedModeratorId('')
      await loadModeratorData()
      toast.success('Viewer definido como moderador.')
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível adicionar o moderador.')
    } finally {
      setModeratorsLoading(false)
    }
  }

  const handleRemoveModerator = async (member: ModeratorMember) => {
    setModeratorsLoading(true)
    try {
      const { error } = await supabase
        .from('streamer_members')
        .delete()
        .eq('id', member.id)
        .eq('role', 'moderator')
      if (error) throw error
      setModerators((current) => current.filter((item) => item.id !== member.id))
      await loadModeratorData()
      toast.success('Moderador removido.')
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível remover o moderador.')
    } finally {
      setModeratorsLoading(false)
    }
  }

  const handleAddStreamerContent = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!streamerProfile || !profile || !newContentTitle.trim()) return
    if ((newContentCategory === 'react' || newContentCategory === 'music') && !newContentUrl.trim()) {
      toast.error('Informe o link do conteúdo.')
      return
    }
    setNewContentSaving(true)
    try {
      const { data: created, error } = await supabase.from('suggestions').insert({
        streamer_id: streamerProfile.id,
        submitted_by: profile.id,
        category: newContentCategory,
        title: newContentTitle.trim(),
        description: newContentDescription.trim() || null,
        source_url: newContentUrl.trim() || null,
        status: 'approved',
        approved_at: new Date().toISOString(),
      } as never).select('id').single()
      if (error) throw error

      const { data: chatResult, error: chatError } = await supabase.functions.invoke('twitch-chat', {
        body: {
          streamer_id: streamerProfile.id,
          suggestion_id: created?.id,
          event_type: 'streamer_added',
          viewer_name: profile.display_name,
          title: newContentTitle.trim(),
        },
      })
      if (chatError || chatResult?.status !== 'sent') {
        toast.warning('Conteúdo adicionado, mas a mensagem não chegou à Twitch.')
      } else {
        toast.success('Conteúdo adicionado e anunciado no chat.')
      }
      setNewContentTitle('')
      setNewContentUrl('')
      setNewContentDescription('')
      setAddContentOpen(false)
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível adicionar o conteúdo.')
    } finally {
      setNewContentSaving(false)
    }
  }

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

  const handleSaveSettings = async () => {
    if (!streamerProfile || !channelName.trim()) return
    setSettingsSaving(true)
    try {
      const { error } = await supabase
        .from('streamers')
        .update({
          channel_name: channelName.trim(),
          bio: bio.trim() || null,
          cover_url: coverUrl.trim() || null,
          social_links: socialLinks,
        } as never)
        .eq('id', streamerProfile.id)

      if (error) throw error
      await refreshProfile()
      toast.success('Informações do canal atualizadas.')
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível salvar as informações do canal.')
    } finally {
      setSettingsSaving(false)
    }
  }

  const handleCoverUpload = async (file?: File) => {
    if (!file || !streamerProfile) return
    if (!file.type.startsWith('image/')) {
      toast.error('Escolha um arquivo de imagem.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('A imagem deve ter no máximo 5 MB.')
      return
    }

    setCoverUploading(true)
    try {
      const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = `${streamerProfile.id}/cover.${extension}`
      const { error } = await supabase.storage
        .from('streamer-assets')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (error) throw error

      const { data } = supabase.storage.from('streamer-assets').getPublicUrl(path)
      const publicUrl = `${data.publicUrl}?v=${Date.now()}`
      setCoverUrl(publicUrl)
      toast.success('Capa enviada. Clique em salvar para confirmar.')
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível enviar a imagem de capa.')
    } finally {
      setCoverUploading(false)
    }
  }

  if (!streamerProfile) {
    return (
      <div className="min-h-screen page-section">
        <div className="max-w-lg mx-auto">
          <EmptyState
            icon={<Zap size={28} />}
            title="Acesso de streamer não disponível"
            description="Seu perfil está configurado como viewer. Canais administrativos são liberados por convite."
            action={
              <Link to="/dashboard">
                <Button leftIcon={<ExternalLink size={15} />}>
                  Voltar às minhas sugestões
                </Button>
              </Link>
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
    <div className="min-h-screen page-section">
      <div className="app-shell space-y-6">

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

          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button size="sm" onClick={() => setAddContentOpen(true)} leftIcon={<Send size={15} />}>
              Adicionar ideia
            </Button>
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
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 min-[430px]:grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
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
        <div className="flex max-w-full gap-1 overflow-x-auto bg-bg-secondary border border-border rounded-xl p-1 w-fit">
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
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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
            <CardContent className="space-y-5">
              <div className="rounded-xl border border-border bg-bg-tertiary p-4">
                <p className="text-sm font-medium text-content-primary">Promover um viewer</p>
                <p className="mt-1 text-xs text-content-muted">A lista mostra viewers que já enviaram sugestões para o seu canal. As permissões serão definidas em uma próxima etapa.</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <select
                    aria-label="Viewer para promover a moderador"
                    className="focus-ring min-h-10 flex-1 rounded-xl border border-border bg-bg-secondary px-3 text-sm text-content-primary"
                    value={selectedModeratorId}
                    onChange={(event) => setSelectedModeratorId(event.target.value)}
                  >
                    <option value="">Selecione um viewer</option>
                    {moderatorCandidates.map((viewer) => (
                      <option key={viewer.id} value={viewer.id}>{viewer.display_name} (@{viewer.twitch_login})</option>
                    ))}
                  </select>
                  <Button disabled={!selectedModeratorId} loading={moderatorsLoading} onClick={handleAddModerator} leftIcon={<UserPlus size={15} />}>
                    Tornar moderador
                  </Button>
                </div>
              </div>

              {moderators.length === 0 ? (
                <EmptyState
                  icon={<Users size={22} />}
                  title="Nenhum moderador"
                  description="Selecione acima um viewer que já participou do canal."
                  compact
                />
              ) : (
                <div className="space-y-2">
                  {moderators.map((member) => (
                    <div key={member.id} className="flex items-center gap-3 rounded-xl border border-border bg-bg-tertiary p-3">
                      <Avatar src={member.profile?.avatar_url} fallback={member.profile?.display_name ?? 'M'} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-content-primary">{member.profile?.display_name ?? 'Moderador'}</p>
                        <p className="truncate text-xs text-content-muted">@{member.profile?.twitch_login ?? 'viewer'} · permissões a definir</p>
                      </div>
                      <Button variant="ghost" size="sm" disabled={moderatorsLoading} onClick={() => handleRemoveModerator(member)} leftIcon={<UserMinus size={14} />}>
                        Remover
                      </Button>
                    </div>
                  ))}
                </div>
              )}
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
              <div className={cn('rounded-xl border p-4 flex gap-3', chatConnected ? 'border-green-500/25 bg-green-500/10' : 'border-brand-purple/20 bg-brand-purple/10')}>
                <CheckCircle size={18} className={cn('shrink-0 mt-0.5', chatConnected ? 'text-green-400' : 'text-brand-purple')} />
                <div>
                  <p className="text-sm font-medium text-content-primary mb-1">
                    {chatConnected ? 'Mensagens conectadas' : 'Conecte o chat da Twitch'}
                  </p>
                  <p className="text-xs text-content-secondary">
                    {chatConnected
                      ? 'O WatchQueue está autorizado a enviar as mensagens configuradas no chat do seu canal.'
                      : 'Autorize separadamente o envio de mensagens. Viewers continuam usando apenas o login básico.'}
                  </p>
                  {!chatStatusLoading && (chatConnected ? (
                    <Button className="mt-3" size="sm" variant="danger" loading={chatDisconnecting} onClick={handleDisconnectChat}>
                      Desconectar mensagens
                    </Button>
                  ) : (
                    <Button className="mt-3" size="sm" onClick={() => { window.location.href = getTwitchChatConnectUrl(streamerProfile.id) }}>
                      Autorizar mensagens no chat
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-content-primary">Mensagens automáticas</p>
                    <p className="text-xs text-content-muted">Use {'{viewer}'} para o usuário e {'{titulo}'} para o conteúdo. O nome do viewer é obrigatório.</p>
                  </div>
                  <Button size="sm" loading={templatesSaving} onClick={handleSaveChatTemplates} leftIcon={<Save size={14} />}>
                    Salvar mensagens
                  </Button>
                </div>
                {(Object.keys(CHAT_TEMPLATE_LABELS) as ChatEventType[]).map((eventType) => (
                  <div key={eventType} className="space-y-2 rounded-xl border border-border bg-bg-tertiary p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold text-content-primary">{CHAT_TEMPLATE_LABELS[eventType]}</p>
                      <span className="text-[11px] text-content-muted">Enviada no chat da Twitch</span>
                    </div>
                    <Textarea
                      aria-label={`Mensagem de ${CHAT_TEMPLATE_LABELS[eventType]}`}
                      value={chatTemplates[eventType]}
                      onChange={(event) => setChatTemplates((current) => ({ ...current, [eventType]: event.target.value }))}
                      rows={2}
                      maxLength={450}
                    />
                    <p className="text-[11px] text-content-muted">Prévia: {chatTemplates[eventType].split('{viewer}').join(profile?.display_name ?? 'Viewer').split('{titulo}').join('Nome do conteúdo').split('{categoria}').join('Reacts')}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Configurações */}
        {activeTab === 'settings' && (
          <Card className="overflow-hidden">
            <CardHeader>
              <div>
                <h2 className="font-semibold text-content-primary flex items-center gap-2">
                  <Settings size={16} className="text-brand-purple" />
                  Perfil público do canal
                </h2>
                <p className="mt-1 text-xs text-content-secondary">
                  Essas informações serão vistas pelos viewers na página do seu canal.
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-8">
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <Image size={16} className="text-brand-purple" />
                  <h3 className="text-sm font-semibold text-content-primary">Imagem de capa</h3>
                </div>
                <div className="overflow-hidden rounded-2xl border border-border bg-bg-tertiary">
                  <div className="aspect-[4/1] min-h-32 w-full">
                    {coverUrl ? (
                      <img src={coverUrl} alt="Prévia da capa" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full min-h-32 items-center justify-center bg-gradient-to-br from-brand-purple/20 to-bg-tertiary text-content-muted">
                        <Image size={28} />
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <label className="focus-ring inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-brand-purple/50 px-4 text-sm font-medium text-brand-purple transition-colors hover:bg-brand-purple/5">
                    <Upload size={15} />
                    {coverUploading ? 'Enviando...' : 'Enviar nova capa'}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      disabled={coverUploading}
                      onChange={(event) => handleCoverUpload(event.target.files?.[0])}
                    />
                  </label>
                  <p className="text-xs text-content-muted">JPG, PNG ou WebP · até 5 MB · proporção recomendada 4:1</p>
                </div>
              </section>

              <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-content-primary">Informações pessoais</h3>
                  <Input label="Nome do canal" value={channelName} onChange={(e) => setChannelName(e.target.value)} maxLength={80} />
                  <Textarea label="Sobre o canal" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={500} rows={5} placeholder="Conte aos viewers sobre você e suas lives..." />
                </div>

                <div className="space-y-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-content-primary">
                    <LinkIcon size={15} className="text-brand-purple" />
                    Redes e comunidade
                  </h3>
                  {['instagram', 'youtube', 'tiktok', 'discord'].map((network) => (
                    <Input
                      key={network}
                      label={network.charAt(0).toUpperCase() + network.slice(1)}
                      type="url"
                      placeholder={`https://${network}.com/...`}
                      value={socialLinks[network] ?? ''}
                      onChange={(e) => setSocialLinks((current) => ({ ...current, [network]: e.target.value }))}
                    />
                  ))}
                </div>
              </section>

              <div className="flex justify-end border-t border-border pt-5">
                <Button loading={settingsSaving} onClick={handleSaveSettings} leftIcon={<Save size={15} />}>
                  Salvar perfil público
                </Button>
              </div>
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

      <Modal isOpen={addContentOpen} onClose={() => setAddContentOpen(false)} title="Adicionar ideia para a comunidade" size="md">
        <form onSubmit={handleAddStreamerContent} className="space-y-4">
          <Input label="Título" required value={newContentTitle} onChange={(event) => setNewContentTitle(event.target.value)} placeholder="Ex: React do novo trailer" />
          <Select
            label="Categoria"
            value={newContentCategory}
            onChange={(event) => setNewContentCategory(event.target.value as SuggestionCategory)}
            options={[
              { value: 'movie', label: 'Filme' }, { value: 'series', label: 'Série' },
              { value: 'anime', label: 'Anime' }, { value: 'react', label: 'React / Vídeo' },
              { value: 'music', label: 'Música' }, { value: 'other', label: 'Outro' },
            ]}
          />
          <Input
            label={newContentCategory === 'music' ? 'Link do Spotify ou YouTube' : 'Link do conteúdo (opcional)'}
            type="url"
            required={newContentCategory === 'react' || newContentCategory === 'music'}
            value={newContentUrl}
            onChange={(event) => setNewContentUrl(event.target.value)}
            placeholder="https://..."
          />
          <Textarea label="Descrição (opcional)" value={newContentDescription} onChange={(event) => setNewContentDescription(event.target.value)} rows={3} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setAddContentOpen(false)}>Cancelar</Button>
            <Button type="submit" loading={newContentSaving}>Adicionar e anunciar</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
