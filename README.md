# WatchQueue 🎬

> **Sua comunidade escolhe. Você decide o que assistir.**

Plataforma multi-streamer onde viewers autenticados com Twitch sugerem filmes, séries, animes e outros conteúdos para streamers assistirem em suas lives.

---

## ✨ Funcionalidades

### Para Streamers
- 📄 Página pública com slug personalizado
- 📋 Kanban de sugestões (Pendente → Aprovado → Na Fila → Assistindo → Concluído → Rejeitado)
- ✅ Aprovação e rejeição de sugestões com motivo
- 🔢 Organização da fila
- 👁️ Status "Assistindo agora" em tempo real
- 📜 Histórico de conteúdos concluídos
- 👮 Moderadores e permissões
- 🔗 Estrutura para integração com chat da Twitch

### Para Viewers
- 🔐 Login seguro com Twitch (OAuth)
- 💡 Envio de sugestões com detecção de duplicatas
- 👍 Sistema de votos (único por sugestão)
- 📊 Dashboard com histórico de sugestões e votos
- ⚡ Atualizações em tempo real (Supabase Realtime)

---

## 🏗️ Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Estilos | Tailwind CSS v3 |
| Roteamento | React Router v6 |
| Estado | Zustand |
| Backend/DB | Supabase (Postgres + RLS + Realtime) |
| Auth | Supabase Auth + Twitch OAuth (Edge Functions) |
| Deploy | Vercel |
| Icons | Lucide React |
| Toasts | Sonner |

---

## 🚀 Configuração Local

