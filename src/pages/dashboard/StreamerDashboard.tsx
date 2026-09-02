import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Send, Clock, ThumbsUp, Play, CheckCircle, XCircle,
  LayoutGrid, List, Settings, Users, Zap, ExternalLink,
  ChevronRight, AlertCircle, Trash2, Image, Save, Link as LinkIcon, Upload, UserPlus, UserMinus, ShieldBan, Crown, Palette
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/authStore'
import { supabase } from '@/lib/supabase'
import { useSuggestions } from '@/hooks/useSuggestions'
import { useContentThumbnail } from '@/hooks/useContentThumbnail'
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
import { streamerPath } from '@/lib/routes'

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
  onBan?: (suggestion: Suggestion) => void
  ownerId?: string
}

function SuggestionThumbnail({ suggestion }: { suggestion: Suggestion }) {
  const thumbnail = useContentThumbnail(suggestion.source_url, suggestion.poster_url)

  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-bg-secondary">
      {thumbnail ? (
        <img
          src={thumbnail}
          alt={`Thumbnail de ${suggestion.title}`}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <Image size={18} className="text-content-muted" />
      )}
    </div>
  )
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
  onBan,
  ownerId,
}: KanbanColumnProps) {
  return (
    <div className="bg-bg-tertiary/70 border border-border rounded-2xl w-full min-w-0 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className={cn('w-2 h-2 rounded-full', color)} />
          <span className="text-sm font-semibold text-content-primary">{title}</span>
        </div>
        <span className="text-xs text-content-muted bg-bg-secondary border border-border rounded-full px-2 py-0.5">
          {suggestions.length}
        </span>
      </div>

      <div className="max-h-[28rem] overflow-y-auto overscroll-contain scrollbar-thin">
        {suggestions.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-content-muted">
            Nenhuma sugestão
          </div>
        ) : (
          suggestions.map((s) => (
            <div
              key={s.id}
              className="group grid min-w-0 grid-cols-1 gap-2 border-b border-border/70 px-4 py-3 transition-colors last:border-b-0 hover:bg-bg-secondary/70 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-4"
            >
              <div className="flex min-w-0 items-center gap-3">
                <SuggestionThumbnail suggestion={s} />
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-content-primary" title={s.title}>
                    {s.title}
                  </p>
                  <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <Badge variant="category" category={s.category as never} size="sm" />
                    <span className="inline-flex items-center gap-1 text-xs text-content-muted">
                      <ThumbsUp size={10} />
                      {s.vote_count ?? 0}
                    </span>
                    <span className="truncate text-xs text-content-muted">
                      {s.submitter?.display_name ?? s.chat_display_name ?? 'Viewer da Twitch'} · {formatRelativeDate(s.submitted_at)}
                    </span>
                    {s.submission_source === 'chat' && <Badge variant="purple" size="sm">Via chat · prioridade normal</Badge>}
                  </div>
                </div>
              </div>

              {/* Ações por status */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 lg:shrink-0 lg:justify-end">
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
                {s.submitted_by && s.submitted_by !== ownerId && <button
                  onClick={() => onBan?.(s)}
                  className="inline-flex items-center gap-1 text-xs text-content-muted transition-colors hover:text-status-rejected"
                  aria-label={`Banir ${s.submitter?.display_name ?? 'usuário'}`}
                >
                  <ShieldBan size={11} />
                  Banir usuário
                </button>}
                <button
                  onClick={() => onDelete?.(s)}
                  className="inline-flex items-center gap-1 text-xs text-content-muted transition-colors hover:text-status-rejected"
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

function BanModal({ suggestion, isOpen, onClose, onBan }: {
  suggestion: Suggestion | null
  isOpen: boolean
  onClose: () => void
  onBan: (suggestion: Suggestion, reason: string) => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const submit = async () => {
    if (!suggestion || !reason.trim()) return
    setLoading(true)
    try {
      await onBan(suggestion, reason.trim())
      setReason('')
      onClose()
    } finally {
      setLoading(false)
    }
  }
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Banir usuário" size="sm">
      <div className="space-y-4">
        <div className="rounded-xl border border-status-rejected/20 bg-status-rejected/10 p-3 text-sm text-content-secondary">
          <strong className="text-content-primary">{suggestion?.submitter?.display_name}</strong> não poderá enviar sugestões nem votar neste canal.
        </div>
        <Textarea label="Motivo do banimento" required value={reason} onChange={(event) => setReason(event.target.value)} rows={3} placeholder="Descreva a violação das regras..." />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="danger" loading={loading} disabled={!reason.trim()} onClick={submit}>Confirmar banimento</Button>
        </div>
      </div>
    </Modal>
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
              por {suggestion.submitter?.display_name ?? suggestion.chat_display_name ?? 'Viewer da Twitch'}
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
type DashTab = 'kanban' | 'settings' | 'moderators' | 'twitch' | 'platform'
type ChatEventType = 'suggestion_received' | 'suggestion_approved' | 'queued' | 'watching_now' | 'completed' | 'rejected' | 'streamer_added'
type ModeratorMember = {
  id: string
  user_id: string
  role: string
  permissions: string[]
  profile?: { display_name: string; twitch_login: string; avatar_url: string | null }
}
type ModeratorCandidate = { id: string; display_name: string; twitch_login: string; avatar_url: string | null }
type PlatformViewer = ModeratorCandidate
type PlatformStreamer = { id: string; owner_id: string; channel_name: string; slug: string; avatar_url: string | null }
type BannedUser = { id: string; user_id: string; reason: string | null; created_at: string; profile?: ModeratorCandidate }

const DEFAULT_CHAT_TEMPLATES: Record<ChatEventType, string> = {
  suggestion_received: '🎬 {viewer} adicionou “{titulo}” à lista do canal! Envie sua sugestão também no WatchQueue.',
  suggestion_approved: '✅ A sugestão “{titulo}”, enviada por {viewer}, foi aprovada! Participe também pelo WatchQueue.',
  queued: '📋 “{titulo}”, ideia de {viewer}, entrou na fila do canal!',
  watching_now: '🍿 Agora estamos assistindo “{titulo}”, sugestão de {viewer}! Qual deveria ser a próxima?',
  completed: '🎉 Terminamos “{titulo}”, sugestão de {viewer}! Obrigado por participar da comunidade.',
  rejected: 'ℹ️ A ideia “{titulo}”, enviada por {viewer}, não foi aprovada desta vez.',
  streamer_added: '📌 {viewer} adicionou “{titulo}” em {categoria}. Vote na sua ideia favorita pelo WatchQueue!',
}

const CHAT_TEMPLATE_LABELS: Record<ChatEventType, string> = {
  suggestion_received: 'Nova sugestão',
  suggestion_approved: 'Aprovação',
  queued: 'Adicionado à fila',
  watching_now: 'Assistindo agora',
  completed: 'Concluído',
  rejected: 'Rejeitado',
  streamer_added: 'Conteúdo adicionado pelo streamer',
}

const PROFILE_THEME_OPTIONS = [
  { id: 'neon', name: 'Neon', description: 'Roxo vibrante e tecnológico', preview: 'from-violet-600 via-purple-900 to-slate-950' },
  { id: 'aurora', name: 'Aurora', description: 'Verde, turquesa e luminoso', preview: 'from-teal-400 via-cyan-900 to-slate-950' },
  { id: 'sunset', name: 'Sunset', description: 'Laranja, rosa e acolhedor', preview: 'from-orange-400 via-rose-800 to-slate-950' },
  { id: 'midnight', name: 'Midnight', description: 'Azul profundo e minimalista', preview: 'from-blue-600 via-slate-800 to-slate-950' },
] as const

export default function StreamerDashboard() {
  const { streamerProfile, profile, refreshProfile } = useAuthStore()
  const [activeTab, setActiveTab] = useState<DashTab>('kanban')
  const [rejectTarget, setRejectTarget] = useState<Suggestion | null>(null)
  const [channelName, setChannelName] = useState(streamerProfile?.channel_name ?? '')
  const [bio, setBio] = useState(streamerProfile?.bio ?? '')
  const [coverUrl, setCoverUrl] = useState(streamerProfile?.cover_url ?? '')
  const [profileTheme, setProfileTheme] = useState<'neon' | 'aurora' | 'sunset' | 'midnight'>(streamerProfile?.profile_theme ?? 'neon')
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>(
    streamerProfile?.social_links ?? { instagram: '', youtube: '', tiktok: '', discord: '' }
  )
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [coverUploading, setCoverUploading] = useState(false)
  const [socialSavingNetwork, setSocialSavingNetwork] = useState<string | null>(null)
  const [chatConnected, setChatConnected] = useState(false)
  const [chatStatusLoading, setChatStatusLoading] = useState(true)
  const [chatDisconnecting, setChatDisconnecting] = useState(false)
  const [chatCommand, setChatCommand] = useState('!sugerir')
  const [chatCommandEnabled, setChatCommandEnabled] = useState(true)
  const [chatCommandSaving, setChatCommandSaving] = useState(false)
  const [chatTemplates, setChatTemplates] = useState<Record<ChatEventType, string>>(DEFAULT_CHAT_TEMPLATES)
  const [templatesSaving, setTemplatesSaving] = useState(false)
  const [moderators, setModerators] = useState<ModeratorMember[]>([])
  const [selectedModeratorId, setSelectedModeratorId] = useState('')
  const [moderatorsLoading, setModeratorsLoading] = useState(false)
  const [moderatorCandidates, setModeratorCandidates] = useState<ModeratorCandidate[]>([])
  const [addContentOpen, setAddContentOpen] = useState(false)
  const [banTarget, setBanTarget] = useState<Suggestion | null>(null)
  const [bannedUsers, setBannedUsers] = useState<BannedUser[]>([])
  const [newContentTitle, setNewContentTitle] = useState('')
  const [newContentCategory, setNewContentCategory] = useState<SuggestionCategory>('react')
  const [newContentUrl, setNewContentUrl] = useState('')
  const [newContentDescription, setNewContentDescription] = useState('')
  const [newContentSaving, setNewContentSaving] = useState(false)
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  const [platformViewers, setPlatformViewers] = useState<PlatformViewer[]>([])
  const [platformStreamers, setPlatformStreamers] = useState<PlatformStreamer[]>([])
  const [promotingViewerId, setPromotingViewerId] = useState<string | null>(null)

  const {
    suggestions, watching, queued, pending, approved,
    completed, rejected, isLoading, updateStatus, remove
  } = useSuggestions(streamerProfile?.id)

  useEffect(() => {
    if (!streamerProfile?.id) return
    let active = true
    const loadChatStatus = async () => {
      setChatStatusLoading(true)
      const [{ data }, { data: chatSettings }] = await Promise.all([
        supabase.from('twitch_connections').select('token_status, scopes').eq('streamer_id', streamerProfile.id).maybeSingle(),
        supabase.from('streamer_settings').select('chat_command, chat_command_enabled').eq('streamer_id', streamerProfile.id).maybeSingle(),
      ])
      if (active) {
        const requiredChatScopes = ['user:read:chat', 'user:write:chat', 'user:bot', 'channel:bot']
        setChatConnected(data?.token_status === 'active' && requiredChatScopes.every((scope) => (data.scopes ?? []).includes(scope)))
        if (chatSettings?.chat_command) setChatCommand(chatSettings.chat_command)
        if (typeof chatSettings?.chat_command_enabled === 'boolean') setChatCommandEnabled(chatSettings.chat_command_enabled)
        setChatStatusLoading(false)
      }
    }
    loadChatStatus()

    const params = new URLSearchParams(window.location.search)
    if (params.get('chat') === 'connected') {
      setActiveTab('twitch')
      toast.success('Comandos e mensagens da Twitch conectados.')
      window.history.replaceState({}, '', window.location.pathname)
    }
    return () => { active = false }
  }, [streamerProfile?.id])

  const loadModeratorData = async () => {
    if (!streamerProfile?.id) return
    const [membersResult, profilesResult, bansResult, streamersResult] = await Promise.all([
      supabase
        .from('streamer_members')
        .select('id, user_id, role, permissions, profile:profiles!user_id(display_name, twitch_login, avatar_url)')
        .eq('streamer_id', streamerProfile.id)
        .eq('role', 'moderator'),
      supabase.from('profiles').select('id, display_name, twitch_login, avatar_url').order('display_name'),
      supabase
        .from('banned_users')
        .select('id, user_id, reason, created_at, profile:profiles!user_id(id, display_name, twitch_login, avatar_url)')
        .eq('streamer_id', streamerProfile.id)
        .order('created_at', { ascending: false }),
      supabase.from('streamers').select('owner_id'),
    ])
    const nextModerators = (membersResult.data ?? []) as unknown as ModeratorMember[]
    const nextBans = (bansResult.data ?? []) as unknown as BannedUser[]
    const streamerOwnerIds = new Set((streamersResult.data ?? []).map((row) => row.owner_id))
    setModerators(nextModerators)

    const candidateMap = new Map<string, ModeratorCandidate>()
    ;(profilesResult.data ?? []).forEach((row) => {
      const viewer = row as ModeratorCandidate
      if (
        viewer.id !== streamerProfile.owner_id &&
        !streamerOwnerIds.has(viewer.id) &&
        !nextBans.some((banned) => banned.user_id === viewer.id) &&
        !nextModerators.some((member) => member.user_id === viewer.id)
      ) candidateMap.set(viewer.id, viewer)
    })
    setModeratorCandidates(Array.from(candidateMap.values()))
    setBannedUsers(nextBans)
  }

  useEffect(() => {
    loadModeratorData()
    // streamerProfile is the stable ownership boundary for this list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamerProfile?.id])

  const loadPlatformViewers = async () => {
    const [profilesResult, streamersResult] = await Promise.all([
      supabase.from('profiles').select('id, display_name, twitch_login, avatar_url').order('display_name'),
      supabase.from('streamers').select('id, owner_id, channel_name, slug, avatar_url').order('channel_name'),
    ])
    const streamerOwnerIds = new Set((streamersResult.data ?? []).map((row) => row.owner_id))
    setPlatformStreamers((streamersResult.data ?? []) as PlatformStreamer[])
    setPlatformViewers(((profilesResult.data ?? []) as PlatformViewer[]).filter((viewer) => !streamerOwnerIds.has(viewer.id)))
  }

  useEffect(() => {
    if (!profile?.id) return
    const loadPlatformAccess = async () => {
      const { data } = await supabase.from('platform_admins').select('user_id').eq('user_id', profile.id).maybeSingle()
      const allowed = !!data
      setIsPlatformAdmin(allowed)
      if (allowed) await loadPlatformViewers()
    }
    loadPlatformAccess()
  }, [profile?.id])

  const handlePromoteViewer = async (viewer: PlatformViewer) => {
    setPromotingViewerId(viewer.id)
    try {
      const { error } = await supabase.rpc('promote_viewer_to_streamer', { p_user_id: viewer.id })
      if (error) throw error
      await loadPlatformViewers()
      toast.success(`${viewer.display_name} agora é streamer.`)
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível promover este viewer.')
    } finally {
      setPromotingViewerId(null)
    }
  }

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
      await supabase.auth.refreshSession()
      const { error } = await supabase.functions.invoke('twitch-auth', {
        body: { action: 'disconnect_chat', streamer_id: streamerProfile.id },
      })
      if (error) throw error
      setChatConnected(false)
      toast.success('Integração com o chat desconectada.')
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

  const handleSaveChatCommand = async () => {
    if (!streamerProfile) return
    const normalized = `!${chatCommand.trim().replace(/^!+/, '').toLowerCase()}`
    if (!/^![a-z0-9][a-z0-9_-]{1,30}$/.test(normalized)) {
      toast.error('Use um comando como !sugerir, com 2 a 31 letras, números, _ ou -.')
      return
    }
    setChatCommandSaving(true)
    try {
      const { error } = await supabase.from('streamer_settings').update({
        chat_command: normalized,
        chat_command_enabled: chatCommandEnabled,
      }).eq('streamer_id', streamerProfile.id)
      if (error) throw error
      setChatCommand(normalized)
      toast.success('Comando do chat salvo.')
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível salvar o comando do chat.')
    } finally {
      setChatCommandSaving(false)
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

  const handleBanUser = async (suggestion: Suggestion, reason: string) => {
    if (!streamerProfile || !profile || suggestion.submitted_by === streamerProfile.owner_id) return
    const { error } = await supabase.from('banned_users').upsert({
      streamer_id: streamerProfile.id,
      user_id: suggestion.submitted_by,
      banned_by: profile.id,
      reason,
    } as never, { onConflict: 'streamer_id,user_id' })
    if (error) {
      toast.error('Não foi possível banir o usuário.')
      throw error
    }
    await supabase
      .from('streamer_members')
      .delete()
      .eq('streamer_id', streamerProfile.id)
      .eq('user_id', suggestion.submitted_by)
      .eq('role', 'moderator')
    await supabase
      .from('suggestions')
      .update({ status: 'rejected', rejection_reason: `Usuário banido: ${reason}` } as never)
      .eq('streamer_id', streamerProfile.id)
      .eq('submitted_by', suggestion.submitted_by)
      .eq('status', 'pending')
    await loadModeratorData()
    toast.success('Usuário banido deste canal.')
  }

  const handleUnbanUser = async (banned: BannedUser) => {
    const { error } = await supabase.from('banned_users').delete().eq('id', banned.id)
    if (error) return toast.error('Não foi possível desbloquear o usuário.')
    setBannedUsers((current) => current.filter((item) => item.id !== banned.id))
    toast.success('Usuário desbloqueado.')
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
      let posterUrl: string | null = null
      if (newContentUrl.trim()) {
        const { data: metadata } = await supabase.functions.invoke('content-metadata', {
          body: { url: newContentUrl.trim() },
        })
        posterUrl = metadata?.thumbnail_url ?? null
      }
      const { data: created, error } = await supabase.from('suggestions').insert({
        streamer_id: streamerProfile.id,
        submitted_by: profile.id,
        category: newContentCategory,
        title: newContentTitle.trim(),
        description: newContentDescription.trim() || null,
        source_url: newContentUrl.trim() || null,
        poster_url: posterUrl,
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
      const successMessage: Partial<Record<SuggestionStatus, string>> = {
        approved: 'Sugestão aprovada!',
        queued: 'Sugestão adicionada à fila!',
        watching: 'Status “Assistindo agora” ativado!',
        completed: 'Sugestão concluída!',
      }
      toast.success(successMessage[status] ?? 'Sugestão atualizada!')
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
          profile_theme: profileTheme,
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

  const handleSaveSocialLink = async (network: string, rawValue: string) => {
    if (!streamerProfile) return
    const trimmed = rawValue.trim()
    const normalized = trimmed && !/^https?:\/\//i.test(trimmed) ? `https://${trimmed}` : trimmed
    const nextLinks = { ...socialLinks, [network]: normalized }
    setSocialLinks(nextLinks)
    setSocialSavingNetwork(network)
    try {
      const { error } = await supabase
        .from('streamers')
        .update({ social_links: nextLinks } as never)
        .eq('id', streamerProfile.id)
      if (error) throw error
      await refreshProfile()
      toast.success(`${network.charAt(0).toUpperCase() + network.slice(1)} atualizado no perfil.`)
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível atualizar essa rede social.')
    } finally {
      setSocialSavingNetwork(null)
    }
  }

  const handleCoverUpload = async (file?: File) => {
    if (!file || !streamerProfile) return
    if (file.size > 1024 * 1024) {
      toast.error('A imagem deve ter no máximo 1 MB.')
      return
    }

    setCoverUploading(true)
    try {
      const header = new Uint8Array(await file.slice(0, 12).arrayBuffer())
      const isPng = header.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => header[index] === byte)
      const isJpeg = header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff
      const isWebp = header.length >= 12
        && String.fromCharCode(...header.slice(0, 4)) === 'RIFF'
        && String.fromCharCode(...header.slice(8, 12)) === 'WEBP'
      const format = isPng
        ? { extension: 'png', contentType: 'image/png' }
        : isJpeg
          ? { extension: 'jpg', contentType: 'image/jpeg' }
          : isWebp
            ? { extension: 'webp', contentType: 'image/webp' }
            : null
      if (!format) {
        toast.error('O arquivo não é uma imagem PNG, JPG, JPEG ou WebP válida.')
        return
      }

      const extension = format.extension
      const path = `${streamerProfile.id}/cover.${extension}`
      const { error } = await supabase.storage
        .from('streamer-assets')
        .upload(path, file, { upsert: true, contentType: format.contentType })
      if (error) throw error

      const { data } = supabase.storage.from('streamer-assets').getPublicUrl(path)
      const publicUrl = `${data.publicUrl}?v=${Date.now()}`
      const { error: profileError } = await supabase
        .from('streamers')
        .update({ cover_url: publicUrl } as never)
        .eq('id', streamerProfile.id)
      if (profileError) throw profileError
      setCoverUrl(publicUrl)
      await refreshProfile()
      toast.success('Capa enviada e publicada no perfil.')
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível enviar a imagem de capa.', {
        description: error instanceof Error ? error.message : 'Tente novamente em alguns instantes.',
      })
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
    { id: 'kanban', label: 'Lista de Sugestões', icon: LayoutGrid },
    { id: 'moderators', label: 'Moderadores', icon: Users },
    { id: 'twitch', label: 'Twitch', icon: Zap },
    { id: 'settings', label: 'Configurações', icon: Settings },
    ...(isPlatformAdmin ? [{ id: 'platform' as DashTab, label: 'Plataforma', icon: Crown }] : []),
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
                to={streamerPath(streamerProfile.slug)}
                className="text-xs text-brand-purple hover:underline flex items-center gap-1"
              >
                {window.location.host}/{streamerProfile.slug}
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
            <div className="grid grid-cols-1 gap-4">
              <KanbanColumn
                title="Pendente"
                status="pending"
                suggestions={pending}
                color="bg-status-pending"
                onAction={handleAction}
                onReject={setRejectTarget}
                onDelete={handleDelete}
                onBan={setBanTarget}
                ownerId={streamerProfile.owner_id}
              />
              <KanbanColumn
                title="Aprovado"
                status="approved"
                suggestions={approved}
                color="bg-status-approved"
                onAction={handleAction}
                onReject={setRejectTarget}
                onDelete={handleDelete}
                onBan={setBanTarget}
                ownerId={streamerProfile.owner_id}
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
                onBan={setBanTarget}
                ownerId={streamerProfile.owner_id}
              />
              <KanbanColumn
                title="Assistindo"
                status="watching"
                suggestions={watching ? [watching] : []}
                color="bg-status-watching"
                onAction={handleAction}
                onReject={setRejectTarget}
                onDelete={handleDelete}
                onBan={setBanTarget}
                ownerId={streamerProfile.owner_id}
              />
              <KanbanColumn
                title="Concluído"
                status="completed"
                suggestions={completed.slice(0, 10)}
                color="bg-status-completed"
                onAction={handleAction}
                onReject={setRejectTarget}
                onDelete={handleDelete}
                onBan={setBanTarget}
                ownerId={streamerProfile.owner_id}
              />
              <KanbanColumn
                title="Rejeitado"
                status="rejected"
                suggestions={rejected.slice(0, 5)}
                color="bg-status-rejected"
                onAction={handleAction}
                onReject={setRejectTarget}
                onDelete={handleDelete}
                onBan={setBanTarget}
                ownerId={streamerProfile.owner_id}
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

              <div className="border-t border-border pt-5">
                <div className="mb-3 flex items-center gap-2">
                  <ShieldBan size={16} className="text-status-rejected" />
                  <div>
                    <p className="text-sm font-semibold text-content-primary">Usuários banidos</p>
                    <p className="text-xs text-content-muted">Não podem enviar sugestões nem votar neste canal.</p>
                  </div>
                </div>
                {bannedUsers.length === 0 ? (
                  <p className="rounded-xl border border-border bg-bg-tertiary p-4 text-xs text-content-muted">Nenhum usuário banido.</p>
                ) : (
                  <div className="space-y-2">
                    {bannedUsers.map((banned) => (
                      <div key={banned.id} className="flex items-center gap-3 rounded-xl border border-status-rejected/20 bg-status-rejected/5 p-3">
                        <Avatar src={banned.profile?.avatar_url} fallback={banned.profile?.display_name ?? 'B'} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-content-primary">{banned.profile?.display_name ?? 'Usuário'}</p>
                          <p className="truncate text-xs text-content-muted">{banned.reason || 'Sem motivo informado'}</p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => handleUnbanUser(banned)}>Desbloquear</Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
                    {chatConnected ? 'Chat conectado' : 'Conecte o chat da Twitch'}
                  </p>
                  <p className="text-xs text-content-secondary">
                    {chatConnected
                      ? 'O WatchQueue pode receber comandos e enviar respostas no chat do seu canal.'
                      : 'Autorize a leitura de comandos e o envio das respostas. Viewers continuam usando apenas o login básico.'}
                  </p>
                  {!chatStatusLoading && (chatConnected ? (
                    <Button className="mt-3" size="sm" variant="danger" loading={chatDisconnecting} onClick={handleDisconnectChat}>
                      Desconectar chat
                    </Button>
                  ) : (
                    <Button className="mt-3" size="sm" onClick={() => { window.location.href = getTwitchChatConnectUrl(streamerProfile.id) }}>
                      Autorizar comandos no chat
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-brand-purple/20 bg-brand-purple/5 p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-content-primary">Comando para receber sugestões</p>
                    <p className="text-xs text-content-muted">Exemplo no chat: {chatCommand || '!sugerir'} Nome do conteúdo</p>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs text-content-secondary">
                    <input
                      type="checkbox"
                      checked={chatCommandEnabled}
                      onChange={(event) => setChatCommandEnabled(event.target.checked)}
                      className="h-4 w-4 accent-brand-purple"
                    />
                    Comando ativo
                  </label>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <Input
                      label="Comando"
                      value={chatCommand}
                      onChange={(event) => setChatCommand(event.target.value)}
                      onBlur={() => setChatCommand((current) => `!${current.trim().replace(/^!+/, '').toLowerCase()}`)}
                      placeholder="!sugerir"
                      maxLength={32}
                    />
                  </div>
                  <Button size="sm" loading={chatCommandSaving} onClick={handleSaveChatCommand} leftIcon={<Save size={14} />}>
                    Salvar comando
                  </Button>
                </div>
                <p className="text-[11px] text-content-muted">
                  O comando sempre começa com !. Sugestões de usuários cadastrados na plataforma aparecem primeiro para revisão.
                </p>
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

        {/* Administração da plataforma */}
        {activeTab === 'platform' && isPlatformAdmin && (
          <Card>
            <CardHeader>
              <div>
                <h2 className="flex items-center gap-2 font-semibold text-content-primary">
                  <Crown size={17} className="text-amber-400" />
                  Streamers da plataforma
                </h2>
                <p className="mt-1 text-xs text-content-secondary">
                  Somente o proprietário da plataforma pode transformar um viewer em streamer.
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <section className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-content-primary">Streamers ativos</h3>
                  <p className="text-xs text-content-muted">Cada canal possui um endereço público próprio para compartilhar.</p>
                </div>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {platformStreamers.map((channel) => (
                    <div key={channel.id} className="flex items-center gap-3 rounded-xl border border-border bg-bg-tertiary/60 p-3">
                      <Avatar src={channel.avatar_url} alt={channel.channel_name} fallback={channel.channel_name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-content-primary">{channel.channel_name}</p>
                        <p className="truncate text-xs text-content-muted">{window.location.host}/{channel.slug}</p>
                      </div>
                      <Link
                        to={streamerPath(channel.slug)}
                        target="_blank"
                        aria-label={`Abrir perfil de ${channel.channel_name}`}
                        className="rounded-lg p-2 text-brand-purple hover:bg-brand-purple/10"
                      >
                        <ExternalLink size={15} />
                      </Link>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-content-primary">Viewers disponíveis</h3>
                  <p className="text-xs text-content-muted">Ao promover, o link público do novo canal é criado automaticamente.</p>
                </div>
              {platformViewers.length === 0 ? (
                <EmptyState
                  icon={<Users size={22} />}
                  title="Nenhum viewer disponível"
                  description="Todos os usuários cadastrados já possuem um canal de streamer."
                />
              ) : (
                <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
                  {platformViewers.map((viewer) => (
                    <div key={viewer.id} className="flex flex-col gap-3 bg-bg-tertiary/60 p-4 sm:flex-row sm:items-center">
                      <Avatar src={viewer.avatar_url} alt={viewer.display_name} fallback={viewer.display_name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-content-primary">{viewer.display_name}</p>
                        <p className="truncate text-xs text-content-muted">@{viewer.twitch_login} · Viewer</p>
                      </div>
                      <Button
                        size="sm"
                        loading={promotingViewerId === viewer.id}
                        disabled={promotingViewerId !== null}
                        onClick={() => handlePromoteViewer(viewer)}
                        leftIcon={<Crown size={14} />}
                      >
                        Tornar streamer
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              </section>
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
                  <Palette size={16} className="text-brand-purple" />
                  <div>
                    <h3 className="text-sm font-semibold text-content-primary">Tema do perfil</h3>
                    <p className="text-xs text-content-muted">Escolha a identidade visual da sua página pública.</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {PROFILE_THEME_OPTIONS.map((theme) => (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => setProfileTheme(theme.id)}
                      className={cn(
                        'overflow-hidden rounded-2xl border text-left transition-all',
                        profileTheme === theme.id
                          ? 'border-brand-purple ring-2 ring-brand-purple/25'
                          : 'border-border hover:border-border-light'
                      )}
                    >
                      <div className={cn('h-20 bg-gradient-to-br', theme.preview)}>
                        <div className="flex h-full items-end gap-2 p-3">
                          <div className="h-8 w-8 rounded-full border-2 border-white/50 bg-black/30" />
                          <div className="mb-1 h-2 w-16 rounded-full bg-white/70" />
                        </div>
                      </div>
                      <div className="bg-bg-tertiary p-3">
                        <p className="text-xs font-semibold text-content-primary">{theme.name}</p>
                        <p className="mt-0.5 text-[10px] text-content-muted">{theme.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>

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
                      accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                      className="sr-only"
                      disabled={coverUploading}
                      onChange={(event) => handleCoverUpload(event.target.files?.[0])}
                    />
                  </label>
                  <p className="text-xs text-content-muted">1920 × 480 px (4:1) · PNG, JPG, JPEG ou WebP · máximo 1 MB</p>
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
                      onBlur={(e) => handleSaveSocialLink(network, e.target.value)}
                      disabled={socialSavingNetwork === network}
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

      <BanModal
        suggestion={banTarget}
        isOpen={!!banTarget}
        onClose={() => setBanTarget(null)}
        onBan={handleBanUser}
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
