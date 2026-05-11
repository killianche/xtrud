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
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      categories_l1: {
        Row: {
          cover_image_url: string | null;
          created_at: string;
          icon: string;
          id: string;
          is_active: boolean;
          name_ru: string;
          sort_order: number;
        };
        Insert: {
          cover_image_url?: string | null;
          created_at?: string;
          icon: string;
          id: string;
          is_active?: boolean;
          name_ru: string;
          sort_order?: number;
        };
        Update: {
          cover_image_url?: string | null;
          created_at?: string;
          icon?: string;
          id?: string;
          is_active?: boolean;
          name_ru?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      categories_l2: {
        Row: {
          created_at: string;
          icon: string;
          id: string;
          is_active: boolean;
          is_visible: boolean;
          l1_id: string;
          name_ru: string;
          sort_order: number;
        };
        Insert: {
          created_at?: string;
          icon: string;
          id: string;
          is_active?: boolean;
          is_visible?: boolean;
          l1_id: string;
          name_ru: string;
          sort_order?: number;
        };
        Update: {
          created_at?: string;
          icon?: string;
          id?: string;
          is_active?: boolean;
          is_visible?: boolean;
          l1_id?: string;
          name_ru?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "categories_l2_l1_id_fkey";
            columns: ["l1_id"];
            isOneToOne: false;
            referencedRelation: "categories_l1";
            referencedColumns: ["id"];
          },
        ];
      };
      categories_l3: {
        Row: {
          avg_check_rub: number | null;
          created_at: string;
          icon: string | null;
          id: string;
          is_active: boolean;
          l2_id: string;
          name_ru: string;
          requires_license: boolean;
          seasonality: Database["public"]["Enums"]["category_seasonality"];
          sort_order: number;
          urgency_typical: Database["public"]["Enums"]["category_urgency"];
        };
        Insert: {
          avg_check_rub?: number | null;
          created_at?: string;
          icon?: string | null;
          id: string;
          is_active?: boolean;
          l2_id: string;
          name_ru: string;
          requires_license?: boolean;
          seasonality?: Database["public"]["Enums"]["category_seasonality"];
          sort_order?: number;
          urgency_typical?: Database["public"]["Enums"]["category_urgency"];
        };
        Update: {
          avg_check_rub?: number | null;
          created_at?: string;
          icon?: string | null;
          id?: string;
          is_active?: boolean;
          l2_id?: string;
          name_ru?: string;
          requires_license?: boolean;
          seasonality?: Database["public"]["Enums"]["category_seasonality"];
          sort_order?: number;
          urgency_typical?: Database["public"]["Enums"]["category_urgency"];
        };
        Relationships: [
          {
            foreignKeyName: "categories_l3_l2_id_fkey";
            columns: ["l2_id"];
            isOneToOne: false;
            referencedRelation: "categories_l2";
            referencedColumns: ["id"];
          },
        ];
      };
      cities: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          region: string;
          sort_order: number;
        };
        Insert: {
          created_at?: string;
          id: string;
          is_active?: boolean;
          name: string;
          region?: string;
          sort_order?: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          region?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      master_profiles: {
        Row: {
          bio: string | null;
          closed_deals: number;
          created_at: string;
          experience_years: number | null;
          has_tools: boolean;
          has_transport: boolean;
          home_clients_policy: Database["public"]["Enums"]["home_clients_policy"] | null;
          inn: string | null;
          languages: string[];
          rating_overall_avg: number | null;
          rating_overall_count: number;
          service_radius_km: number;
          status: Database["public"]["Enums"]["master_status"];
          tax_status: Database["public"]["Enums"]["tax_status"] | null;
          team_size: number;
          updated_at: string;
          user_id: string;
          verification_level: number;
          work_schedule: Json;
        };
        Insert: {
          bio?: string | null;
          closed_deals?: number;
          created_at?: string;
          experience_years?: number | null;
          has_tools?: boolean;
          has_transport?: boolean;
          home_clients_policy?: Database["public"]["Enums"]["home_clients_policy"] | null;
          inn?: string | null;
          languages?: string[];
          rating_overall_avg?: number | null;
          rating_overall_count?: number;
          service_radius_km?: number;
          status?: Database["public"]["Enums"]["master_status"];
          tax_status?: Database["public"]["Enums"]["tax_status"] | null;
          team_size?: number;
          updated_at?: string;
          user_id: string;
          verification_level?: number;
          work_schedule?: Json;
        };
        Update: {
          bio?: string | null;
          closed_deals?: number;
          created_at?: string;
          experience_years?: number | null;
          has_tools?: boolean;
          has_transport?: boolean;
          home_clients_policy?: Database["public"]["Enums"]["home_clients_policy"] | null;
          inn?: string | null;
          languages?: string[];
          rating_overall_avg?: number | null;
          rating_overall_count?: number;
          service_radius_km?: number;
          status?: Database["public"]["Enums"]["master_status"];
          tax_status?: Database["public"]["Enums"]["tax_status"] | null;
          team_size?: number;
          updated_at?: string;
          user_id?: string;
          verification_level?: number;
          work_schedule?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "master_profiles_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      users: {
        Row: {
          active_role: Database["public"]["Enums"]["user_active_role"];
          avatar_url: string | null;
          city_id: string | null;
          created_at: string;
          district: string | null;
          first_name: string | null;
          id: string;
          is_client: boolean;
          is_master: boolean;
          last_name: string | null;
          onboarding_completed_at: string | null;
          rating_as_client_avg: number | null;
          rating_as_client_count: number;
          status: Database["public"]["Enums"]["user_status"];
          updated_at: string;
        };
        Insert: {
          active_role?: Database["public"]["Enums"]["user_active_role"];
          avatar_url?: string | null;
          city_id?: string | null;
          created_at?: string;
          district?: string | null;
          first_name?: string | null;
          id: string;
          is_client?: boolean;
          is_master?: boolean;
          last_name?: string | null;
          onboarding_completed_at?: string | null;
          rating_as_client_avg?: number | null;
          rating_as_client_count?: number;
          status?: Database["public"]["Enums"]["user_status"];
          updated_at?: string;
        };
        Update: {
          active_role?: Database["public"]["Enums"]["user_active_role"];
          avatar_url?: string | null;
          city_id?: string | null;
          created_at?: string;
          district?: string | null;
          first_name?: string | null;
          id?: string;
          is_client?: boolean;
          is_master?: boolean;
          last_name?: string | null;
          onboarding_completed_at?: string | null;
          rating_as_client_avg?: number | null;
          rating_as_client_count?: number;
          status?: Database["public"]["Enums"]["user_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "users_city_id_fkey";
            columns: ["city_id"];
            isOneToOne: false;
            referencedRelation: "cities";
            referencedColumns: ["id"];
          },
        ];
      };
      users_private: {
        Row: {
          birth_year: number | null;
          created_at: string;
          gender: Database["public"]["Enums"]["user_gender"];
          last_active_at: string | null;
          phone: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          birth_year?: number | null;
          created_at?: string;
          gender?: Database["public"]["Enums"]["user_gender"];
          last_active_at?: string | null;
          phone?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          birth_year?: number | null;
          created_at?: string;
          gender?: Database["public"]["Enums"]["user_gender"];
          last_active_at?: string | null;
          phone?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "users_private_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      complete_master_onboarding: {
        Args: {
          p_bio: string;
          p_city_id: string;
          p_district: string;
          p_experience_years: number;
          p_first_name: string;
          p_has_tools: boolean;
          p_has_transport: boolean;
          p_last_name: string;
          p_service_radius_km: number;
        };
        Returns: undefined;
      };
    };
    Enums: {
      category_seasonality: "year_round" | "summer" | "winter" | "wedding_season";
      category_urgency: "urgent" | "week" | "month";
      home_clients_policy: "anytime" | "with_male_present" | "women_only";
      master_status: "draft" | "pending" | "active" | "suspended" | "archived";
      tax_status: "individual" | "self_employed" | "individual_entrepreneur" | "legal_entity";
      user_active_role: "client" | "master";
      user_gender: "male" | "female" | "unspecified";
      user_status: "active" | "suspended" | "banned" | "deleted";
    };
    CompositeTypes: Record<string, never>;
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      category_seasonality: ["year_round", "summer", "winter", "wedding_season"],
      category_urgency: ["urgent", "week", "month"],
      home_clients_policy: ["anytime", "with_male_present", "women_only"],
      master_status: ["draft", "pending", "active", "suspended", "archived"],
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
} as const;
