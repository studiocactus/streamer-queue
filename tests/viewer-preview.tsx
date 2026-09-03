// Development-only fixture. Never uses a real account or writes to Supabase.
import React from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom'
import { Toaster } from 'sonner'
import '../src/index.css'
import { supabase } from '../src/lib/supabase'
import { useAuthStore } from '../src/store/authStore'
import ViewerDashboard from '../src/pages/dashboard/ViewerDashboard'
import ViewerProfile from '../src/pages/ViewerProfile'

let fixture = {
  id: 'fixture-viewer', twitch_user_id: 'fixture', twitch_login: 'viewer_teste',
  display_name: 'Viewer de teste', avatar_url: null, bio: 'Descrição de teste com texto longo. '.repeat(10),
  social_links: { instagram: 'https://instagram.com/viewer_teste' }, created_at: '', updated_at: '',
}
const channels = [{ channel_name: 'Canal de teste com nome muito longo para conferir o espaço', slug: 'canal-teste', avatar_url: null }]
let fail = false
supabase.rpc = (async () => fail ? { data: null, error: new Error('Simulated outage') } : { data: [{ ...fixture, moderated_channels: channels }], error: null }) as never
supabase.from = ((table: string) => {
  let values: object | undefined
  const query: any = {
    select: () => query, eq: () => query, order: () => query, limit: () => query,
    update: (next: object) => { values = next; return query },
    then: (resolve: (value: unknown) => unknown) => {
      if (values && table === 'profiles') fixture = { ...fixture, ...values }
      const suggestion = { id: 'fixture-suggestion', title: 'Conteúdo fictício com título longo para teste', category: 'movie', status: 'approved', submitted_at: new Date().toISOString(),
        poster_url: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#9146ff"/><circle cx="100" cy="150" r="60" fill="#b6e336"/></svg>'),
        streamer: { channel_name: 'Canal de teste', slug: 'canal-teste' }, votes: [] }
      return Promise.resolve({ data: table === 'suggestions' ? [suggestion] : [], count: 0, error: null }).then(resolve)
    },
  }
  return query
}) as never
useAuthStore.setState({ profile: fixture, streamerProfile: null, isLoading: false, isInitialized: true,
  refreshProfile: async () => { useAuthStore.setState({ profile: { ...fixture } }) },
})
createRoot(document.getElementById('root')!).render(<MemoryRouter><div className="p-3 text-sm text-content-primary flex flex-wrap gap-4"><strong>PRÉVIA LOCAL · DADOS FICTÍCIOS</strong><Link to="/">Painel</Link><Link to="/viewer/viewer_teste">Perfil</Link><button onClick={() => { fail = !fail }}>Alternar falha de rede</button></div><Toaster /><Routes><Route path="/" element={<ViewerDashboard />} /><Route path="/viewer/:login" element={<ViewerProfile />} /><Route path="/:slug" element={<p>Canal fictício acessado</p>} /></Routes></MemoryRouter>)
