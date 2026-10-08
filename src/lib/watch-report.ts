export const REPORT_TIMEZONE = 'America/Sao_Paulo'
export function reportToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: REPORT_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const get = (type: string) => parts.find(part => part.type === type)!.value
  return `${get('year')}-${get('month')}-${get('day')}`
}
export function shiftReportDate(day: string, days: number): string {
  const date = new Date(day + 'T12:00:00Z')
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
export function formatWatchDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const h = Math.floor(total / 3600), m = Math.floor(total % 3600 / 60), s = total % 60
  return h ? `${h}h ${m}min ${s}s` : m ? `${m}min ${s}s` : `${s}s`
}
export function parseWatchDuration(value: string): number | null {
  const match = /^(?:(\d{1,3}):)?(\d{1,3}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1] ?? 0), minutes = Number(match[2]), seconds = Number(match[3])
  if (seconds >= 60 || (match[1] && minutes >= 60)) return null
  const total = hours * 3600 + minutes * 60 + seconds
  return total > 0 && total <= 604800 ? total : null
}
export function watchDurationInput(seconds: number | null): string {
  if (!seconds) return ''
  return `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}
export function csvCell(value: unknown): string {
  let text = String(value ?? '')
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text
  return '"' + text.replaceAll('"', '""') + '"'
}