### Pré-requisitos
- Node.js 18+
- Conta [Supabase](https://supabase.com)
- Conta [Vercel](https://vercel.com)
- App [Twitch Developer](https://dev.twitch.tv/console) (opcional para modo demo)

### 1. Clonar e instalar

```bash
git clone https://github.com/SEU_USER/streamer-queue.git
cd streamer-queue
npm install
```

### 2. Variáveis de ambiente

```bash
cp .env.example .env
```

Edite `.env` com suas credenciais:

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

### 3. Executar o banco de dados

No [SQL Editor do Supabase](https://supabase.com/dashboard/project/_/sql), execute em ordem:

```
supabase/migrations/0001_initial_schema.sql
supabase/migrations/0002_rls_policies.sql
supabase/migrations/0003_functions.sql
```

### 4. Rodar localmente

```bash
npm run dev
```

Acesse: `http://localhost:5173`

---

## 🗄️ Banco de Dados

### Migrations (execute no SQL Editor do Supabase)

| Arquivo | Descrição |
|---------|-----------|
| `0001_initial_schema.sql` | Tabelas, índices, triggers |
| `0002_rls_policies.sql` | Row Level Security completo |
| `0003_functions.sql` | Funções SQL utilitárias |
| `seed.sql` | Dados demo (opcional, apenas dev) |

### Tabelas principais

- `profiles` — Perfis dos usuários (sincronizado da Twitch)
- `streamers` — Canais dos streamers
- `streamer_members` — Moderadores e permissões
- `suggestions` — Sugestões de conteúdo
- `votes` — Votos (único por usuário por sugestão)
- `streamer_settings` — Configurações do canal
- `twitch_connections` — Status da integração Twitch
- `chat_message_templates` — Modelos de mensagem ao chat
- `chat_message_logs` — Logs de envio

---

## 🔐 Autenticação Twitch

A autenticação usa **Supabase Edge Functions** como proxy seguro. O `client_secret` nunca fica no frontend.

### Configurar Edge Functions

1. Instale o [Supabase CLI](https://supabase.com/docs/guides/cli)
2. Faça login: `supabase login`
3. Link ao projeto: `supabase link --project-ref pmfbtoagldevawlbsiuq`
4. Configure os secrets:

```bash
supabase secrets set TWITCH_CLIENT_ID=seu_client_id
supabase secrets set TWITCH_CLIENT_SECRET=seu_client_secret
supabase secrets set TWITCH_REDIRECT_URI=https://pmfbtoagldevawlbsiuq.supabase.co/functions/v1/twitch-auth/callback
supabase secrets set APP_URL=https://seu-app.vercel.app
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key
```

5. Deploy das functions:

```bash
supabase functions deploy twitch-auth
supabase functions deploy twitch-chat
```

### Configurar App Twitch

1. Acesse [dev.twitch.tv/console](https://dev.twitch.tv/console)
2. Crie um novo app
3. Em **OAuth Redirect URLs**, adicione:
   ```
   https://pmfbtoagldevawlbsiuq.supabase.co/functions/v1/twitch-auth/callback
   ```
4. Anote o **Client ID** e gere o **Client Secret**

> ⚠️ Sem as credenciais Twitch, o login mostrará um erro de configuração. O restante da plataforma funciona em modo demonstrativo.

---

## 🌐 Deploy na Vercel

### Variáveis de ambiente na Vercel

Configure apenas as variáveis **públicas** (prefixo `VITE_`):

| Variável | Descrição |
|----------|-----------|
| `VITE_SUPABASE_URL` | URL do seu projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Chave pública do Supabase |

> 🚫 **NUNCA** configure `TWITCH_CLIENT_SECRET` ou `SUPABASE_SERVICE_ROLE_KEY` na Vercel. Esses secrets ficam apenas nas Edge Functions.

### Build settings

| Campo | Valor |
|-------|-------|
| Framework Preset | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm install` |

---

## 📁 Estrutura do Projeto

```
streamer-queue/
├── src/
│   ├── components/
│   │   ├── layout/       # Header, Footer, ProtectedRoute
│   │   └── ui/           # Button, Card, Badge, Skeleton, Avatar, Input, Modal, EmptyState
│   ├── hooks/
│   │   ├── useSuggestions.ts   # Sugestões, votos, realtime
│   │   └── useStreamer.ts      # Dados de streamers
│   ├── lib/
│   │   ├── supabase.ts         # Cliente Supabase
│   │   ├── utils.ts            # Utilitários
│   │   └── database.types.ts   # Tipos do banco
│   ├── pages/
│   │   ├── Landing.tsx
│   │   ├── Explore.tsx
│   │   ├── StreamerPage.tsx
│   │   ├── AuthCallback.tsx
│   │   └── dashboard/
│   │       ├── ViewerDashboard.tsx
│   │       └── StreamerDashboard.tsx
│   ├── store/
│   │   └── authStore.ts        # Zustand auth store
│   ├── types/
│   │   └── index.ts            # Tipos TypeScript globais
│   └── App.tsx                 # Roteamento principal
├── supabase/
│   ├── migrations/
│   │   ├── 0001_initial_schema.sql
│   │   ├── 0002_rls_policies.sql
│   │   └── 0003_functions.sql
│   ├── functions/
│   │   ├── twitch-auth/        # OAuth Twitch
│   │   └── twitch-chat/        # Mensagens ao chat
│   └── seed.sql                # Dados demo (dev only)
├── .env.example
├── vercel.json
└── README.md
```

---

## 🔮 Próximos Passos

- [ ] Deploy das Edge Functions Twitch
- [ ] Configurar credenciais Twitch
- [ ] Executar migrations no Supabase
- [ ] Configurar domínio customizado na Vercel
- [ ] Implementar drag-and-drop no Kanban
- [ ] Notificações em tempo real no dashboard
- [ ] Configurações completas do canal (aparência, regras)
- [ ] Sistema de monetização (highlight/skip_queue)
- [ ] Integração real com chat da Twitch (bot)
- [ ] Métricas e analytics do canal

---

## 🛡️ Segurança

- RLS ativado em **todas** as tabelas
- Tokens Twitch nunca expostos ao frontend
- Secrets apenas em variáveis de ambiente das Edge Functions
- CSRF protection no fluxo OAuth
- `.env` ignorado pelo Git

---

## 📄 Licença

MIT © WatchQueue
