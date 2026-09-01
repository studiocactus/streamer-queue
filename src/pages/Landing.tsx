import { Link } from 'react-router-dom'
import {
  Tv2, Users, ThumbsUp, Zap, Shield, Gift,
  ChevronRight, Play, Star, CheckCircle, ArrowRight
} from 'lucide-react'
import { Button } from '@/components/ui/Button'

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Streamer cria seu canal',
    description: 'Configure sua página personalizada com slug único, regras e aparência.',
    icon: Tv2,
  },
  {
    step: '02',
    title: 'Viewers sugerem conteúdo',
    description: 'A comunidade envia filmes, séries, animes e outros conteúdos autenticados pela Twitch.',
    icon: Users,
  },
  {
    step: '03',
    title: 'Comunidade vota',
    description: 'Os melhores conteúdos sobem na fila automaticamente pelos votos.',
    icon: ThumbsUp,
  },
  {
    step: '04',
    title: 'Streamer decide e assiste',
    description: 'Aprove, organize e marque o que está assistindo em tempo real na sua live.',
    icon: Play,
  },
]

const STREAMER_FEATURES = [
  { icon: Shield, title: 'Moderação completa', description: 'Aprove, rejeite e organize sugestões com moderadores.' },
  { icon: Zap, title: 'Integração Twitch', description: 'Anúncios automáticos no chat quando iniciar assistir.' },
  { icon: Star, title: 'Fila inteligente', description: 'Organize por votos, recentes ou manualmente.' },
  { icon: Gift, title: 'Monetização futura', description: 'Destaque pago para sugestões em breve.' },
]

const VIEWER_FEATURES = [
  { icon: CheckCircle, title: 'Login simples', description: 'Autentique apenas com sua conta Twitch.' },
  { icon: ThumbsUp, title: 'Vote nas favoritas', description: 'Apoie as sugestões que você quer ver.' },
  { icon: Tv2, title: 'Acompanhe status', description: 'Veja em tempo real se sua sugestão foi aceita.' },
  { icon: Users, title: 'Vários streamers', description: 'Siga e sugira em múltiplos canais.' },
]

const FAQ = [
  {
    q: 'O WatchQueue é gratuito?',
    a: 'Sim! A plataforma é gratuita tanto para streamers quanto para viewers. Recursos premium opcionais poderão ser adicionados no futuro.',
  },
  {
    q: 'Preciso de uma conta Twitch?',
    a: 'Sim. Tanto streamers quanto viewers precisam autenticar com Twitch para garantir a segurança e identidade real da comunidade.',
  },
  {
    q: 'O streamer precisa ser Twitch Partner ou Affiliate?',
    a: 'Não! Qualquer streamer da Twitch pode criar seu canal no WatchQueue.',
  },
  {
    q: 'Quantas sugestões posso enviar?',
    a: 'O limite é configurado pelo streamer. Por padrão, cada viewer pode enviar até 3 sugestões ativas por canal.',
  },
  {
    q: 'Como funciona a integração com o chat da Twitch?',
    a: 'O streamer pode configurar mensagens automáticas que o bot envia no chat quando uma sugestão é recebida ou quando ele começa a assistir.',
  },
]

