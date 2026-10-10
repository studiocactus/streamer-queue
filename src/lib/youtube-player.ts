export interface YoutubePlayer {
 playVideo(): void; pauseVideo(): void; destroy(): void; setVolume(value: number): void;
 getCurrentTime(): number; getDuration(): number; getPlayerState(): number;
}
export interface YoutubeApi { Player: new (element: HTMLElement, options: {
 width: string; height: string; videoId: string; playerVars: Record<string, string | number>;
 events: { onReady: () => void; onError: () => void; onAutoplayBlocked: () => void }
}) => YoutubePlayer }
declare global { interface Window { YT?: YoutubeApi; onYouTubeIframeAPIReady?: () => void } }
let loading: Promise<YoutubeApi> | undefined
export function loadYoutubeApi(): Promise<YoutubeApi> {
 if (window.YT?.Player) return Promise.resolve(window.YT)
 if (loading) return loading
 loading = new Promise((resolve, reject) => {
  const timeout = window.setTimeout(() => { loading = undefined; reject(new Error('O player do YouTube não carregou. Recarregue a fonte.')) }, 15000)
  const previous = window.onYouTubeIframeAPIReady
  window.onYouTubeIframeAPIReady = () => { previous?.(); window.clearTimeout(timeout); if (window.YT) resolve(window.YT) }
  const script = document.createElement('script'); script.src = 'https://www.youtube.com/iframe_api'; script.async = true
  script.onerror = () => { window.clearTimeout(timeout); loading = undefined; reject(new Error('Falha ao conectar ao YouTube.')) }
  document.head.append(script)
 })
 return loading
}
