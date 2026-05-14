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
      field_updates: {
        Row: {
          attachments: Json
          author_id: string
          created_at: string
          id: string
          message: string
          time: string | null
          type: Database["public"]["Enums"]["field_update_type"]
        }
        Insert: {
          attachments?: Json
          author_id: string
          created_at?: string
          id?: string
          message: string
          time?: string | null
          type?: Database["public"]["Enums"]["field_update_type"]
        }
        Update: {
          attachments?: Json
          author_id?: string
          created_at?: string
          id?: string
          message?: string
          time?: string | null
          type?: Database["public"]["Enums"]["field_update_type"]
        }
        Relationships: []
      }
      guide_notes: {
        Row: {
          attachments: Json
          author_staff_id: string
          category: Database["public"]["Enums"]["note_category"]
          created_at: string
          id: string
          message: string
          shift_id: string
        }
        Insert: {
          attachments?: Json
          author_staff_id: string
          category?: Database["public"]["Enums"]["note_category"]
          created_at?: string
          id?: string
          message: string
          shift_id: string
        }
        Update: {
          attachments?: Json
          author_staff_id?: string
          category?: Database["public"]["Enums"]["note_category"]
          created_at?: string
          id?: string
          message?: string
          shift_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guide_notes_author_staff_id_fkey"
            columns: ["author_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guide_notes_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      guide_notifications: {
        Row: {
          attachments: Json
          body: string
          created_at: string
          id: string
          link: string | null
          read: boolean
          shift_id: string | null
          staff_id: string
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Insert: {
          attachments?: Json
          body: string
          created_at?: string
          id?: string
          link?: string | null
          read?: boolean
          shift_id?: string | null
          staff_id: string
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Update: {
          attachments?: Json
          body?: string
          created_at?: string
          id?: string
          link?: string | null
          read?: boolean
          shift_id?: string | null
          staff_id?: string
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
        }
        Relationships: [
          {
            foreignKeyName: "guide_notifications_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guide_notifications_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          created_by: string | null
          customer: Json
          drive_url: string | null
          id: string
          invoice_date: string
          lines: Json
          notes: string | null
          number: number
          pdf_filename: string | null
          shift_id: string | null
          subtotal: number
          total: number
          updated_at: string
          vat_amount: number
          vat_rate: number
          year: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer?: Json
          drive_url?: string | null
          id?: string
          invoice_date?: string
          lines?: Json
          notes?: string | null
          number: number
          pdf_filename?: string | null
          shift_id?: string | null
          subtotal?: number
          total?: number
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
          year: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer?: Json
          drive_url?: string | null
          id?: string
          invoice_date?: string
          lines?: Json
          notes?: string | null
          number?: number
          pdf_filename?: string | null
          shift_id?: string | null
          subtotal?: number
          total?: number
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_initials: string
          created_at: string
          display_name: string
          id: string
          phone: string | null
          staff_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_initials?: string
          created_at?: string
          display_name?: string
          id: string
          phone?: string | null
          staff_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_initials?: string
          created_at?: string
          display_name?: string
          id?: string
          phone?: string | null
          staff_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_points: {
        Row: {
          active: boolean
          address: string | null
          city: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          opening_hours: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          city?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          opening_hours?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          city?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          opening_hours?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      shifts: {
        Row: {
          adults: number
          assigned_staff_id: string | null
          bokun_created_at: string | null
          booking_channel: string | null
          booking_id: string | null
          channel_booking_ref: string | null
          created_at: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          date: string
          end_time: string
          external_booking_ref: string | null
          id: string
          infants: number
          meeting_point: string
          notes: string | null
          operations_notes: string | null
          participants: Json
          rate: number | null
          rate_title: string | null
          rental_point_id: string | null
          required_tags: string[]
          seller: string | null
          source: Database["public"]["Enums"]["shift_source"]
          start_time: string
          status: Database["public"]["Enums"]["shift_status"]
          teens: number
          ticket_sent: boolean
          tour_name: string
          trailers: number
          updated_at: string
        }
        Insert: {
          adults?: number
          assigned_staff_id?: string | null
          bokun_created_at?: string | null
          booking_channel?: string | null
          booking_id?: string | null
          channel_booking_ref?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          date: string
          end_time: string
          external_booking_ref?: string | null
          id?: string
          infants?: number
          meeting_point?: string
          notes?: string | null
          operations_notes?: string | null
          participants?: Json
          rate?: number | null
          rate_title?: string | null
          rental_point_id?: string | null
          required_tags?: string[]
          seller?: string | null
          source?: Database["public"]["Enums"]["shift_source"]
          start_time: string
          status?: Database["public"]["Enums"]["shift_status"]
          teens?: number
          ticket_sent?: boolean
          tour_name: string
          trailers?: number
          updated_at?: string
        }
        Update: {
          adults?: number
          assigned_staff_id?: string | null
          bokun_created_at?: string | null
          booking_channel?: string | null
          booking_id?: string | null
          channel_booking_ref?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          date?: string
          end_time?: string
          external_booking_ref?: string | null
          id?: string
          infants?: number
          meeting_point?: string
          notes?: string | null
          operations_notes?: string | null
          participants?: Json
          rate?: number | null
          rate_title?: string | null
          rental_point_id?: string | null
          required_tags?: string[]
          seller?: string | null
          source?: Database["public"]["Enums"]["shift_source"]
          start_time?: string
          status?: Database["public"]["Enums"]["shift_status"]
          teens?: number
          ticket_sent?: boolean
          tour_name?: string
          trailers?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_assigned_staff_id_fkey"
            columns: ["assigned_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_rental_point_id_fkey"
            columns: ["rental_point_id"]
            isOneToOne: false
            referencedRelation: "rental_points"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          active: boolean
          avatar: string
          created_at: string
          email: string | null
          id: string
          languages: string[]
          licenses: string[]
          name: string
          phone: string | null
          profile_id: string | null
          role: Database["public"]["Enums"]["staff_role"]
          status: Database["public"]["Enums"]["staff_status"]
          tags: string[]
          updated_at: string
        }
        Insert: {
          active?: boolean
          avatar?: string
          created_at?: string
          email?: string | null
          id?: string
          languages?: string[]
          licenses?: string[]
          name: string
          phone?: string | null
          profile_id?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
          status?: Database["public"]["Enums"]["staff_status"]
          tags?: string[]
          updated_at?: string
        }
        Update: {
          active?: boolean
          avatar?: string
          created_at?: string
          email?: string | null
          id?: string
          languages?: string[]
          licenses?: string[]
          name?: string
          phone?: string | null
          profile_id?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
          status?: Database["public"]["Enums"]["staff_status"]
          tags?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      staff_rental_points: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          rental_point_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          rental_point_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          rental_point_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_rental_points_rental_point_id_fkey"
            columns: ["rental_point_id"]
            isOneToOne: false
            referencedRelation: "rental_points"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_unavailability: {
        Row: {
          all_day: boolean
          created_at: string
          date: string
          from_time: string | null
          id: string
          reason: string | null
          staff_id: string
          to_time: string | null
        }
        Insert: {
          all_day?: boolean
          created_at?: string
          date: string
          from_time?: string | null
          id?: string
          reason?: string | null
          staff_id: string
          to_time?: string | null
        }
        Update: {
          all_day?: boolean
          created_at?: string
          date?: string
          from_time?: string | null
          id?: string
          reason?: string | null
          staff_id?: string
          to_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_unavailability_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      task_updates: {
        Row: {
          attachments: Json
          author_staff_id: string
          created_at: string
          id: string
          message: string
          read: boolean
          task_id: string
          type: Database["public"]["Enums"]["task_update_type"]
        }
        Insert: {
          attachments?: Json
          author_staff_id: string
          created_at?: string
          id?: string
          message: string
          read?: boolean
          task_id: string
          type?: Database["public"]["Enums"]["task_update_type"]
        }
        Update: {
          attachments?: Json
          author_staff_id?: string
          created_at?: string
          id?: string
          message?: string
          read?: boolean
          task_id?: string
          type?: Database["public"]["Enums"]["task_update_type"]
        }
        Relationships: [
          {
            foreignKeyName: "task_updates_author_staff_id_fkey"
            columns: ["author_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_updates_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string
          created_at: string
          description: string | null
          done: boolean
          due: string
          id: string
          priority: Database["public"]["Enums"]["task_priority"]
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to: string
          created_at?: string
          description?: string | null
          done?: boolean
          due: string
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string
          created_at?: string
          description?: string | null
          done?: boolean
          due?: string
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      waiver_signatures: {
        Row: {
          booking_id: string | null
          created_at: string
          email: string | null
          external_signature_id: string | null
          id: string
          matched_shift_id: string | null
          raw_payload: Json
          signed_at: string
          signer_name: string | null
          waiver_template_id: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          email?: string | null
          external_signature_id?: string | null
          id?: string
          matched_shift_id?: string | null
          raw_payload?: Json
          signed_at?: string
          signer_name?: string | null
          waiver_template_id?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          email?: string | null
          external_signature_id?: string | null
          id?: string
          matched_shift_id?: string | null
          raw_payload?: Json
          signed_at?: string
          signer_name?: string | null
          waiver_template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waiver_signatures_matched_shift_id_fkey"
            columns: ["matched_shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
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
      next_invoice_number: { Args: { _year: number }; Returns: number }
      reject_shift: { Args: { _shift_id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "staff"
      field_update_type:
        | "field"
        | "progress"
        | "completed"
        | "blocker"
        | "broadcast"
      note_category: "general" | "bike_issue" | "customer" | "incident"
      notification_type:
        | "assigned"
        | "reassigned"
        | "unassigned"
        | "shift_updated"
        | "shift_cancelled"
        | "broadcast"
        | "reminder"
        | "task"
      shift_source: "manual" | "bokun"
      shift_status: "unassigned" | "pending" | "accepted" | "rejected"
      staff_role: "guide" | "rental" | "mechanic" | "admin"
      staff_status: "available" | "on_shift" | "off"
      task_priority: "low" | "medium" | "high"
      task_update_type: "progress" | "completed" | "blocker"
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
      app_role: ["admin", "staff"],
      field_update_type: [
        "field",
        "progress",
        "completed",
        "blocker",
        "broadcast",
      ],
      note_category: ["general", "bike_issue", "customer", "incident"],
      notification_type: [
        "assigned",
        "reassigned",
        "unassigned",
        "shift_updated",
        "shift_cancelled",
        "broadcast",
        "reminder",
        "task",
      ],
      shift_source: ["manual", "bokun"],
      shift_status: ["unassigned", "pending", "accepted", "rejected"],
      staff_role: ["guide", "rental", "mechanic", "admin"],
      staff_status: ["available", "on_shift", "off"],
      task_priority: ["low", "medium", "high"],
      task_update_type: ["progress", "completed", "blocker"],
    },
  },
} as const
