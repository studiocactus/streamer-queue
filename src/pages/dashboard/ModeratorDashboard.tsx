import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { CheckCircle, Settings, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAuthStore } from '@/store/authStore'

type Channel = { id: string; channel_name: string; slug: string; accepting_suggestions: boolean }
type ChannelSettings = { require_approval: boolean; allow_votes: boolean; public_list: boolean; chat_command: string; chat_command_enabled: boolean }

export default function ModeratorDashboard() {
  const { streamerId } = useParams()
  const userId = useAuthStore((state) => state.user?.id)
  const [isAdmin, setIsAdmin] = useState(false)
  const [channel, setChannel] = useState<Channel | null>(null)
  const [settings, setSettings] = useState<ChannelSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      if (!streamerId) return
      setLoading(true)
      const { data: admin } = await supabase.rpc('is_platform_admin', { p_user_id: userId })
      if (active) setIsAdmin(Boolean(admin))
      const { data: channels, error: accessError } = await supabase.rpc('get_my_moderated_channels')
      if (accessError || !channels?.some((item: { id: string }) => item.id === streamerId)) { if (active) { setChannel(null); setSettings(null); setLoading(false) }; return }
      const [{ data: loadedChannel, error: channelError }, { data: loadedSettings, error: settingsError }] = await Promise.all([
        supabase.from('streamers').select('id, channel_name, slug, accepting_suggestions').eq('id', streamerId).maybeSingle(),
        supabase.from('streamer_settings').select('require_approval, allow_votes, public_list, chat_command, chat_command_enabled').eq('streamer_id', streamerId).maybeSingle(),
      ])
      if (!active) return
      if (channelError || settingsError || !loadedChannel || !loadedSettings) { setChannel(null); setSettings(null) } else { setChannel(loadedChannel as Channel); setSettings(loadedSettings as ChannelSettings) }
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [streamerId, userId])

  const save = async () => {
    if (!channel || !settings) return
    const command = `!${settings.chat_command.trim().replace(/^!+/, '').toLowerCase()}`
    if (!/^![a-z0-9][a-z0-9_-]{1,30}$/.test(command)) { toast.error('Use um comando como !sugerir.'); return }
    setSaving(true)
    try {
      const [channelResult, settingsResult] = await Promise.all([
        supabase.from('streamers').update({ accepting_suggestions: channel.accepting_suggestions }).eq('id', channel.id),
        supabase.from('streamer_settings').update({ ...settings, chat_command: command }).eq('streamer_id', channel.id),
      ])
      if (channelResult.error ?? settingsResult.error) throw channelResult.error ?? settingsResult.error
      setSettings({ ...settings, chat_command: command })
      toast.success('Configurações salvas. O streamer foi avisado.')
    } catch (error) { console.error(error); toast.error('Não foi possível salvar as configurações deste canal.') } finally { setSaving(false) }
  }

  if (isAdmin) return <Navigate to={`/dashboard/admin/${streamerId}`} replace />
  if (loading) return <div className="page-section text-content-secondary">Carregando configurações…</div>
  if (!channel || !settings) return <div className="page-section"><EmptyState icon={<ShieldCheck size={24} />} title="Acesso de moderador não encontrado" description="Você só pode administrar os canais para os quais foi escolhido pelo streamer." action={<Link to="/dashboard"><Button>Voltar ao meu painel</Button></Link>} /></div>

  return <div className="page-section"><div className="app-shell max-w-3xl space-y-6">
    <Card><CardHeader><div className="flex items-start gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-purple/10 text-brand-purple"><ShieldCheck size={20} /></span><div><h1 className="font-semibold text-content-primary">Configurações de {channel.channel_name}</h1><p className="mt-1 text-sm text-content-secondary">Você está moderando este canal. Cada alteração é avisada ao streamer.</p></div></div></CardHeader></Card>
    <Card><CardHeader><h2 className="flex items-center gap-2 font-semibold text-content-primary"><Settings size={17} className="text-brand-purple" />Operação do canal</h2></CardHeader><CardContent className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">{[
        ['accepting_suggestions', 'Receber sugestões', 'Permite novas sugestões no site e no chat.'],
        ['require_approval', 'Revisar antes da fila', 'Sugestões precisam ser aprovadas antes de entrar na fila.'],
        ['allow_votes', 'Permitir votos', 'Viewers podem votar nas sugestões.'],
        ['public_list', 'Mostrar lista pública', 'A fila fica visível na página do canal.'],
        ['chat_command_enabled', 'Ativar comando do chat', 'Aceita sugestões pelo comando configurado.'],
      ].map(([key, label, description]) => <label key={key} className="flex cursor-pointer gap-3 rounded-xl border border-border bg-bg-tertiary/45 p-4"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-purple" checked={key === 'accepting_suggestions' ? channel.accepting_suggestions : settings[key as keyof ChannelSettings] as boolean} onChange={(event) => key === 'accepting_suggestions' ? setChannel({ ...channel, accepting_suggestions: event.target.checked }) : setSettings({ ...settings, [key]: event.target.checked })} /><span><span className="block text-sm font-medium text-content-primary">{label}</span><span className="mt-1 block text-xs text-content-muted">{description}</span></span></label>)}</div>
      <Input label="Comando para sugestões" value={settings.chat_command} onChange={(event) => setSettings({ ...settings, chat_command: event.target.value })} hint="Exemplo: !sugerir" />
      <Button loading={saving} onClick={save} leftIcon={<CheckCircle size={15} />}>Salvar configurações</Button>
    </CardContent></Card>
  </div></div>
}
