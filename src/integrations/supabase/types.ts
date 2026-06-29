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
      agent_actions: {
        Row: {
          action: string
          agent: Database["public"]["Enums"]["agent_name"]
          autonomy: Database["public"]["Enums"]["agent_autonomy"]
          created_at: string
          error: string | null
          id: string
          input: Json | null
          location_id: string | null
          outcome: Database["public"]["Enums"]["agent_outcome"]
          output: Json | null
          reasoning: string
          target_row_id: string | null
          target_table: string | null
        }
        Insert: {
          action: string
          agent: Database["public"]["Enums"]["agent_name"]
          autonomy?: Database["public"]["Enums"]["agent_autonomy"]
          created_at?: string
          error?: string | null
          id?: string
          input?: Json | null
          location_id?: string | null
          outcome?: Database["public"]["Enums"]["agent_outcome"]
          output?: Json | null
          reasoning: string
          target_row_id?: string | null
          target_table?: string | null
        }
        Update: {
          action?: string
          agent?: Database["public"]["Enums"]["agent_name"]
          autonomy?: Database["public"]["Enums"]["agent_autonomy"]
          created_at?: string
          error?: string | null
          id?: string
          input?: Json | null
          location_id?: string | null
          outcome?: Database["public"]["Enums"]["agent_outcome"]
          output?: Json | null
          reasoning?: string
          target_row_id?: string | null
          target_table?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_actions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_settings: {
        Row: {
          agent: Database["public"]["Enums"]["agent_name"]
          autonomy: Database["public"]["Enums"]["agent_autonomy"]
          enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          agent: Database["public"]["Enums"]["agent_name"]
          autonomy?: Database["public"]["Enums"]["agent_autonomy"]
          enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          agent?: Database["public"]["Enums"]["agent_name"]
          autonomy?: Database["public"]["Enums"]["agent_autonomy"]
          enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      ai_artifacts: {
        Row: {
          content: Json
          created_at: string
          created_by: string | null
          id: string
          kind: Database["public"]["Enums"]["ai_artifact_kind"]
          location_id: string | null
          model: string | null
          source_ref: string | null
          title: string | null
        }
        Insert: {
          content?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          kind: Database["public"]["Enums"]["ai_artifact_kind"]
          location_id?: string | null
          model?: string | null
          source_ref?: string | null
          title?: string | null
        }
        Update: {
          content?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["ai_artifact_kind"]
          location_id?: string | null
          model?: string | null
          source_ref?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_artifacts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          attraction_id: string | null
          category: string | null
          created_at: string
          criticality: Database["public"]["Enums"]["asset_criticality"]
          deleted_at: string | null
          heartbeat_interval_minutes: number | null
          id: string
          installed_on: string | null
          last_heartbeat_at: string | null
          location_id: string
          manufacturer: string | null
          model: string | null
          name: string
          notes: string | null
          tag: string
          updated_at: string
          warranty_expires_on: string | null
        }
        Insert: {
          attraction_id?: string | null
          category?: string | null
          created_at?: string
          criticality?: Database["public"]["Enums"]["asset_criticality"]
          deleted_at?: string | null
          heartbeat_interval_minutes?: number | null
          id?: string
          installed_on?: string | null
          last_heartbeat_at?: string | null
          location_id: string
          manufacturer?: string | null
          model?: string | null
          name: string
          notes?: string | null
          tag: string
          updated_at?: string
          warranty_expires_on?: string | null
        }
        Update: {
          attraction_id?: string | null
          category?: string | null
          created_at?: string
          criticality?: Database["public"]["Enums"]["asset_criticality"]
          deleted_at?: string | null
          heartbeat_interval_minutes?: number | null
          id?: string
          installed_on?: string | null
          last_heartbeat_at?: string | null
          location_id?: string
          manufacturer?: string | null
          model?: string | null
          name?: string
          notes?: string | null
          tag?: string
          updated_at?: string
          warranty_expires_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_attraction_id_fkey"
            columns: ["attraction_id"]
            isOneToOne: false
            referencedRelation: "attractions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      attractions: {
        Row: {
          capacity: number | null
          category: string | null
          code: string
          created_at: string
          id: string
          location_id: string
          name: string
          status: Database["public"]["Enums"]["attraction_status"]
          throughput_per_hour: number | null
          updated_at: string
        }
        Insert: {
          capacity?: number | null
          category?: string | null
          code: string
          created_at?: string
          id?: string
          location_id: string
          name: string
          status?: Database["public"]["Enums"]["attraction_status"]
          throughput_per_hour?: number | null
          updated_at?: string
        }
        Update: {
          capacity?: number | null
          category?: string | null
          code?: string
          created_at?: string
          id?: string
          location_id?: string
          name?: string
          status?: Database["public"]["Enums"]["attraction_status"]
          throughput_per_hour?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attractions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          id: string
          location_id: string | null
          metadata: Json | null
          reason: string | null
          row_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          location_id?: string | null
          metadata?: Json | null
          reason?: string | null
          row_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          location_id?: string | null
          metadata?: Json | null
          reason?: string | null
          row_id?: string | null
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      audits: {
        Row: {
          audit_type: Database["public"]["Enums"]["audit_type"]
          auditor_id: string | null
          conducted_on: string
          created_at: string
          id: string
          location_id: string
          score: number | null
          summary: string | null
          updated_at: string
        }
        Insert: {
          audit_type: Database["public"]["Enums"]["audit_type"]
          auditor_id?: string | null
          conducted_on?: string
          created_at?: string
          id?: string
          location_id: string
          score?: number | null
          summary?: string | null
          updated_at?: string
        }
        Update: {
          audit_type?: Database["public"]["Enums"]["audit_type"]
          auditor_id?: string | null
          conducted_on?: string
          created_at?: string
          id?: string
          location_id?: string
          score?: number | null
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audits_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          contact_email: string | null
          contact_name: string
          contact_phone: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deposit_amount: number | null
          ends_at: string | null
          id: string
          kind: Database["public"]["Enums"]["booking_kind"]
          location_id: string
          notes: string | null
          party_size: number
          quote_amount: number | null
          reference: string
          starts_at: string
          status: Database["public"]["Enums"]["booking_status"]
          total_amount: number | null
          updated_at: string
        }
        Insert: {
          contact_email?: string | null
          contact_name: string
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deposit_amount?: number | null
          ends_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["booking_kind"]
          location_id: string
          notes?: string | null
          party_size?: number
          quote_amount?: number | null
          reference?: string
          starts_at: string
          status?: Database["public"]["Enums"]["booking_status"]
          total_amount?: number | null
          updated_at?: string
        }
        Update: {
          contact_email?: string | null
          contact_name?: string
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deposit_amount?: number | null
          ends_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["booking_kind"]
          location_id?: string
          notes?: string | null
          party_size?: number
          quote_amount?: number | null
          reference?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["booking_status"]
          total_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_documents: {
        Row: {
          certificate_number: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          contract_id: string | null
          created_at: string
          created_by: string | null
          document_name: string | null
          document_type: string
          expiry_date: string | null
          file_mime: string | null
          file_name: string | null
          file_path: string | null
          id: string
          issue_date: string | null
          issuing_authority: string | null
          location_id: string
          notes: string | null
          notification_date: string | null
          outstanding_amount: number
          paid_amount: number
          payment_status: string
          priority: string | null
          quotation_amount: number
          reference_number: string | null
          remarks: string | null
          renewal_due_date: string | null
          renewal_status: string
          responsible_person: string | null
          status: string
          submission_deadline: string | null
          submitted_at: string | null
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          certificate_number?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          document_name?: string | null
          document_type: string
          expiry_date?: string | null
          file_mime?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          issue_date?: string | null
          issuing_authority?: string | null
          location_id: string
          notes?: string | null
          notification_date?: string | null
          outstanding_amount?: number
          paid_amount?: number
          payment_status?: string
          priority?: string | null
          quotation_amount?: number
          reference_number?: string | null
          remarks?: string | null
          renewal_due_date?: string | null
          renewal_status?: string
          responsible_person?: string | null
          status?: string
          submission_deadline?: string | null
          submitted_at?: string | null
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          certificate_number?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          document_name?: string | null
          document_type?: string
          expiry_date?: string | null
          file_mime?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          issue_date?: string | null
          issuing_authority?: string | null
          location_id?: string
          notes?: string | null
          notification_date?: string | null
          outstanding_amount?: number
          paid_amount?: number
          payment_status?: string
          priority?: string | null
          quotation_amount?: number
          reference_number?: string | null
          remarks?: string | null
          renewal_due_date?: string | null
          renewal_status?: string
          responsible_person?: string | null
          status?: string
          submission_deadline?: string | null
          submitted_at?: string | null
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_documents_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      complaints: {
        Row: {
          ai_triage: Json | null
          category: string | null
          channel: string
          created_at: string
          deleted_at: string | null
          guest_contact: string | null
          guest_name: string | null
          handled_by: string | null
          id: string
          location_id: string
          resolution_notes: string | null
          resolved_at: string | null
          severity: string
          status: Database["public"]["Enums"]["complaint_status"]
          summary: string
          updated_at: string
        }
        Insert: {
          ai_triage?: Json | null
          category?: string | null
          channel?: string
          created_at?: string
          deleted_at?: string | null
          guest_contact?: string | null
          guest_name?: string | null
          handled_by?: string | null
          id?: string
          location_id: string
          resolution_notes?: string | null
          resolved_at?: string | null
          severity?: string
          status?: Database["public"]["Enums"]["complaint_status"]
          summary: string
          updated_at?: string
        }
        Update: {
          ai_triage?: Json | null
          category?: string | null
          channel?: string
          created_at?: string
          deleted_at?: string | null
          guest_contact?: string | null
          guest_name?: string | null
          handled_by?: string | null
          id?: string
          location_id?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          severity?: string
          status?: Database["public"]["Enums"]["complaint_status"]
          summary?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaints_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_votes: {
        Row: {
          created_at: string
          decision_id: string
          id: string
          note: string | null
          vote: Database["public"]["Enums"]["vote_type"]
          voter_id: string
        }
        Insert: {
          created_at?: string
          decision_id: string
          id?: string
          note?: string | null
          vote: Database["public"]["Enums"]["vote_type"]
          voter_id: string
        }
        Update: {
          created_at?: string
          decision_id?: string
          id?: string
          note?: string | null
          vote?: Database["public"]["Enums"]["vote_type"]
          voter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_votes_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      decisions: {
        Row: {
          ai_summary: string | null
          created_at: string
          description: string | null
          due_date: string | null
          estimated_impact_aed: number | null
          id: string
          priority: Database["public"]["Enums"]["decision_priority"]
          proposed_by: string | null
          status: Database["public"]["Enums"]["decision_status"]
          title: string
          updated_at: string
        }
        Insert: {
          ai_summary?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          estimated_impact_aed?: number | null
          id?: string
          priority?: Database["public"]["Enums"]["decision_priority"]
          proposed_by?: string | null
          status?: Database["public"]["Enums"]["decision_status"]
          title: string
          updated_at?: string
        }
        Update: {
          ai_summary?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          estimated_impact_aed?: number | null
          id?: string
          priority?: Database["public"]["Enums"]["decision_priority"]
          proposed_by?: string | null
          status?: Database["public"]["Enums"]["decision_status"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      delivery_request_items: {
        Row: {
          id: string
          delivery_request_id: string
          category: Database["public"]["Enums"]["delivery_item_category"]
          item_name: string
          quantity_requested: number
          quantity_dispatched: number | null
          quantity_received: number | null
          unit: string | null
          remarks: string | null
          created_at: string
        }
        Insert: {
          id?: string
          delivery_request_id: string
          category?: Database["public"]["Enums"]["delivery_item_category"]
          item_name: string
          quantity_requested?: number
          quantity_dispatched?: number | null
          quantity_received?: number | null
          unit?: string | null
          remarks?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          delivery_request_id?: string
          category?: Database["public"]["Enums"]["delivery_item_category"]
          item_name?: string
          quantity_requested?: number
          quantity_dispatched?: number | null
          quantity_received?: number | null
          unit?: string | null
          remarks?: string | null
          created_at?: string
        }
        Relationships: []
      }
      delivery_request_photos: {
        Row: {
          id: string
          delivery_request_id: string
          file_path: string
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          delivery_request_id: string
          file_path: string
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          delivery_request_id?: string
          file_path?: string
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      delivery_requests: {
        Row: {
          id: string
          request_number: string
          location_id: string
          department: string | null
          requested_by: string
          request_date: string
          priority: Database["public"]["Enums"]["maintenance_priority"]
          remarks: string | null
          status: Database["public"]["Enums"]["delivery_request_status"]
          reviewed_by: string | null
          reviewed_at: string | null
          review_notes: string | null
          dispatch_personnel_id: string | null
          dispatched_at: string | null
          dispatch_notes: string | null
          verification_remarks: string | null
          shortage_notes: string | null
          created_by: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          request_number: string
          location_id: string
          department?: string | null
          requested_by: string
          request_date?: string
          priority?: Database["public"]["Enums"]["maintenance_priority"]
          remarks?: string | null
          status?: Database["public"]["Enums"]["delivery_request_status"]
          reviewed_by?: string | null
          reviewed_at?: string | null
          review_notes?: string | null
          dispatch_personnel_id?: string | null
          dispatched_at?: string | null
          dispatch_notes?: string | null
          verification_remarks?: string | null
          shortage_notes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          request_number?: string
          location_id?: string
          department?: string | null
          requested_by?: string
          request_date?: string
          priority?: Database["public"]["Enums"]["maintenance_priority"]
          remarks?: string | null
          status?: Database["public"]["Enums"]["delivery_request_status"]
          reviewed_by?: string | null
          reviewed_at?: string | null
          review_notes?: string | null
          dispatch_personnel_id?: string | null
          dispatched_at?: string | null
          dispatch_notes?: string | null
          verification_remarks?: string | null
          shortage_notes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: []
      }
      delivery_signatures: {
        Row: {
          id: string
          delivery_request_id: string
          signer_role: string
          signer_name: string
          signature_data: string
          signed_by: string | null
          signed_at: string
        }
        Insert: {
          id?: string
          delivery_request_id: string
          signer_role: string
          signer_name: string
          signature_data: string
          signed_by?: string | null
          signed_at?: string
        }
        Update: {
          id?: string
          delivery_request_id?: string
          signer_role?: string
          signer_name?: string
          signature_data?: string
          signed_by?: string | null
          signed_at?: string
        }
        Relationships: []
      }
      downtime_events: {
        Row: {
          asset_id: string | null
          closed_by: string | null
          created_at: string
          duration_minutes: number | null
          ended_at: string | null
          id: string
          location_id: string
          notes: string | null
          opened_by: string | null
          reason: string
          source: string
          started_at: string
          ticket_id: string | null
          updated_at: string
          work_order_id: string | null
        }
        Insert: {
          asset_id?: string | null
          closed_by?: string | null
          created_at?: string
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          location_id: string
          notes?: string | null
          opened_by?: string | null
          reason: string
          source?: string
          started_at?: string
          ticket_id?: string | null
          updated_at?: string
          work_order_id?: string | null
        }
        Update: {
          asset_id?: string | null
          closed_by?: string | null
          created_at?: string
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          location_id?: string
          notes?: string | null
          opened_by?: string | null
          reason?: string
          source?: string
          started_at?: string
          ticket_id?: string | null
          updated_at?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "downtime_events_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "downtime_events_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "downtime_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "downtime_events_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      escalation_rules: {
        Row: {
          bump_priority: boolean
          created_at: string
          enabled: boolean
          id: string
          level: number
          location_id: string | null
          minutes_after_sla: number
          name: string
          scope_category: string | null
          scope_priority: string | null
          target_role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          bump_priority?: boolean
          created_at?: string
          enabled?: boolean
          id?: string
          level?: number
          location_id?: string | null
          minutes_after_sla?: number
          name: string
          scope_category?: string | null
          scope_priority?: string | null
          target_role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          bump_priority?: boolean
          created_at?: string
          enabled?: boolean
          id?: string
          level?: number
          location_id?: string | null
          minutes_after_sla?: number
          name?: string
          scope_category?: string | null
          scope_priority?: string | null
          target_role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "escalation_rules_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      escalations: {
        Row: {
          created_at: string
          detail: string | null
          due_at: string | null
          id: string
          level: number
          location_id: string
          owner_id: string | null
          resolved_at: string | null
          rule_id: string | null
          severity: string
          source: string
          source_id: string | null
          status: string
          ticket_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          due_at?: string | null
          id?: string
          level?: number
          location_id: string
          owner_id?: string | null
          resolved_at?: string | null
          rule_id?: string | null
          severity?: string
          source: string
          source_id?: string | null
          status?: string
          ticket_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          due_at?: string | null
          id?: string
          level?: number
          location_id?: string
          owner_id?: string | null
          resolved_at?: string | null
          rule_id?: string | null
          severity?: string
          source?: string
          source_id?: string | null
          status?: string
          ticket_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "escalations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalations_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "escalation_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalations_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_snapshots: {
        Row: {
          cogs: number
          created_at: string
          ebitda: number | null
          footfall: number | null
          id: string
          labor: number
          location_id: string
          marketing: number
          other_opex: number
          period_kind: string
          period_start: string
          rent: number
          revenue: number
          updated_at: string
          utilities: number
        }
        Insert: {
          cogs?: number
          created_at?: string
          ebitda?: number | null
          footfall?: number | null
          id?: string
          labor?: number
          location_id: string
          marketing?: number
          other_opex?: number
          period_kind?: string
          period_start: string
          rent?: number
          revenue?: number
          updated_at?: string
          utilities?: number
        }
        Update: {
          cogs?: number
          created_at?: string
          ebitda?: number | null
          footfall?: number | null
          id?: string
          labor?: number
          location_id?: string
          marketing?: number
          other_opex?: number
          period_kind?: string
          period_start?: string
          rent?: number
          revenue?: number
          updated_at?: string
          utilities?: number
        }
        Relationships: [
          {
            foreignKeyName: "financial_snapshots_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      findings: {
        Row: {
          audit_id: string
          closed_at: string | null
          created_at: string
          detail: string | null
          due_on: string | null
          id: string
          location_id: string
          owner_id: string | null
          severity: Database["public"]["Enums"]["finding_severity"]
          status: Database["public"]["Enums"]["finding_status"]
          title: string
          updated_at: string
        }
        Insert: {
          audit_id: string
          closed_at?: string | null
          created_at?: string
          detail?: string | null
          due_on?: string | null
          id?: string
          location_id: string
          owner_id?: string | null
          severity?: Database["public"]["Enums"]["finding_severity"]
          status?: Database["public"]["Enums"]["finding_status"]
          title: string
          updated_at?: string
        }
        Update: {
          audit_id?: string
          closed_at?: string | null
          created_at?: string
          detail?: string | null
          due_on?: string | null
          id?: string
          location_id?: string
          owner_id?: string | null
          severity?: Database["public"]["Enums"]["finding_severity"]
          status?: Database["public"]["Enums"]["finding_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "findings_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "findings_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      forecast_results: {
        Row: {
          assumptions: Json | null
          created_at: string
          forecast_id: string
          id: string
          location_id: string
          projected_ebitda: number
          projected_footfall: number
          projected_margin_pct: number
          projected_revenue: number
        }
        Insert: {
          assumptions?: Json | null
          created_at?: string
          forecast_id: string
          id?: string
          location_id: string
          projected_ebitda?: number
          projected_footfall?: number
          projected_margin_pct?: number
          projected_revenue?: number
        }
        Update: {
          assumptions?: Json | null
          created_at?: string
          forecast_id?: string
          id?: string
          location_id?: string
          projected_ebitda?: number
          projected_footfall?: number
          projected_margin_pct?: number
          projected_revenue?: number
        }
        Relationships: [
          {
            foreignKeyName: "forecast_results_forecast_id_fkey"
            columns: ["forecast_id"]
            isOneToOne: false
            referencedRelation: "forecasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forecast_results_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      forecasts: {
        Row: {
          ai_commentary: string | null
          base_margin_pct: number
          base_revenue_growth_pct: number
          capex_plan_aed: number
          created_at: string
          created_by: string | null
          description: string | null
          footfall_uplift_pct: number
          horizon_months: number
          id: string
          opex_change_pct: number
          status: Database["public"]["Enums"]["forecast_status"]
          title: string
          updated_at: string
        }
        Insert: {
          ai_commentary?: string | null
          base_margin_pct?: number
          base_revenue_growth_pct?: number
          capex_plan_aed?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          footfall_uplift_pct?: number
          horizon_months?: number
          id?: string
          opex_change_pct?: number
          status?: Database["public"]["Enums"]["forecast_status"]
          title: string
          updated_at?: string
        }
        Update: {
          ai_commentary?: string | null
          base_margin_pct?: number
          base_revenue_growth_pct?: number
          capex_plan_aed?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          footfall_uplift_pct?: number
          horizon_months?: number
          id?: string
          opex_change_pct?: number
          status?: Database["public"]["Enums"]["forecast_status"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      handovers: {
        Row: {
          created_at: string
          digest: Json
          from_user: string | null
          id: string
          location_id: string
          notes: string | null
          signed_at: string
          to_user: string | null
          window_end: string
          window_start: string
        }
        Insert: {
          created_at?: string
          digest?: Json
          from_user?: string | null
          id?: string
          location_id: string
          notes?: string | null
          signed_at?: string
          to_user?: string | null
          window_end?: string
          window_start: string
        }
        Update: {
          created_at?: string
          digest?: Json
          from_user?: string | null
          id?: string
          location_id?: string
          notes?: string | null
          signed_at?: string
          to_user?: string | null
          window_end?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "handovers_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          action_taken: string | null
          category: string
          closed_at: string | null
          created_at: string
          deleted_at: string | null
          detail: string | null
          id: string
          location_id: string
          occurred_at: string
          rca_actions: string | null
          rca_root_cause: string | null
          reported_by: string | null
          severity: string
          status: Database["public"]["Enums"]["incident_status"]
          summary: string
          updated_at: string
        }
        Insert: {
          action_taken?: string | null
          category: string
          closed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          detail?: string | null
          id?: string
          location_id: string
          occurred_at?: string
          rca_actions?: string | null
          rca_root_cause?: string | null
          reported_by?: string | null
          severity?: string
          status?: Database["public"]["Enums"]["incident_status"]
          summary: string
          updated_at?: string
        }
        Update: {
          action_taken?: string | null
          category?: string
          closed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          detail?: string | null
          id?: string
          location_id?: string
          occurred_at?: string
          rca_actions?: string | null
          rca_root_cause?: string | null
          reported_by?: string | null
          severity?: string
          status?: Database["public"]["Enums"]["incident_status"]
          summary?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidents_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          document_id: string
          embedding: string
          id: string
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string
          document_id: string
          embedding: string
          id?: string
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kb_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "kb_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_documents: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          metadata: Json
          source: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          source?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          source?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      leakage_cases: {
        Row: {
          category: string
          closed_at: string | null
          created_at: string
          detected_on: string
          estimated_loss: number | null
          hypothesis: string | null
          id: string
          location_id: string
          owner_id: string | null
          recovered_amount: number | null
          root_cause: string | null
          status: Database["public"]["Enums"]["leakage_status"]
          updated_at: string
        }
        Insert: {
          category: string
          closed_at?: string | null
          created_at?: string
          detected_on?: string
          estimated_loss?: number | null
          hypothesis?: string | null
          id?: string
          location_id: string
          owner_id?: string | null
          recovered_amount?: number | null
          root_cause?: string | null
          status?: Database["public"]["Enums"]["leakage_status"]
          updated_at?: string
        }
        Update: {
          category?: string
          closed_at?: string | null
          created_at?: string
          detected_on?: string
          estimated_loss?: number | null
          hypothesis?: string | null
          id?: string
          location_id?: string
          owner_id?: string | null
          recovered_amount?: number | null
          root_cause?: string | null
          status?: Database["public"]["Enums"]["leakage_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leakage_cases_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          city: string
          code: string
          country: string
          created_at: string
          gla_sqm: number | null
          id: string
          launched_on: string | null
          name: string
          region: string | null
          status: Database["public"]["Enums"]["location_status"]
          surge_mode: boolean
          surge_reason: string | null
          surge_started_at: string | null
          surge_started_by: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          city: string
          code: string
          country?: string
          created_at?: string
          gla_sqm?: number | null
          id?: string
          launched_on?: string | null
          name: string
          region?: string | null
          status?: Database["public"]["Enums"]["location_status"]
          surge_mode?: boolean
          surge_reason?: string | null
          surge_started_at?: string | null
          surge_started_by?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          city?: string
          code?: string
          country?: string
          created_at?: string
          gla_sqm?: number | null
          id?: string
          launched_on?: string | null
          name?: string
          region?: string | null
          status?: Database["public"]["Enums"]["location_status"]
          surge_mode?: boolean
          surge_reason?: string | null
          surge_started_at?: string | null
          surge_started_by?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      mall_requests: {
        Row: {
          category: string | null
          created_at: string
          detail: string | null
          id: string
          location_id: string
          raised_by: string | null
          responded_at: string | null
          response_due_at: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          location_id: string
          raised_by?: string | null
          responded_at?: string | null
          response_due_at?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          location_id?: string
          raised_by?: string | null
          responded_at?: string | null
          response_due_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mall_requests_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      obligations: {
        Row: {
          authority: string | null
          category: string | null
          created_at: string
          detail: string | null
          due_on: string | null
          id: string
          location_id: string
          owner_id: string | null
          recurrence: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          authority?: string | null
          category?: string | null
          created_at?: string
          detail?: string | null
          due_on?: string | null
          id?: string
          location_id: string
          owner_id?: string | null
          recurrence?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          authority?: string | null
          category?: string | null
          created_at?: string
          detail?: string | null
          due_on?: string | null
          id?: string
          location_id?: string
          owner_id?: string | null
          recurrence?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "obligations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_schedules: {
        Row: {
          active: boolean
          asset_id: string | null
          created_at: string
          created_by: string | null
          id: string
          interval_days: number
          kind: string
          last_generated_at: string | null
          location_id: string
          next_due_at: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          asset_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          interval_days: number
          kind?: string
          last_generated_at?: string | null
          location_id: string
          next_due_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          asset_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          interval_days?: number
          kind?: string
          last_generated_at?: string | null
          location_id?: string
          next_due_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_schedules_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_schedules_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          employee_code: string | null
          id: string
          phone: string | null
          pin_hash: string | null
          preferred_language: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          employee_code?: string | null
          id: string
          phone?: string | null
          pin_hash?: string | null
          preferred_language?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          employee_code?: string | null
          id?: string
          phone?: string | null
          pin_hash?: string | null
          preferred_language?: string
          updated_at?: string
        }
        Relationships: []
      }
      purchase_orders: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          category: string | null
          created_at: string
          currency: string
          deleted_at: string | null
          description: string | null
          id: string
          location_id: string
          po_number: string
          received_at: string | null
          requested_by: string | null
          status: Database["public"]["Enums"]["po_status"]
          updated_at: string
          vendor_name: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          category?: string | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          location_id: string
          po_number?: string
          received_at?: string | null
          requested_by?: string | null
          status?: Database["public"]["Enums"]["po_status"]
          updated_at?: string
          vendor_name: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          category?: string | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          location_id?: string
          po_number?: string
          received_at?: string | null
          requested_by?: string | null
          status?: Database["public"]["Enums"]["po_status"]
          updated_at?: string
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          clock_in_at: string | null
          clock_out_at: string | null
          created_at: string
          ends_at: string
          id: string
          location_id: string
          notes: string | null
          role_label: string | null
          roster_upload_id: string | null
          staff_id: string | null
          starts_at: string
          status: string
          swap_requested_at: string | null
          swap_requested_for: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          clock_in_at?: string | null
          clock_out_at?: string | null
          created_at?: string
          ends_at: string
          id?: string
          location_id: string
          notes?: string | null
          role_label?: string | null
          roster_upload_id?: string | null
          staff_id?: string | null
          starts_at: string
          status?: string
          swap_requested_at?: string | null
          swap_requested_for?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          clock_in_at?: string | null
          clock_out_at?: string | null
          created_at?: string
          ends_at?: string
          id?: string
          location_id?: string
          notes?: string | null
          role_label?: string | null
          roster_upload_id?: string | null
          staff_id?: string | null
          starts_at?: string
          status?: string
          swap_requested_at?: string | null
          swap_requested_for?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shifts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          created_at: string
          deleted_at: string | null
          department: string | null
          email: string | null
          employee_code: string
          full_name: string
          hire_date: string | null
          id: string
          job_title: string | null
          location_id: string
          phone: string | null
          staff_role: Database["public"]["Enums"]["staff_role"] | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          department?: string | null
          email?: string | null
          employee_code: string
          full_name: string
          hire_date?: string | null
          id?: string
          job_title?: string | null
          location_id: string
          phone?: string | null
          staff_role?: Database["public"]["Enums"]["staff_role"] | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          department?: string | null
          email?: string | null
          employee_code?: string
          full_name?: string
          hire_date?: string | null
          id?: string
          job_title?: string | null
          location_id?: string
          phone?: string | null
          staff_role?: Database["public"]["Enums"]["staff_role"] | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      master_departments: {
        Row: {
          active: boolean
          code: string | null
          created_at: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          code?: string | null
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string | null
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      staff_departments: {
        Row: {
          created_at: string
          department_id: string
          staff_id: string
        }
        Insert: {
          created_at?: string
          department_id: string
          staff_id: string
        }
        Update: {
          created_at?: string
          department_id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_departments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "master_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_departments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_leaderboard: {
        Row: {
          badge: string | null
          bookings_created: number
          complaints_handled: number
          created_at: string
          id: string
          incidents_resolved: number
          location_id: string | null
          overall_score: number
          period_end: string
          period_start: string
          profile_id: string
          rank: number | null
          tasks_completed: number
          updated_at: string
        }
        Insert: {
          badge?: string | null
          bookings_created?: number
          complaints_handled?: number
          created_at?: string
          id?: string
          incidents_resolved?: number
          location_id?: string | null
          overall_score?: number
          period_end: string
          period_start: string
          profile_id: string
          rank?: number | null
          tasks_completed?: number
          updated_at?: string
        }
        Update: {
          badge?: string | null
          bookings_created?: number
          complaints_handled?: number
          created_at?: string
          id?: string
          incidents_resolved?: number
          location_id?: string | null
          overall_score?: number
          period_end?: string
          period_start?: string
          profile_id?: string
          rank?: number | null
          tasks_completed?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_leaderboard_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_leaderboard_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_instances: {
        Row: {
          assigned_to: string | null
          created_at: string
          due_at: string | null
          id: string
          location_id: string
          status: string
          submitted_at: string | null
          submitted_by: string | null
          template_id: string
          title: string
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          location_id: string
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          template_id: string
          title: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          location_id?: string
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          template_id?: string
          title?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_instances_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_instances_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "task_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      task_item_results: {
        Row: {
          checked: boolean
          completed_at: string | null
          completed_by: string | null
          created_at: string
          id: string
          instance_id: string
          item_id: string
          note: string | null
          photo_path: string | null
          updated_at: string
        }
        Insert: {
          checked?: boolean
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          instance_id: string
          item_id: string
          note?: string | null
          photo_path?: string | null
          updated_at?: string
        }
        Update: {
          checked?: boolean
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          instance_id?: string
          item_id?: string
          note?: string | null
          photo_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_item_results_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "task_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_item_results_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "task_template_items"
            referencedColumns: ["id"]
          },
        ]
      }
      task_template_items: {
        Row: {
          created_at: string
          id: string
          label: string
          position: number
          required: boolean
          requires_photo: boolean
          template_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          position?: number
          required?: boolean
          requires_photo?: boolean
          template_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          position?: number
          required?: boolean
          requires_photo?: boolean
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "task_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      task_templates: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          kind: string
          location_id: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          kind?: string
          location_id: string
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          kind?: string
          location_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_templates_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          asset_id: string | null
          assigned_to: string | null
          attraction_id: string | null
          category: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          location_id: string
          metadata: Json
          priority: Database["public"]["Enums"]["ticket_priority"]
          reported_by: string | null
          resolved_at: string | null
          sla_due_at: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          title: string
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          asset_id?: string | null
          assigned_to?: string | null
          attraction_id?: string | null
          category?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          location_id: string
          metadata?: Json
          priority?: Database["public"]["Enums"]["ticket_priority"]
          reported_by?: string | null
          resolved_at?: string | null
          sla_due_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          title: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          asset_id?: string | null
          assigned_to?: string | null
          attraction_id?: string | null
          category?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          location_id?: string
          metadata?: Json
          priority?: Database["public"]["Enums"]["ticket_priority"]
          reported_by?: string | null
          resolved_at?: string | null
          sla_due_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          title?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_attraction_id_fkey"
            columns: ["attraction_id"]
            isOneToOne: false
            referencedRelation: "attractions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      training_enrollments: {
        Row: {
          completed_on: string | null
          course_name: string
          created_at: string
          due_on: string | null
          enrolled_on: string
          id: string
          location_id: string
          required: boolean
          score: number | null
          staff_id: string
          status: string
          updated_at: string
        }
        Insert: {
          completed_on?: string | null
          course_name: string
          created_at?: string
          due_on?: string | null
          enrolled_on?: string
          id?: string
          location_id: string
          required?: boolean
          score?: number | null
          staff_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          completed_on?: string | null
          course_name?: string
          created_at?: string
          due_on?: string | null
          enrolled_on?: string
          id?: string
          location_id?: string
          required?: boolean
          score?: number | null
          staff_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_enrollments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_enrollments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          booking_id: string | null
          cashier_id: string | null
          category: string | null
          channel: string
          created_at: string
          currency: string
          id: string
          location_id: string
          occurred_at: string
          payment_method: string | null
        }
        Insert: {
          amount: number
          booking_id?: string | null
          cashier_id?: string | null
          category?: string | null
          channel?: string
          created_at?: string
          currency?: string
          id?: string
          location_id: string
          occurred_at?: string
          payment_method?: string | null
        }
        Update: {
          amount?: number
          booking_id?: string | null
          cashier_id?: string | null
          category?: string | null
          channel?: string
          created_at?: string
          currency?: string
          id?: string
          location_id?: string
          occurred_at?: string
          payment_method?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          location_ids: string[]
          role: Database["public"]["Enums"]["app_role"]
          role_level: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_ids?: string[]
          role: Database["public"]["Enums"]["app_role"]
          role_level?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          location_ids?: string[]
          role?: Database["public"]["Enums"]["app_role"]
          role_level?: number
          user_id?: string
        }
        Relationships: []
      }
      work_orders: {
        Row: {
          actual_end: string | null
          actual_hours: number | null
          actual_start: string | null
          area: string | null
          asset_id: string | null
          assigned_to: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          issue_category: string | null
          issue_type: string | null
          job_order_number: string | null
          kind: string
          location_id: string
          planned_end: string | null
          planned_hours: number | null
          planned_start: string | null
          priority: Database["public"]["Enums"]["maintenance_priority"]
          remarks: string | null
          reporter_name: string | null
          request_id: string | null
          sla_breached: boolean
          sla_completed_within_sla: boolean | null
          sla_due_at: string | null
          sla_escalation_sent_at: string | null
          sla_response_due_at: string | null
          status: Database["public"]["Enums"]["work_order_status"]
          ticket_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          actual_end?: string | null
          actual_hours?: number | null
          actual_start?: string | null
          area?: string | null
          asset_id?: string | null
          assigned_to?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          issue_category?: string | null
          issue_type?: string | null
          job_order_number?: string | null
          kind?: string
          location_id: string
          planned_end?: string | null
          planned_hours?: number | null
          planned_start?: string | null
          priority?: Database["public"]["Enums"]["maintenance_priority"]
          remarks?: string | null
          reporter_name?: string | null
          request_id?: string | null
          sla_breached?: boolean
          sla_completed_within_sla?: boolean | null
          sla_due_at?: string | null
          sla_escalation_sent_at?: string | null
          sla_response_due_at?: string | null
          status?: Database["public"]["Enums"]["work_order_status"]
          ticket_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          actual_end?: string | null
          actual_hours?: number | null
          actual_start?: string | null
          area?: string | null
          asset_id?: string | null
          assigned_to?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          issue_category?: string | null
          issue_type?: string | null
          job_order_number?: string | null
          kind?: string
          location_id?: string
          planned_end?: string | null
          planned_hours?: number | null
          planned_start?: string | null
          priority?: Database["public"]["Enums"]["maintenance_priority"]
          remarks?: string | null
          reporter_name?: string | null
          request_id?: string | null
          sla_breached?: boolean
          sla_completed_within_sla?: boolean | null
          sla_due_at?: string | null
          sla_escalation_sent_at?: string | null
          sla_response_due_at?: string | null
          status?: Database["public"]["Enums"]["work_order_status"]
          ticket_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_templates: {
        Row: {
          id: string
          code: string
          name: string
          description: string | null
          target_role: Database["public"]["Enums"]["app_role"] | null
          department: string | null
          active: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          code: string
          name: string
          description?: string | null
          target_role?: Database["public"]["Enums"]["app_role"] | null
          department?: string | null
          active?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          code?: string
          name?: string
          description?: string | null
          target_role?: Database["public"]["Enums"]["app_role"] | null
          department?: string | null
          active?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      kpi_template_items: {
        Row: {
          id: string
          template_id: string
          code: string
          label: string
          description: string | null
          weight: number
          data_source: string
          auto_query_key: string | null
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          template_id: string
          code: string
          label: string
          description?: string | null
          weight?: number
          data_source?: string
          auto_query_key?: string | null
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          template_id?: string
          code?: string
          label?: string
          description?: string | null
          weight?: number
          data_source?: string
          auto_query_key?: string | null
          sort_order?: number
          created_at?: string
        }
        Relationships: []
      }
      kpi_assignments: {
        Row: {
          id: string
          template_id: string
          staff_id: string | null
          user_id: string | null
          location_id: string | null
          department: string | null
          active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          template_id: string
          staff_id?: string | null
          user_id?: string | null
          location_id?: string | null
          department?: string | null
          active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          template_id?: string
          staff_id?: string | null
          user_id?: string | null
          location_id?: string | null
          department?: string | null
          active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      kpi_periods: {
        Row: {
          id: string
          period_kind: string
          period_start: string
          period_end: string
          label: string
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          period_kind?: string
          period_start: string
          period_end: string
          label: string
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          period_kind?: string
          period_start?: string
          period_end?: string
          label?: string
          status?: string
          created_at?: string
        }
        Relationships: []
      }
      kpi_scores: {
        Row: {
          id: string
          assignment_id: string
          period_id: string
          location_id: string | null
          staff_id: string | null
          user_id: string | null
          total_score: number
          rating: string | null
          calculated_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          assignment_id: string
          period_id: string
          location_id?: string | null
          staff_id?: string | null
          user_id?: string | null
          total_score?: number
          rating?: string | null
          calculated_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          assignment_id?: string
          period_id?: string
          location_id?: string | null
          staff_id?: string | null
          user_id?: string | null
          total_score?: number
          rating?: string | null
          calculated_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      kpi_score_details: {
        Row: {
          id: string
          score_id: string
          item_id: string
          raw_value: number | null
          normalized_score: number
          weighted_score: number
          source: string
          notes: string | null
          entered_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          score_id: string
          item_id: string
          raw_value?: number | null
          normalized_score?: number
          weighted_score?: number
          source?: string
          notes?: string | null
          entered_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          score_id?: string
          item_id?: string
          raw_value?: number | null
          normalized_score?: number
          weighted_score?: number
          source?: string
          notes?: string | null
          entered_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      sop_documents: {
        Row: {
          id: string
          code: string
          title: string
          category: string
          department: string | null
          location_id: string | null
          target_role: Database["public"]["Enums"]["app_role"] | null
          scope: string
          owner_id: string | null
          status: string
          current_version: number
          effective_date: string | null
          review_date: string | null
          expiry_date: string | null
          mandatory_ack: boolean
          requires_quiz: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          code: string
          title: string
          category: string
          department?: string | null
          location_id?: string | null
          target_role?: Database["public"]["Enums"]["app_role"] | null
          scope?: string
          owner_id?: string | null
          status?: string
          current_version?: number
          effective_date?: string | null
          review_date?: string | null
          expiry_date?: string | null
          mandatory_ack?: boolean
          requires_quiz?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          code?: string
          title?: string
          category?: string
          department?: string | null
          location_id?: string | null
          target_role?: Database["public"]["Enums"]["app_role"] | null
          scope?: string
          owner_id?: string | null
          status?: string
          current_version?: number
          effective_date?: string | null
          review_date?: string | null
          expiry_date?: string | null
          mandatory_ack?: boolean
          requires_quiz?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      sop_sections: {
        Row: {
          id: string
          document_id: string
          version: number
          sort_order: number
          heading: string | null
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          document_id: string
          version?: number
          sort_order?: number
          heading?: string | null
          content: string
          created_at?: string
        }
        Update: {
          id?: string
          document_id?: string
          version?: number
          sort_order?: number
          heading?: string | null
          content?: string
          created_at?: string
        }
        Relationships: []
      }
      sop_versions: {
        Row: {
          id: string
          document_id: string
          version: number
          change_summary: string | null
          published_by: string | null
          published_at: string
        }
        Insert: {
          id?: string
          document_id: string
          version: number
          change_summary?: string | null
          published_by?: string | null
          published_at?: string
        }
        Update: {
          id?: string
          document_id?: string
          version?: number
          change_summary?: string | null
          published_by?: string | null
          published_at?: string
        }
        Relationships: []
      }
      sop_assignments: {
        Row: {
          id: string
          document_id: string
          user_id: string | null
          staff_id: string | null
          location_id: string | null
          target_role: Database["public"]["Enums"]["app_role"] | null
          due_date: string | null
          active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          document_id: string
          user_id?: string | null
          staff_id?: string | null
          location_id?: string | null
          target_role?: Database["public"]["Enums"]["app_role"] | null
          due_date?: string | null
          active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          document_id?: string
          user_id?: string | null
          staff_id?: string | null
          location_id?: string | null
          target_role?: Database["public"]["Enums"]["app_role"] | null
          due_date?: string | null
          active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      sop_acknowledgments: {
        Row: {
          id: string
          document_id: string
          user_id: string
          version: number
          status: string
          read_at: string | null
          acknowledged_at: string | null
          due_date: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          document_id: string
          user_id: string
          version: number
          status?: string
          read_at?: string | null
          acknowledged_at?: string | null
          due_date?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          document_id?: string
          user_id?: string
          version?: number
          status?: string
          read_at?: string | null
          acknowledged_at?: string | null
          due_date?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      sop_quizzes: {
        Row: {
          id: string
          document_id: string
          version: number
          passing_score: number
          active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          document_id: string
          version?: number
          passing_score?: number
          active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          document_id?: string
          version?: number
          passing_score?: number
          active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      sop_quiz_questions: {
        Row: {
          id: string
          quiz_id: string
          question: string
          options: Json
          correct_option: number
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          quiz_id: string
          question: string
          options?: Json
          correct_option?: number
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          quiz_id?: string
          question?: string
          options?: Json
          correct_option?: number
          sort_order?: number
          created_at?: string
        }
        Relationships: []
      }
      sop_quiz_attempts: {
        Row: {
          id: string
          quiz_id: string
          user_id: string
          score: number
          passed: boolean
          answers: Json
          attempted_at: string
        }
        Insert: {
          id?: string
          quiz_id: string
          user_id: string
          score?: number
          passed?: boolean
          answers?: Json
          attempted_at?: string
        }
        Update: {
          id?: string
          quiz_id?: string
          user_id?: string
          score?: number
          passed?: boolean
          answers?: Json
          attempted_at?: string
        }
        Relationships: []
      }
      attendance_devices: { Row: Record<string, unknown> & { id: string; location_id: string; device_code: string; device_name: string; vendor: string; active: boolean; last_sync_at: string | null }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      attendance_logs: { Row: Record<string, unknown> & { id: string; location_id: string; staff_id: string | null; punch_at: string; punch_type: string }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      attendance_daily_summary: { Row: Record<string, unknown> & { id: string; location_id: string; staff_id: string | null; work_date: string; status: string; late_minutes: number; missed_punch: boolean }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      attendance_exceptions: { Row: Record<string, unknown> & { id: string; summary_id: string; location_id: string; staff_id: string | null; exception_type: string; status: string; correction_in: string | null; correction_out: string | null }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      attendance_sync_jobs: { Row: Record<string, unknown> & { id: string; device_id: string | null; location_id: string | null; status: string; records_received: number; records_processed: number; error_message: string | null; completed_at: string | null }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      snag_lists: { Row: Record<string, unknown> & { id: string; location_id: string; name: string; status: string }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      snag_items: { Row: Record<string, unknown> & { id: string; snag_number: string; location_id: string; raised_at: string; area: string | null; category: string; description: string; severity: string; priority: string; status: string; target_date: string | null; risk_score: number; vendor_id: string | null }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      snag_photos: { Row: Record<string, unknown> & { id: string; snag_id: string; photo_type: string; file_path: string }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      snag_assignments: { Row: Record<string, unknown> & { id: string; snag_id: string }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      snag_status_history: { Row: Record<string, unknown> & { id: string; snag_id: string; from_status: string | null; to_status: string; remarks: string | null; created_at: string }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      vendors: { Row: Record<string, unknown> & { id: string; name: string; category: string; contact_person: string | null; phone: string | null; email: string | null; branch_coverage: string[]; amc_status: string | null; active: boolean }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      vendor_contacts: { Row: Record<string, unknown> & { id: string; vendor_id: string; name: string }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      vendor_contracts: { Row: Record<string, unknown> & { id: string; vendor_id: string; location_id: string | null; title: string; end_date: string | null; status: string }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      vendor_service_levels: { Row: Record<string, unknown> & { id: string; contract_id: string }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      vendor_followups: { Row: Record<string, unknown> & { id: string; vendor_id: string; location_id: string | null; title: string; due_date: string; status: string }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      vendor_documents: { Row: Record<string, unknown> & { id: string; vendor_id: string }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      compliance_calendar_events: { Row: Record<string, unknown> & { id: string; location_id: string; title: string; event_type: string; due_date: string; status: string }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      compliance_recurring_tasks: { Row: Record<string, unknown> & { id: string; location_id: string; title: string; task_type: string; next_due_date: string; active: boolean }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      compliance_followups: { Row: Record<string, unknown> & { id: string; location_id: string; followup_date: string; status: string }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      notifications: { Row: Record<string, unknown> & { id: string; user_id: string; category: string; title: string; body: string | null; severity: string; action_url: string | null; read_at: string | null; created_at: string }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      maintenance_email_log: {
        Row: {
          id: string
          source_type: string
          source_id: string | null
          recipient_email: string | null
          template_key: string
          subject: string
          status: string
          error_message: string | null
          sent_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          source_type: string
          source_id?: string | null
          recipient_email?: string | null
          template_key: string
          subject: string
          status?: string
          error_message?: string | null
          sent_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          source_type?: string
          source_id?: string | null
          recipient_email?: string | null
          template_key?: string
          subject?: string
          status?: string
          error_message?: string | null
          sent_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      maintenance_request_attachments: {
        Row: {
          id: string
          request_id: string
          file_path: string
          file_name: string | null
          mime_type: string | null
          kind: string
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          request_id: string
          file_path: string
          file_name?: string | null
          mime_type?: string | null
          kind?: string
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          request_id?: string
          file_path?: string
          file_name?: string | null
          mime_type?: string | null
          kind?: string
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      maintenance_requests: {
        Row: {
          id: string
          request_number: string
          location_id: string
          area: string | null
          category: string
          issue_type: string | null
          priority: Database["public"]["Enums"]["maintenance_priority"]
          description: string
          assigned_technician_id: string | null
          reporter_name: string | null
          reported_at: string
          status: Database["public"]["Enums"]["maintenance_request_status"]
          work_order_id: string | null
          remarks: string | null
          progress_notes: string | null
          created_by: string | null
          accepted_by: string | null
          accepted_at: string | null
          completed_at: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          request_number: string
          location_id: string
          area?: string | null
          category?: string
          issue_type?: string | null
          priority?: Database["public"]["Enums"]["maintenance_priority"]
          description: string
          assigned_technician_id?: string | null
          reporter_name?: string | null
          reported_at?: string
          status?: Database["public"]["Enums"]["maintenance_request_status"]
          work_order_id?: string | null
          remarks?: string | null
          progress_notes?: string | null
          created_by?: string | null
          accepted_by?: string | null
          accepted_at?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          request_number?: string
          location_id?: string
          area?: string | null
          category?: string
          issue_type?: string | null
          priority?: Database["public"]["Enums"]["maintenance_priority"]
          description?: string
          assigned_technician_id?: string | null
          reporter_name?: string | null
          reported_at?: string
          status?: Database["public"]["Enums"]["maintenance_request_status"]
          work_order_id?: string | null
          remarks?: string | null
          progress_notes?: string | null
          created_by?: string | null
          accepted_by?: string | null
          accepted_at?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: []
      }
      notification_preferences: { Row: Record<string, unknown> & { id: string; user_id: string; category: string; channel_in_app: boolean; channel_email: boolean; channel_sms: boolean; channel_whatsapp: boolean }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      notification_delivery_logs: { Row: Record<string, unknown> & { id: string; notification_id: string; channel: string; provider: string; status: string }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      inventory_items: { Row: Record<string, unknown> & { id: string; sku: string; name: string; category: string; unit: string; size: string | null; reorder_level: number; active: boolean; deleted_at: string | null }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      inventory_stock: { Row: Record<string, unknown> & { id: string; item_id: string; location_id: string; quantity_on_hand: number; quantity_reserved: number }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      inventory_movements: { Row: Record<string, unknown> & { id: string; item_id: string; location_id: string; movement_type: string; quantity: number }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      amc_contracts: { Row: Record<string, unknown> & { id: string; location_id: string; category: string; vendor_name: string; vendor_contact_person: string | null; vendor_phone: string | null; vendor_email: string | null; contract_start_date: string; contract_end_date: string; service_frequency: string; contract_value: number; paid_amount: number; outstanding_amount: number; payment_status: string; status: string; scope_of_work: string | null; last_service_date: string | null; next_service_date: string | null; remarks: string | null }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      amc_service_schedules: { Row: Record<string, unknown> & { id: string; contract_id: string; service_number: number; planned_date: string; actual_service_date: string | null; status: string; verification_status: string; vendor_remarks: string | null; internal_notes: string | null }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      amc_attachments: { Row: Record<string, unknown> & { id: string; contract_id: string; service_schedule_id: string | null; attachment_type: string; file_name: string; file_path: string; uploaded_at: string }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      utility_consumption: { Row: Record<string, unknown> & { id: string; location_id: string; utility_type: string; meter_account_number: string | null; period_month: string; opening_reading: number | null; closing_reading: number | null; consumption: number | null; bill_amount: number; currency: string; file_path: string | null; file_name: string | null; remarks: string | null }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      risk_register: { Row: Record<string, unknown> & { id: string; location_id: string; risk_category: string; description: string; impact: number; likelihood: number; risk_score: number; mitigation_action: string | null; owner_id: string | null; target_date: string | null; status: string }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      planned_notifications: { Row: Record<string, unknown> & { id: string; user_id: string | null; location_id: string | null; reminder_type: string; title: string; body: string | null; source_type: string | null; source_id: string | null; due_date: string; scheduled_for: string; status: string; sent_at: string | null; notification_id: string | null }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      facility_tasks: { Row: Record<string, unknown> & { id: string; location_id: string; category: string; title: string; description: string | null; priority: string; status: string; due_date: string | null; assigned_to: string | null; completed_at: string | null; notes: string | null }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      amc_payment_lines: { Row: Record<string, unknown> & { id: string; contract_id: string; label: string; percent: number | null; amount: number; due_date: string; paid: boolean; paid_date: string | null }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      compliance_items: { Row: Record<string, unknown> & { id: string; domain: string; item_name: string; venue_scope: string; vendor_authority: string | null; expiry_date: string | null; next_due_date: string | null; renewal_cost: number; status: string; risk_level: string }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      compliance_items_enriched: { Row: Record<string, unknown> & { id: string; domain: string; item_name: string; venue_scope: string; governing_date: string | null; days_remaining: number | null; alert_tier: string }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      e3_compliance_items: { Row: Record<string, unknown> & { id: string; location: string; area: string; category: string; item: string; vendor: string; contract_start: string | null; contract_end: string | null; last_service: string | null; next_service: string | null; issue_date: string | null; expiry_date: string | null; frequency: string; owner: string; remarks: string | null; drive_link: string | null; created_at: string; updated_at: string }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      e3_compliance_items_enriched: { Row: Record<string, unknown> & { id: string; location: string; area: string; category: string; item: string; vendor: string; contract_start: string | null; contract_end: string | null; last_service: string | null; next_service: string | null; issue_date: string | null; expiry_date: string | null; frequency: string; owner: string; remarks: string | null; drive_link: string | null; days_to_expiry: number | null; computed_status: string }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      compliance_service_history: { Row: Record<string, unknown> & { id: string; service_date: string; contract_item: string; domain: string | null; vendor: string | null; venue_scope: string; service_type: string; result: string; cost: number }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      vendor_repairs: { Row: Record<string, unknown> & { id: string; vendor: string; location_id: string | null; asset: string; status: string; cost: number; expected_return: string | null; actual_return: string | null }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      staff_certifications: { Row: Record<string, unknown> & { id: string; staff_name: string; role: string | null; location_id: string | null; medical_expiry: string | null; food_handler_expiry: string | null; first_aid_expiry: string | null; qid_expiry: string | null }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      shift_briefings: { Row: Record<string, unknown> & { id: string; briefing_date: string; location_id: string; shift: string; supervisor_name: string; staff_scheduled: number; staff_present: number; staff_absent: number; attendance_pct: number; key_notes: string | null; handover_items: string | null; filled_by: string | null; created_at: string; updated_at: string }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      daily_ops_roster_uploads: { Row: Record<string, unknown> & { id: string; location_id: string; file_name: string; file_path: string | null; file_type: string; period_start: string | null; period_end: string | null; rows_imported: number; uploaded_by: string | null; notes: string | null; created_at: string }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      supervisor_issues: { Row: Record<string, unknown> & { id: string; entry_ref: string | null; log_date: string; location_id: string; category: string; priority: string; status: string; due_date: string | null; cost: number; date_resolved: string | null }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      supervisor_issues_enriched: { Row: Record<string, unknown> & { id: string; entry_ref: string | null; log_date: string; date_reported: string; location_id: string; category: string; zone: string | null; area_equipment: string | null; description: string; priority: string; status: string; assigned_to: string | null; date_resolved: string | null; days_open: number }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      opening_readiness: { Row: Record<string, unknown> & { id: string; check_date: string; location_id: string; check_item: string; status: string }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      daily_reports: { Row: Record<string, unknown> & { id: string; report_date: string; location_id: string; footfall: number; revenue: number; opening_readiness_pct: number }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      document_attachments: { Row: Record<string, unknown> & { id: string; document_id: string; attachment_type: string; file_name: string; file_path: string; file_mime: string | null; uploaded_by: string | null; uploaded_at: string }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      document_notifications: { Row: Record<string, unknown> & { id: string; document_id: string; notification_type: string; notification_date: string; recipient_user_id: string | null; status: string; sent_at: string | null; created_at: string }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      compliance_documents_enriched: { Row: Record<string, unknown> & { id: string; expiry_tier: string; days_to_expiry: number | null }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      compliance_requirements: { Row: Record<string, unknown> & { id: string; location_type: string; area_sub_area: string | null; category: string; requirement_name: string; document_contract_type: string | null; is_required: boolean; default_frequency: string | null; default_owner: string | null; default_department: string | null; default_risk_level: string; sort_order: number }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      location_compliance_items: { Row: Record<string, unknown> & { id: string; location_id: string; requirement_id: string | null; area_sub_area: string | null; category: string; requirement_name: string; document_contract_type: string | null; is_required: boolean; vendor_id: string | null; vendor_name: string | null; issuing_authority: string | null; cert_contract_number: string | null; start_date: string | null; issue_date: string | null; expiry_date: string | null; renewal_due_date: string | null; service_frequency: string | null; last_service_date: string | null; next_service_date: string | null; manual_status: string | null; risk_level: string; owner: string | null; department: string | null; quotation_amount: number; paid_amount: number; outstanding_amount: number; payment_status: string; attachment_status: string; remarks: string | null; compliance_document_id: string | null; amc_contract_id: string | null; vendor_contract_id: string | null; updated_by: string | null; created_at: string; updated_at: string }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      location_compliance_items_enriched: { Row: Record<string, unknown> & { id: string; location_id: string; location_code: string; location_name: string; area_sub_area: string | null; category: string; requirement_name: string; document_contract_type: string | null; is_required: boolean; vendor_name: string | null; issuing_authority: string | null; cert_contract_number: string | null; start_date: string | null; issue_date: string | null; expiry_date: string | null; renewal_due_date: string | null; service_frequency: string | null; last_service_date: string | null; next_service_date: string | null; computed_status: string; days_remaining: number | null; risk_level: string; owner: string | null; department: string | null; quotation_amount: number; paid_amount: number; outstanding_amount: number; payment_status: string; attachment_status: string; has_certificate: boolean; has_quotation: boolean; has_invoice: boolean; has_payment_proof: boolean; has_service_report: boolean; remarks: string | null; amc_contract_id: string | null; compliance_document_id: string | null; governing_date: string | null; expiry_bucket: string; updated_at: string }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      location_compliance_attachments: { Row: Record<string, unknown> & { id: string; item_id: string; attachment_type: string; file_name: string; file_path: string; file_mime: string | null; uploaded_by: string | null; uploaded_at: string }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      compliance_notification_log: { Row: Record<string, unknown> & { id: string; item_id: string; rule_type: string; user_id: string | null; fired_on: string; created_at: string }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      weekly_reports: { Row: Record<string, unknown> & { id: string; location_id: string; reporting_week_start: string; reporting_week_end: string; status: string; priority: string; submitted_by_name: string | null; revenue: number | null; footfall: number | null; staff_scheduled: number; staff_present: number; staff_attendance_pct: number | null; absentees_late: string | null; customer_complaints: number; positive_feedback: string | null; incidents_count: number; incidents_detail: string | null; maintenance_issues: string | null; maintenance_open: number; maintenance_closed: number; compliance_updates: string | null; compliance_score: number | null; inventory_issues: string | null; cashier_pos_issues: string | null; marketing_events: string | null; top_achievements: string | null; top_challenges: string | null; support_required: string | null; next_week_action_plan: string | null; critical_issues: string | null; review_remarks: string | null; missing_info_flag: boolean; reviewed_at: string | null; submitted_at: string | null; created_by: string | null; reviewed_by: string | null; executive_report_id: string | null; created_at: string; updated_at: string }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      weekly_report_attachments: { Row: Record<string, unknown> & { id: string; weekly_report_id: string; file_name: string; mime_type: string; file_size: number | null; storage_path: string | null; content_base64: string | null; uploaded_by: string | null; created_at: string }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      report_review_comments: { Row: Record<string, unknown> & { id: string; weekly_report_id: string; comment_text: string; is_internal: boolean; priority: string | null; created_by: string | null; created_at: string }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      executive_reports: { Row: Record<string, unknown> & { id: string; reporting_week_start: string; reporting_week_end: string; title: string; status: string; content: Record<string, unknown>; narrative: string | null; ai_generated: boolean; generated_by: string | null; published_at: string | null; created_at: string; updated_at: string }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      executive_report_actions: { Row: Record<string, unknown> & { id: string; executive_report_id: string; action_text: string; owner_role: string | null; due_date: string | null; priority: string; status: string | null; created_by: string | null; created_at: string }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      report_kpi_snapshots: { Row: Record<string, unknown> & { id: string; executive_report_id: string; kpis: Record<string, unknown>; charts: Record<string, unknown>; location_rankings: unknown; snapshot_at: string }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      maintenance_weekly_reports: { Row: Record<string, unknown> & { id: string; team: string; reporting_week_start: string; reporting_week_end: string; status: string; priority: string; submitted_by_name: string | null; kpi_snapshot: Record<string, unknown>; top_achievements: string | null; top_challenges: string | null; support_required: string | null; next_week_action_plan: string | null; critical_issues: string | null; operational_notes: string | null; review_remarks: string | null; missing_info_flag: boolean; reviewed_at: string | null; submitted_at: string | null; created_by: string | null; reviewed_by: string | null; executive_report_id: string | null; created_at: string; updated_at: string }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      maintenance_weekly_report_attachments: { Row: Record<string, unknown> & { id: string; maintenance_weekly_report_id: string; file_name: string; mime_type: string; file_size: number | null; storage_path: string | null; content_base64: string | null; uploaded_by: string | null; created_at: string }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      maintenance_report_review_comments: { Row: Record<string, unknown> & { id: string; maintenance_weekly_report_id: string; comment_text: string; is_internal: boolean; priority: string | null; created_by: string | null; created_at: string }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      maintenance_executive_reports: { Row: Record<string, unknown> & { id: string; reporting_week_start: string; reporting_week_end: string; title: string; status: string; content: Record<string, unknown>; narrative: string | null; ai_generated: boolean; generated_by: string | null; published_at: string | null; created_at: string; updated_at: string }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
      maintenance_report_kpi_snapshots: { Row: Record<string, unknown> & { id: string; maintenance_executive_report_id: string; kpis: Record<string, unknown>; charts: Record<string, unknown>; snapshot_at: string }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_shift_swap: { Args: { _id: string }; Returns: undefined }
      cancel_shift: {
        Args: { _id: string; _reason?: string }
        Returns: undefined
      }
      clock_in_shift: { Args: { _id: string }; Returns: undefined }
      clock_out_shift: { Args: { _id: string }; Returns: undefined }
      close_incident: {
        Args: {
          _actions: string
          _id: string
          _reason?: string
          _root_cause: string
        }
        Returns: undefined
      }
      complete_task_item: {
        Args: {
          _checked: boolean
          _instance_id: string
          _item_id: string
          _note?: string
          _photo_path?: string
        }
        Returns: undefined
      }
      complete_training: {
        Args: { _id: string; _score?: number }
        Returns: undefined
      }
      compute_maintenance_sla: {
        Args: {
          _priority: Database["public"]["Enums"]["maintenance_priority"]
          _created_at?: string
        }
        Returns: {
          sla_response_due_at: string
          sla_due_at: string
        }[]
      }
      generate_delivery_request_number: {
        Args: never
        Returns: string
      }
      generate_maintenance_request_number: {
        Args: never
        Returns: string
      }
      create_booking: {
        Args: {
          _contact_email?: string
          _contact_name: string
          _contact_phone?: string
          _ends_at?: string
          _kind: Database["public"]["Enums"]["booking_kind"]
          _location_id: string
          _notes?: string
          _party_size: number
          _quote_amount?: number
          _starts_at: string
        }
        Returns: string
      }
      create_complaint: {
        Args: {
          _category: string
          _channel: string
          _guest_contact?: string
          _guest_name?: string
          _location_id: string
          _severity: string
          _summary: string
        }
        Returns: string
      }
      create_incident: {
        Args: {
          _location_id: string
          _occurred_at: string
          _category: string
          _severity: string
          _summary: string
          _detail?: string
          _action_taken?: string
        }
        Returns: string
      }
      create_leakage_case: {
        Args: {
          _category: string
          _estimated_loss?: number
          _hypothesis?: string
          _location_id: string
        }
        Returns: string
      }
      create_purchase_order: {
        Args: {
          _amount: number
          _category?: string
          _currency?: string
          _description?: string
          _location_id: string
          _vendor_name: string
        }
        Returns: string
      }
      create_shift: {
        Args: {
          _ends_at: string
          _location_id: string
          _notes?: string
          _role_label?: string
          _starts_at: string
          _user_id: string
        }
        Returns: string
      }
      current_user_role_level: { Args: never; Returns: number }
      get_compliance_renewals: {
        Args: { p_limit?: number; p_location_code?: string | null }
        Returns: {
          id: string
          item_name: string
          domain: string
          venue_scope: string
          status: string
          expiry_date: string | null
          alert_tier: string
        }[]
      }
      get_compliance_kpis: {
        Args: { p_location_id?: string | null }
        Returns: Json
      }
      get_e3_tracker_summary: {
        Args: { p_location?: string; p_area?: string }
        Returns: Json
      }
      get_dashboard_charts: {
        Args: { p_location_ids: string[]; p_year: number }
        Returns: Json
      }
      get_dashboard_kpis: { Args: { p_location_ids: string[] }; Returns: Json }
      get_daily_ops_kpis: { Args: { p_location_ids: string[] }; Returns: Json }
      decision_vote_summary: { Args: { _decision_id: string }; Returns: Json }
      detect_silent_failures: { Args: never; Returns: number }
      end_downtime: {
        Args: { _id: string; _notes?: string }
        Returns: undefined
      }
      generate_due_pm_work_orders: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      log_audit: {
        Args: {
          _action: string
          _after?: Json
          _before?: Json
          _location_id?: string
          _metadata?: Json
          _reason?: string
          _row_id?: string
          _table_name: string
        }
        Returns: string
      }
      match_kb_chunks: {
        Args: { match_count?: number; query_embedding: string }
        Returns: {
          chunk_index: number
          content: string
          document_id: string
          id: string
          similarity: number
          source: string
          title: string
        }[]
      }
      record_asset_heartbeat: {
        Args: { _asset_id: string }
        Returns: undefined
      }
      refresh_leaderboard_scores: { Args: never; Returns: number }
      request_shift_swap: {
        Args: { _id: string; _to_user: string }
        Returns: undefined
      }
      resolve_complaint: {
        Args: { _id: string; _notes: string; _reason?: string }
        Returns: undefined
      }
      respond_mall_request: {
        Args: { _id: string; _reason?: string; _status: string }
        Returns: undefined
      }
      run_escalation_sweep: {
        Args: never
        Returns: {
          escalation_id: string
          level: number
          rule_id: string
          ticket_id: string
        }[]
      }
      run_maintenance_sla_sweep: {
        Args: never
        Returns: {
          work_order_id: string
          action: string
          job_order_number: string | null
        }[]
      }
      save_complaint_triage: {
        Args: { _id: string; _triage: Json }
        Returns: undefined
      }
      spawn_task_instance: {
        Args: { _assigned_to?: string; _due_at?: string; _template_id: string }
        Returns: string
      }
      start_downtime: {
        Args: {
          _asset_id: string
          _location_id: string
          _reason: string
          _ticket_id?: string
        }
        Returns: string
      }
      submit_handover: {
        Args: {
          _digest: Json
          _location_id: string
          _notes: string
          _to_user: string
          _window_start: string
        }
        Returns: string
      }
      submit_task_instance: {
        Args: { _instance_id: string }
        Returns: undefined
      }
      toggle_surge_mode: {
        Args: { _enable: boolean; _location_id: string; _reason?: string }
        Returns: undefined
      }
      update_booking_status: {
        Args: {
          _deposit_amount?: number
          _id: string
          _reason?: string
          _status: Database["public"]["Enums"]["booking_status"]
          _total_amount?: number
        }
        Returns: undefined
      }
      update_compliance_document_status: {
        Args: { _id: string; _reason?: string; _status: string }
        Returns: undefined
      }
      update_complaint_status: {
        Args: {
          _id: string
          _reason?: string
          _status: Database["public"]["Enums"]["complaint_status"]
        }
        Returns: undefined
      }
      update_finding_status: {
        Args: {
          _id: string
          _reason?: string
          _status: Database["public"]["Enums"]["finding_status"]
        }
        Returns: undefined
      }
      update_forecast_results: {
        Args: { _forecast_id: string }
        Returns: undefined
      }
      update_leakage_status: {
        Args: {
          _id: string
          _reason?: string
          _recovered_amount?: number
          _root_cause?: string
          _status: Database["public"]["Enums"]["leakage_status"]
        }
        Returns: undefined
      }
      update_obligation_status: {
        Args: { _id: string; _reason?: string; _status: string }
        Returns: undefined
      }
      update_po_status: {
        Args: {
          _id: string
          _reason?: string
          _status: Database["public"]["Enums"]["po_status"]
        }
        Returns: undefined
      }
      user_can_access_location: {
        Args: { _location_id: string }
        Returns: boolean
      }
    }
    Enums: {
      agent_autonomy: "A" | "B" | "C"
      agent_name:
        | "operations"
        | "maintenance"
        | "revenue"
        | "cx"
        | "performance"
        | "compliance"
        | "executive_reporting"
      agent_outcome: "proposed" | "executed" | "blocked" | "failed" | "skipped"
      ai_artifact_kind:
        | "daily_brief"
        | "leakage_rca"
        | "forecast"
        | "pnl_commentary"
        | "rag_answer"
        | "board_pack"
        | "executive_weekly_report"
      app_role:
        | "ceo"
        | "coo"
        | "cfo"
        | "regional_ops"
        | "branch_gm"
        | "duty_manager"
        | "tech_supervisor"
        | "technician"
        | "cashier_host"
        | "auditor"
        | "hr"
        | "customer_service"
      asset_criticality: "low" | "medium" | "high" | "critical"
      attraction_status: "operational" | "degraded" | "down" | "closed"
      audit_type:
        | "safety"
        | "financial"
        | "operational"
        | "compliance"
        | "quality"
      booking_kind: "party" | "group" | "corporate" | "school"
      booking_status:
        | "quote"
        | "deposit"
        | "confirmed"
        | "delivered"
        | "cancelled"
        | "no_show"
      complaint_status:
        | "new"
        | "investigating"
        | "resolved"
        | "escalated"
        | "dismissed"
      decision_priority: "low" | "medium" | "high" | "critical"
      decision_status:
        | "proposed"
        | "reviewing"
        | "approved"
        | "rejected"
        | "implemented"
        | "cancelled"
      delivery_item_category:
        | "spare_parts"
        | "tools"
        | "consumables"
        | "cleaning_materials"
        | "safety_equipment"
        | "other"
      delivery_request_status:
        | "submitted"
        | "approved"
        | "rejected"
        | "preparing"
        | "dispatched"
        | "verification_pending"
        | "completed"
      finding_severity: "low" | "medium" | "high" | "critical"
      finding_status: "open" | "in_remediation" | "closed" | "accepted_risk"
      forecast_status: "draft" | "published" | "archived"
      incident_status: "reported" | "investigating" | "rca_complete" | "closed"
      shift_period: "morning" | "afternoon" | "evening" | "full_day"
      staff_role:
        | "venue_supervisor"
        | "shift_lead"
        | "crew"
        | "technician"
        | "cashier"
        | "cleaner"
        | "security"
        | "other"
      leakage_status:
        | "detected"
        | "investigating"
        | "confirmed"
        | "recovered"
        | "dismissed"
      location_status: "active" | "maintenance" | "closed" | "pre_launch"
      maintenance_priority: "normal" | "medium" | "urgent"
      maintenance_request_status:
        | "submitted"
        | "accepted"
        | "in_progress"
        | "completed"
        | "cancelled"
      po_status:
        | "draft"
        | "pending_approval"
        | "approved"
        | "rejected"
        | "received"
        | "closed"
      ticket_priority: "low" | "normal" | "high" | "urgent"
      ticket_status:
        | "open"
        | "assigned"
        | "in_progress"
        | "blocked"
        | "resolved"
        | "closed"
        | "cancelled"
      vote_type: "approve" | "reject" | "abstain" | "request_info"
      work_order_status:
        | "planned"
        | "in_progress"
        | "on_hold"
        | "completed"
        | "cancelled"
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
      agent_autonomy: ["A", "B", "C"],
      agent_name: [
        "operations",
        "maintenance",
        "revenue",
        "cx",
        "performance",
        "compliance",
        "executive_reporting",
      ],
      agent_outcome: ["proposed", "executed", "blocked", "failed", "skipped"],
      ai_artifact_kind: [
        "daily_brief",
        "leakage_rca",
        "forecast",
        "pnl_commentary",
        "rag_answer",
        "board_pack",
        "executive_weekly_report",
      ],
      app_role: [
        "ceo",
        "coo",
        "cfo",
        "regional_ops",
        "branch_gm",
        "duty_manager",
        "tech_supervisor",
        "technician",
        "cashier_host",
        "auditor",
        "hr",
        "customer_service",
      ],
      asset_criticality: ["low", "medium", "high", "critical"],
      attraction_status: ["operational", "degraded", "down", "closed"],
      audit_type: [
        "safety",
        "financial",
        "operational",
        "compliance",
        "quality",
      ],
      booking_kind: ["party", "group", "corporate", "school"],
      booking_status: [
        "quote",
        "deposit",
        "confirmed",
        "delivered",
        "cancelled",
        "no_show",
      ],
      complaint_status: [
        "new",
        "investigating",
        "resolved",
        "escalated",
        "dismissed",
      ],
      decision_priority: ["low", "medium", "high", "critical"],
      decision_status: [
        "proposed",
        "reviewing",
        "approved",
        "rejected",
        "implemented",
        "cancelled",
      ],
      delivery_item_category: [
        "spare_parts",
        "tools",
        "consumables",
        "cleaning_materials",
        "safety_equipment",
        "other",
      ],
      delivery_request_status: [
        "submitted",
        "approved",
        "rejected",
        "preparing",
        "dispatched",
        "verification_pending",
        "completed",
      ],
      finding_severity: ["low", "medium", "high", "critical"],
      finding_status: ["open", "in_remediation", "closed", "accepted_risk"],
      forecast_status: ["draft", "published", "archived"],
      incident_status: ["reported", "investigating", "rca_complete", "closed"],
      shift_period: ["morning", "afternoon", "evening", "full_day"],
      staff_role: [
        "venue_supervisor",
        "shift_lead",
        "crew",
        "technician",
        "cashier",
        "cleaner",
        "security",
        "other",
      ],
      leakage_status: [
        "detected",
        "investigating",
        "confirmed",
        "recovered",
        "dismissed",
      ],
      location_status: ["active", "maintenance", "closed", "pre_launch"],
      maintenance_priority: ["normal", "medium", "urgent"],
      maintenance_request_status: [
        "submitted",
        "accepted",
        "in_progress",
        "completed",
        "cancelled",
      ],
      po_status: [
        "draft",
        "pending_approval",
        "approved",
        "rejected",
        "received",
        "closed",
      ],
      ticket_priority: ["low", "normal", "high", "urgent"],
      ticket_status: [
        "open",
        "assigned",
        "in_progress",
        "blocked",
        "resolved",
        "closed",
        "cancelled",
      ],
      vote_type: ["approve", "reject", "abstain", "request_info"],
      work_order_status: [
        "planned",
        "in_progress",
        "on_hold",
        "completed",
        "cancelled",
      ],
    },
  },
} as const
