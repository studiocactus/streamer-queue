import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ExternalLink, ShieldCheck, UserRound } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { streamerPath } from '@/lib/routes'
import { updateSeoContent } from '@/components/Seo'

type PublicViewer = {
  id: string
  twitch_login: string
  display_name: string
  avatar_url: string | null
  bio: string | null
  social_links: Record<string, string>
  moderated_channels: { channel_name: string; slug: string; avatar_url: string | null }[]
}

export default function ViewerProfile() {
  const { login = '' } = useParams()
  const [viewer, setViewer] = useState<PublicViewer | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    supabase.rpc('get_public_viewer_profile', { p_login: login }).then(({ data }) => {
      if (!active) return
      const result = (data?.[0] ?? null) as PublicViewer | null
      setViewer(result)
      setLoading(false)
      if (result) updateSeoContent(`${result.display_name} | WatchQueue`, `Conheça ${result.display_name} e veja os canais que modera no WatchQueue.`)
    })
    return () => { active = false }
  }, [login])

  if (loading) return <div className="app-shell min-h-screen animate-pulse py-16"><div className="h-64 rounded-3xl bg-bg-secondary" /></div>
  if (!viewer) return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <EmptyState icon={<UserRound size={28} />} title="Viewer não encontrado" description="Este perfil não existe ou não está disponível." action={<Link to="/explore"><Button>Buscar streamers</Button></Link>} />
    </div>
  )

  const socialLinks = Object.entries(viewer.social_links ?? {}).filter(([, url]) => /^https?:\/\//i.test(url))
  return (
    <div className="min-h-screen page-section">
      <div className="app-shell max-w-4xl space-y-6">
        <section className="overflow-hidden rounded-3xl border border-border bg-bg-secondary">
          <div className="h-28 bg-[radial-gradient(circle_at_30%_0%,rgba(145,70,255,.45),transparent_60%),linear-gradient(120deg,#17121f,#111119)] sm:h-36" />
          <div className="px-5 pb-6 sm:px-8">
            <Avatar src={viewer.avatar_url} alt={viewer.display_name} fallback={viewer.display_name} size="xl" className="-mt-10 ring-4 ring-bg-secondary" />
            <div className="mt-4">
              <h1 className="text-2xl font-bold text-content-primary">{viewer.display_name}</h1>
              <p className="mt-0.5 text-sm text-content-muted">@{viewer.twitch_login}</p>
              <Badge variant="purple" className="mt-3">Viewer da comunidade</Badge>
              {viewer.bio && <p className="mt-5 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-content-secondary">{viewer.bio}</p>}
              {socialLinks.length > 0 && <div className="mt-5 flex flex-wrap gap-2">{socialLinks.map(([network, url]) => <a key={network} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-medium capitalize text-content-secondary hover:border-brand-purple/40 hover:text-content-primary">{network}<ExternalLink size={11} /></a>)}</div>}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-bg-secondary p-5 sm:p-8">
          <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-purple/10 text-brand-purple"><ShieldCheck size={19} /></div><div><h2 className="font-semibold text-content-primary">Canais que modera</h2><p className="text-xs text-content-muted">Funções públicas na comunidade</p></div></div>
          {viewer.moderated_channels.length === 0 ? <p className="mt-6 rounded-2xl border border-border bg-bg-tertiary/50 px-4 py-5 text-sm text-content-muted">Este viewer ainda não modera nenhum canal.</p> : <div className="mt-6 grid gap-3 sm:grid-cols-2">{viewer.moderated_channels.map((channel) => <Link key={channel.slug} to={streamerPath(channel.slug)} className="flex items-center gap-3 rounded-2xl border border-border bg-bg-tertiary/60 p-3 transition-colors hover:border-brand-purple/35"><Avatar src={channel.avatar_url} alt={channel.channel_name} fallback={channel.channel_name} size="sm" /><span className="min-w-0 flex-1 truncate text-sm font-medium text-content-primary">{channel.channel_name}</span><ExternalLink size={14} className="text-content-muted" /></Link>)}</div>}
        </section>
      </div>
    </div>
  )
}
