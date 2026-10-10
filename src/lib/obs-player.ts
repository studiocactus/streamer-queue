export type ObsState = {
 streamer_id: string; revision: number; generation: number; suggestion_id: string | null; video_id: string | null;
 source_url: string | null; title: string | null; desired: string; state: string; automatic: boolean;
 gap_seconds: number; volume: number; position_seconds: number; duration_seconds: number;
 connected: boolean; countdown: number; error: string | null; token?: string;
}
export const obsTime = (seconds: number) => {
 const n = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
 return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`
}
export const obsLabels: Record<string, string> = { idle: 'Pronto para iniciar', loading: 'Carregando vídeo', playing: 'Reproduzindo', paused: 'Pausado', ended: 'Vídeo concluído', countdown: 'Intervalo entre vídeos', error: 'Falha na reprodução', blocked: 'Aguardando interação no OBS' }
