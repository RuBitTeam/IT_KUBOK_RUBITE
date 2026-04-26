export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      categories: {
        Row: {
          color: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          name: string
          social_account_ids: string[]
          sort_order: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          name: string
          social_account_ids?: string[]
          sort_order?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          name?: string
          social_account_ids?: string[]
          sort_order?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_messages: {
        Row: {
          action: string
          content: string
          created_at: string
          data: Json
          id: string
          role: string
          session_id: string
          user_id: string
        }
        Insert: {
          action?: string
          content?: string
          created_at?: string
          data?: Json
          id?: string
          role: string
          session_id: string
          user_id: string
        }
        Update: {
          action?: string
          content?: string
          created_at?: string
          data?: Json
          id?: string
          role?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creative_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "creative_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_sessions: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      creative_sources: {
        Row: {
          created_at: string
          id: string
          label: string | null
          platform: string | null
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          platform?: string | null
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          platform?: string | null
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      media_assets: {
        Row: {
          bucket_path: string
          created_at: string
          file_name: string
          id: string
          mime_type: string | null
          owner_id: string
          public_url: string
          size_bytes: number | null
        }
        Insert: {
          bucket_path: string
          created_at?: string
          file_name: string
          id?: string
          mime_type?: string | null
          owner_id: string
          public_url: string
          size_bytes?: number | null
        }
        Update: {
          bucket_path?: string
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string | null
          owner_id?: string
          public_url?: string
          size_bytes?: number | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          post_id: string | null
          read: boolean
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          post_id?: string | null
          read?: boolean
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          post_id?: string | null
          read?: boolean
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_analytics: {
        Row: {
          id: string
          post_id: string
          reactions: number
          recorded_at: string
          views: number
        }
        Insert: {
          id?: string
          post_id: string
          reactions?: number
          recorded_at?: string
          views?: number
        }
        Update: {
          id?: string
          post_id?: string
          reactions?: number
          recorded_at?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "post_analytics_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_groups: {
        Row: {
          category_id: string | null
          created_at: string
          created_by: string | null
          id: string
          publish_date: string | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          publish_date?: string | null
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          publish_date?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_groups_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_groups_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      post_task_watchers: {
        Row: {
          created_at: string
          id: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_task_watchers_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "post_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      post_tasks: {
        Row: {
          assignee_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string
          deadline: string | null
          description: string
          id: string
          post_id: string | null
          reminder_24h_sent: boolean
          reminder_dayof_sent: boolean
          status: Database["public"]["Enums"]["task_status"]
          task_role: Database["public"]["Enums"]["task_role"]
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assignee_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by: string
          deadline?: string | null
          description?: string
          id?: string
          post_id?: string | null
          reminder_24h_sent?: boolean
          reminder_dayof_sent?: boolean
          status?: Database["public"]["Enums"]["task_status"]
          task_role?: Database["public"]["Enums"]["task_role"]
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assignee_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string
          deadline?: string | null
          description?: string
          id?: string
          post_id?: string | null
          reminder_24h_sent?: boolean
          reminder_dayof_sent?: boolean
          status?: Database["public"]["Enums"]["task_status"]
          task_role?: Database["public"]["Enums"]["task_role"]
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_tasks_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      post_variants: {
        Row: {
          content: string
          created_at: string
          error_log: string | null
          group_id: string
          id: string
          media_url: string | null
          platform: Database["public"]["Enums"]["social_platform"]
          publish_date: string | null
          published_at: string | null
          social_account_id: string | null
          status: Database["public"]["Enums"]["post_status"]
          updated_at: string
        }
        Insert: {
          content?: string
          created_at?: string
          error_log?: string | null
          group_id: string
          id?: string
          media_url?: string | null
          platform: Database["public"]["Enums"]["social_platform"]
          publish_date?: string | null
          published_at?: string | null
          social_account_id?: string | null
          status?: Database["public"]["Enums"]["post_status"]
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          error_log?: string | null
          group_id?: string
          id?: string
          media_url?: string | null
          platform?: Database["public"]["Enums"]["social_platform"]
          publish_date?: string | null
          published_at?: string | null
          social_account_id?: string | null
          status?: Database["public"]["Enums"]["post_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_variants_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "post_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_variants_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          author_id: string
          category_id: string | null
          content: string
          created_at: string
          error_log: string | null
          external_post_ids: Json
          group_id: string | null
          id: string
          is_draft: boolean
          media_url: string | null
          platform: Database["public"]["Enums"]["platform_type"]
          publish_date: string | null
          published_at: string | null
          retries: number
          social_account_id: string | null
          sort_order: number
          status: Database["public"]["Enums"]["post_status"]
          suggested_post_id: string | null
          tags: string[]
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          author_id: string
          category_id?: string | null
          content?: string
          created_at?: string
          error_log?: string | null
          external_post_ids?: Json
          group_id?: string | null
          id?: string
          is_draft?: boolean
          media_url?: string | null
          platform?: Database["public"]["Enums"]["platform_type"]
          publish_date?: string | null
          published_at?: string | null
          retries?: number
          social_account_id?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["post_status"]
          suggested_post_id?: string | null
          tags?: string[]
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          author_id?: string
          category_id?: string | null
          content?: string
          created_at?: string
          error_log?: string | null
          external_post_ids?: Json
          group_id?: string | null
          id?: string
          is_draft?: boolean
          media_url?: string | null
          platform?: Database["public"]["Enums"]["platform_type"]
          publish_date?: string | null
          published_at?: string | null
          retries?: number
          social_account_id?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["post_status"]
          suggested_post_id?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "post_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          position: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          position?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          position?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      social_accounts: {
        Row: {
          created_at: string
          display_name: string
          encrypted_token: string
          id: string
          last_checked_at: string | null
          last_error: string | null
          meta: Json
          owner_id: string
          platform: Database["public"]["Enums"]["social_platform"]
          status: Database["public"]["Enums"]["social_account_status"]
          target_chat: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          encrypted_token: string
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          meta?: Json
          owner_id: string
          platform: Database["public"]["Enums"]["social_platform"]
          status?: Database["public"]["Enums"]["social_account_status"]
          target_chat: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          encrypted_token?: string
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          meta?: Json
          owner_id?: string
          platform?: Database["public"]["Enums"]["social_platform"]
          status?: Database["public"]["Enums"]["social_account_status"]
          target_chat?: string
          updated_at?: string
        }
        Relationships: []
      }
      suggested_posts: {
        Row: {
          author_id: string
          converted_post_id: string | null
          created_at: string
          id: string
          media: string[]
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["suggestion_status"]
          text: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          author_id: string
          converted_post_id?: string | null
          created_at?: string
          id?: string
          media?: string[]
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["suggestion_status"]
          text?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          author_id?: string
          converted_post_id?: string | null
          created_at?: string
          id?: string
          media?: string[]
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["suggestion_status"]
          text?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      templates: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          type: Database["public"]["Enums"]["template_type"]
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          type: Database["public"]["Enums"]["template_type"]
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          type?: Database["public"]["Enums"]["template_type"]
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workspace_invites: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          max_uses: number | null
          revoked: boolean
          role: Database["public"]["Enums"]["workspace_role"]
          token: string
          uses: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          revoked?: boolean
          role?: Database["public"]["Enums"]["workspace_role"]
          token: string
          uses?: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          revoked?: boolean
          role?: Database["public"]["Enums"]["workspace_role"]
          token?: string
          uses?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invites_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_social_accounts: {
        Row: {
          added_by: string | null
          created_at: string
          id: string
          social_account_id: string
          workspace_id: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          id?: string
          social_account_id: string
          workspace_id: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          id?: string
          social_account_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_social_accounts_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_social_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_users: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_users_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          description: string
          id: string
          name: string
          owner_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          name: string
          owner_id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          name?: string
          owner_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_admin_workspace: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      can_edit_workspace: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      is_workspace_owner: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      workspace_of_group: { Args: { _group_id: string }; Returns: string }
      workspace_of_task: { Args: { _task_id: string }; Returns: string }
      workspace_role_of: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: Database["public"]["Enums"]["workspace_role"]
      }
    }
    Enums: {
      app_role: "admin" | "editor" | "viewer"
      notification_type:
        | "scheduled"
        | "draft_reminder"
        | "published"
        | "failed"
        | "suggestion"
        | "task"
      platform_type: "vk" | "telegram" | "instagram" | "youtube" | "other"
      post_status: "draft" | "scheduled" | "published" | "failed"
      social_account_status: "connected" | "disconnected" | "error"
      social_platform: "vk" | "telegram"
      suggestion_status: "pending" | "approved" | "rejected"
      task_role: "copywriter" | "designer" | "other"
      task_status: "open" | "done"
      template_type: "announcement" | "results" | "vacancy" | "grant"
      workspace_role: "owner" | "admin" | "editor" | "viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "editor", "viewer"],
      notification_type: [
        "scheduled",
        "draft_reminder",
        "published",
        "failed",
        "suggestion",
        "task",
      ],
      platform_type: ["vk", "telegram", "instagram", "youtube", "other"],
      post_status: ["draft", "scheduled", "published", "failed"],
      social_account_status: ["connected", "disconnected", "error"],
      social_platform: ["vk", "telegram"],
      suggestion_status: ["pending", "approved", "rejected"],
      task_role: ["copywriter", "designer", "other"],
      task_status: ["open", "done"],
      template_type: ["announcement", "results", "vacancy", "grant"],
      workspace_role: ["owner", "admin", "editor", "viewer"],
    },
  },
} as const
