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
      bokun_import_runs: {
        Row: {
          created: number
          created_at: string
          error_message: string | null
          errors: Json
          finished_at: string | null
          from_date: string
          id: string
          next_page: number
          skipped: number
          started_at: string
          success: boolean
          to_date: string
          total_hits: number | null
          total_seen: number
          trigger: string
          updated: number
        }
        Insert: {
          created?: number
          created_at?: string
          error_message?: string | null
          errors?: Json
          finished_at?: string | null
          from_date: string
          id?: string
          next_page?: number
          skipped?: number
          started_at?: string
          success?: boolean
          to_date: string
          total_hits?: number | null
          total_seen?: number
          trigger?: string
          updated?: number
        }
        Update: {
          created?: number
          created_at?: string
          error_message?: string | null
          errors?: Json
          finished_at?: string | null
          from_date?: string
          id?: string
          next_page?: number
          skipped?: number
          started_at?: string
          success?: boolean
          to_date?: string
          total_hits?: number | null
          total_seen?: number
          trigger?: string
          updated?: number
        }
        Relationships: []
      }
      booking_notes: {
        Row: {
          attachments: Json
          author_name: string
          author_profile_id: string
          author_role: string
          created_at: string
          id: string
          message: string
          shift_id: string
        }
        Insert: {
          attachments?: Json
          author_name?: string
          author_profile_id: string
          author_role?: string
          created_at?: string
          id?: string
          message: string
          shift_id: string
        }
        Update: {
          attachments?: Json
          author_name?: string
          author_profile_id?: string
          author_role?: string
          created_at?: string
          id?: string
          message?: string
          shift_id?: string
        }
        Relationships: []
      }
      broadcast_comments: {
        Row: {
          author_initials: string | null
          author_name: string
          author_profile_id: string
          created_at: string
          field_update_id: string
          id: string
          message: string
          updated_at: string
        }
        Insert: {
          author_initials?: string | null
          author_name: string
          author_profile_id: string
          created_at?: string
          field_update_id: string
          id?: string
          message: string
          updated_at?: string
        }
        Update: {
          author_initials?: string | null
          author_name?: string
          author_profile_id?: string
          created_at?: string
          field_update_id?: string
          id?: string
          message?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_comments_field_update_id_fkey"
            columns: ["field_update_id"]
            isOneToOne: false
            referencedRelation: "field_updates"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_reactions: {
        Row: {
          created_at: string
          emoji: string
          field_update_id: string
          id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          field_update_id: string
          id?: string
          profile_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          field_update_id?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_reactions_field_update_id_fkey"
            columns: ["field_update_id"]
            isOneToOne: false
            referencedRelation: "field_updates"
            referencedColumns: ["id"]
          },
        ]
      }
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
          archived_at: string | null
          attachment_count: number | null
          attachments: Json
          body: string
          created_at: string
          field_update_id: string | null
          id: string
          link: string | null
          read: boolean
          shift_id: string | null
          staff_id: string
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Insert: {
          archived_at?: string | null
          attachment_count?: number | null
          attachments?: Json
          body: string
          created_at?: string
          field_update_id?: string | null
          id?: string
          link?: string | null
          read?: boolean
          shift_id?: string | null
          staff_id: string
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Update: {
          archived_at?: string | null
          attachment_count?: number | null
          attachments?: Json
          body?: string
          created_at?: string
          field_update_id?: string | null
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
      guide_payout_rates: {
        Row: {
          created_at: string
          private_rate: number | null
          product_id: string
          tier1: number
          tier2: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          private_rate?: number | null
          product_id: string
          tier1: number
          tier2: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          private_rate?: number | null
          product_id?: string
          tier1?: number
          tier2?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
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
      note_templates: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_initials: string
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          phone: string | null
          staff_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_initials?: string
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id: string
          phone?: string | null
          staff_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_initials?: string
          avatar_url?: string | null
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
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string
          p256dh: string
          profile_id: string
          staff_id: string | null
          user_agent: string | null
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string
          p256dh: string
          profile_id: string
          staff_id?: string | null
          user_agent?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string
          p256dh?: string
          profile_id?: string
          staff_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_point_day_assignments: {
        Row: {
          accepted_at: string | null
          created_at: string
          created_by: string | null
          date: string
          id: string
          notes: string | null
          pending_expires_at: string | null
          rejection_reason: string | null
          reminder_24h_sent_at: string | null
          reminder_2h_sent_at: string | null
          rental_point_id: string
          rental_staff_id: string
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string | null
          date: string
          id?: string
          notes?: string | null
          pending_expires_at?: string | null
          rejection_reason?: string | null
          reminder_24h_sent_at?: string | null
          reminder_2h_sent_at?: string | null
          rental_point_id: string
          rental_staff_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          notes?: string | null
          pending_expires_at?: string | null
          rejection_reason?: string | null
          reminder_24h_sent_at?: string | null
          reminder_2h_sent_at?: string | null
          rental_point_id?: string
          rental_staff_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_point_day_assignments_rental_point_id_fkey"
            columns: ["rental_point_id"]
            isOneToOne: false
            referencedRelation: "rental_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_point_day_assignments_rental_staff_id_fkey"
            columns: ["rental_staff_id"]
            isOneToOne: false
            referencedRelation: "rental_staff"
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
      rental_staff: {
        Row: {
          active: boolean
          avatar: string
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          profile_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          avatar?: string
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          profile_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          avatar?: string
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          profile_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rental_staff_notifications: {
        Row: {
          archived_at: string | null
          body: string
          created_at: string
          date: string | null
          id: string
          link: string | null
          read: boolean
          rental_point_id: string | null
          rental_staff_id: string
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Insert: {
          archived_at?: string | null
          body: string
          created_at?: string
          date?: string | null
          id?: string
          link?: string | null
          read?: boolean
          rental_point_id?: string | null
          rental_staff_id: string
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Update: {
          archived_at?: string | null
          body?: string
          created_at?: string
          date?: string | null
          id?: string
          link?: string | null
          read?: boolean
          rental_point_id?: string | null
          rental_staff_id?: string
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
        }
        Relationships: [
          {
            foreignKeyName: "rental_staff_notifications_rental_point_id_fkey"
            columns: ["rental_point_id"]
            isOneToOne: false
            referencedRelation: "rental_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_staff_notifications_rental_staff_id_fkey"
            columns: ["rental_staff_id"]
            isOneToOne: false
            referencedRelation: "rental_staff"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_staff_task_updates: {
        Row: {
          attachments: Json
          author_rental_staff_id: string | null
          created_at: string
          id: string
          message: string
          read: boolean
          task_id: string
          type: Database["public"]["Enums"]["task_update_type"]
        }
        Insert: {
          attachments?: Json
          author_rental_staff_id?: string | null
          created_at?: string
          id?: string
          message: string
          read?: boolean
          task_id: string
          type?: Database["public"]["Enums"]["task_update_type"]
        }
        Update: {
          attachments?: Json
          author_rental_staff_id?: string | null
          created_at?: string
          id?: string
          message?: string
          read?: boolean
          task_id?: string
          type?: Database["public"]["Enums"]["task_update_type"]
        }
        Relationships: [
          {
            foreignKeyName: "rental_staff_task_updates_author_rental_staff_id_fkey"
            columns: ["author_rental_staff_id"]
            isOneToOne: false
            referencedRelation: "rental_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_staff_task_updates_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "rental_staff_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_staff_tasks: {
        Row: {
          assigned_to: string
          created_at: string
          created_by: string | null
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
          created_by?: string | null
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
          created_by?: string | null
          description?: string | null
          done?: boolean
          due?: string
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_staff_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "rental_staff"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_staff_unavailability: {
        Row: {
          all_day: boolean
          created_at: string
          date: string
          from_time: string | null
          id: string
          reason: string | null
          rental_staff_id: string
          to_time: string | null
        }
        Insert: {
          all_day?: boolean
          created_at?: string
          date: string
          from_time?: string | null
          id?: string
          reason?: string | null
          rental_staff_id: string
          to_time?: string | null
        }
        Update: {
          all_day?: boolean
          created_at?: string
          date?: string
          from_time?: string | null
          id?: string
          reason?: string | null
          rental_staff_id?: string
          to_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rental_staff_unavailability_rental_staff_id_fkey"
            columns: ["rental_staff_id"]
            isOneToOne: false
            referencedRelation: "rental_staff"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_additional_guides: {
        Row: {
          assigned_by: string | null
          created_at: string
          id: string
          payout_amount: number | null
          payout_paid: boolean
          payout_paid_at: string | null
          payout_tier: number | null
          rejection_reason: string | null
          responded_at: string | null
          shift_id: string
          staff_id: string
          status: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          payout_amount?: number | null
          payout_paid?: boolean
          payout_paid_at?: string | null
          payout_tier?: number | null
          rejection_reason?: string | null
          responded_at?: string | null
          shift_id: string
          staff_id: string
          status?: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          payout_amount?: number | null
          payout_paid?: boolean
          payout_paid_at?: string | null
          payout_tier?: number | null
          rejection_reason?: string | null
          responded_at?: string | null
          shift_id?: string
          staff_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_additional_guides_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_additional_guides_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_dispatch_events: {
        Row: {
          actor_profile_id: string | null
          created_at: string
          event_type: string
          id: string
          previous_staff_id: string | null
          reason: string | null
          shift_id: string
          staff_id: string | null
        }
        Insert: {
          actor_profile_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          previous_staff_id?: string | null
          reason?: string | null
          shift_id: string
          staff_id?: string | null
        }
        Update: {
          actor_profile_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          previous_staff_id?: string | null
          reason?: string | null
          shift_id?: string
          staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_dispatch_events_previous_staff_id_fkey"
            columns: ["previous_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_dispatch_events_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_dispatch_events_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          adults: number
          assigned_staff_id: string | null
          bokun_created_at: string | null
          bokun_product_id: string | null
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
          no_show: boolean
          no_show_notes: string | null
          no_show_reported_at: string | null
          no_show_reported_by: string | null
          notes: string | null
          operations_notes: string | null
          participants: Json
          payout_amount: number | null
          payout_paid: boolean
          payout_paid_at: string | null
          payout_paid_by: string | null
          payout_tier: number | null
          pending_expires_at: string | null
          rate: number | null
          rate_title: string | null
          rejected_by_staff_ids: string[]
          rejection_reason: string | null
          reminder_24h_sent_at: string | null
          reminder_2h_sent_at: string | null
          rental_point_id: string | null
          requested_by: string | null
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
          bokun_product_id?: string | null
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
          no_show?: boolean
          no_show_notes?: string | null
          no_show_reported_at?: string | null
          no_show_reported_by?: string | null
          notes?: string | null
          operations_notes?: string | null
          participants?: Json
          payout_amount?: number | null
          payout_paid?: boolean
          payout_paid_at?: string | null
          payout_paid_by?: string | null
          payout_tier?: number | null
          pending_expires_at?: string | null
          rate?: number | null
          rate_title?: string | null
          rejected_by_staff_ids?: string[]
          rejection_reason?: string | null
          reminder_24h_sent_at?: string | null
          reminder_2h_sent_at?: string | null
          rental_point_id?: string | null
          requested_by?: string | null
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
          bokun_product_id?: string | null
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
          no_show?: boolean
          no_show_notes?: string | null
          no_show_reported_at?: string | null
          no_show_reported_by?: string | null
          notes?: string | null
          operations_notes?: string | null
          participants?: Json
          payout_amount?: number | null
          payout_paid?: boolean
          payout_paid_at?: string | null
          payout_paid_by?: string | null
          payout_tier?: number | null
          pending_expires_at?: string | null
          rate?: number | null
          rate_title?: string | null
          rejected_by_staff_ids?: string[]
          rejection_reason?: string | null
          reminder_24h_sent_at?: string | null
          reminder_2h_sent_at?: string | null
          rental_point_id?: string | null
          requested_by?: string | null
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
      accept_additional_guide_assignment: {
        Args: { _shift_id: string }
        Returns: undefined
      }
      accept_rental_day: {
        Args: { _assignment_id: string }
        Returns: undefined
      }
      accept_shift: { Args: { _shift_id: string }; Returns: undefined }
      can_read_attachment: { Args: { _path: string }; Returns: boolean }
      cancel_shift_request: {
        Args: { _reason?: string; _shift_id: string }
        Returns: undefined
      }
      expire_rental_day_requests: { Args: never; Returns: number }
      expire_shift_requests: { Args: never; Returns: number }
      get_bokun_cron_status: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_additional_guide_for_shift: {
        Args: { _profile_id: string; _shift_id: string }
        Returns: boolean
      }
      is_bokun_runs_allowed: { Args: { _user_id: string }; Returns: boolean }
      is_primary_guide_for_shift: {
        Args: { _profile_id: string; _shift_id: string }
        Returns: boolean
      }
      is_rental_staff: { Args: { _user_id: string }; Returns: boolean }
      is_staff_assigned_to_rental_shift: {
        Args: { _staff_id: string }
        Returns: boolean
      }
      my_signed_waiver_shift_ids: { Args: never; Returns: string[] }
      next_invoice_number: { Args: { _year: number }; Returns: number }
      prune_bokun_import_runs: { Args: never; Returns: number }
      reject_additional_guide_assignment: {
        Args: { _reason?: string; _shift_id: string }
        Returns: undefined
      }
      reject_rental_day: {
        Args: { _assignment_id: string; _reason?: string }
        Returns: undefined
      }
      reject_shift: {
        Args: { _reason?: string; _shift_id: string }
        Returns: undefined
      }
      send_rental_point_reminders: { Args: never; Returns: number }
      send_shift_reminders: { Args: never; Returns: number }
      set_shift_no_show: {
        Args: { _no_show: boolean; _notes?: string; _shift_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "staff" | "rental_staff"
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
        | "shift_accepted"
        | "shift_rejected"
        | "no_show"
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
      app_role: ["admin", "staff", "rental_staff"],
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
        "shift_accepted",
        "shift_rejected",
        "no_show",
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
