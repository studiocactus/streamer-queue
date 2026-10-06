import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { normalizeOverlayConfig } from '@/lib/overlay'
import { Button } from '@/components/ui/Button'
import type { Streamer } from '@/types'

export function OverlaySettings({ streamer }: { streamer: Streamer }) {
  const [config, setConfig] = useState(() => normalizeOverlayConfig(streamer.overlay_config))
  const [saving, setSaving] = useState(false)
  useEffect(() => { setConfig(normalizeOverlayConfig(streamer.overlay_config)) }, [streamer.id, streamer.overlay_config])
  async function save() {
    setSaving(true)
    try {
      const { data, error } = await supabase.from('streamers').update({ overlay_config: config }).eq('id', streamer.id).select('id').single()
      if (error || !data) throw error ?? new Error('Canal indisponível')
      toast.success('Overlay atualizado. O link do OBS continua o mesmo.')
    } catch { toast.error('Não foi possível salvar o overlay. Tente novamente.') }
    finally { setSaving(false) }
  }
  return <div className="mt-5 space-y-4 border-t border-border pt-4">
    <fieldset disabled={saving} className="space-y-4">
      <legend className="mb-2 text-sm font-medium">Formato do overlay</legend>
      <div className="flex flex-wrap gap-4">{(['horizontal', 'vertical'] as const).map(value => <label key={value} className="flex cursor-pointer items-center gap-2 text-sm"><input type="radio" name={`overlay-format-${streamer.id}`} checked={config.orientation === value} onChange={() => setConfig({ ...config, orientation: value })} className="accent-brand-purple" />{value === 'horizontal' ? 'Horizontal' : 'Vertical'}</label>)}</div>
      <div className="flex flex-wrap gap-6">{([{ key: 'text', label: 'Cor dos textos' }, { key: 'background', label: 'Cor dos fundos' }] as const).map(({ key, label }) => <label key={key} className="flex items-center gap-3 text-sm"><input type="color" value={config[key]} onChange={event => setConfig({ ...config, [key]: event.target.value })} className="h-9 w-12 cursor-pointer rounded border border-border" />{label}</label>)}</div>
    </fieldset>
    <div className="rounded-xl p-4 text-sm" style={{ color: config.text, background: config.background }}><strong>Fila do Streamer — {streamer.channel_name}</strong><p className="mt-2">Assistindo agora · A seguir: 3 próximos da fila</p></div>
    <Button size="sm" disabled={saving} onClick={save}>{saving ? 'Salvando…' : 'Salvar overlay'}</Button>
    <p className="text-xs text-content-muted">No OBS: Fontes → Navegador → cole o link. Tamanho recomendado: {config.orientation === 'vertical' ? '480 × 900' : '1280 × 720'}.</p>
  </div>
}
