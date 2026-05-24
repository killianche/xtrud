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
      articles: {
        Row: {
          author_id: string | null
          body_md: string
          category_l1_id: string | null
          cover_url: string | null
          created_at: string
          excerpt: string | null
          id: string
          published_at: string | null
          slug: string
          status: Database["public"]["Enums"]["article_status"]
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body_md: string
          category_l1_id?: string | null
          cover_url?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          published_at?: string | null
          slug: string
          status?: Database["public"]["Enums"]["article_status"]
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body_md?: string
          category_l1_id?: string | null
          cover_url?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          published_at?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["article_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "articles_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_category_l1_id_fkey"
            columns: ["category_l1_id"]
            isOneToOne: false
            referencedRelation: "categories_l1"
            referencedColumns: ["id"]
          },
        ]
      }
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
          fts_doc: unknown
          icon: string
          id: string
          is_active: boolean
          is_featured: boolean
          is_visible: boolean
          l1_id: string
          name_ru: string
          sort_order: number
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          fts_doc?: unknown
          icon: string
          id: string
          is_active?: boolean
          is_featured?: boolean
          is_visible?: boolean
          l1_id: string
          name_ru: string
          sort_order?: number
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          fts_doc?: unknown
          icon?: string
          id?: string
          is_active?: boolean
          is_featured?: boolean
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
          fts_doc: unknown
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
          fts_doc?: unknown
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
          fts_doc?: unknown
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
      category_terms: {
        Row: {
          created_at: string
          id: string
          l2_id: string | null
          l3_id: string | null
          term: string
          weight: number
        }
        Insert: {
          created_at?: string
          id?: string
          l2_id?: string | null
          l3_id?: string | null
          term: string
          weight?: number
        }
        Update: {
          created_at?: string
          id?: string
          l2_id?: string | null
          l3_id?: string | null
          term?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "category_terms_l2_id_fkey"
            columns: ["l2_id"]
            isOneToOne: false
            referencedRelation: "categories_l2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_terms_l3_id_fkey"
            columns: ["l3_id"]
            isOneToOne: false
            referencedRelation: "categories_l3"
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
          last_message_text: string | null
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
          last_message_text?: string | null
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
          last_message_text?: string | null
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
            isOneToOne: false
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
          availability_status: Database["public"]["Enums"]["availability_status"]
          availability_until: string | null
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
          is_hidden_from_search: boolean
          languages: string[]
          legal_name: string | null
          ogrn: string | null
          ranking_score: number
          rating_overall_avg: number | null
          rating_overall_count: number
          status: Database["public"]["Enums"]["master_status"]
          tax_status: Database["public"]["Enums"]["tax_status"] | null
          team_size: number
          updated_at: string
          user_id: string
          verification_level: number
          whatsapp_phone: string | null
          whatsapp_same_as_phone: boolean
          work_schedule: Json
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["master_account_type"]
          availability_status?: Database["public"]["Enums"]["availability_status"]
          availability_until?: string | null
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
          is_hidden_from_search?: boolean
          languages?: string[]
          legal_name?: string | null
          ogrn?: string | null
          ranking_score?: number
          rating_overall_avg?: number | null
          rating_overall_count?: number
          status?: Database["public"]["Enums"]["master_status"]
          tax_status?: Database["public"]["Enums"]["tax_status"] | null
          team_size?: number
          updated_at?: string
          user_id: string
          verification_level?: number
          whatsapp_phone?: string | null
          whatsapp_same_as_phone?: boolean
          work_schedule?: Json
        }
        Update: {
          account_type?: Database["public"]["Enums"]["master_account_type"]
          availability_status?: Database["public"]["Enums"]["availability_status"]
          availability_until?: string | null
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
          is_hidden_from_search?: boolean
          languages?: string[]
          legal_name?: string | null
          ogrn?: string | null
          ranking_score?: number
          rating_overall_avg?: number | null
          rating_overall_count?: number
          status?: Database["public"]["Enums"]["master_status"]
          tax_status?: Database["public"]["Enums"]["tax_status"] | null
          team_size?: number
          updated_at?: string
          user_id?: string
          verification_level?: number
          whatsapp_phone?: string | null
          whatsapp_same_as_phone?: boolean
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
      master_service_areas: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["master_area_kind"]
          location_id: string
          master_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["master_area_kind"]
          location_id: string
          master_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["master_area_kind"]
          location_id?: string
          master_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "master_service_areas_master_id_fkey"
            columns: ["master_id"]
            isOneToOne: false
            referencedRelation: "master_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      master_services: {
        Row: {
          created_at: string
          id: string
          l2_id: string | null
          l3_id: string | null
          master_id: string
          position: number
          price_max: number | null
          price_min: number | null
          pricing_kind: Database["public"]["Enums"]["service_pricing_kind"]
          title: string
          unit: Database["public"]["Enums"]["service_unit"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          l2_id?: string | null
          l3_id?: string | null
          master_id: string
          position?: number
          price_max?: number | null
          price_min?: number | null
          pricing_kind?: Database["public"]["Enums"]["service_pricing_kind"]
          title: string
          unit?: Database["public"]["Enums"]["service_unit"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          l2_id?: string | null
          l3_id?: string | null
          master_id?: string
          position?: number
          price_max?: number | null
          price_min?: number | null
          pricing_kind?: Database["public"]["Enums"]["service_pricing_kind"]
          title?: string
          unit?: Database["public"]["Enums"]["service_unit"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "master_services_l2_id_fkey"
            columns: ["l2_id"]
            isOneToOne: false
            referencedRelation: "categories_l2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "master_services_l3_id_fkey"
            columns: ["l3_id"]
            isOneToOne: false
            referencedRelation: "categories_l3"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "master_services_master_id_fkey"
            columns: ["master_id"]
            isOneToOne: false
            referencedRelation: "master_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      master_verifications: {
        Row: {
          passport_main_path: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          selfie_path: string
          status: Database["public"]["Enums"]["verification_status"]
          submitted_at: string
          user_id: string
        }
        Insert: {
          passport_main_path: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          selfie_path: string
          status?: Database["public"]["Enums"]["verification_status"]
          submitted_at?: string
          user_id: string
        }
        Update: {
          passport_main_path?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          selfie_path?: string
          status?: Database["public"]["Enums"]["verification_status"]
          submitted_at?: string
          user_id?: string
        }
        Relationships: []
      }
      master_views: {
        Row: {
          created_at: string
          id: string
          master_id: string
          view_type: string
          viewer_id: string | null
          viewer_session_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          master_id: string
          view_type: string
          viewer_id?: string | null
          viewer_session_id: string
        }
        Update: {
          created_at?: string
          id?: string
          master_id?: string
          view_type?: string
          viewer_id?: string | null
          viewer_session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "master_views_master_id_fkey"
            columns: ["master_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "master_views_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          chat_id: string
          created_at: string
          id: string
          image_url: string | null
          read_at: string | null
          sender_id: string
          text: string | null
        }
        Insert: {
          chat_id: string
          created_at?: string
          id?: string
          image_url?: string | null
          read_at?: string | null
          sender_id: string
          text?: string | null
        }
        Update: {
          chat_id?: string
          created_at?: string
          id?: string
          image_url?: string | null
          read_at?: string | null
          sender_id?: string
          text?: string | null
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
          price_kind: Database["public"]["Enums"]["order_price_kind"]
          price_value: number | null
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
          price_kind?: Database["public"]["Enums"]["order_price_kind"]
          price_value?: number | null
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
          price_kind?: Database["public"]["Enums"]["order_price_kind"]
          price_value?: number | null
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
      order_status_log: {
        Row: {
          created_at: string
          from_status: Database["public"]["Enums"]["order_status"] | null
          id: string
          metadata: Json | null
          order_id: string
          to_status: Database["public"]["Enums"]["order_status"]
          transition_code: string | null
          triggered_by: string | null
          triggered_kind: string
        }
        Insert: {
          created_at?: string
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: string
          metadata?: Json | null
          order_id: string
          to_status: Database["public"]["Enums"]["order_status"]
          transition_code?: string | null
          triggered_by?: string | null
          triggered_kind: string
        }
        Update: {
          created_at?: string
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: string
          metadata?: Json | null
          order_id?: string
          to_status?: Database["public"]["Enums"]["order_status"]
          transition_code?: string | null
          triggered_by?: string | null
          triggered_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_log_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          awaiting_confirmation_until: string | null
          budget_kind: Database["public"]["Enums"]["order_price_kind"]
          budget_value: number | null
          cancel_reason: string | null
          cancelled_by: string | null
          city_id: string | null
          client_id: string
          completed_at: string | null
          completion_kind: string | null
          contact_mode: Database["public"]["Enums"]["order_contact_mode"]
          contact_name: string | null
          created_at: string
          created_via: Database["public"]["Enums"]["order_created_via"]
          description: string | null
          dispute_opened_by: string | null
          dispute_reason: string | null
          disputed_at: string | null
          district: string | null
          executor_type: Database["public"]["Enums"]["order_executor_type"]
          expires_at: string
          id: string
          l2_id: string
          l3_ids: string[]
          last_activity_at: string | null
          master_marked_done_at: string | null
          photo_urls: string[]
          picked_at: string | null
          picked_master_id: string | null
          resolution_kind: string | null
          resolved_at: string | null
          resolved_by: string | null
          responses_count: number
          status: Database["public"]["Enums"]["order_status"]
          title: string
          updated_at: string
          urgency: Database["public"]["Enums"]["order_urgency"]
        }
        Insert: {
          awaiting_confirmation_until?: string | null
          budget_kind?: Database["public"]["Enums"]["order_price_kind"]
          budget_value?: number | null
          cancel_reason?: string | null
          cancelled_by?: string | null
          city_id?: string | null
          client_id: string
          completed_at?: string | null
          completion_kind?: string | null
          contact_mode?: Database["public"]["Enums"]["order_contact_mode"]
          contact_name?: string | null
          created_at?: string
          created_via?: Database["public"]["Enums"]["order_created_via"]
          description?: string | null
          dispute_opened_by?: string | null
          dispute_reason?: string | null
          disputed_at?: string | null
          district?: string | null
          executor_type?: Database["public"]["Enums"]["order_executor_type"]
          expires_at?: string
          id?: string
          l2_id: string
          l3_ids?: string[]
          last_activity_at?: string | null
          master_marked_done_at?: string | null
          photo_urls?: string[]
          picked_at?: string | null
          picked_master_id?: string | null
          resolution_kind?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          responses_count?: number
          status?: Database["public"]["Enums"]["order_status"]
          title: string
          updated_at?: string
          urgency?: Database["public"]["Enums"]["order_urgency"]
        }
        Update: {
          awaiting_confirmation_until?: string | null
          budget_kind?: Database["public"]["Enums"]["order_price_kind"]
          budget_value?: number | null
          cancel_reason?: string | null
          cancelled_by?: string | null
          city_id?: string | null
          client_id?: string
          completed_at?: string | null
          completion_kind?: string | null
          contact_mode?: Database["public"]["Enums"]["order_contact_mode"]
          contact_name?: string | null
          created_at?: string
          created_via?: Database["public"]["Enums"]["order_created_via"]
          description?: string | null
          dispute_opened_by?: string | null
          dispute_reason?: string | null
          disputed_at?: string | null
          district?: string | null
          executor_type?: Database["public"]["Enums"]["order_executor_type"]
          expires_at?: string
          id?: string
          l2_id?: string
          l3_ids?: string[]
          last_activity_at?: string | null
          master_marked_done_at?: string | null
          photo_urls?: string[]
          picked_at?: string | null
          picked_master_id?: string | null
          resolution_kind?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          responses_count?: number
          status?: Database["public"]["Enums"]["order_status"]
          title?: string
          updated_at?: string
          urgency?: Database["public"]["Enums"]["order_urgency"]
        }
        Relationships: [
          {
            foreignKeyName: "orders_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "orders_dispute_opened_by_fkey"
            columns: ["dispute_opened_by"]
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
          {
            foreignKeyName: "orders_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_cases: {
        Row: {
          created_at: string
          description: string | null
          id: string
          master_id: string
          order_id: string | null
          sort_order: number
          title: string
          updated_at: string
          work_done_at: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          master_id: string
          order_id?: string | null
          sort_order?: number
          title: string
          updated_at?: string
          work_done_at?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          master_id?: string
          order_id?: string | null
          sort_order?: number
          title?: string
          updated_at?: string
          work_done_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_cases_master_id_fkey"
            columns: ["master_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_cases_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_items: {
        Row: {
          caption: string | null
          case_id: string | null
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
          case_id?: string | null
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
          case_id?: string | null
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
            foreignKeyName: "portfolio_items_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "portfolio_cases"
            referencedColumns: ["id"]
          },
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
      search_queries_log: {
        Row: {
          hits_count: number
          id: number
          query_norm: string
          query_raw: string
          ts: string
          user_id: string | null
        }
        Insert: {
          hits_count?: number
          id?: number
          query_norm: string
          query_raw: string
          ts?: string
          user_id?: string | null
        }
        Update: {
          hits_count?: number
          id?: number
          query_norm?: string
          query_raw?: string
          ts?: string
          user_id?: string | null
        }
        Relationships: []
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
      user_contacts: {
        Row: {
          created_at: string
          display_name: string | null
          phone_normalized: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          phone_normalized: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          phone_normalized?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_contacts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_favorites: {
        Row: {
          created_at: string
          master_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          master_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          master_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_favorites_master_id_fkey"
            columns: ["master_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_favorites_user_id_fkey"
            columns: ["user_id"]
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
          contact_phone: string | null
          created_at: string
          district: string | null
          first_name: string | null
          id: string
          is_admin: boolean
          is_client: boolean
          is_demo: boolean
          is_master: boolean
          last_name: string | null
          last_active_at: string | null
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
          contact_phone?: string | null
          created_at?: string
          district?: string | null
          first_name?: string | null
          id: string
          is_admin?: boolean
          is_client?: boolean
          is_demo?: boolean
          is_master?: boolean
          last_name?: string | null
          last_active_at?: string | null
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
          contact_phone?: string | null
          created_at?: string
          district?: string | null
          first_name?: string | null
          id?: string
          is_admin?: boolean
          is_client?: boolean
          is_demo?: boolean
          is_master?: boolean
          last_name?: string | null
          last_active_at?: string | null
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
      vouches: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          vouchee_id: string
          voucher_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          vouchee_id: string
          voucher_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          vouchee_id?: string
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vouches_vouchee_id_fkey"
            columns: ["vouchee_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouches_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      top_queries_7d: {
        Row: {
          avg_hits: number | null
          last_seen: string | null
          query_norm: string | null
          searches: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _availability_expires_at: {
        Args: { p_status: Database["public"]["Enums"]["availability_status"] }
        Returns: string
      }
      accept_response: { Args: { p_response_id: string }; Returns: undefined }
      auto_confirm_completions: { Args: never; Returns: number }
      cancel_stale_in_progress: { Args: never; Returns: number }
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
        }
        Returns: undefined
      }
      confirm_completion: { Args: { p_order_id: string }; Returns: undefined }
      confirm_work_done: {
        Args: {
          p_l2_id?: string
          p_master_id: string
          p_order_id?: string
          p_review_rating?: number
          p_review_text?: string
          p_title?: string
        }
        Returns: string
      }
      count_common_contacts_with: {
        Args: { p_other_user_id: string }
        Returns: number
      }
      count_vouches_for: { Args: { p_target_user_id: string }; Returns: number }
      delete_my_account: { Args: never; Returns: Json }
      enable_master_mode: { Args: never; Returns: undefined }
      expire_availability: { Args: never; Returns: number }
      expire_old_orders: { Args: never; Returns: number }
      finalize_master_onboarding: { Args: never; Returns: undefined }
      get_master_phone: { Args: { p_master_id: string }; Returns: string }
      get_master_stats: { Args: never; Returns: Json }
      get_my_master_view_stats: {
        Args: never
        Returns: {
          impressions: number
          profile_opens: number
        }[]
      }
      get_popular_queries: {
        Args: { p_limit?: number }
        Returns: {
          query: string
          searches: number
        }[]
      }
      get_response_limit_today: { Args: never; Returns: Json }
      is_current_user_admin: { Args: never; Returns: boolean }
      log_search_query: {
        Args: { p_hits: number; p_query: string }
        Returns: undefined
      }
      mark_chat_read: { Args: { p_chat_id: string }; Returns: undefined }
      mark_feed_seen: { Args: never; Returns: undefined }
      mark_notifications_read: { Args: { p_ids?: string[] }; Returns: number }
      mark_order_done: { Args: { p_order_id: string }; Returns: undefined }
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
      open_dispute: {
        Args: { p_order_id: string; p_reason: string }
        Returns: undefined
      }
      record_master_view: {
        Args: { p_master_id: string; p_session_id: string; p_view_type: string }
        Returns: undefined
      }
      reject_response: { Args: { p_response_id: string }; Returns: undefined }
      reopen_order: { Args: { p_order_id: string }; Returns: undefined }
      search_categories: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          id: string
          kind: string
          l2_id: string
          name_ru: string
          score: number
          source: string
        }[]
      }
      set_availability: {
        Args: { p_status: Database["public"]["Enums"]["availability_status"] }
        Returns: string
      }
      set_master_categories: {
        Args: { p_l2_ids: string[] }
        Returns: undefined
      }
      set_master_service_areas: {
        Args: { p_cities: string[]; p_districts: string[] }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      start_chat_with_master: {
        Args: { p_master_id: string; p_order_id: string }
        Returns: string
      }
      terminate_cooperation: {
        Args: { p_order_id: string; p_reason?: string }
        Returns: undefined
      }
      touch_last_active: { Args: never; Returns: undefined }
      try_publish_master: { Args: { p_user_id: string }; Returns: undefined }
      withdraw_response: { Args: { p_response_id: string }; Returns: undefined }
    }
    Enums: {
      article_status: "draft" | "published" | "archived"
      availability_status: "today" | "this_week" | "next_week" | "unavailable"
      category_seasonality:
        | "year_round"
        | "summer"
        | "winter"
        | "wedding_season"
      category_urgency: "urgent" | "week" | "month"
      home_clients_policy: "anytime" | "with_male_present" | "women_only"
      master_account_type: "solo" | "brigade" | "company"
      master_area_kind: "city" | "district"
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
      order_contact_mode: "chat_only" | "phone_open" | "phone_masked"
      order_created_via: "wizard" | "ad_hoc_completion"
      order_executor_type: "any" | "solo" | "brigade" | "company"
      order_price_kind: "fixed" | "from" | "up_to" | "negotiable"
      order_status:
        | "draft"
        | "open"
        | "in_progress"
        | "awaiting_confirmation"
        | "completed"
        | "disputed"
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
      service_pricing_kind:
        | "fixed"
        | "range"
        | "hourly"
        | "quote"
        | "from"
        | "up_to"
      service_unit: "per_hour" | "per_task" | "per_m2" | "per_day"
      tax_status:
        | "individual"
        | "self_employed"
        | "individual_entrepreneur"
        | "legal_entity"
      team_member_role: "owner" | "member"
      user_active_role: "client" | "master"
      user_gender: "male" | "female" | "unspecified"
      user_status: "active" | "suspended" | "banned" | "deleted"
      verification_status: "pending" | "approved" | "rejected"
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
      article_status: ["draft", "published", "archived"],
      availability_status: ["today", "this_week", "next_week", "unavailable"],
      category_seasonality: [
        "year_round",
        "summer",
        "winter",
        "wedding_season",
      ],
      category_urgency: ["urgent", "week", "month"],
      home_clients_policy: ["anytime", "with_male_present", "women_only"],
      master_account_type: ["solo", "brigade", "company"],
      master_area_kind: ["city", "district"],
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
      order_contact_mode: ["chat_only", "phone_open", "phone_masked"],
      order_created_via: ["wizard", "ad_hoc_completion"],
      order_executor_type: ["any", "solo", "brigade", "company"],
      order_price_kind: ["fixed", "from", "up_to", "negotiable"],
      order_status: [
        "draft",
        "open",
        "in_progress",
        "awaiting_confirmation",
        "completed",
        "disputed",
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
      service_pricing_kind: [
        "fixed",
        "range",
        "hourly",
        "quote",
        "from",
        "up_to",
      ],
      service_unit: ["per_hour", "per_task", "per_m2", "per_day"],
      tax_status: [
        "individual",
        "self_employed",
        "individual_entrepreneur",
        "legal_entity",
      ],
      team_member_role: ["owner", "member"],
      user_active_role: ["client", "master"],
      user_gender: ["male", "female", "unspecified"],
      user_status: ["active", "suspended", "banned", "deleted"],
      verification_status: ["pending", "approved", "rejected"],
    },
  },
} as const
