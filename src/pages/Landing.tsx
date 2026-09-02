import { useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import {
  Tv2, Users, ThumbsUp, Zap, Shield, Gift,
  ChevronRight, Play, Star, CheckCircle, ArrowRight, MessageCircle, Radio, Sparkles
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { getTwitchAuthUrl } from '@/lib/supabase'

gsap.registerPlugin(useGSAP, ScrollTrigger)

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Streamer convidado configura o canal',
    description: 'Cada streamer da comunidade recebe uma página própria, com regras e aparência.',
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
  { icon: Gift, title: 'Comunidade privada', description: 'Canais liberados para streamers convidados pelo administrador.' },
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
    q: 'Como um streamer entra na comunidade?',
    a: 'Os canais de streamer são liberados por convite. Todo novo usuário entra primeiro como viewer e recebe acesso administrativo somente após aprovação.',
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
  const pageRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const authRequired = Boolean(
    (location.state as { authRequired?: boolean } | null)?.authRequired
  )

  const handleLoginWithTwitch = () => {
    window.location.href = getTwitchAuthUrl()
  }

  useGSAP(() => {
    const media = gsap.matchMedia()

    media.add('(prefers-reduced-motion: no-preference)', () => {
      const hero = gsap.timeline({ defaults: { ease: 'power3.out' } })
      hero
        .from('[data-hero-glow]', { autoAlpha: 0, scale: 0.72, duration: 1.2 })
        .from('[data-hero-orb]', { autoAlpha: 0, scale: 0.5, stagger: 0.12, duration: 1 }, 0)
        .from('[data-hero-badge]', { autoAlpha: 0, y: 18, duration: 0.45 }, 0.1)
        .from('[data-hero-line]', { autoAlpha: 0, yPercent: 115, stagger: 0.11, duration: 0.72 }, 0.18)
        .from('[data-hero-copy]', { autoAlpha: 0, y: 22, duration: 0.55 }, 0.38)
        .from('[data-hero-proof]', { autoAlpha: 0, duration: 0.45 }, 0.7)
        .from('[data-hero-product]', { autoAlpha: 0, y: 60, rotationX: 8, duration: 0.9 }, 0.62)

      gsap.to('[data-hero-glow]', {
        scale: 1.08,
        duration: 4,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      })

      gsap.to('[data-hero-orb="left"]', { y: 70, x: 20, ease: 'none', scrollTrigger: { trigger: '[data-hero]', start: 'top top', end: 'bottom top', scrub: 1 } })
      gsap.to('[data-hero-orb="right"]', { y: 110, x: -30, ease: 'none', scrollTrigger: { trigger: '[data-hero]', start: 'top top', end: 'bottom top', scrub: 1 } })
      gsap.to('[data-hero-product]', { y: 44, ease: 'none', scrollTrigger: { trigger: '[data-hero]', start: 'top top', end: 'bottom top', scrub: 1 } })

      gsap.to('[data-curtain="one"]', { xPercent: 18, yPercent: 9, rotation: 4, scaleY: 1.12, duration: 7, repeat: -1, yoyo: true, ease: 'sine.inOut' })
      gsap.to('[data-curtain="two"]', { xPercent: -16, yPercent: -7, rotation: -5, scaleX: 1.1, duration: 9, repeat: -1, yoyo: true, ease: 'sine.inOut' })
      gsap.to('[data-curtain="three"]', { xPercent: 12, yPercent: 12, rotation: 3, scale: 1.08, duration: 11, repeat: -1, yoyo: true, ease: 'sine.inOut' })

      gsap.utils.toArray<HTMLElement>('[data-gsap-section]').forEach((section) => {
        const heading = section.querySelector('[data-gsap-heading]')
        const cards = section.querySelectorAll('[data-gsap-card]')
        ScrollTrigger.create({
          trigger: section,
          start: 'top 88%',
          once: true,
          onEnter: () => {
            if (heading) gsap.fromTo(heading, { autoAlpha: 0, y: 22 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power2.out', clearProps: 'all' })
            if (cards.length) gsap.fromTo(cards, { autoAlpha: 0, y: 24, scale: 0.99 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.48, stagger: 0.07, ease: 'power2.out', clearProps: 'all' })
          },
        })
      })
    })

    media.add('(prefers-reduced-motion: reduce)', () => {
      gsap.set('[data-hero-glow], [data-hero-orb], [data-hero-badge], [data-hero-line], [data-hero-copy], [data-hero-proof], [data-hero-product], [data-gsap-heading], [data-gsap-card]', {
        clearProps: 'all',
      })
    })

    return () => media.revert()
  }, { scope: pageRef })

  return (
    <div ref={pageRef} className="landing-page min-h-screen">
      {authRequired && (
        <div
          role="status"
          className="border-b border-brand-purple/30 bg-brand-purple/10 px-4 py-3"
        >
          <div className="app-shell flex flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="text-center text-sm text-content-secondary sm:text-left">
              Entre com sua conta Twitch para acessar suas sugestões. Contas convidadas também recebem o painel de streamer.
            </p>
            <Button size="sm" onClick={handleLoginWithTwitch}>
              Entrar com Twitch
            </Button>
          </div>
        </div>
      )}

      {/* ============================================================
          HERO
      ============================================================ */}
      <section data-hero className="landing-hero relative overflow-hidden pb-20 pt-20 sm:pt-24 lg:pt-28">
        <div className="landing-grid absolute inset-0 pointer-events-none" />
        <div data-hero-glow className="landing-aurora pointer-events-none absolute left-1/2 top-[-20rem] h-[42rem] w-[72rem] -translate-x-1/2 rounded-full" />
        <div className="landing-curtain pointer-events-none absolute inset-0">
          <span data-curtain="one" className="landing-curtain-layer landing-curtain-one" />
          <span data-curtain="two" className="landing-curtain-layer landing-curtain-two" />
          <span data-curtain="three" className="landing-curtain-layer landing-curtain-three" />
        </div>
        <div data-hero-orb="left" className="landing-orb landing-orb-left pointer-events-none absolute" />
        <div data-hero-orb="right" className="landing-orb landing-orb-right pointer-events-none absolute" />

        <div className="app-shell relative text-center">
          <div data-hero-badge className="landing-pill mb-8 inline-flex items-center gap-2 rounded-full px-4 py-2">
            <Sparkles size={13} className="text-brand-green" />
            <span className="text-xs font-semibold text-content-primary">A fila da sua live, movida pela comunidade</span>
          </div>

          <h1 data-hero-title className="mx-auto mb-7 max-w-6xl text-[clamp(2.65rem,7.2vw,6.5rem)] font-semibold leading-[0.94] tracking-[-0.065em] text-content-primary">
            <span className="block overflow-hidden pb-2"><span data-hero-line className="block">Sua comunidade escolhe.</span></span>
            <span className="block overflow-hidden pb-3"><span data-hero-line className="landing-gradient-text relative inline-block">Você decide o que assistir.</span></span>
          </h1>

          <p data-hero-copy className="mx-auto mb-9 max-w-2xl text-base leading-relaxed text-content-secondary sm:text-lg">
            Sugestões, votos e decisões em tempo real. Uma experiência mais viva para o streamer e para todo mundo que participa do chat.
          </p>

          <div data-hero-actions className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              className="landing-primary-cta rounded-full px-7"
              onClick={handleLoginWithTwitch}
              leftIcon={
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                  <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
                </svg>
              }
            >
              Entrar com Twitch
            </Button>
            <Link
              to="/explore"
              className="landing-secondary-cta focus-ring inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-base font-medium text-content-primary transition-all duration-300"
            >
              Encontrar um streamer
              <ChevronRight size={18} />
            </Link>
          </div>

          {/* Social proof */}
          <p data-hero-proof className="mt-7 text-xs text-content-muted">
            <span className="text-brand-green">●</span> Gratuito para viewers &nbsp;·&nbsp; Streamers por convite &nbsp;·&nbsp; Login seguro com Twitch
          </p>

          <div data-hero-product className="landing-product mx-auto mt-14 max-w-5xl text-left sm:mt-16">
            <div className="landing-product-bar flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-red-400" /><span className="h-2.5 w-2.5 rounded-full bg-amber-300" /><span className="h-2.5 w-2.5 rounded-full bg-brand-green" /></div>
              <div className="flex items-center gap-2 text-[10px] font-medium text-content-muted"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-status-completed" /> AO VIVO</div>
            </div>
            <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[1.25fr_.75fr]">
              <div className="rounded-2xl border border-white/10 bg-black/25 p-4 sm:p-5">
                <div className="mb-4 flex items-center justify-between"><div><p className="text-xs text-content-muted">Fila da comunidade</p><p className="font-semibold text-content-primary">Próximos conteúdos</p></div><span className="rounded-full bg-brand-purple/15 px-3 py-1 text-[10px] font-semibold text-brand-purple-light">12 sugestões</span></div>
                {[
                  { title: 'Arcane', type: 'Série', votes: 128, color: 'from-violet-500 to-fuchsia-500' },
                  { title: 'Interestelar', type: 'Filme', votes: 96, color: 'from-cyan-400 to-blue-600' },
                  { title: 'One Piece', type: 'Anime', votes: 74, color: 'from-orange-400 to-red-500' },
                ].map((item, index) => (
                  <div key={item.title} className="landing-queue-row mb-2 flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.035] p-3 last:mb-0">
                    <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${item.color}`} />
                    <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-content-primary">{item.title}</p><p className="text-[11px] text-content-muted">{item.type}</p></div>
                    <div className="flex items-center gap-1.5 text-xs text-content-secondary"><ThumbsUp size={12} /> {item.votes}</div>
                    <span className="text-xs font-bold text-content-muted">0{index + 1}</span>
                  </div>
                ))}
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                <div className="landing-mini-card rounded-2xl p-5"><Radio size={18} className="mb-5 text-brand-green" /><p className="text-3xl font-bold text-content-primary">2.4k</p><p className="text-xs text-content-muted">votos da comunidade</p></div>
                <div className="landing-mini-card rounded-2xl p-5"><MessageCircle size={18} className="mb-5 text-cyan-300" /><p className="text-3xl font-bold text-content-primary">Ao vivo</p><p className="text-xs text-content-muted">sincronizado com o chat</p></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
          COMO FUNCIONA
      ============================================================ */}
      <section data-gsap-section className="page-section" id="como-funciona">
        <div className="app-shell">
          <div data-gsap-heading className="text-center mb-12">
            <h2 className="text-3xl font-bold text-content-primary mb-3">Como funciona</h2>
            <p className="text-content-secondary max-w-xl mx-auto">
              Em quatro passos simples, sua comunidade e você têm a melhor experiência de live watch party.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {HOW_IT_WORKS.map(({ step, title, description, icon: Icon }) => (
              <div data-gsap-card key={step} className="group relative bg-bg-secondary border border-border rounded-2xl p-6 hover:border-brand-purple/30 transition-all duration-200">
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
      <section data-gsap-section className="page-section bg-bg-secondary/60" id="recursos-streamer">
        <div className="app-shell">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div data-gsap-heading>
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
                className="landing-primary-cta mt-8 rounded-full px-6"
                onClick={handleLoginWithTwitch}
                leftIcon={<ArrowRight size={16} />}
              >
                Acessar meu painel
              </Button>
            </div>

            {/* Preview card */}
            <div data-gsap-card className="relative">
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
                  <div data-gsap-card key={i} className="flex items-center gap-3 bg-bg-secondary border border-border rounded-xl p-3">
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
      <section data-gsap-section className="page-section" id="recursos-viewer">
        <div className="app-shell">
          <div data-gsap-heading className="text-center mb-12">
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
              <div data-gsap-card key={title} className="bg-bg-secondary border border-border rounded-2xl p-5 hover:border-brand-green/30 transition-all duration-200 group">
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
      <section data-gsap-section className="twitch-spotlight page-section" id="twitch">
        <div className="app-shell relative">
          <div data-gsap-heading className="mx-auto max-w-3xl text-center">
          <div className="twitch-icon-glow w-16 h-16 rounded-2xl bg-brand-purple/10 border border-brand-purple/20 flex items-center justify-center mx-auto mb-6">
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
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
            {[
              { title: '🎬 Nova sugestão', msg: '{viewer} adicionou "{titulo}" à lista!' },
              { title: '✅ Aprovação', msg: 'A sugestão "{titulo}" foi aprovada!' },
              { title: '🍿 Assistindo agora', msg: 'Começamos a assistir "{titulo}"!' },
            ].map((item) => (
              <div data-gsap-card key={item.title} className="twitch-message-card rounded-2xl p-5">
                <p className="text-xs font-semibold text-content-primary mb-2">{item.title}</p>
                <p className="text-xs text-content-muted">{item.msg}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================
          FAQ
      ============================================================ */}
      <section data-gsap-section className="page-section" id="faq">
        <div className="max-w-2xl mx-auto">
          <div data-gsap-heading className="text-center mb-12">
            <h2 className="text-3xl font-bold text-content-primary mb-3">Perguntas frequentes</h2>
          </div>
          <div className="space-y-3">
            {FAQ.map((item) => (
              <FaqItem key={item.q} question={item.q} answer={item.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================
          CTA FINAL
      ============================================================ */}
      <section data-gsap-section className="page-section">
        <div data-gsap-heading className="final-cta relative mx-auto max-w-5xl overflow-hidden rounded-[2rem] px-6 py-14 text-center sm:px-12 sm:py-20">
          <div className="relative z-10 mx-auto max-w-2xl">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.24em] text-brand-green">Sua próxima live começa aqui</p>
          <h2 className="mb-4 text-3xl font-bold text-content-primary sm:text-5xl">
            Pronto para começar?
          </h2>
          <p className="text-content-secondary mb-8">
            Crie seu canal gratuitamente e deixe sua comunidade escolher o próximo título.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              className="landing-primary-cta rounded-full px-7"
              onClick={handleLoginWithTwitch}
              leftIcon={
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                  <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
                </svg>
              }
            >
              Entrar com Twitch
            </Button>
            <Link
              to="/explore"
              className="landing-secondary-cta focus-ring inline-flex h-12 items-center justify-center rounded-full px-6 text-base font-medium text-content-primary transition-all duration-300"
            >
              Explorar streamers →
            </Link>
          </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div data-gsap-card className={`faq-item rounded-2xl border transition-colors duration-300 ${open ? 'border-brand-purple/35 bg-brand-purple/[0.06]' : 'border-border bg-bg-secondary'}`}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)} className="flex w-full items-center justify-between p-5 text-left">
        <span className="text-sm font-medium text-content-primary">{question}</span>
        <ChevronRight size={16} className={`ml-3 shrink-0 text-content-muted transition-transform duration-300 ${open ? 'rotate-90 text-brand-purple-light' : ''}`} />
      </button>
      <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden"><p className="px-5 pb-5 text-sm leading-relaxed text-content-secondary">{answer}</p></div>
      </div>
    </div>
  )
}
