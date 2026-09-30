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
      audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          details: Json
          entity: string
          entity_id: string | null
          id: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json
          entity: string
          entity_id?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json
          entity?: string
          entity_id?: string | null
          id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          id: string
          name: string
          parent_id: string | null
          position: number
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          position?: number
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          position?: number
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      fomo_campaign_products: {
        Row: {
          campaign_id: string
          created_at: string
          discount_percent: number | null
          display_sale_price: number | null
          id: string
          product_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          discount_percent?: number | null
          display_sale_price?: number | null
          id?: string
          product_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          discount_percent?: number | null
          display_sale_price?: number | null
          id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fomo_campaign_products_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "fomo_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fomo_campaign_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      fomo_campaigns: {
        Row: {
          auto_increment_enabled: boolean
          created_at: string
          duration_hours: number
          headline: string
          id: string
          increment_interval_seconds: number
          increment_max: number
          increment_min: number
          initial_sold_percent: number
          is_active: boolean
          max_sold_percent: number
          name: string
          reset_delay_hours: number
          reset_mode: string
          total_fake_stock: number
          updated_at: string
        }
        Insert: {
          auto_increment_enabled?: boolean
          created_at?: string
          duration_hours?: number
          headline?: string
          id?: string
          increment_interval_seconds?: number
          increment_max?: number
          increment_min?: number
          initial_sold_percent?: number
          is_active?: boolean
          max_sold_percent?: number
          name?: string
          reset_delay_hours?: number
          reset_mode?: string
          total_fake_stock?: number
          updated_at?: string
        }
        Update: {
          auto_increment_enabled?: boolean
          created_at?: string
          duration_hours?: number
          headline?: string
          id?: string
          increment_interval_seconds?: number
          increment_max?: number
          increment_min?: number
          initial_sold_percent?: number
          is_active?: boolean
          max_sold_percent?: number
          name?: string
          reset_delay_hours?: number
          reset_mode?: string
          total_fake_stock?: number
          updated_at?: string
        }
        Relationships: []
      }
      hero_banner: {
        Row: {
          cta_href: string
          cta_label: string
          eyebrow: string
          id: string
          image_alt: string
          image_url: string | null
          is_active: boolean
          overlay_opacity: number
          storage_path: string | null
          subtitle: string
          text_align: string
          title: string
          updated_at: string
        }
        Insert: {
          cta_href?: string
          cta_label?: string
          eyebrow?: string
          id?: string
          image_alt?: string
          image_url?: string | null
          is_active?: boolean
          overlay_opacity?: number
          storage_path?: string | null
          subtitle?: string
          text_align?: string
          title?: string
          updated_at?: string
        }
        Update: {
          cta_href?: string
          cta_label?: string
          eyebrow?: string
          id?: string
          image_alt?: string
          image_url?: string | null
          is_active?: boolean
          overlay_opacity?: number
          storage_path?: string | null
          subtitle?: string
          text_align?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_images: {
        Row: {
          asset_key: string | null
          created_at: string
          id: string
          position: number
          product_id: string
          storage_path: string | null
          url: string | null
        }
        Insert: {
          asset_key?: string | null
          created_at?: string
          id?: string
          position?: number
          product_id: string
          storage_path?: string | null
          url?: string | null
        }
        Update: {
          asset_key?: string | null
          created_at?: string
          id?: string
          position?: number
          product_id?: string
          storage_path?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          archived_at: string | null
          category: string
          created_at: string
          description: string
          editors_notes: string
          effect: string
          hover_image_enabled: boolean
          id: string
          is_new: boolean
          low_stock_threshold: number
          name: string
          position: number
          preorder_deposit_type: string
          preorder_deposit_value: number
          preorder_enabled: boolean
          preorder_release_date: string | null
          price: number
          sale_price: number | null
          sku: string
          slug: string
          status: string
          stock: number
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          category: string
          created_at?: string
          description?: string
          editors_notes?: string
          effect?: string
          hover_image_enabled?: boolean
          id?: string
          is_new?: boolean
          low_stock_threshold?: number
          name: string
          position?: number
          preorder_deposit_type?: string
          preorder_deposit_value?: number
          preorder_enabled?: boolean
          preorder_release_date?: string | null
          price?: number
          sale_price?: number | null
          sku: string
          slug: string
          status?: string
          stock?: number
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          category?: string
          created_at?: string
          description?: string
          editors_notes?: string
          effect?: string
          hover_image_enabled?: boolean
          id?: string
          is_new?: boolean
          low_stock_threshold?: number
          name?: string
          position?: number
          preorder_deposit_type?: string
          preorder_deposit_value?: number
          preorder_enabled?: boolean
          preorder_release_date?: string | null
          price?: number
          sale_price?: number | null
          sku?: string
          slug?: string
          status?: string
          stock?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      saved_carts: {
        Row: {
          items: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          items?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          items?: Json
          updated_at?: string
          user_id?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_manage_products: { Args: { _user_id: string }; Returns: boolean }
      claim_first_admin: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "super_admin" | "inventory_manager" | "order_processor"
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
      app_role: ["super_admin", "inventory_manager", "order_processor"],
    },
  },
} as const
