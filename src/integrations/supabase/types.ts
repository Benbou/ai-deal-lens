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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      analyses: {
        Row: {
          completed_at: string | null
          created_at: string | null
          current_step: string | null
          deal_id: string
          duration_seconds: number | null
          error_details: Json | null
          error_message: string | null
          id: string
          progress_percent: number | null
          quick_context: Json | null
          result: Json | null
          started_at: string | null
          status: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          current_step?: string | null
          deal_id: string
          duration_seconds?: number | null
          error_details?: Json | null
          error_message?: string | null
          id?: string
          progress_percent?: number | null
          quick_context?: Json | null
          result?: Json | null
          started_at?: string | null
          status?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          current_step?: string | null
          deal_id?: string
          duration_seconds?: number | null
          error_details?: Json | null
          error_message?: string | null
          id?: string
          progress_percent?: number | null
          quick_context?: Json | null
          result?: Json | null
          started_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analyses_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          amount_raised_cents: number | null
          analysis_completed_at: string | null
          analysis_started_at: string | null
          analyzed_at: string | null
          company_name: string | null
          country: string
          created_at: string | null
          currency: string | null
          current_arr_cents: number | null
          error_message: string | null
          id: string
          is_archived: boolean | null
          is_invested: boolean | null
          memo_content: Json | null
          memo_html: string | null
          mom_growth_percent: number | null
          personal_notes: string | null
          pre_money_valuation_cents: number | null
          recommandation: string | null
          sector: string
          solution_summary: string | null
          stage: string
          startup_name: string
          status: string | null
          temp_email: string | null
          temp_phone: string | null
          updated_at: string | null
          user_id: string | null
          website: string | null
          yoy_growth_percent: number | null
        }
        Insert: {
          amount_raised_cents?: number | null
          analysis_completed_at?: string | null
          analysis_started_at?: string | null
          analyzed_at?: string | null
          company_name?: string | null
          country: string
          created_at?: string | null
          currency?: string | null
          current_arr_cents?: number | null
          error_message?: string | null
          id?: string
          is_archived?: boolean | null
          is_invested?: boolean | null
          memo_content?: Json | null
          memo_html?: string | null
          mom_growth_percent?: number | null
          personal_notes?: string | null
          pre_money_valuation_cents?: number | null
          recommandation?: string | null
          sector: string
          solution_summary?: string | null
          stage: string
          startup_name: string
          status?: string | null
          temp_email?: string | null
          temp_phone?: string | null
          updated_at?: string | null
          user_id?: string | null
          website?: string | null
          yoy_growth_percent?: number | null
        }
        Update: {
          amount_raised_cents?: number | null
          analysis_completed_at?: string | null
          analysis_started_at?: string | null
          analyzed_at?: string | null
          company_name?: string | null
          country?: string
          created_at?: string | null
          currency?: string | null
          current_arr_cents?: number | null
          error_message?: string | null
          id?: string
          is_archived?: boolean | null
          is_invested?: boolean | null
          memo_content?: Json | null
          memo_html?: string | null
          mom_growth_percent?: number | null
          personal_notes?: string | null
          pre_money_valuation_cents?: number | null
          recommandation?: string | null
          sector?: string
          solution_summary?: string | null
          stage?: string
          startup_name?: string
          status?: string | null
          temp_email?: string | null
          temp_phone?: string | null
          updated_at?: string | null
          user_id?: string | null
          website?: string | null
          yoy_growth_percent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deck_files: {
        Row: {
          deal_id: string
          docsend_url: string | null
          file_name: string
          file_size_bytes: number | null
          id: string
          mime_type: string | null
          ocr_markdown: string | null
          storage_path: string
          thumbnail_path: string | null
          uploaded_at: string | null
        }
        Insert: {
          deal_id: string
          docsend_url?: string | null
          file_name: string
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          ocr_markdown?: string | null
          storage_path: string
          thumbnail_path?: string | null
          uploaded_at?: string | null
        }
        Update: {
          deal_id?: string
          docsend_url?: string | null
          file_name?: string
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          ocr_markdown?: string | null
          storage_path?: string
          thumbnail_path?: string | null
          uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deck_files_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      investment_kpis: {
        Row: {
          arr_cents: number | null
          burn_rate_monthly_cents: number | null
          created_at: string | null
          created_by: string | null
          customer_count: number | null
          deal_id: string
          id: string
          notes: string | null
          recorded_at: string
          runway_months: number | null
        }
        Insert: {
          arr_cents?: number | null
          burn_rate_monthly_cents?: number | null
          created_at?: string | null
          created_by?: string | null
          customer_count?: number | null
          deal_id: string
          id?: string
          notes?: string | null
          recorded_at: string
          runway_months?: number | null
        }
        Update: {
          arr_cents?: number | null
          burn_rate_monthly_cents?: number | null
          created_at?: string | null
          created_by?: string | null
          customer_count?: number | null
          deal_id?: string
          id?: string
          notes?: string | null
          recorded_at?: string
          runway_months?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "investment_kpis_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investment_kpis_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          content: string
          content_html: string | null
          created_at: string | null
          deal_id: string
          id: string
          updated_at: string | null
          user_id: string
          version: number | null
        }
        Insert: {
          content: string
          content_html?: string | null
          created_at?: string | null
          deal_id: string
          id?: string
          updated_at?: string | null
          user_id: string
          version?: number | null
        }
        Update: {
          content?: string
          content_html?: string | null
          created_at?: string | null
          deal_id?: string
          id?: string
          updated_at?: string | null
          user_id?: string
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "notes_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          check_size_max: number | null
          check_size_min: number | null
          country: string | null
          created_at: string | null
          email: string
          id: string
          investment_focus: string[] | null
          name: string
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          check_size_max?: number | null
          check_size_min?: number | null
          country?: string | null
          created_at?: string | null
          email: string
          id: string
          investment_focus?: string[] | null
          name: string
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          check_size_max?: number | null
          check_size_min?: number | null
          country?: string | null
          created_at?: string | null
          email?: string
          id?: string
          investment_focus?: string[] | null
          name?: string
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workflow_logs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          deal_id: string
          duration_ms: number | null
          error_message: string | null
          id: string
          input: Json | null
          output: Json | null
          started_at: string | null
          status: string
          step_name: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          deal_id: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          input?: Json | null
          output?: Json | null
          started_at?: string | null
          status: string
          step_name: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          deal_id?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          input?: Json | null
          output?: Json | null
          started_at?: string | null
          status?: string
          step_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_logs_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
