import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { formatRelativeDate } from '@/lib/utils'

type Feedback = { id: string; message: string; created_at: string; author: string }

export function PlatformFeedback() {
  const [items, setItems] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(false)
      try {
        const { data, error: queryError } = await supabase.from('platform_feedback')
          .select('id, message, created_at, user_id').order('created_at', { ascending: false })
        if (queryError) throw queryError
        const ids = [...new Set((data ?? []).flatMap(item => item.user_id ? [item.user_id] : []))]
        const { data: profiles, error: profilesError } = ids.length
          ? await supabase.from('profiles').select('id, display_name').in('id', ids)
          : { data: [], error: null }
        if (profilesError) throw profilesError
        if (!cancelled) setItems((data ?? []).map(item => ({ ...item,
          author: profiles?.find(profile => profile.id === item.user_id)?.display_name ?? 'Usuário indisponível',
        })))
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [refresh])

  return <Card>
    <CardHeader>
      <div><h2 className="font-semibold text-content-primary">Melhorias da plataforma</h2>
        <p className="mt-1 text-sm text-content-secondary">Sugestões enviadas pelos usuários, da mais recente para a mais antiga.</p></div>
      <Button size="sm" disabled={loading} onClick={() => setRefresh(value => value + 1)}>Atualizar</Button>
    </CardHeader>
    <CardContent>
      {loading ? <p role="status">Carregando mensagens…</p>
        : error ? <p role="alert">Não foi possível carregar as mensagens. Clique em Atualizar para tentar novamente.</p>
        : items.length === 0 ? <p className="text-content-muted">Nenhuma sugestão de melhoria recebida ainda.</p>
        : <div className="space-y-3">{items.map(item => <article key={item.id} className="rounded-xl border border-border p-4">
          <div className="mb-2 flex flex-wrap justify-between gap-2 text-xs text-content-secondary">
            <span>{item.author}</span><time dateTime={item.created_at} title={new Date(item.created_at).toLocaleString('pt-BR')}>{formatRelativeDate(item.created_at)}</time>
          </div>
          <p className="whitespace-pre-wrap break-words text-sm text-content-primary">{item.message}</p>
        </article>)}</div>}
    </CardContent>
  </Card>
}
