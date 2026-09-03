import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const SITE_URL = 'https://streamer-queue.vercel.app'
const DEFAULT_TITLE = 'WatchQueue — Sugestões da comunidade para streamers'
const DEFAULT_DESCRIPTION = 'A comunidade escolhe o que o streamer assiste. Envie sugestões, vote nas favoritas e acompanhe a fila do canal.'

function setMeta(selector: string, attribute: 'name' | 'property', key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector)
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attribute, key)
    document.head.appendChild(element)
  }
  element.content = content
}

export function updateSeoContent(title: string, description: string) {
  document.title = title
  setMeta('meta[name="description"]', 'name', 'description', description)
  setMeta('meta[property="og:title"]', 'property', 'og:title', title)
  setMeta('meta[property="og:description"]', 'property', 'og:description', description)
  setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', title)
  setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description)
}

export function Seo() {
  const { pathname } = useLocation()

  useEffect(() => {
    const isOverlay = pathname.startsWith('/overlay/')
    const isPrivate = pathname.startsWith('/dashboard') || pathname.startsWith('/auth/') || isOverlay
    const isExplore = pathname === '/explore'
    const isHome = pathname === '/'
    const isLegacyStreamer = pathname.startsWith('/streamer/')
    const isPublicStreamer = !isHome && !isExplore && !isPrivate && !isLegacyStreamer

    const title = isExplore
      ? 'Buscar streamers e canais | WatchQueue'
      : isPublicStreamer
        ? 'Canal da comunidade | WatchQueue'
        : isPrivate
          ? 'Área da comunidade | WatchQueue'
          : DEFAULT_TITLE

    const description = isExplore
      ? 'Encontre streamers no WatchQueue, conheça seus canais e participe enviando e votando em sugestões.'
      : isPublicStreamer
        ? 'Veja a fila do canal, envie sugestões e vote no que a comunidade quer assistir.'
        : DEFAULT_DESCRIPTION

    const canonicalPath = isOverlay ? pathname.replace(/^\/overlay/, '') : isPrivate ? '/' : pathname
    const canonicalUrl = new URL(canonicalPath, SITE_URL).toString()
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    if (!canonical) {
      canonical = document.createElement('link')
      canonical.rel = 'canonical'
      document.head.appendChild(canonical)
    }

    canonical.href = canonicalUrl
    updateSeoContent(title, description)
    setMeta('meta[name="robots"]', 'name', 'robots', isPrivate ? 'noindex, nofollow' : 'index, follow')
    setMeta('meta[property="og:url"]', 'property', 'og:url', canonicalUrl)
  }, [pathname])

  return null
}
