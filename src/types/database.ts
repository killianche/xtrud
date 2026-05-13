// AUTO-GENERATED Supabase database types.
//
// Регенерация после изменения схемы:
//   mcp__60860ed0-af83-4b0e-869b-1e21dbf91dac__generate_typescript_types
// или CLI:
//   npx supabase gen types typescript --project-id wgeimsajvjkzrrnfrnkb > src/types/database.ts

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
      categories_l1: {
        Row: {
          cover_image_url: string | null
          created_at: string
          icon: string
          id: string
          is_active: boolean
          name_ru: string
          sort_order: number
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          icon: string
          id: string
          is_active?: boolean
          name_ru: string
          sort_order?: number
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          icon?: string
          id?: string
          is_active?: boolean
          name_ru?: string
          sort_order?: number
        }
        Relationships: []
      }
      categories_l2: {
        Row: {
          cover_image_url: string | null
          created_at: string
          icon: string
          id: string
          is_active: boolean
          is_visible: boolean
          l1_id: string
          name_ru: string
          sort_order: number
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          icon: string
          id: string
          is_active?: boolean
          is_visible?: boolean
          l1_id: string
          name_ru: string
          sort_order?: number
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          icon?: string
          id?: string
          is_active?: boolean
          is_visible?: boolean
          l1_id?: string
          name_ru?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "categories_l2_l1_id_fkey"
            columns: ["l1_id"]
            isOneToOne: false
            referencedRelation: "categories_l1"
            referencedColumns: ["id"]
          },
        ]
      }
      categories_l3: {
        Row: {
          avg_check_rub: number | null
          created_at: string
          icon: string | null
          id: string
          is_active: boolean
          l2_id: string
          name_ru: string
          requires_license: boolean
          seasonality: Database["public"]["Enums"]["category_seasonality"]
          sort_order: number
          urgency_typical: Database["public"]["Enums"]["category_urgency"]
        }
        Insert: {
          avg_check_rub?: number | null
          created_at?: string
          icon?: string | null
          id: string
          is_active?: boolean
          l2_id: string
          name_ru: string
          requires_license?: boolean
          seasonality?: Database["public"]["Enums"]["category_seasonality"]
          sort_order?: number
          urgency_typical?: Database["public"]["Enums"]["category_urgency"]
        }
        Update: {
          avg_check_rub?: number | null
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          l2_id?: string
          name_ru?: string
          requires_license?: boolean
          seasonality?: Database["public"]["Enums"]["category_seasonality"]
          sort_order?: number
          urgency_typical?: Database["public"]["Enums"]["category_urgency"]
        }
        Relationships: [
          {
            foreignKeyName: "categories_l3_l2_id_fkey"
            columns: ["l2_id"]
            isOneToOne: false
            referencedRelation: "categories_l2"
            referencedColumns: ["id"]
          },
        ]
      }
      chats: {
        Row: {
          client_id: string
          created_at: string
          id: string
          last_message_at: string | null
          last_read_client_at: string | null
          last_read_master_at: string | null
          master_id: string
          order_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          last_message_at?: string | null
          last_read_client_at?: string | null
          last_read_master_at?: string | null
          master_id: string
          order_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          last_message_at?: string | null
          last_read_client_at?: string | null
          last_read_master_at?: string | null
          master_id?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chats_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chats_master_id_fkey"
            columns: ["master_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chats_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      cities: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          region: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id: string
          is_active?: boolean
          name: string
          region?: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          region?: string
          sort_order?: number
        }
        Relationships: []
      }
      master_categories: {
        Row: {
          attributes: Json
          category_bio: string | null
          category_radius_km: number | null
          closed_deals: number
          created_at: string
          id: string
          l2_id: string
          l3_ids: string[]
          master_id: string
          pricing: Json
          pricing_mode: Database["public"]["Enums"]["master_pricing_mode"]
          rating_avg: number | null
          rating_count: number
          updated_at: string
        }
        Insert: {
          attributes?: Json
          category_bio?: string | null
          category_radius_km?: number | null
          closed_deals?: number
          created_at?: string
          id?: string
          l2_id: string
          l3_ids?: string[]
          master_id: string
          pricing?: Json
          pricing_mode?: Database["public"]["Enums"]["master_pricing_mode"]
          rating_avg?: number | null
          rating_count?: number
          updated_at?: string
        }
        Update: {
          attributes?: Json
          category_bio?: string | null
          category_radius_km?: number | null
          closed_deals?: number
          created_at?: string
          id?: string
          l2_id?: string
          l3_ids?: string[]
          master_id?: string
          pricing?: Json
          pricing_mode?: Database["public"]["Enums"]["master_pricing_mode"]
          rating_avg?: number | null
          rating_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "master_categories_l2_id_fkey"
            columns: ["l2_id"]
            isOneToOne: false
            referencedRelation: "categories_l2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "master_categories_master_id_fkey"
            columns: ["master_id"]
            isOneToOne: false
            referencedRelation: "master_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      master_profiles: {
        Row: {
          account_type: Database["public"]["Enums"]["master_account_type"]
          bio: string | null
          closed_deals: number
          created_at: string
          experience_years: number | null
          has_tools: boolean
          has_transport: boolean
          home_clients_policy:
            | Database["public"]["Enums"]["home_clients_policy"]
            | null
          inn: string | null
          languages: string[]
          legal_name: string | null
          ogrn: string | null
          rating_overall_avg: number | null
          rating_overall_count: number
          service_radius_km: number
          status: Database["public"]["Enums"]["master_status"]
          tax_status: Database["public"]["Enums"]["tax_status"] | null
          team_size: number
          updated_at: string
          user_id: string
          verification_level: number
          work_schedule: Json
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["master_account_type"]
          bio?: string | null
          closed_deals?: number
          created_at?: string
          experience_years?: number | null
          has_tools?: boolean
          has_transport?: boolean
          home_clients_policy?:
            | Database["public"]["Enums"]["home_clients_policy"]
            | null
          inn?: string | null
          languages?: string[]
          legal_name?: string | null
          ogrn?: string | null
          rating_overall_avg?: number | null
          rating_overall_count?: number
          service_radius_km?: number
          status?: Database["public"]["Enums"]["master_status"]
          tax_status?: Database["public"]["Enums"]["tax_status"] | null
          team_size?: number
          updated_at?: string
          user_id: string
          verification_level?: number
          work_schedule?: Json
        }
        Update: {
          account_type?: Database["public"]["Enums"]["master_account_type"]
          bio?: string | null
          closed_deals?: number
          created_at?: string
          experience_years?: number | null
          has_tools?: boolean
          has_transport?: boolean
          home_clients_policy?:
            | Database["public"]["Enums"]["home_clients_policy"]
            | null
          inn?: string | null
          languages?: string[]
          legal_name?: string | null
          ogrn?: string | null
          rating_overall_avg?: number | null
          rating_overall_count?: number
          service_radius_km?: number
          status?: Database["public"]["Enums"]["master_status"]
          tax_status?: Database["public"]["Enums"]["tax_status"] | null
          team_size?: number
          updated_at?: string
          user_id?: string
          verification_level?: number
          work_schedule?: Json
        }
        Relationships: [
          {
            foreignKeyName: "master_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      master_services: {
        Row: {
          created_at: string
          id: string
          master_id: string
          position: number
          price_max: number | null
          price_min: number
          title: string
          unit: Database["public"]["Enums"]["service_unit"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          master_id: string
          position?: number
          price_max?: number | null
          price_min: number
          title: string
          unit?: Database["public"]["Enums"]["service_unit"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          master_id?: string
          position?: number
          price_max?: number | null
          price_min?: number
          title?: string
          unit?: Database["public"]["Enums"]["service_unit"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "master_services_master_id_fkey"
            columns: ["master_id"]
            isOneToOne: false
            referencedRelation: "master_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      messages: {
        Row: {
          chat_id: string
          created_at: string
          id: string
          read_at: string | null
          sender_id: string
          text: string
        }
        Insert: {
          chat_id: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id: string
          text: string
        }
        Update: {
          chat_id?: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_tokens: {
        Row: {
          created_at: string
          device_name: string | null
          expo_token: string
          id: string
          platform: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_name?: string | null
          expo_token: string
          id?: string
          platform: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_name?: string | null
          expo_token?: string
          id?: string
          platform?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          data: Json
          id: string
          read_at: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      order_responses: {
        Row: {
          created_at: string
          id: string
          l2_id: string
          lead_time: string | null
          master_id: string
          message: string
          order_id: string
          price_max: number | null
          price_min: number | null
          price_mode: Database["public"]["Enums"]["order_budget_mode"]
          status: Database["public"]["Enums"]["response_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          l2_id: string
          lead_time?: string | null
          master_id: string
          message: string
          order_id: string
          price_max?: number | null
          price_min?: number | null
          price_mode?: Database["public"]["Enums"]["order_budget_mode"]
          status?: Database["public"]["Enums"]["response_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          l2_id?: string
          lead_time?: string | null
          master_id?: string
          message?: string
          order_id?: string
          price_max?: number | null
          price_min?: number | null
          price_mode?: Database["public"]["Enums"]["order_budget_mode"]
          status?: Database["public"]["Enums"]["response_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_responses_l2_id_fkey"
            columns: ["l2_id"]
            isOneToOne: false
            referencedRelation: "categories_l2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_responses_master_id_fkey"
            columns: ["master_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_responses_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          budget_max: number | null
          budget_min: number | null
          budget_mode: Database["public"]["Enums"]["order_budget_mode"]
          city_id: string
          client_id: string
          contact_mode: Database["public"]["Enums"]["order_contact_mode"]
          created_at: string
          description: string
          district: string | null
          executor_type: Database["public"]["Enums"]["order_executor_type"]
          expires_at: string
          id: string
          l2_id: string
          l3_ids: string[]
          picked_master_id: string | null
          responses_count: number
          status: Database["public"]["Enums"]["order_status"]
          title: string
          updated_at: string
          urgency: Database["public"]["Enums"]["order_urgency"]
        }
        Insert: {
          budget_max?: number | null
          budget_min?: number | null
          budget_mode?: Database["public"]["Enums"]["order_budget_mode"]
          city_id: string
          client_id: string
          contact_mode?: Database["public"]["Enums"]["order_contact_mode"]
          created_at?: string
          description: string
          district?: string | null
          executor_type?: Database["public"]["Enums"]["order_executor_type"]
          expires_at?: string
          id?: string
          l2_id: string
          l3_ids?: string[]
          picked_master_id?: string | null
          responses_count?: number
          status?: Database["public"]["Enums"]["order_status"]
          title: string
          updated_at?: string
          urgency?: Database["public"]["Enums"]["order_urgency"]
        }
        Update: {
          budget_max?: number | null
          budget_min?: number | null
          budget_mode?: Database["public"]["Enums"]["order_budget_mode"]
          city_id?: string
          client_id?: string
          contact_mode?: Database["public"]["Enums"]["order_contact_mode"]
          created_at?: string
          description?: string
          district?: string | null
          executor_type?: Database["public"]["Enums"]["order_executor_type"]
          expires_at?: string
          id?: string
          l2_id?: string
          l3_ids?: string[]
          picked_master_id?: string | null
          responses_count?: number
          status?: Database["public"]["Enums"]["order_status"]
          title?: string
          updated_at?: string
          urgency?: Database["public"]["Enums"]["order_urgency"]
        }
        Relationships: [
          {
            foreignKeyName: "orders_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_l2_id_fkey"
            columns: ["l2_id"]
            isOneToOne: false
            referencedRelation: "categories_l2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_picked_master_id_fkey"
            columns: ["picked_master_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          joined_at: string
          role: Database["public"]["Enums"]["team_member_role"]
          team_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          role?: Database["public"]["Enums"]["team_member_role"]
          team_id: string
          user_id: string
        }
        Update: {
          joined_at?: string
          role?: Database["public"]["Enums"]["team_member_role"]
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_items: {
        Row: {
          caption: string | null
          created_at: string
          height: number | null
          id: string
          master_id: string
          sort_order: number
          storage_path: string
          updated_at: string
          url: string
          width: number | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          height?: number | null
          id?: string
          master_id: string
          sort_order?: number
          storage_path: string
          updated_at?: string
          url: string
          width?: number | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          height?: number | null
          id?: string
          master_id?: string
          sort_order?: number
          storage_path?: string
          updated_at?: string
          url?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_items_master_id_fkey"
            columns: ["master_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          admin_note: string | null
          created_at: string
          description: string | null
          id: string
          reason: Database["public"]["Enums"]["report_reason"]
          reporter_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["report_status"]
          target_id: string
          target_type: Database["public"]["Enums"]["report_target_type"]
          updated_at: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          description?: string | null
          id?: string
          reason: Database["public"]["Enums"]["report_reason"]
          reporter_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          target_id: string
          target_type: Database["public"]["Enums"]["report_target_type"]
          updated_at?: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          description?: string | null
          id?: string
          reason?: Database["public"]["Enums"]["report_reason"]
          reporter_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          target_id?: string
          target_type?: Database["public"]["Enums"]["report_target_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          author_id: string
          created_at: string
          direction: Database["public"]["Enums"]["review_direction"]
          id: string
          l2_id: string
          order_id: string
          rating: number
          status: Database["public"]["Enums"]["review_status"]
          target_id: string
          text: string | null
          updated_at: string
        }
        Insert: {
          author_id: string
          created_at?: string
          direction: Database["public"]["Enums"]["review_direction"]
          id?: string
          l2_id: string
          order_id: string
          rating: number
          status?: Database["public"]["Enums"]["review_status"]
          target_id: string
          text?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string
          created_at?: string
          direction?: Database["public"]["Enums"]["review_direction"]
          id?: string
          l2_id?: string
          order_id?: string
          rating?: number
          status?: Database["public"]["Enums"]["review_status"]
          target_id?: string
          text?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_l2_id_fkey"
            columns: ["l2_id"]
            isOneToOne: false
            referencedRelation: "categories_l2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          active_role: Database["public"]["Enums"]["user_active_role"]
          avatar_url: string | null
          city_id: string | null
          created_at: string
          district: string | null
          first_name: string | null
          id: string
          is_admin: boolean
          is_client: boolean
          is_master: boolean
          last_name: string | null
          last_seen_feed_at: string | null
          onboarding_completed_at: string | null
          rating_as_client_avg: number | null
          rating_as_client_count: number
          status: Database["public"]["Enums"]["user_status"]
          updated_at: string
        }
        Insert: {
          active_role?: Database["public"]["Enums"]["user_active_role"]
          avatar_url?: string | null
          city_id?: string | null
          created_at?: string
          district?: string | null
          first_name?: string | null
          id: string
          is_admin?: boolean
          is_client?: boolean
          is_master?: boolean
          last_name?: string | null
          last_seen_feed_at?: string | null
          onboarding_completed_at?: string | null
          rating_as_client_avg?: number | null
          rating_as_client_count?: number
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Update: {
          active_role?: Database["public"]["Enums"]["user_active_role"]
          avatar_url?: string | null
          city_id?: string | null
          created_at?: string
          district?: string | null
          first_name?: string | null
          id?: string
          is_admin?: boolean
          is_client?: boolean
          is_master?: boolean
          last_name?: string | null
          last_seen_feed_at?: string | null
          onboarding_completed_at?: string | null
          rating_as_client_avg?: number | null
          rating_as_client_count?: number
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
      users_private: {
        Row: {
          birth_year: number | null
          created_at: string
          gender: Database["public"]["Enums"]["user_gender"]
          last_active_at: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          birth_year?: number | null
          created_at?: string
          gender?: Database["public"]["Enums"]["user_gender"]
          last_active_at?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          birth_year?: number | null
          created_at?: string
          gender?: Database["public"]["Enums"]["user_gender"]
          last_active_at?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_private_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_response: { Args: { p_response_id: string }; Returns: undefined }
      complete_master_onboarding: {
        Args: {
          p_bio: string
          p_city_id: string
          p_district: string
          p_experience_years: number
          p_first_name: string
          p_has_tools: boolean
          p_has_transport: boolean
          p_last_name: string
          p_service_radius_km: number
        }
        Returns: undefined
      }
      expire_old_orders: { Args: never; Returns: number }
      is_current_user_admin: { Args: never; Returns: boolean }
      mark_chat_read: { Args: { p_chat_id: string }; Returns: undefined }
      mark_feed_seen: { Args: never; Returns: undefined }
      mark_notifications_read: { Args: { p_ids?: string[] }; Returns: number }
      mark_order_responses_viewed: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      notify_user: {
        Args: {
          p_body: string
          p_data?: Json
          p_title: string
          p_user_id: string
        }
        Returns: undefined
      }
      set_master_categories: {
        Args: { p_l2_ids: string[] }
        Returns: undefined
      }
    }
    Enums: {
      category_seasonality:
        | "year_round"
        | "summer"
        | "winter"
        | "wedding_season"
      category_urgency: "urgent" | "week" | "month"
      home_clients_policy: "anytime" | "with_male_present" | "women_only"
      master_account_type: "solo" | "brigade" | "company"
      master_pricing_mode: "per_hour" | "per_unit" | "negotiable" | "on_quote"
      master_status: "draft" | "pending" | "active" | "suspended" | "archived"
      notification_type:
        | "new_response"
        | "order_accepted"
        | "order_cancelled"
        | "order_expired"
        | "new_message"
        | "review_received"
        | "system"
      order_budget_mode: "exact" | "range" | "negotiable"
      order_contact_mode: "chat_only" | "phone_open" | "phone_masked"
      order_executor_type: "any" | "solo" | "brigade" | "company"
      order_status:
        | "draft"
        | "open"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "expired"
      order_urgency: "urgent" | "this_week" | "this_month" | "flexible"
      report_reason:
        | "spam"
        | "fraud"
        | "inappropriate"
        | "fake_profile"
        | "fake_review"
        | "off_platform"
        | "safety"
        | "other"
      report_status: "pending" | "reviewed" | "resolved" | "dismissed"
      report_target_type: "user" | "order" | "review" | "message"
      response_status: "sent" | "viewed" | "accepted" | "rejected" | "withdrawn"
      review_direction: "client_to_master" | "master_to_client"
      review_status: "visible" | "hidden" | "pending"
      service_unit: "per_hour" | "per_task" | "per_m2" | "per_day"
      team_member_role: "owner" | "member"
      tax_status:
        | "individual"
        | "self_employed"
        | "individual_entrepreneur"
        | "legal_entity"
      user_active_role: "client" | "master"
      user_gender: "male" | "female" | "unspecified"
      user_status: "active" | "suspended" | "banned" | "deleted"
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
      category_seasonality: [
        "year_round",
        "summer",
        "winter",
        "wedding_season",
      ],
      category_urgency: ["urgent", "week", "month"],
      home_clients_policy: ["anytime", "with_male_present", "women_only"],
      master_account_type: ["solo", "brigade", "company"],
      master_pricing_mode: ["per_hour", "per_unit", "negotiable", "on_quote"],
      master_status: ["draft", "pending", "active", "suspended", "archived"],
      notification_type: [
        "new_response",
        "order_accepted",
        "order_cancelled",
        "order_expired",
        "new_message",
        "review_received",
        "system",
      ],
      order_budget_mode: ["exact", "range", "negotiable"],
      order_contact_mode: ["chat_only", "phone_open", "phone_masked"],
      order_executor_type: ["any", "solo", "brigade", "company"],
      order_status: [
        "draft",
        "open",
        "in_progress",
        "completed",
        "cancelled",
        "expired",
      ],
      order_urgency: ["urgent", "this_week", "this_month", "flexible"],
      report_reason: [
        "spam",
        "fraud",
        "inappropriate",
        "fake_profile",
        "fake_review",
        "off_platform",
        "safety",
        "other",
      ],
      report_status: ["pending", "reviewed", "resolved", "dismissed"],
      report_target_type: ["user", "order", "review", "message"],
      response_status: ["sent", "viewed", "accepted", "rejected", "withdrawn"],
      review_direction: ["client_to_master", "master_to_client"],
      review_status: ["visible", "hidden", "pending"],
      service_unit: ["per_hour", "per_task", "per_m2", "per_day"],
      team_member_role: ["owner", "member"],
      tax_status: [
        "individual",
        "self_employed",
        "individual_entrepreneur",
        "legal_entity",
      ],
      user_active_role: ["client", "master"],
      user_gender: ["male", "female", "unspecified"],
      user_status: ["active", "suspended", "banned", "deleted"],
    },
  },
} as const
