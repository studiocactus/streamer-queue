import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Activity, ArrowUpRight, Coffee, Gauge, Heart, LayoutDashboard, Radio, Search, Sparkles, Tv2, Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { BrandLogo } from '@/components/ui/BrandLogo'

interface PlatformStats {
  usersCount: number | null
  streamersCount: number | null
  platformStatus: 'operational' | 'attention' | null
}

const supportUrl = 'https://livepix.gg/thenees'

export function Footer() {
  const [stats, setStats] = useState<PlatformStats>({ usersCount: null, streamersCount: null, platformStatus: null })

  useEffect(() => {
    let active = true
    const loadStats = async () => {
      const { data, error } = await supabase.rpc('get_platform_stats')
      if (!active) return
      let usersCount: number | null = null
      let streamersCount: number | null = null
      let platformStatus: PlatformStats['platformStatus'] = null

      if (!error) {
        const totals = data?.[0]
        usersCount = Number(totals?.users_count ?? 0)
        streamersCount = Number(totals?.streamers_count ?? 0)
        platformStatus = totals?.platform_status === 'operational' ? 'operational' : 'attention'
      } else {
        // Backward-compatible fallback while the aggregate RPC migration propagates.
        const [profilesResult, streamersResult] = await Promise.all([
          supabase.from('profiles').select('id', { count: 'exact', head: true }),
          supabase.from('streamers').select('id', { count: 'exact', head: true }).eq('is_active', true),
        ])
        if (!active) return
        usersCount = profilesResult.error ? null : profilesResult.count
        streamersCount = streamersResult.error ? null : streamersResult.count
        platformStatus = usersCount !== null && streamersCount !== null ? 'operational' : 'attention'
      }

      setStats({
        usersCount,
        streamersCount,
        platformStatus,
      })
    }
    loadStats()
    return () => { active = false }
  }, [])

  const formatTotal = (value: number | null) => value === null ? '—' : new Intl.NumberFormat('pt-BR').format(value)

  return (
    <footer className="landing-footer relative mt-auto overflow-hidden border-t border-border bg-bg-secondary">
      <div className="app-shell py-10 lg:py-14">
        <div className="mb-10 grid gap-4 sm:grid-cols-3">
          <FooterMetric icon={<Activity size={18} />} label="Status da plataforma">
            <span className={`h-2 w-2 rounded-full ${stats.platformStatus === null ? 'animate-pulse bg-content-muted' : stats.platformStatus === 'operational' ? 'bg-status-approved' : 'bg-amber-400'}`} />
            {stats.platformStatus === null ? 'Verificando sistemas...' : stats.platformStatus === 'operational' ? 'Todos os sistemas operacionais' : 'Sistema em atenção'}
          </FooterMetric>
          <FooterMetric icon={<Users size={18} />} label="Pessoas na comunidade" value={formatTotal(stats.usersCount)} />
          <FooterMetric icon={<Tv2 size={18} />} label="Streamers ativos" value={formatTotal(stats.streamersCount)} />
        </div>

        <div className="grid grid-cols-1 gap-8 sm:gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div className="md:col-span-2 lg:col-span-2">
            <Link to="/" aria-label="Página inicial do WatchQueue" className="mb-4 block w-[172px]">
              <BrandLogo />
            </Link>
            <p className="max-w-md text-sm leading-relaxed text-content-secondary">
              A comunidade escolhe o que o streamer assiste. Organize filas, receba sugestões e transforme cada transmissão em uma experiência compartilhada.
            </p>
            <div className="mt-5 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <a href={supportUrl} target="_blank" rel="noopener noreferrer" className="support-cta inline-flex shrink-0 items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white transition-all duration-300">
                <Coffee size={16} /> Apoiar o projeto <ArrowUpRight size={14} />
              </a>
              <p className="max-w-md text-xs leading-relaxed text-content-muted">
                Você <strong className="font-bold text-white">não é obrigado a apoiar o projeto</strong>!
                <br />
                Fique à vontade para apoiar se quiser ajudar. Sua mensagem será exibida em live. (
                <a href="https://www.twitch.tv/thenees" target="_blank" rel="noopener noreferrer" className="text-content-secondary underline decoration-brand-purple/50 underline-offset-2 transition-colors hover:text-content-primary">
                  twitch.tv/thenees
                </a>
                )
              </p>
            </div>
          </div>

          <FooterLinks title="Produto" links={[
            { to: '/explore', icon: <Search size={14} />, label: 'Buscar Streamers' },
            { to: '/dashboard', icon: <LayoutDashboard size={14} />, label: 'Dashboard' },
            { to: '/', icon: <Sparkles size={14} />, label: 'Conhecer a plataforma' },
          ]} />

          <div>
            <h3 className="mb-4 text-sm font-semibold text-content-primary">Recursos</h3>
            <ul className="space-y-3">
              <li><a href="https://twitch.tv" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-content-secondary transition-colors hover:text-content-primary"><Radio size={14} /> Twitch <ArrowUpRight size={12} /></a></li>
              <li><span className="flex items-center gap-2 text-sm text-content-secondary"><Gauge size={14} /> Status em tempo real</span></li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-border pt-6 sm:flex-row sm:items-center">
          <p className="flex flex-wrap items-center gap-1 text-xs text-content-muted">Feito com <Heart size={12} className="fill-brand-purple text-brand-purple" /> para a comunidade de streamers</p>
          <p className="text-xs text-content-muted">© {new Date().getFullYear()} WatchQueue. Todos os direitos reservados.</p>
        </div>
      </div>
    </footer>
  )
}

function FooterMetric({ icon, label, value, children }: { icon: ReactNode; label: string; value?: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-bg-primary/45 p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-purple/10 text-brand-purple">{icon}</span>
        <div><p className="text-xs text-content-muted">{label}</p><p className="mt-0.5 flex items-center gap-2 text-sm font-semibold text-content-primary">{value ?? children}</p></div>
      </div>
    </div>
  )
}

function FooterLinks({ title, links }: { title: string; links: { to: string; icon: ReactNode; label: string }[] }) {
  return (
    <div>
      <h3 className="mb-4 text-sm font-semibold text-content-primary">{title}</h3>
      <ul className="space-y-3">{links.map((link) => <li key={link.to + link.label}><Link to={link.to} className="flex items-center gap-2 text-sm text-content-secondary transition-colors hover:text-content-primary">{link.icon}{link.label}</Link></li>)}</ul>
    </div>
  )
}
