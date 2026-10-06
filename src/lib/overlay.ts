export type OverlayConfig = { orientation: 'horizontal' | 'vertical'; text: string; background: string }
export const defaultOverlayConfig: OverlayConfig = { orientation: 'horizontal', text: '#ffffff', background: '#111119' }
export function normalizeOverlayConfig(value: unknown): OverlayConfig {
  const config = (value ?? {}) as Partial<OverlayConfig>
  const color = (value: unknown, fallback: string) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback
  return { orientation: config.orientation === 'vertical' ? 'vertical' : 'horizontal', text: color(config.text, defaultOverlayConfig.text), background: color(config.background, defaultOverlayConfig.background) }
}
