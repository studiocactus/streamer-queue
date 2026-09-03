// Tipos gerados do schema Supabase — serão substituídos pelo CLI quando disponível
// Por ora, usamos uma definição manual compatível

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          twitch_user_id: string
          twitch_login: string
          display_name: string
          avatar_url: string | null
          bio: string | null
          social_links: Record<string, string>
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          twitch_user_id: string
          twitch_login: string
          display_name: string
          avatar_url?: string | null
          bio?: string | null
          social_links?: Record<string, string>
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          twitch_user_id?: string
          twitch_login?: string
          display_name?: string
          avatar_url?: string | null
          bio?: string | null
          social_links?: Record<string, string>
          updated_at?: string
        }
      }
      streamers: {
        Row: {
          id: string
          owner_id: string
          twitch_broadcaster_id: string | null
          channel_name: string
          slug: string
          avatar_url: string | null
          cover_url: string | null
          bio: string | null
          profile_theme: string
          social_links: Record<string, string>
          is_public: boolean
          is_active: boolean
          accepting_suggestions: boolean
          is_live: boolean
          live_started_at: string | null
          live_status_updated_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          owner_id: string
          twitch_broadcaster_id?: string | null
          channel_name: string
          slug: string
          avatar_url?: string | null
          cover_url?: string | null
          bio?: string | null
          profile_theme?: string
          social_links?: Record<string, string>
          is_public?: boolean
          is_active?: boolean
          accepting_suggestions?: boolean
          is_live?: boolean
          live_started_at?: string | null
          live_status_updated_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          owner_id?: string
          twitch_broadcaster_id?: string | null
          channel_name?: string
          slug?: string
          avatar_url?: string | null
          cover_url?: string | null
          bio?: string | null
          profile_theme?: string
          social_links?: Record<string, string>
          is_public?: boolean
          is_active?: boolean
          accepting_suggestions?: boolean
          is_live?: boolean
          live_started_at?: string | null
          live_status_updated_at?: string | null
          updated_at?: string
        }
      }
      streamer_members: {
        Row: {
          id: string
          streamer_id: string
          user_id: string
          role: string
          permissions: string[]
          created_at: string
        }
        Insert: {
          id?: string
          streamer_id: string
          user_id: string
          role: string
          permissions?: string[]
          created_at?: string
        }
        Update: {
          role?: string
          permissions?: string[]
        }
      }
      platform_admins: {
        Row: { user_id: string; created_at: string }
        Insert: { user_id: string; created_at?: string }
        Update: Record<string, never>
      }
      suggestions: {
        Row: {
          id: string
          streamer_id: string
          submitted_by: string | null
          category: string
          title: string
          description: string | null
          poster_url: string | null
          release_year: number | null
          source_url: string | null
          status: string
          queue_position: number | null
          rejection_reason: string | null
          submitted_at: string
          approved_at: string | null
          started_at: string | null
          completed_at: string | null
          submission_source: string
          submission_priority: number
          chat_user_id: string | null
          chat_user_login: string | null
          chat_display_name: string | null
        }
        Insert: {
          id?: string
          streamer_id: string
          submitted_by?: string | null
          category: string
          title: string
          description?: string | null
          poster_url?: string | null
          release_year?: number | null
          source_url?: string | null
          status?: string
          queue_position?: number | null
          rejection_reason?: string | null
          submitted_at?: string
          approved_at?: string | null
          started_at?: string | null
          completed_at?: string | null
          submission_source?: string
          submission_priority?: number
          chat_user_id?: string | null
          chat_user_login?: string | null
          chat_display_name?: string | null
        }
        Update: {
          category?: string
          title?: string
          description?: string | null
          poster_url?: string | null
          release_year?: number | null
          source_url?: string | null
          status?: string
          queue_position?: number | null
          rejection_reason?: string | null
          approved_at?: string | null
          started_at?: string | null
          completed_at?: string | null
          submission_source?: string
          submission_priority?: number
          chat_user_id?: string | null
          chat_user_login?: string | null
          chat_display_name?: string | null
        }
      }
      votes: {
        Row: {
          id: string
          streamer_id: string
          suggestion_id: string
          user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          streamer_id: string
          suggestion_id: string
          user_id: string
          created_at?: string
        }
        Update: Record<string, never>
      }
      streamer_notifications: {
        Row: {
          id: string
          streamer_id: string
          user_id: string | null
          suggestion_id: string | null
          type: string
          title: string
          message: string
          target_path: string | null
          read_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          streamer_id: string
          user_id?: string | null
          suggestion_id?: string | null
          type?: string
          title: string
          message: string
          target_path?: string | null
          read_at?: string | null
          created_at?: string
        }
        Update: {
          read_at?: string | null
        }
      }
      streamer_settings: {
        Row: {
          streamer_id: string
          require_approval: boolean
          allow_votes: boolean
          max_suggestions_per_user: number
          public_list: boolean
          chat_notifications_enabled: boolean
          chat_command: string
          chat_command_enabled: boolean
          monetization_mode: string
          created_at: string
          updated_at: string
        }
        Insert: {
          streamer_id: string
          require_approval?: boolean
          allow_votes?: boolean
          max_suggestions_per_user?: number
          public_list?: boolean
          chat_notifications_enabled?: boolean
          chat_command?: string
          chat_command_enabled?: boolean
          monetization_mode?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          require_approval?: boolean
          allow_votes?: boolean
          max_suggestions_per_user?: number
          public_list?: boolean
          chat_notifications_enabled?: boolean
          chat_command?: string
          chat_command_enabled?: boolean
          monetization_mode?: string
          updated_at?: string
        }
      }
      twitch_connections: {
        Row: {
          id: string
          streamer_id: string
          broadcaster_id: string | null
          bot_user_id: string | null
          scopes: string[]
          token_status: string
          token_expires_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          streamer_id: string
          broadcaster_id?: string | null
          bot_user_id?: string | null
          scopes?: string[]
          token_status?: string
          token_expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          broadcaster_id?: string | null
          bot_user_id?: string | null
          scopes?: string[]
          token_status?: string
          token_expires_at?: string | null
          updated_at?: string
        }
      }
      chat_message_templates: {
        Row: {
          id: string
          streamer_id: string
          event_type: string
          template: string
          enabled: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          streamer_id: string
          event_type: string
          template: string
          enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          template?: string
          enabled?: boolean
          updated_at?: string
        }
      }
      chat_message_logs: {
        Row: {
          id: string
          streamer_id: string
          suggestion_id: string | null
          event_type: string
          message: string
          status: string
          error_message: string | null
          created_at: string
        }
        Insert: {
          id?: string
          streamer_id: string
          suggestion_id?: string | null
          event_type: string
          message: string
          status: string
          error_message?: string | null
          created_at?: string
        }
        Update: Record<string, never>
      }
      chat_delivery_queue: {
        Row: {
          id: string
          streamer_id: string
          suggestion_id: string
          event_type: string
          status: 'pending' | 'processing' | 'sent' | 'failed' | 'skipped'
          attempts: number
          max_attempts: number
          next_attempt_at: string
          locked_at: string | null
          processed_at: string | null
          last_error: string | null
          created_at: string
          updated_at: string
        }
        Insert: Record<string, never>
        Update: Record<string, never>
      }
    }
    Views: Record<string, never>
    Functions: {
      get_platform_stats: {
        Args: Record<string, never>
        Returns: { users_count: number; streamers_count: number }[]
      }
      get_streamer_by_slug: {
        Args: { p_slug: string }
        Returns: {
          id: string
          slug: string
          channel_name: string
        }[]
      }
      promote_viewer_to_streamer: {
        Args: { p_user_id: string }
        Returns: string
      }
      retry_failed_chat_deliveries: {
        Args: { p_streamer_id: string }
        Returns: number
      }
      reorder_queue: {
        Args: { p_streamer_id: string; p_suggestion_id: string; p_new_position: number }
        Returns: undefined
      }
      advance_streamer_queue: {
        Args: { p_streamer_id: string }
        Returns: string | null
      }
      get_public_viewer_profile: {
        Args: { p_login: string }
        Returns: {
          id: string
          twitch_login: string
          display_name: string
          avatar_url: string | null
          bio: string | null
          social_links: Record<string, string>
          moderated_channels: { channel_name: string; slug: string; avatar_url: string | null }[]
        }[]
      }
    }
    Enums: Record<string, never>
  }
}
