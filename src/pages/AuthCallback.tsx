import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { normalizeStreamerReturnPath } from '@/lib/routes'
import { useAuthStore } from '@/store/authStore'

export default function AuthCallback() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { initialize } = useAuthStore()

  const error = params.get('error')
  const message = params.get('message')
  const requestedReturnTo = params.get('return_to')
  const returnTo = normalizeStreamerReturnPath(requestedReturnTo) ?? '/dashboard'

  useEffect(() => {
    const handleCallback = async () => {
      // O Supabase processa automaticamente o hash/token na URL
      const { data, error: sessionError } = await supabase.auth.getSession()

      if (sessionError || !data.session) {
        // Aguardar um momento e tentar novamente (pode ser redirect com hash)
        setTimeout(async () => {
          await initialize()
          const { data: retryData } = await supabase.auth.getSession()
          if (retryData.session) {
            await initialize()
            navigate(returnTo, { replace: true })
          } else {
            navigate('/?auth=failed', { replace: true })
          }
        }, 2000)
        return
      }

      await initialize()
      navigate(returnTo, { replace: true })
    }

    if (!error) {
      handleCallback()
    }
  }, [error, initialize, navigate, returnTo])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-bg-secondary p-5 text-center sm:p-8">
          <div className="w-14 h-14 rounded-2xl bg-status-rejected/10 border border-status-rejected/20 flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={28} className="text-status-rejected" />
          </div>
          <h1 className="text-lg font-bold text-content-primary mb-2">Erro na autenticação</h1>
          <p className="text-sm text-content-secondary mb-6">
            {error === 'twitch_not_configured'
              ? 'A integração com Twitch ainda não está configurada. Aguardando as credenciais.'
              : error === 'access_denied'
              ? 'Acesso negado. Você cancelou a autorização.'
              : message ?? 'Ocorreu um erro ao autenticar com a Twitch.'}
          </p>
          <button
            onClick={() => navigate('/')}
            className="text-brand-purple text-sm font-medium hover:underline"
          >
            Voltar ao início
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-14 h-14 rounded-2xl bg-brand-purple/10 border border-brand-purple/20 flex items-center justify-center mx-auto mb-4">
          <Loader2 size={28} className="text-brand-purple animate-spin" />
        </div>
        <h1 className="text-lg font-bold text-content-primary mb-2">Autenticando...</h1>
        <p className="text-sm text-content-secondary">Verificando sua conta Twitch.</p>
      </div>
    </div>
  )
}