export default function LandingPage() {
  const handleLoginWithTwitch = () => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    if (!supabaseUrl) return
    window.location.href = `${supabaseUrl}/functions/v1/twitch-auth/login`
  }

  return (
    <div className="min-h-screen">
      {/* ============================================================
          HERO
      ============================================================ */}
      <section className="relative overflow-hidden bg-bg-hero-gradient pt-20 pb-28 px-4">
        {/* Background glow */}
        <div className="absolute inset-0 bg-hero-gradient pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-brand-purple/8 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-brand-purple/10 border border-brand-purple/20 rounded-full px-4 py-1.5 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse-slow" />
            <span className="text-xs font-medium text-brand-purple">Plataforma multi-streamer</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-content-primary leading-tight mb-6">
            Sua comunidade escolhe.{' '}
            <span className="text-gradient">Você decide</span>{' '}
            o que assistir.
          </h1>

          <p className="text-lg text-content-secondary max-w-2xl mx-auto mb-10 leading-relaxed">
            Receba sugestões de filmes, séries, animes e muito mais, organize sua fila e
            transforme as escolhas da comunidade em momentos de live.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              onClick={handleLoginWithTwitch}
              leftIcon={
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                  <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
                </svg>
              }
            >
              Criar página para meu canal
            </Button>
            <Link to="/explore">
              <Button size="lg" variant="secondary" rightIcon={<ChevronRight size={18} />}>
                Encontrar um streamer
              </Button>
            </Link>
          </div>

          {/* Social proof */}
          <p className="mt-8 text-xs text-content-muted">
            Grátis para sempre · Sem cartão de crédito · Login com Twitch
          </p>
        </div>
      </section>

      {/* ============================================================
          COMO FUNCIONA
      ============================================================ */}
      <section className="py-20 px-4" id="como-funciona">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-content-primary mb-3">Como funciona</h2>
            <p className="text-content-secondary max-w-xl mx-auto">
              Em quatro passos simples, sua comunidade e você têm a melhor experiência de live watch party.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {HOW_IT_WORKS.map(({ step, title, description, icon: Icon }) => (
              <div key={step} className="group relative bg-bg-secondary border border-border rounded-2xl p-6 hover:border-brand-purple/30 transition-all duration-200">
                <div className="text-5xl font-black text-border mb-4 group-hover:text-brand-purple/20 transition-colors">
                  {step}
                </div>
                <div className="w-10 h-10 rounded-xl bg-brand-purple/10 border border-brand-purple/20 flex items-center justify-center mb-3">
                  <Icon size={20} className="text-brand-purple" />
                </div>
                <h3 className="font-semibold text-content-primary mb-2">{title}</h3>
                <p className="text-sm text-content-secondary">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================
          RECURSOS — STREAMERS
      ============================================================ */}
      <section className="py-20 px-4 bg-bg-secondary" id="recursos-streamer">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-brand-purple/10 border border-brand-purple/20 rounded-full px-3 py-1 mb-5">
                <Tv2 size={13} className="text-brand-purple" />
                <span className="text-xs font-medium text-brand-purple">Para Streamers</span>
              </div>
              <h2 className="text-3xl font-bold text-content-primary mb-4">
                Tudo que você precisa para organizar sua fila
              </h2>
              <p className="text-content-secondary mb-8">
                Controle total da sua fila de conteúdo, com aprovação, moderadores e integração direta com o chat da Twitch.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {STREAMER_FEATURES.map(({ icon: Icon, title, description }) => (
                  <div key={title} className="flex gap-3">
                    <div className="w-9 h-9 rounded-lg bg-brand-purple/10 border border-brand-purple/20 flex items-center justify-center shrink-0">
                      <Icon size={16} className="text-brand-purple" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-content-primary">{title}</p>
                      <p className="text-xs text-content-secondary mt-0.5">{description}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Button
                className="mt-8"
                onClick={handleLoginWithTwitch}
                leftIcon={<ArrowRight size={16} />}
              >
                Criar meu canal
              </Button>
            </div>

            {/* Preview card */}
            <div className="relative">
              <div className="bg-bg-primary border border-border rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-content-primary">Fila do Canal</span>
                  <span className="text-xs text-content-muted">3 na fila</span>
                </div>
                {[
                  { title: 'Interestelar', cat: 'Filme', votes: 42, status: 'watching' },
                  { title: 'Ruptura', cat: 'Série', votes: 28, status: 'queued' },
                  { title: 'One Piece', cat: 'Anime', votes: 19, status: 'queued' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 bg-bg-secondary border border-border rounded-xl p-3">
                    <div className="w-8 h-8 rounded-lg bg-bg-tertiary flex items-center justify-center text-xs font-bold text-content-muted">
                      {item.status === 'watching' ? '▶' : i}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-content-primary truncate">{item.title}</p>
                      <p className="text-xs text-content-muted">{item.cat}</p>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-content-muted">
                      <ThumbsUp size={11} />
                      {item.votes}
                    </div>
                    {item.status === 'watching' && (
                      <div className="flex items-center gap-1 text-xs bg-status-watching/10 text-status-watching border border-status-watching/20 rounded-full px-2 py-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-status-watching animate-pulse" />
                        Assistindo
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
          RECURSOS — VIEWERS
      ============================================================ */}
      <section className="py-20 px-4" id="recursos-viewer">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-brand-green/10 border border-brand-green/20 rounded-full px-3 py-1 mb-5">
              <Users size={13} className="text-brand-green" />
              <span className="text-xs font-medium text-brand-green">Para Viewers</span>
            </div>
            <h2 className="text-3xl font-bold text-content-primary mb-3">
              Sua voz importa na live
            </h2>
            <p className="text-content-secondary max-w-xl mx-auto">
              Suggira, vote e acompanhe seus conteúdos favoritos em tempo real durante a transmissão.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {VIEWER_FEATURES.map(({ icon: Icon, title, description }) => (
              <div key={title} className="bg-bg-secondary border border-border rounded-2xl p-5 hover:border-brand-green/30 transition-all duration-200 group">
                <div className="w-10 h-10 rounded-xl bg-brand-green/10 border border-brand-green/20 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <Icon size={18} className="text-brand-green" />
                </div>
                <h3 className="font-semibold text-content-primary mb-1.5">{title}</h3>
                <p className="text-sm text-content-secondary">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================
          INTEGRAÇÃO TWITCH
      ============================================================ */}
      <section className="py-20 px-4 bg-bg-secondary" id="twitch">
        <div className="max-w-3xl mx-auto text-center">
          <div className="w-16 h-16 rounded-2xl bg-brand-purple/10 border border-brand-purple/20 flex items-center justify-center mx-auto mb-6">
            <svg viewBox="0 0 24 24" className="w-8 h-8 fill-brand-purple">
              <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
            </svg>
          </div>
          <h2 className="text-3xl font-bold text-content-primary mb-4">
            Integração nativa com Twitch
          </h2>
          <p className="text-content-secondary mb-8 leading-relaxed">
            Conecte seu canal Twitch e receba anúncios automáticos no chat quando uma sugestão é recebida
            ou quando você começa a assistir. Mensagens personalizáveis e logs completos de envio.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
            {[
              { title: '🎬 Nova sugestão', msg: '{viewer} adicionou "{titulo}" à lista!' },
              { title: '✅ Aprovação', msg: 'A sugestão "{titulo}" foi aprovada!' },
              { title: '🍿 Assistindo agora', msg: 'Começamos a assistir "{titulo}"!' },
            ].map((item) => (
              <div key={item.title} className="bg-bg-primary border border-border rounded-xl p-4">
                <p className="text-xs font-semibold text-content-primary mb-2">{item.title}</p>
                <p className="text-xs text-content-muted font-mono">{item.msg}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================
          FAQ
      ============================================================ */}
      <section className="py-20 px-4" id="faq">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-content-primary mb-3">Perguntas frequentes</h2>
          </div>
          <div className="space-y-3">
            {FAQ.map((item) => (
              <details key={item.q} className="group bg-bg-secondary border border-border rounded-2xl">
                <summary className="flex items-center justify-between p-5 cursor-pointer list-none">
                  <span className="text-sm font-medium text-content-primary">{item.q}</span>
                  <ChevronRight size={16} className="text-content-muted group-open:rotate-90 transition-transform shrink-0 ml-3" />
                </summary>
                <div className="px-5 pb-5">
                  <p className="text-sm text-content-secondary">{item.a}</p>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================
          CTA FINAL
      ============================================================ */}
      <section className="py-20 px-4 bg-bg-secondary">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-content-primary mb-4">
            Pronto para começar?
          </h2>
          <p className="text-content-secondary mb-8">
            Crie seu canal gratuitamente e deixe sua comunidade escolher o próximo título.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              onClick={handleLoginWithTwitch}
              leftIcon={
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                  <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
                </svg>
              }
            >
              Criar página para meu canal
            </Button>
            <Link to="/explore">
              <Button size="lg" variant="ghost">
                Explorar streamers →
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
