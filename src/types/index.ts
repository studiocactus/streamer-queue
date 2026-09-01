// ============================================================
// WatchQueue — Tipos TypeScript Globais
// ============================================================

export type Role = 'owner' | 'moderator' | 'viewer'
export type SuggestionStatus = 'pending' | 'approved' | 'queued' | 'watching' | 'completed' | 'rejected'
export type SuggestionCategory = 'movie' | 'series' | 'anime' | 'other'
export type MonetizationMode = 'free' | 'highlight' | 'skip_queue' | 'custom'
export type ChatEventType = 'suggestion_received' | 'suggestion_approved' | 'watching_now' | 'completed'
export type MessageStatus = 'sent' | 'failed' | 'simulated'

// ============================================================
// Profiles
// ============================================================
export interface Profile {
  id: string
  twitch_user_id: string
  twitch_login: string
  display_name: string
  avatar_url: string | null
  created_at: string
  updated_at: string
}

// ============================================================
// Streamers
// ============================================================
export interface Streamer {
  id: string
  owner_id: string
  twitch_broadcaster_id: string | null
  channel_name: string
  slug: string
  avatar_url: string | null
  cover_url: string | null
  bio: string | null
  is_public: boolean
  is_active: boolean
  created_at: string
  updated_at: string
  // Joined
  owner?: Profile
  settings?: StreamerSettings
  member_count?: number
  suggestion_count?: number
  is_live?: boolean
  watching_now?: Suggestion | null
}

// ============================================================
// Streamer Members
// ============================================================
export interface StreamerMember {
  id: string
  streamer_id: string
  user_id: string
  role: Role
  permissions: string[]
  created_at: string
  // Joined
  profile?: Profile
}

// ============================================================
// Suggestions
// ============================================================
export interface Suggestion {
  id: string
  streamer_id: string
  submitted_by: string
  category: SuggestionCategory
  title: string
  description: string | null
  poster_url: string | null
  release_year: number | null
  status: SuggestionStatus
  queue_position: number | null
  rejection_reason: string | null
  submitted_at: string
  approved_at: string | null
  started_at: string | null
  completed_at: string | null
  // Joined
  submitter?: Profile
  vote_count?: number
  user_voted?: boolean
}

// ============================================================
// Votes
// ============================================================
export interface Vote {
  id: string
  streamer_id: string
  suggestion_id: string
  user_id: string
  created_at: string
}

// ============================================================
// Streamer Settings
// ============================================================
export interface StreamerSettings {
  streamer_id: string
  require_approval: boolean
  allow_votes: boolean
  max_suggestions_per_user: number
  public_list: boolean
  chat_notifications_enabled: boolean
  monetization_mode: MonetizationMode
  created_at: string
  updated_at: string
}

// ============================================================
// Twitch Connections
// ============================================================
export interface TwitchConnection {
  id: string
  streamer_id: string
  broadcaster_id: string | null
  bot_user_id: string | null
  scopes: string[]
  token_status: 'active' | 'expired' | 'revoked'
  token_expires_at: string | null
  created_at: string
  updated_at: string
}

// ============================================================
// Chat Message Templates
// ============================================================
export interface ChatMessageTemplate {
  id: string
  streamer_id: string
  event_type: ChatEventType
  template: string
  enabled: boolean
  created_at: string
  updated_at: string
}

// ============================================================
// Chat Message Logs
// ============================================================
export interface ChatMessageLog {
  id: string
  streamer_id: string
  suggestion_id: string | null
  event_type: ChatEventType
  message: string
  status: MessageStatus
  error_message: string | null
  created_at: string
}

// ============================================================
// UI / App Types
// ============================================================
export interface FilterOptions {
  category?: SuggestionCategory | 'all'
  status?: SuggestionStatus | 'all'
  sort?: 'votes' | 'recent' | 'queue'
}

export interface PaginationMeta {
  page: number
  pageSize: number
  total: number
  hasMore: boolean
}

export interface ApiResponse<T> {
  data: T | null
  error: string | null
  loading: boolean
}

export interface ToastOptions {
  type: 'success' | 'error' | 'info' | 'warning'
  message: string
  description?: string
}
