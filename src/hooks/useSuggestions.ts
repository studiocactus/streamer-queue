import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type { Suggestion, SuggestionStatus, SuggestionCategory, FilterOptions } from '@/types'
import { useAuthStore } from '@/store/authStore'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = any

export function useSuggestions(streamerId: string | undefined, filters?: FilterOptions) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuthStore()

  const fetchSuggestions = useCallback(async () => {
    if (!streamerId) { setIsLoading(false); return }
    setIsLoading(true)
    setError(null)

    try {
      let query = supabase
        .from('suggestions')
        .select(`
          *,
          submitter:profiles!submitted_by(id, display_name, avatar_url, twitch_login),
          votes(id, user_id)
        `)
        .eq('streamer_id', streamerId)

      if (filters?.category && filters.category !== 'all') {
        query = query.eq('category', filters.category)
      }

      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status)
      }

      if (filters?.sort === 'queue') {
        query = query.order('queue_position', { ascending: true, nullsFirst: false })
      } else {
        query = query.order('submitted_at', { ascending: false })
      }

      const { data, error: fetchError } = await query

      if (fetchError) throw fetchError

      const raw: AnyRecord[] = data ?? []
      const enhanced: Suggestion[] = raw.map((s) => ({
        ...s,
        vote_count: Array.isArray(s.votes) ? s.votes.length : 0,
        user_voted: user
          ? Array.isArray(s.votes) && s.votes.some((v: AnyRecord) => v.user_id === user.id)
          : false,
      }))

      setSuggestions(enhanced)
    } catch (err) {
      setError('Erro ao carregar sugestões')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }, [streamerId, filters?.category, filters?.status, filters?.sort, user?.id])

  useEffect(() => {
    fetchSuggestions()
  }, [fetchSuggestions])

  // Realtime subscription
  useEffect(() => {
    if (!streamerId) return

    const channel = supabase
      .channel(`suggestions:${streamerId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'suggestions',
        filter: `streamer_id=eq.${streamerId}`,
      }, () => { fetchSuggestions() })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'votes',
        filter: `streamer_id=eq.${streamerId}`,
      }, () => { fetchSuggestions() })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [streamerId, fetchSuggestions])

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
    }) => {
      if (!user) { toast.error('Você precisa estar logado para sugerir'); return false }
      if (!streamerId) return false

      try {
        const { error: insertError } = await supabase.from('suggestions').insert({
          streamer_id: streamerId,
          submitted_by: user.id,
          category: data.category,
          title: data.title.trim(),
          description: data.description?.trim() ?? null,
          release_year: data.release_year ?? null,
          status: 'pending',
        } as AnyRecord)

        if (insertError) throw insertError

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
    [user, streamerId, fetchSuggestions]
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
        toast.error('Erro ao atualizar sugestão')
        throw updateError
      }
      fetchSuggestions()
    },
    [fetchSuggestions]
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

  const watching = suggestions.find((s) => s.status === 'watching')
  const queued = suggestions
    .filter((s) => s.status === 'queued')
    .sort((a, b) => (a.queue_position ?? 999) - (b.queue_position ?? 999))
  const pending = suggestions.filter((s) => s.status === 'pending')
  const completed = suggestions.filter((s) => s.status === 'completed')
  const rejected = suggestions.filter((s) => s.status === 'rejected')
  const approved = suggestions.filter((s) => s.status === 'approved')

  return {
    suggestions, watching, queued, pending,
    completed, rejected, approved,
    isLoading, error,
    vote, submit, updateStatus, checkDuplicates,
    refetch: fetchSuggestions,
  }
}
