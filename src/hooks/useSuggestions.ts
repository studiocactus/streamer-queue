import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type { Suggestion, SuggestionStatus, SuggestionCategory } from '@/types'
import { useAuthStore } from '@/store/authStore'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = any

function suggestionUpdateError(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
  if (code === '42501') return 'Sua conta não tem permissão para alterar esta sugestão.'
  if (code === '23514') return 'Esta alteração de status não é válida para a sugestão.'
  return 'Não foi possível atualizar a sugestão agora. Tente novamente.'
}

/**
 * Busca TODAS as sugestões de um canal (sem filtros server-side).
 * A filtragem por categoria/status é feita no componente para evitar
 * loops infinitos causados por objetos `filters` recriados a cada render.
 */
export function useSuggestions(streamerId: string | undefined) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user, profile } = useAuthStore()
  const contextKey = `${streamerId ?? ''}:${user?.id ?? ''}`
  const activeContext = useRef(contextKey)
  activeContext.current = contextKey
  const loadedContext = useRef<string | null>(null)
  const requestVersion = useRef(0)

  const fetchSuggestions = useCallback(async () => {
    const version = ++requestVersion.current
    const isCurrent = () => activeContext.current === contextKey && requestVersion.current === version
    if (!streamerId) {
      setIsLoading(false)
      setSuggestions([])
      return
    }
    const initialLoad = loadedContext.current !== contextKey
    if (initialLoad) {
      setIsLoading(true)
      setSuggestions([])
    }
    setError(null)

    try {
      const { data, error: fetchError } = await supabase
        .from('suggestions')
        .select(`
          *,
          submitter:profiles!submitted_by(id, display_name, avatar_url, twitch_login),
          votes(id, user_id)
        `)
        .eq('streamer_id', streamerId)
        .order('submitted_at', { ascending: false })

      if (fetchError) throw fetchError

      const raw: AnyRecord[] = data ?? []
      const enhanced: Suggestion[] = raw.map((s) => ({
        ...s,
        vote_count: Array.isArray(s.votes) ? s.votes.length : 0,
        user_voted: user
          ? Array.isArray(s.votes) && s.votes.some((v: AnyRecord) => v.user_id === user.id)
          : false,
      }))

      if (!isCurrent()) return
      loadedContext.current = contextKey
      setSuggestions(enhanced)
    } catch (err) {
      if (isCurrent() && initialLoad) setError('Erro ao carregar sugestões')
      console.error(err)
    } finally {
      if (isCurrent()) setIsLoading(false)
    }
  }, [streamerId, user?.id, contextKey]) // SEM dependência de objeto filters

  useEffect(() => {
    fetchSuggestions()
  }, [fetchSuggestions])

  // Mantém ref estável para o Realtime subscription não criar loop
  const fetchRef = useRef(fetchSuggestions)
  useEffect(() => {
    fetchRef.current = fetchSuggestions
  }, [fetchSuggestions])

  useEffect(() => {
    const refreshVisible = () => {
      if (document.visibilityState === 'visible') void fetchRef.current()
    }
    document.addEventListener('visibilitychange', refreshVisible)
    window.addEventListener('online', refreshVisible)
    const interval = window.setInterval(refreshVisible, 60000)
    return () => {
      document.removeEventListener('visibilitychange', refreshVisible)
      window.removeEventListener('online', refreshVisible)
      window.clearInterval(interval)
      requestVersion.current++
    }
  }, [streamerId, user?.id])

  useEffect(() => {
    const handleSuggestionChange = (event: Event) => {
      const detail = (event as CustomEvent<{ streamerId?: string }>).detail
      if (detail?.streamerId === streamerId) fetchRef.current()
    }
    window.addEventListener('watchqueue:suggestions-changed', handleSuggestionChange)
    return () => window.removeEventListener('watchqueue:suggestions-changed', handleSuggestionChange)
  }, [streamerId])

  // Realtime — nome único para nunca reutilizar canal já subscrito
  useEffect(() => {
    if (!streamerId) return

    // Prefixo aleatório evita o erro "cannot add callbacks after subscribe()"
    const channelName = `suggestions-${streamerId}-${Math.random().toString(36).slice(2)}`
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'suggestions',
        filter: `streamer_id=eq.${streamerId}`,
      }, () => { fetchRef.current() })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'votes',
        filter: `streamer_id=eq.${streamerId}`,
      }, () => { fetchRef.current() })
      .subscribe((status) => { if (status === 'SUBSCRIBED') void fetchRef.current() })

    return () => {
      channel.unsubscribe()
      supabase.removeChannel(channel)
    }
  }, [streamerId])

  const vote = useCallback(
    async (suggestionId: string, currentlyVoted: boolean) => {
      if (!user) {
        toast.error('Você precisa estar logado para votar')
        return
      }

      try {
        if (currentlyVoted) {
          await supabase
            .from('votes')
            .delete()
            .eq('suggestion_id', suggestionId)
            .eq('user_id', user.id)
        } else {
          const { error: voteError } = await supabase.from('votes').insert({
            suggestion_id: suggestionId,
            streamer_id: streamerId!,
            user_id: user.id,
          } as AnyRecord)
          if (voteError) throw voteError
        }

        // Atualização otimista
        setSuggestions((prev) =>
          prev.map((s) =>
            s.id === suggestionId
              ? {
                  ...s,
                  vote_count: (s.vote_count ?? 0) + (currentlyVoted ? -1 : 1),
                  user_voted: !currentlyVoted,
                }
              : s
          )
        )
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : ''
        if (msg.includes('duplicate') || msg.includes('unique')) {
          toast.error('Você já votou nesta sugestão')
        } else {
          toast.error('Erro ao registrar voto')
        }
        console.error(err)
      }
    },
    [user, streamerId]
  )

  const submit = useCallback(
    async (data: {
      title: string
      category: SuggestionCategory
      description?: string
      release_year?: number
      source_url?: string
    }) => {
      if (!user) { toast.error('Você precisa estar logado para sugerir'); return false }
      if (!streamerId) return false

      try {
        const { data: metadata } = await supabase.functions.invoke('content-metadata', {
          body: data.source_url
            ? { url: data.source_url }
            : { title: data.title, category: data.category, release_year: data.release_year },
        })
        const posterUrl: string | null = metadata?.thumbnail_url ?? null

        const { data: created, error: insertError } = await supabase.from('suggestions').insert({
          streamer_id: streamerId,
          submitted_by: user.id,
          category: data.category,
          title: data.title.trim(),
          description: data.description?.trim() ?? null,
          release_year: data.release_year ?? null,
          source_url: data.source_url?.trim() || null,
          poster_url: posterUrl,
          status: 'pending',
        } as AnyRecord).select('id').single()

        if (insertError?.message?.includes('SUGGESTION_ALREADY_ACTIVE')) {
          toast.info('Você já enviou essa sugestão.', { description: 'Ela continua na lista deste canal. Não precisa enviar novamente.' })
          return false
        }
        if (insertError) throw insertError

        // Confirma o processamento no backend para não perder o envio ao fechar o modal.
        const { data: chatResult, error: chatError } = await supabase.functions.invoke('twitch-chat', {
          body: {
            streamer_id: streamerId,
            suggestion_id: created?.id,
            event_type: 'suggestion_received',
            viewer_name: profile?.display_name ?? 'Viewer',
            title: data.title.trim(),
          },
        })
        if (chatError || !['sent', 'pending', 'processing', 'skipped'].includes(chatResult?.status)) {
          console.error('Erro ao notificar chat:', chatError ?? chatResult)
          toast.warning('Sugestão salva. A mensagem para a Twitch ficou na fila.', {
            description: 'O WatchQueue tentará enviar novamente automaticamente.',
          })
        }

        toast.success('Sugestão enviada!', {
          description: `"${data.title}" foi enviada ao streamer.`,
        })
        fetchSuggestions()
        return true
      } catch (err) {
        toast.error('Erro ao enviar sugestão')
        console.error(err)
        return false
      }
    },
    [user, profile?.display_name, streamerId, fetchSuggestions]
  )

  const updateStatus = useCallback(
    async (
      suggestionId: string,
      status: SuggestionStatus,
      extra?: { rejection_reason?: string; queue_position?: number }
    ) => {
      const now = new Date().toISOString()
      const updates: AnyRecord = { status }

      if (status === 'approved') updates.approved_at = now
      if (status === 'watching') updates.started_at = now
      if (status === 'completed') updates.completed_at = now
      if (status === 'rejected' && extra?.rejection_reason) {
        updates.rejection_reason = extra.rejection_reason
      }
      if (extra?.queue_position != null) updates.queue_position = extra.queue_position

      const { error: updateError } = await supabase
        .from('suggestions')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(updates as any)
        .eq('id', suggestionId)

      if (updateError) {
        toast.error(suggestionUpdateError(updateError))
        throw updateError
      }

      // Reflect the transition immediately. Twitch delivery continues in the
      // background and must not make queue controls feel blocked.
      setSuggestions((current) => current.map((item) => (
        item.id === suggestionId ? { ...item, ...updates } : item
      )))
      void fetchSuggestions()

      const eventType = status === 'approved'
        ? 'suggestion_approved'
        : status === 'queued'
          ? 'queued'
        : status === 'watching'
          ? 'watching_now'
          : status === 'completed'
            ? 'completed'
            : status === 'rejected'
              ? 'rejected'
            : null
      const currentSuggestion = suggestions.find((item) => item.id === suggestionId)
      if (eventType && currentSuggestion?.status !== status) {
        void (async () => {
          let chatDelivered = false
          let lastChatError: unknown = null
          for (let attempt = 0; attempt < 2 && !chatDelivered; attempt++) {
            try {
              const { data: chatResult, error: chatError } = await supabase.functions.invoke('twitch-chat', {
                body: {
                  streamer_id: streamerId,
                  suggestion_id: suggestionId,
                  event_type: eventType,
                  viewer_name: currentSuggestion?.submitter?.display_name ?? currentSuggestion?.chat_display_name ?? 'Viewer',
                  title: currentSuggestion?.title ?? '',
                },
              })
              lastChatError = chatError ?? chatResult
              chatDelivered = !chatError && ['sent', 'pending', 'processing', 'skipped'].includes(chatResult?.status)
            } catch (error) {
              lastChatError = error
            }
          }
          if (!chatDelivered) {
            console.error('Erro ao notificar chat:', lastChatError)
            toast.warning('Status atualizado. A mensagem para a Twitch ficou na fila.', {
              description: 'O WatchQueue tentará enviar novamente automaticamente.',
            })
          }
        })()
      }
    },
    [fetchSuggestions, streamerId, suggestions]
  )

  const toggleFavorite = useCallback(
    async (suggestionId: string, isFavorite: boolean) => {
      const { error: updateError } = await supabase
        .from('suggestions')
        .update({ is_favorite: isFavorite } as AnyRecord)
        .eq('id', suggestionId)

      if (updateError) {
        toast.error('Erro ao atualizar favorito')
        throw updateError
      }

      setSuggestions((current) => current.map((item) => (
        item.id === suggestionId ? { ...item, is_favorite: isFavorite } : item
      )))
    },
    []
  )

  const remove = useCallback(
    async (suggestionId: string) => {
      const { error: deleteError } = await supabase
        .from('suggestions')
        .delete()
        .eq('id', suggestionId)

      if (deleteError) {
        toast.error('Erro ao excluir sugestão')
        throw deleteError
      }

      setSuggestions((current) => current.filter((item) => item.id !== suggestionId))
    },
    []
  )

  const checkDuplicates = useCallback(
    async (title: string): Promise<{ id: string; title: string; status: string }[]> => {
      if (!streamerId || !title.trim()) return []
      try {
        const { data } = await supabase.rpc('find_similar_suggestions', {
          p_streamer_id: streamerId,
          p_title: title,
          p_threshold: 0.3,
        } as AnyRecord)
        return (data ?? []) as { id: string; title: string; status: string }[]
      } catch {
        return []
      }
    },
    [streamerId]
  )

  // Derivados por status (calculados do array completo)
  const watching = suggestions.find((s) => s.status === 'watching')
  const queued = suggestions
    .filter((s) => s.status === 'queued')
    .sort((a, b) => (a.queue_position ?? 999) - (b.queue_position ?? 999))
  const pending = suggestions
    .filter((s) => s.status === 'pending')
    .sort((a, b) => b.submission_priority - a.submission_priority || a.submitted_at.localeCompare(b.submitted_at))
  const completed = suggestions.filter((s) => s.status === 'completed')
  const rejected = suggestions.filter((s) => s.status === 'rejected')
  const approved = suggestions.filter((s) => s.status === 'approved')

  return {
    suggestions, watching, queued, pending,
    completed, rejected, approved,
    isLoading, error,
    vote, submit, updateStatus, toggleFavorite, remove, checkDuplicates,
    refetch: fetchSuggestions,
  }
}
