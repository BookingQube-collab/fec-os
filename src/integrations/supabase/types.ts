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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
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
      ai_provider_configs: {
        Row: {
          base_url: string | null
          config_json: Json
          connection_status: string
          created_at: string
          created_by: string | null
          display_name: string
          enabled: boolean
          encrypted_api_key: string | null
          id: string
          key_last_four: string | null
          last_test_result: string | null
          last_tested_at: string | null
          provider_code: string
          selected_model: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          base_url?: string | null
          config_json?: Json
          connection_status?: string
          created_at?: string
          created_by?: string | null
          display_name: string
          enabled?: boolean
          encrypted_api_key?: string | null
          id?: string
          key_last_four?: string | null
          last_test_result?: string | null
          last_tested_at?: string | null
          provider_code: string
          selected_model?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          base_url?: string | null
          config_json?: Json
          connection_status?: string
          created_at?: string
          created_by?: string | null
          display_name?: string
          enabled?: boolean
          encrypted_api_key?: string | null
          id?: string
          key_last_four?: string | null
          last_test_result?: string | null
          last_tested_at?: string | null
          provider_code?: string
          selected_model?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      ai_routing_settings: {
        Row: {
          auto_fallback: boolean
          created_at: string
          id: string
          max_retries: number
          monthly_limit_usd: number | null
          primary_provider: string | null
          provider_monthly_limits: Json
          secondary_provider: string | null
          tertiary_provider: string | null
          timeout_ms: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          auto_fallback?: boolean
          created_at?: string
          id?: string
          max_retries?: number
          monthly_limit_usd?: number | null
          primary_provider?: string | null
          provider_monthly_limits?: Json
          secondary_provider?: string | null
          tertiary_provider?: string | null
          timeout_ms?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          auto_fallback?: boolean
          created_at?: string
          id?: string
          max_retries?: number
          monthly_limit_usd?: number | null
          primary_provider?: string | null
          provider_monthly_limits?: Json
          secondary_provider?: string | null
          tertiary_provider?: string | null
          timeout_ms?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      ai_usage_daily: {
        Row: {
          created_at: string
          estimated_cost_usd: number
          fail_count: number
          id: string
          input_tokens: number
          latency_ms_total: number
          model: string
          module_source: string
          output_tokens: number
          provider_code: string
          success_count: number
          updated_at: string
          usage_date: string
        }
        Insert: {
          created_at?: string
          estimated_cost_usd?: number
          fail_count?: number
          id?: string
          input_tokens?: number
          latency_ms_total?: number
          model: string
          module_source?: string
          output_tokens?: number
          provider_code: string
          success_count?: number
          updated_at?: string
          usage_date: string
        }
        Update: {
          created_at?: string
          estimated_cost_usd?: number
          fail_count?: number
          id?: string
          input_tokens?: number
          latency_ms_total?: number
          model?: string
          module_source?: string
          output_tokens?: number
          provider_code?: string
          success_count?: number
          updated_at?: string
          usage_date?: string
        }
        Relationships: []
      }
      amc_attachments: {
        Row: {
          attachment_type: string
          contract_id: string
          file_mime: string | null
          file_name: string
          file_path: string
          id: string
          service_schedule_id: string | null
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          attachment_type?: string
          contract_id: string
          file_mime?: string | null
          file_name: string
          file_path: string
          id?: string
          service_schedule_id?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          attachment_type?: string
          contract_id?: string
          file_mime?: string | null
          file_name?: string
          file_path?: string
          id?: string
          service_schedule_id?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "amc_attachments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "amc_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amc_attachments_service_schedule_id_fkey"
            columns: ["service_schedule_id"]
            isOneToOne: false
            referencedRelation: "amc_service_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      amc_contracts: {
        Row: {
          category: string
          contact: string | null
          contract_end_date: string
          contract_ref: string | null
          contract_start_date: string
          contract_value: number
          created_at: string
          created_by: string | null
          id: string
          internal_notes: string | null
          internal_owner: string | null
          last_service_date: string | null
          location_floor: string | null
          location_id: string
          next_service_date: string | null
          outstanding_amount: number | null
          paid_amount: number
          payment_plan: string | null
          payment_status: string
          remarks: string | null
          risk_level: string | null
          scope_of_work: string | null
          service_frequency: string
          status: string
          updated_at: string
          vendor_contact_person: string | null
          vendor_email: string | null
          vendor_id: string | null
          vendor_name: string
          vendor_phone: string | null
        }
        Insert: {
          category: string
          contact?: string | null
          contract_end_date: string
          contract_ref?: string | null
          contract_start_date: string
          contract_value?: number
          created_at?: string
          created_by?: string | null
          id?: string
          internal_notes?: string | null
          internal_owner?: string | null
          last_service_date?: string | null
          location_floor?: string | null
          location_id: string
          next_service_date?: string | null
          outstanding_amount?: number | null
          paid_amount?: number
          payment_plan?: string | null
          payment_status?: string
          remarks?: string | null
          risk_level?: string | null
          scope_of_work?: string | null
          service_frequency?: string
          status?: string
          updated_at?: string
          vendor_contact_person?: string | null
          vendor_email?: string | null
          vendor_id?: string | null
          vendor_name: string
          vendor_phone?: string | null
        }
        Update: {
          category?: string
          contact?: string | null
          contract_end_date?: string
          contract_ref?: string | null
          contract_start_date?: string
          contract_value?: number
          created_at?: string
          created_by?: string | null
          id?: string
          internal_notes?: string | null
          internal_owner?: string | null
          last_service_date?: string | null
          location_floor?: string | null
          location_id?: string
          next_service_date?: string | null
          outstanding_amount?: number | null
          paid_amount?: number
          payment_plan?: string | null
          payment_status?: string
          remarks?: string | null
          risk_level?: string | null
          scope_of_work?: string | null
          service_frequency?: string
          status?: string
          updated_at?: string
          vendor_contact_person?: string | null
          vendor_email?: string | null
          vendor_id?: string | null
          vendor_name?: string
          vendor_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "amc_contracts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amc_contracts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      amc_payment_lines: {
        Row: {
          amount: number
          contract_id: string
          created_at: string
          due_date: string
          id: string
          label: string
          paid: boolean
          paid_date: string | null
          percent: number | null
          updated_at: string
        }
        Insert: {
          amount?: number
          contract_id: string
          created_at?: string
          due_date: string
          id?: string
          label: string
          paid?: boolean
          paid_date?: string | null
          percent?: number | null
          updated_at?: string
        }
        Update: {
          amount?: number
          contract_id?: string
          created_at?: string
          due_date?: string
          id?: string
          label?: string
          paid?: boolean
          paid_date?: string | null
          percent?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "amc_payment_lines_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "amc_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      amc_service_schedules: {
        Row: {
          actual_service_date: string | null
          contract_id: string
          created_at: string
          id: string
          internal_notes: string | null
          planned_date: string
          service_number: number
          status: string
          updated_at: string
          vendor_remarks: string | null
          verification_status: string
          verified_by: string | null
          visit_label: string | null
        }
        Insert: {
          actual_service_date?: string | null
          contract_id: string
          created_at?: string
          id?: string
          internal_notes?: string | null
          planned_date: string
          service_number: number
          status?: string
          updated_at?: string
          vendor_remarks?: string | null
          verification_status?: string
          verified_by?: string | null
          visit_label?: string | null
        }
        Update: {
          actual_service_date?: string | null
          contract_id?: string
          created_at?: string
          id?: string
          internal_notes?: string | null
          planned_date?: string
          service_number?: number
          status?: string
          updated_at?: string
          vendor_remarks?: string | null
          verification_status?: string
          verified_by?: string | null
          visit_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "amc_service_schedules_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "amc_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      app_email_settings: {
        Row: {
          enabled: boolean
          from_address: string
          id: string
          managed: boolean
          resend_api_key: string
          updated_at: string
          updated_by: string | null
          webhook_url: string
        }
        Insert: {
          enabled?: boolean
          from_address?: string
          id: string
          managed?: boolean
          resend_api_key?: string
          updated_at?: string
          updated_by?: string | null
          webhook_url?: string
        }
        Update: {
          enabled?: boolean
          from_address?: string
          id?: string
          managed?: boolean
          resend_api_key?: string
          updated_at?: string
          updated_by?: string | null
          webhook_url?: string
        }
        Relationships: []
      }
      arcade_alert_fires: {
        Row: {
          created_at: string
          entity_id: string
          fired_on: string
          id: string
          notification_id: string | null
          rule_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          fired_on?: string
          id?: string
          notification_id?: string | null
          rule_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          fired_on?: string
          id?: string
          notification_id?: string | null
          rule_key?: string
          user_id?: string
        }
        Relationships: []
      }
      arcade_attachments: {
        Row: {
          created_at: string
          created_by: string | null
          entity_id: string
          entity_type: string
          file_name: string
          id: string
          kind: string
          location_id: string | null
          mime_type: string | null
          storage_path: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entity_id: string
          entity_type: string
          file_name: string
          id?: string
          kind?: string
          location_id?: string | null
          mime_type?: string | null
          storage_path: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entity_id?: string
          entity_type?: string
          file_name?: string
          id?: string
          kind?: string
          location_id?: string | null
          mime_type?: string | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "arcade_attachments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_damage_reports: {
        Row: {
          accidental: boolean
          cause: string | null
          corrective_action: string | null
          created_at: string
          created_by: string | null
          customer_caused: boolean
          damage_type: string
          description: string
          estimated_cost: number | null
          id: string
          location_id: string | null
          machine_id: string | null
          needs_mapping: boolean
          operational: boolean
          parts_required: string | null
          preventive_action: string | null
          reported_by_staff_id: string | null
          reported_on: string
          staff_caused: boolean
          supplier_assistance: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          accidental?: boolean
          cause?: string | null
          corrective_action?: string | null
          created_at?: string
          created_by?: string | null
          customer_caused?: boolean
          damage_type: string
          description: string
          estimated_cost?: number | null
          id?: string
          location_id?: string | null
          machine_id?: string | null
          needs_mapping?: boolean
          operational?: boolean
          parts_required?: string | null
          preventive_action?: string | null
          reported_by_staff_id?: string | null
          reported_on?: string
          staff_caused?: boolean
          supplier_assistance?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          accidental?: boolean
          cause?: string | null
          corrective_action?: string | null
          created_at?: string
          created_by?: string | null
          customer_caused?: boolean
          damage_type?: string
          description?: string
          estimated_cost?: number | null
          id?: string
          location_id?: string | null
          machine_id?: string | null
          needs_mapping?: boolean
          operational?: boolean
          parts_required?: string | null
          preventive_action?: string | null
          reported_by_staff_id?: string | null
          reported_on?: string
          staff_caused?: boolean
          supplier_assistance?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "arcade_damage_reports_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_damage_reports_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "arcade_machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_damage_reports_reported_by_staff_id_fkey"
            columns: ["reported_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_documents: {
        Row: {
          created_at: string
          created_by: string | null
          doc_type: string
          error_code: string | null
          external_url: string | null
          fault_category: string | null
          file_name: string | null
          id: string
          location_id: string | null
          machine_id: string | null
          manufacturer: string | null
          mime_type: string | null
          model: string | null
          notes: string | null
          part_hint: string | null
          storage_path: string | null
          title: string
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          doc_type: string
          error_code?: string | null
          external_url?: string | null
          fault_category?: string | null
          file_name?: string | null
          id?: string
          location_id?: string | null
          machine_id?: string | null
          manufacturer?: string | null
          mime_type?: string | null
          model?: string | null
          notes?: string | null
          part_hint?: string | null
          storage_path?: string | null
          title: string
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          doc_type?: string
          error_code?: string | null
          external_url?: string | null
          fault_category?: string | null
          file_name?: string | null
          id?: string
          location_id?: string | null
          machine_id?: string | null
          manufacturer?: string | null
          mime_type?: string | null
          model?: string | null
          notes?: string | null
          part_hint?: string | null
          storage_path?: string | null
          title?: string
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "arcade_documents_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_documents_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "arcade_machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_documents_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_fault_updates: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          fault_id: string
          id: string
          kind: string
          location_id: string | null
          new_status: string | null
          previous_status: string | null
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          fault_id: string
          id?: string
          kind?: string
          location_id?: string | null
          new_status?: string | null
          previous_status?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          fault_id?: string
          id?: string
          kind?: string
          location_id?: string | null
          new_status?: string | null
          previous_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "arcade_fault_updates_fault_id_fkey"
            columns: ["fault_id"]
            isOneToOne: false
            referencedRelation: "arcade_faults"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_fault_updates_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_faults: {
        Row: {
          action_taken: string | null
          category: string
          closed_at: string | null
          created_at: string
          created_by: string | null
          days_since_last_repair: number | null
          description: string
          diagnosis: string | null
          downtime_ended_at: string | null
          downtime_started_at: string | null
          final_result: string | null
          id: string
          is_repeat: boolean
          last_failure_at: string | null
          location_id: string
          machine_id: string
          operational_impact: string
          parts_used: string | null
          pm_record_id: string | null
          prior_fault_id: string | null
          problem: string | null
          recommendations: string | null
          repeat_count: number
          reported_at: string
          reported_by_staff_id: string | null
          resolved_at: string | null
          severity: string
          status: string
          technician_staff_id: string | null
          testing_performed: string | null
          ticket_number: string | null
          unit_number: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          action_taken?: string | null
          category: string
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          days_since_last_repair?: number | null
          description: string
          diagnosis?: string | null
          downtime_ended_at?: string | null
          downtime_started_at?: string | null
          final_result?: string | null
          id?: string
          is_repeat?: boolean
          last_failure_at?: string | null
          location_id: string
          machine_id: string
          operational_impact?: string
          parts_used?: string | null
          pm_record_id?: string | null
          prior_fault_id?: string | null
          problem?: string | null
          recommendations?: string | null
          repeat_count?: number
          reported_at?: string
          reported_by_staff_id?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
          technician_staff_id?: string | null
          testing_performed?: string | null
          ticket_number?: string | null
          unit_number?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          action_taken?: string | null
          category?: string
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          days_since_last_repair?: number | null
          description?: string
          diagnosis?: string | null
          downtime_ended_at?: string | null
          downtime_started_at?: string | null
          final_result?: string | null
          id?: string
          is_repeat?: boolean
          last_failure_at?: string | null
          location_id?: string
          machine_id?: string
          operational_impact?: string
          parts_used?: string | null
          pm_record_id?: string | null
          prior_fault_id?: string | null
          problem?: string | null
          recommendations?: string | null
          repeat_count?: number
          reported_at?: string
          reported_by_staff_id?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
          technician_staff_id?: string | null
          testing_performed?: string | null
          ticket_number?: string | null
          unit_number?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "arcade_faults_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_faults_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "arcade_machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_faults_pm_record_fkey"
            columns: ["pm_record_id"]
            isOneToOne: false
            referencedRelation: "arcade_pm_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_faults_prior_fault_id_fkey"
            columns: ["prior_fault_id"]
            isOneToOne: false
            referencedRelation: "arcade_faults"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_faults_reported_by_staff_id_fkey"
            columns: ["reported_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_faults_technician_staff_id_fkey"
            columns: ["technician_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_import_queue: {
        Row: {
          created_at: string
          created_by: string | null
          external_key: string | null
          id: string
          imported_entity: string | null
          imported_id: string | null
          kind: string
          machine_id: string | null
          mapping_reason: string | null
          needs_mapping: boolean
          payload: Json
          source: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          external_key?: string | null
          id?: string
          imported_entity?: string | null
          imported_id?: string | null
          kind: string
          machine_id?: string | null
          mapping_reason?: string | null
          needs_mapping?: boolean
          payload?: Json
          source: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          external_key?: string | null
          id?: string
          imported_entity?: string | null
          imported_id?: string | null
          kind?: string
          machine_id?: string | null
          mapping_reason?: string | null
          needs_mapping?: boolean
          payload?: Json
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "arcade_import_queue_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "arcade_machines"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_installations: {
        Row: {
          checks: Json
          created_at: string
          created_by: string | null
          delivery_on: string | null
          final_acceptance: string | null
          id: string
          installed_on: string | null
          issues: string | null
          location_id: string
          machine_id: string | null
          status: string
          supplier_technician: string | null
          technician_staff_id: string | null
          updated_at: string
          updated_by: string | null
          vendor_id: string | null
        }
        Insert: {
          checks?: Json
          created_at?: string
          created_by?: string | null
          delivery_on?: string | null
          final_acceptance?: string | null
          id?: string
          installed_on?: string | null
          issues?: string | null
          location_id: string
          machine_id?: string | null
          status?: string
          supplier_technician?: string | null
          technician_staff_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string | null
        }
        Update: {
          checks?: Json
          created_at?: string
          created_by?: string | null
          delivery_on?: string | null
          final_acceptance?: string | null
          id?: string
          installed_on?: string | null
          issues?: string | null
          location_id?: string
          machine_id?: string | null
          status?: string
          supplier_technician?: string | null
          technician_staff_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "arcade_installations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_installations_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "arcade_machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_installations_technician_staff_id_fkey"
            columns: ["technician_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_installations_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_list_hides: {
        Row: {
          created_at: string
          hidden_by: string | null
          id: string
          location_id: string | null
          machine_id: string | null
        }
        Insert: {
          created_at?: string
          hidden_by?: string | null
          id?: string
          location_id?: string | null
          machine_id?: string | null
        }
        Update: {
          created_at?: string
          hidden_by?: string | null
          id?: string
          location_id?: string | null
          machine_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "arcade_list_hides_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_list_hides_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "arcade_machines"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_machines: {
        Row: {
          active: boolean
          amount_paid: number | null
          area_id: string | null
          asset_code: string
          card_rfid_interface: string | null
          controller_pcb: string | null
          created_at: string
          created_by: string | null
          game_category: string
          id: string
          installed_on: string | null
          ip_address: string | null
          last_fault_at: string | null
          last_fix_at: string | null
          last_fix_status: string | null
          last_fix_summary: string | null
          last_fix_technician_staff_id: string | null
          last_pm_on: string | null
          last_repair_at: string | null
          location_id: string
          machine_cost: number | null
          manufacturer: string | null
          model: string | null
          name: string
          network_requirement: string | null
          next_pm_on: string | null
          notes: string | null
          paid_currency: string | null
          paid_on: string | null
          photo_path: string | null
          power_requirement: string | null
          purchased_on: string | null
          serial_number: string | null
          software_version: string | null
          status: string
          supplier_name: string | null
          technician_staff_id: string | null
          unit_number: string | null
          updated_at: string
          updated_by: string | null
          vendor_id: string | null
          warranty_expires_on: string | null
          warranty_start: string | null
          zone: string | null
        }
        Insert: {
          active?: boolean
          amount_paid?: number | null
          area_id?: string | null
          asset_code: string
          card_rfid_interface?: string | null
          controller_pcb?: string | null
          created_at?: string
          created_by?: string | null
          game_category: string
          id?: string
          installed_on?: string | null
          ip_address?: string | null
          last_fault_at?: string | null
          last_fix_at?: string | null
          last_fix_status?: string | null
          last_fix_summary?: string | null
          last_fix_technician_staff_id?: string | null
          last_pm_on?: string | null
          last_repair_at?: string | null
          location_id: string
          machine_cost?: number | null
          manufacturer?: string | null
          model?: string | null
          name: string
          network_requirement?: string | null
          next_pm_on?: string | null
          notes?: string | null
          paid_currency?: string | null
          paid_on?: string | null
          photo_path?: string | null
          power_requirement?: string | null
          purchased_on?: string | null
          serial_number?: string | null
          software_version?: string | null
          status?: string
          supplier_name?: string | null
          technician_staff_id?: string | null
          unit_number?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string | null
          warranty_expires_on?: string | null
          warranty_start?: string | null
          zone?: string | null
        }
        Update: {
          active?: boolean
          amount_paid?: number | null
          area_id?: string | null
          asset_code?: string
          card_rfid_interface?: string | null
          controller_pcb?: string | null
          created_at?: string
          created_by?: string | null
          game_category?: string
          id?: string
          installed_on?: string | null
          ip_address?: string | null
          last_fault_at?: string | null
          last_fix_at?: string | null
          last_fix_status?: string | null
          last_fix_summary?: string | null
          last_fix_technician_staff_id?: string | null
          last_pm_on?: string | null
          last_repair_at?: string | null
          location_id?: string
          machine_cost?: number | null
          manufacturer?: string | null
          model?: string | null
          name?: string
          network_requirement?: string | null
          next_pm_on?: string | null
          notes?: string | null
          paid_currency?: string | null
          paid_on?: string | null
          photo_path?: string | null
          power_requirement?: string | null
          purchased_on?: string | null
          serial_number?: string | null
          software_version?: string | null
          status?: string
          supplier_name?: string | null
          technician_staff_id?: string | null
          unit_number?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string | null
          warranty_expires_on?: string | null
          warranty_start?: string | null
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "arcade_machines_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "location_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_machines_last_fix_technician_staff_id_fkey"
            columns: ["last_fix_technician_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_machines_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_machines_technician_staff_id_fkey"
            columns: ["technician_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_machines_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_number_counters: {
        Row: {
          last_value: number
          prefix: string
          year: number
        }
        Insert: {
          last_value: number
          prefix: string
          year: number
        }
        Update: {
          last_value?: number
          prefix?: string
          year?: number
        }
        Relationships: []
      }
      arcade_observation_checks: {
        Row: {
          checked_on: string
          created_at: string
          created_by: string | null
          id: string
          location_id: string
          notes: string | null
          observation_id: string
          result: string
        }
        Insert: {
          checked_on?: string
          created_at?: string
          created_by?: string | null
          id?: string
          location_id: string
          notes?: string | null
          observation_id: string
          result: string
        }
        Update: {
          checked_on?: string
          created_at?: string
          created_by?: string | null
          id?: string
          location_id?: string
          notes?: string | null
          observation_id?: string
          result?: string
        }
        Relationships: [
          {
            foreignKeyName: "arcade_observation_checks_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_observation_checks_observation_id_fkey"
            columns: ["observation_id"]
            isOneToOne: false
            referencedRelation: "arcade_observations"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_observations: {
        Row: {
          closed_at: string | null
          created_by: string | null
          fault_id: string | null
          id: string
          location_id: string
          machine_id: string
          started_at: string
          status: string
          technician_staff_id: string | null
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          created_by?: string | null
          fault_id?: string | null
          id?: string
          location_id: string
          machine_id: string
          started_at?: string
          status?: string
          technician_staff_id?: string | null
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          created_by?: string | null
          fault_id?: string | null
          id?: string
          location_id?: string
          machine_id?: string
          started_at?: string
          status?: string
          technician_staff_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "arcade_observations_fault_id_fkey"
            columns: ["fault_id"]
            isOneToOne: false
            referencedRelation: "arcade_faults"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_observations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_observations_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "arcade_machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_observations_technician_staff_id_fkey"
            columns: ["technician_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_part_machines: {
        Row: {
          machine_id: string
          part_id: string
        }
        Insert: {
          machine_id: string
          part_id: string
        }
        Update: {
          machine_id?: string
          part_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "arcade_part_machines_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "arcade_machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_part_machines_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "arcade_spare_parts"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_part_requests: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          eta: string | null
          fault_id: string | null
          id: string
          location_id: string
          machine_id: string | null
          notes: string | null
          part_id: string | null
          qty: number
          status: string
          technician_staff_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description: string
          eta?: string | null
          fault_id?: string | null
          id?: string
          location_id: string
          machine_id?: string | null
          notes?: string | null
          part_id?: string | null
          qty?: number
          status?: string
          technician_staff_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          eta?: string | null
          fault_id?: string | null
          id?: string
          location_id?: string
          machine_id?: string | null
          notes?: string | null
          part_id?: string | null
          qty?: number
          status?: string
          technician_staff_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "arcade_part_requests_fault_id_fkey"
            columns: ["fault_id"]
            isOneToOne: false
            referencedRelation: "arcade_faults"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_part_requests_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_part_requests_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "arcade_machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_part_requests_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "arcade_spare_parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_part_requests_technician_staff_id_fkey"
            columns: ["technician_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_part_usages: {
        Row: {
          created_at: string
          created_by: string | null
          fault_id: string | null
          id: string
          inventory_item_id: string | null
          location_id: string
          machine_id: string
          movement_id: string | null
          notes: string | null
          part_id: string
          qty: number
          technician_staff_id: string | null
          unit_cost: number | null
          used_on: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          fault_id?: string | null
          id?: string
          inventory_item_id?: string | null
          location_id: string
          machine_id: string
          movement_id?: string | null
          notes?: string | null
          part_id: string
          qty: number
          technician_staff_id?: string | null
          unit_cost?: number | null
          used_on?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          fault_id?: string | null
          id?: string
          inventory_item_id?: string | null
          location_id?: string
          machine_id?: string
          movement_id?: string | null
          notes?: string | null
          part_id?: string
          qty?: number
          technician_staff_id?: string | null
          unit_cost?: number | null
          used_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "arcade_part_usages_fault_id_fkey"
            columns: ["fault_id"]
            isOneToOne: false
            referencedRelation: "arcade_faults"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_part_usages_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_part_usages_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_part_usages_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "arcade_machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_part_usages_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "arcade_spare_parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_part_usages_technician_staff_id_fkey"
            columns: ["technician_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_pm_records: {
        Row: {
          completed_at: string | null
          confirmed: boolean
          created_at: string
          created_by: string | null
          id: string
          issues_found: string | null
          location_id: string
          machine_id: string
          next_pm_on: string | null
          notes: string | null
          performed_on: string
          schedule_id: string | null
          started_at: string | null
          technician_staff_id: string | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          confirmed?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          issues_found?: string | null
          location_id: string
          machine_id: string
          next_pm_on?: string | null
          notes?: string | null
          performed_on?: string
          schedule_id?: string | null
          started_at?: string | null
          technician_staff_id?: string | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          confirmed?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          issues_found?: string | null
          location_id?: string
          machine_id?: string
          next_pm_on?: string | null
          notes?: string | null
          performed_on?: string
          schedule_id?: string | null
          started_at?: string | null
          technician_staff_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "arcade_pm_records_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_pm_records_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "arcade_machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_pm_records_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "arcade_pm_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_pm_records_technician_staff_id_fkey"
            columns: ["technician_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_pm_results: {
        Row: {
          id: string
          item_label: string
          location_id: string
          notes: string | null
          record_id: string
          result: string
        }
        Insert: {
          id?: string
          item_label: string
          location_id: string
          notes?: string | null
          record_id: string
          result: string
        }
        Update: {
          id?: string
          item_label?: string
          location_id?: string
          notes?: string | null
          record_id?: string
          result?: string
        }
        Relationships: [
          {
            foreignKeyName: "arcade_pm_results_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_pm_results_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "arcade_pm_records"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_pm_schedules: {
        Row: {
          active: boolean
          cadence: string
          checklist: Json
          created_at: string
          created_by: string | null
          custom_interval_days: number | null
          game_category: string | null
          id: string
          location_id: string | null
          machine_id: string | null
          next_due_on: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          cadence: string
          checklist?: Json
          created_at?: string
          created_by?: string | null
          custom_interval_days?: number | null
          game_category?: string | null
          id?: string
          location_id?: string | null
          machine_id?: string | null
          next_due_on?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          cadence?: string
          checklist?: Json
          created_at?: string
          created_by?: string | null
          custom_interval_days?: number | null
          game_category?: string | null
          id?: string
          location_id?: string | null
          machine_id?: string | null
          next_due_on?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "arcade_pm_schedules_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_pm_schedules_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "arcade_machines"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_repairs: {
        Row: {
          completed_at: string | null
          created_by: string | null
          fault_id: string
          id: string
          location_id: string
          machine_id: string
          notes: string | null
          paused_at: string | null
          started_at: string
          status: string
          technician_staff_id: string | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_by?: string | null
          fault_id: string
          id?: string
          location_id: string
          machine_id: string
          notes?: string | null
          paused_at?: string | null
          started_at?: string
          status?: string
          technician_staff_id?: string | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_by?: string | null
          fault_id?: string
          id?: string
          location_id?: string
          machine_id?: string
          notes?: string | null
          paused_at?: string | null
          started_at?: string
          status?: string
          technician_staff_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "arcade_repairs_fault_id_fkey"
            columns: ["fault_id"]
            isOneToOne: false
            referencedRelation: "arcade_faults"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_repairs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_repairs_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "arcade_machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_repairs_technician_staff_id_fkey"
            columns: ["technician_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_spare_parts: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          eta: string | null
          id: string
          inventory_item_id: string | null
          last_purchase_price: number | null
          manufacturer: string | null
          min_stock: number
          name: string
          notes: string | null
          ordered_qty: number
          part_code: string
          part_number: string | null
          photo_path: string | null
          received_qty: number
          reorder_level: number
          requested_qty: number
          spec: string | null
          supply_status: string
          unit_cost: number | null
          updated_at: string
          updated_by: string | null
          vendor_id: string | null
          warehouse_location_id: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          eta?: string | null
          id?: string
          inventory_item_id?: string | null
          last_purchase_price?: number | null
          manufacturer?: string | null
          min_stock?: number
          name: string
          notes?: string | null
          ordered_qty?: number
          part_code: string
          part_number?: string | null
          photo_path?: string | null
          received_qty?: number
          reorder_level?: number
          requested_qty?: number
          spec?: string | null
          supply_status?: string
          unit_cost?: number | null
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string | null
          warehouse_location_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          eta?: string | null
          id?: string
          inventory_item_id?: string | null
          last_purchase_price?: number | null
          manufacturer?: string | null
          min_stock?: number
          name?: string
          notes?: string | null
          ordered_qty?: number
          part_code?: string
          part_number?: string | null
          photo_path?: string | null
          received_qty?: number
          reorder_level?: number
          requested_qty?: number
          spec?: string | null
          supply_status?: string
          unit_cost?: number | null
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string | null
          warehouse_location_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "arcade_spare_parts_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: true
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_spare_parts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_spare_parts_warehouse_location_id_fkey"
            columns: ["warehouse_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_status_history: {
        Row: {
          created_at: string
          created_by: string | null
          entity_id: string | null
          entity_type: string
          id: string
          location_id: string | null
          machine_id: string | null
          new_status: string | null
          notes: string | null
          previous_status: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          location_id?: string | null
          machine_id?: string | null
          new_status?: string | null
          notes?: string | null
          previous_status?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          location_id?: string | null
          machine_id?: string | null
          new_status?: string | null
          notes?: string | null
          previous_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "arcade_status_history_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_status_history_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "arcade_machines"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_supplier_case_updates: {
        Row: {
          body: string
          case_id: string
          created_at: string
          created_by: string | null
          id: string
          location_id: string | null
        }
        Insert: {
          body: string
          case_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          location_id?: string | null
        }
        Update: {
          body?: string
          case_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          location_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "arcade_supplier_case_updates_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "arcade_supplier_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_supplier_case_updates_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_supplier_cases: {
        Row: {
          case_number: string | null
          created_at: string
          created_by: string | null
          fault_id: string | null
          first_response_at: string | null
          id: string
          last_contact_at: string | null
          location_id: string | null
          machine_id: string | null
          next_follow_up_on: string | null
          parts_tested: string | null
          problem: string
          resolved_at: string | null
          status: string
          supplier_response: string | null
          technician_findings: string | null
          technician_staff_id: string | null
          troubleshooting_done: string | null
          updated_at: string
          updated_by: string | null
          vendor_id: string
          warranty_status: string | null
        }
        Insert: {
          case_number?: string | null
          created_at?: string
          created_by?: string | null
          fault_id?: string | null
          first_response_at?: string | null
          id?: string
          last_contact_at?: string | null
          location_id?: string | null
          machine_id?: string | null
          next_follow_up_on?: string | null
          parts_tested?: string | null
          problem: string
          resolved_at?: string | null
          status?: string
          supplier_response?: string | null
          technician_findings?: string | null
          technician_staff_id?: string | null
          troubleshooting_done?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_id: string
          warranty_status?: string | null
        }
        Update: {
          case_number?: string | null
          created_at?: string
          created_by?: string | null
          fault_id?: string | null
          first_response_at?: string | null
          id?: string
          last_contact_at?: string | null
          location_id?: string | null
          machine_id?: string | null
          next_follow_up_on?: string | null
          parts_tested?: string | null
          problem?: string
          resolved_at?: string | null
          status?: string
          supplier_response?: string | null
          technician_findings?: string | null
          technician_staff_id?: string | null
          troubleshooting_done?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string
          warranty_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "arcade_supplier_cases_fault_id_fkey"
            columns: ["fault_id"]
            isOneToOne: false
            referencedRelation: "arcade_faults"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_supplier_cases_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_supplier_cases_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "arcade_machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_supplier_cases_technician_staff_id_fkey"
            columns: ["technician_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_supplier_cases_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_tasks: {
        Row: {
          actual_minutes: number | null
          created_at: string
          created_by: string | null
          depends_on_id: string | null
          due_on: string
          estimated_minutes: number | null
          evidence: string | null
          id: string
          kind: string
          location_id: string | null
          machine_id: string | null
          notes: string | null
          priority: string
          source_id: string | null
          source_type: string | null
          span: string
          status: string
          technician_staff_id: string | null
          title: string
          updated_at: string
          updated_by: string | null
          verification: string
          verification_note: string | null
          verified_at: string | null
          verified_by_staff_id: string | null
        }
        Insert: {
          actual_minutes?: number | null
          created_at?: string
          created_by?: string | null
          depends_on_id?: string | null
          due_on: string
          estimated_minutes?: number | null
          evidence?: string | null
          id?: string
          kind: string
          location_id?: string | null
          machine_id?: string | null
          notes?: string | null
          priority?: string
          source_id?: string | null
          source_type?: string | null
          span?: string
          status?: string
          technician_staff_id?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
          verification?: string
          verification_note?: string | null
          verified_at?: string | null
          verified_by_staff_id?: string | null
        }
        Update: {
          actual_minutes?: number | null
          created_at?: string
          created_by?: string | null
          depends_on_id?: string | null
          due_on?: string
          estimated_minutes?: number | null
          evidence?: string | null
          id?: string
          kind?: string
          location_id?: string | null
          machine_id?: string | null
          notes?: string | null
          priority?: string
          source_id?: string | null
          source_type?: string | null
          span?: string
          status?: string
          technician_staff_id?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
          verification?: string
          verification_note?: string | null
          verified_at?: string | null
          verified_by_staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "arcade_tasks_depends_on_id_fkey"
            columns: ["depends_on_id"]
            isOneToOne: false
            referencedRelation: "arcade_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_tasks_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_tasks_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "arcade_machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_tasks_technician_staff_id_fkey"
            columns: ["technician_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_tasks_verified_by_staff_id_fkey"
            columns: ["verified_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_vendor_profiles: {
        Row: {
          address: string | null
          country: string | null
          notes: string | null
          sales_contact: string | null
          sales_phone: string | null
          technical_contact: string | null
          technical_phone: string | null
          typical_lead_days: number | null
          updated_at: string
          updated_by: string | null
          vendor_id: string
          warranty_terms: string | null
          website: string | null
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          country?: string | null
          notes?: string | null
          sales_contact?: string | null
          sales_phone?: string | null
          technical_contact?: string | null
          technical_phone?: string | null
          typical_lead_days?: number | null
          updated_at?: string
          updated_by?: string | null
          vendor_id: string
          warranty_terms?: string | null
          website?: string | null
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          country?: string | null
          notes?: string | null
          sales_contact?: string | null
          sales_phone?: string | null
          technical_contact?: string | null
          technical_phone?: string | null
          typical_lead_days?: number | null
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string
          warranty_terms?: string | null
          website?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "arcade_vendor_profiles_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: true
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_week_tasks: {
        Row: {
          created_at: string
          created_by: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          kind: string
          location_id: string | null
          machine_id: string | null
          notes: string | null
          priority: string
          status: string
          task_date: string
          technician_staff_id: string | null
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          kind: string
          location_id?: string | null
          machine_id?: string | null
          notes?: string | null
          priority?: string
          status?: string
          task_date: string
          technician_staff_id?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          kind?: string
          location_id?: string | null
          machine_id?: string | null
          notes?: string | null
          priority?: string
          status?: string
          task_date?: string
          technician_staff_id?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "arcade_week_tasks_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_week_tasks_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "arcade_machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arcade_week_tasks_technician_staff_id_fkey"
            columns: ["technician_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
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
      attendance_adms_connection_tests: {
        Row: {
          acknowledged_at: string | null
          command_body: string | null
          command_id: number | null
          completed_at: string | null
          contact_class: string | null
          created_at: string
          created_by: string | null
          delivered_at: string | null
          device_id: string
          diagnosis: string | null
          error: string | null
          id: string
          last_contact_at: string | null
          last_endpoint: string | null
          last_source_ip: string | null
          location_id: string
          pushver: string | null
          queued_at: string | null
          result_code: number | null
          round_trip_ms: number | null
          serial_number: string | null
          stages: Json
          status: string
          timeout_ms: number
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          command_body?: string | null
          command_id?: number | null
          completed_at?: string | null
          contact_class?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          device_id: string
          diagnosis?: string | null
          error?: string | null
          id?: string
          last_contact_at?: string | null
          last_endpoint?: string | null
          last_source_ip?: string | null
          location_id: string
          pushver?: string | null
          queued_at?: string | null
          result_code?: number | null
          round_trip_ms?: number | null
          serial_number?: string | null
          stages?: Json
          status?: string
          timeout_ms?: number
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          command_body?: string | null
          command_id?: number | null
          completed_at?: string | null
          contact_class?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          device_id?: string
          diagnosis?: string | null
          error?: string | null
          id?: string
          last_contact_at?: string | null
          last_endpoint?: string | null
          last_source_ip?: string | null
          location_id?: string
          pushver?: string | null
          queued_at?: string | null
          result_code?: number | null
          round_trip_ms?: number | null
          serial_number?: string | null
          stages?: Json
          status?: string
          timeout_ms?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_adms_connection_tests_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "attendance_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_adms_diagnostic_events: {
        Row: {
          command_id: number | null
          created_at: string
          device_id: string | null
          endpoint: string | null
          error: string | null
          event_type: string
          id: string
          location_id: string | null
          metadata: Json
          result: string | null
          serial_number: string | null
          test_id: string | null
        }
        Insert: {
          command_id?: number | null
          created_at?: string
          device_id?: string | null
          endpoint?: string | null
          error?: string | null
          event_type: string
          id?: string
          location_id?: string | null
          metadata?: Json
          result?: string | null
          serial_number?: string | null
          test_id?: string | null
        }
        Update: {
          command_id?: number | null
          created_at?: string
          device_id?: string | null
          endpoint?: string | null
          error?: string | null
          event_type?: string
          id?: string
          location_id?: string | null
          metadata?: Json
          result?: string | null
          serial_number?: string | null
          test_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_adms_diagnostic_events_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "attendance_adms_connection_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_adms_unknown_serials: {
        Row: {
          endpoint: string | null
          id: string
          seen_at: string
          serial_number: string
          source_ip: string | null
        }
        Insert: {
          endpoint?: string | null
          id?: string
          seen_at?: string
          serial_number: string
          source_ip?: string | null
        }
        Update: {
          endpoint?: string | null
          id?: string
          seen_at?: string
          serial_number?: string
          source_ip?: string | null
        }
        Relationships: []
      }
      attendance_audit_events: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          location_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          location_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          location_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_audit_events_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_biometric_users: {
        Row: {
          biometric_user_id: string
          company_id: string
          created_at: string
          department: string | null
          device_id: string
          device_name: string | null
          employee_code: string | null
          employment_status: string
          full_name: string | null
          id: string
          job_title: string | null
          location_id: string
          mapped_at: string | null
          mapped_by: string | null
          previous_device_name: string | null
          staff_id: string | null
          updated_at: string
        }
        Insert: {
          biometric_user_id: string
          company_id: string
          created_at?: string
          department?: string | null
          device_id: string
          device_name?: string | null
          employee_code?: string | null
          employment_status?: string
          full_name?: string | null
          id?: string
          job_title?: string | null
          location_id: string
          mapped_at?: string | null
          mapped_by?: string | null
          previous_device_name?: string | null
          staff_id?: string | null
          updated_at?: string
        }
        Update: {
          biometric_user_id?: string
          company_id?: string
          created_at?: string
          department?: string | null
          device_id?: string
          device_name?: string | null
          employee_code?: string | null
          employment_status?: string
          full_name?: string | null
          id?: string
          job_title?: string | null
          location_id?: string
          mapped_at?: string | null
          mapped_by?: string | null
          previous_device_name?: string | null
          staff_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_biometric_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "hr_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_biometric_users_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "attendance_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_biometric_users_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_biometric_users_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_correction_approvals: {
        Row: {
          acted_at: string | null
          acted_by: string | null
          comments: string | null
          correction_id: string
          created_at: string
          id: string
          status: string
          step_order: number
          step_role: string
        }
        Insert: {
          acted_at?: string | null
          acted_by?: string | null
          comments?: string | null
          correction_id: string
          created_at?: string
          id?: string
          status?: string
          step_order: number
          step_role: string
        }
        Update: {
          acted_at?: string | null
          acted_by?: string | null
          comments?: string | null
          correction_id?: string
          created_at?: string
          id?: string
          status?: string
          step_order?: number
          step_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_correction_approvals_correction_id_fkey"
            columns: ["correction_id"]
            isOneToOne: false
            referencedRelation: "attendance_corrections"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_corrections: {
        Row: {
          attachment_path: string | null
          current_step_role: string | null
          id: string
          kind: string
          location_id: string
          new_value: Json
          original_value: Json
          punch_id: string | null
          reason: string
          request_number: string | null
          requested_at: string
          requested_by: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          staff_id: string | null
          status: string
          summary_id: string | null
          work_date: string | null
        }
        Insert: {
          attachment_path?: string | null
          current_step_role?: string | null
          id?: string
          kind: string
          location_id: string
          new_value?: Json
          original_value?: Json
          punch_id?: string | null
          reason: string
          request_number?: string | null
          requested_at?: string
          requested_by: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_id?: string | null
          status?: string
          summary_id?: string | null
          work_date?: string | null
        }
        Update: {
          attachment_path?: string | null
          current_step_role?: string | null
          id?: string
          kind?: string
          location_id?: string
          new_value?: Json
          original_value?: Json
          punch_id?: string | null
          reason?: string
          request_number?: string | null
          requested_at?: string
          requested_by?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_id?: string | null
          status?: string
          summary_id?: string | null
          work_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_corrections_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_corrections_punch_id_fkey"
            columns: ["punch_id"]
            isOneToOne: false
            referencedRelation: "attendance_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_corrections_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_corrections_summary_id_fkey"
            columns: ["summary_id"]
            isOneToOne: false
            referencedRelation: "attendance_daily_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_daily_summary: {
        Row: {
          actual_in: string | null
          actual_out: string | null
          approval_status: string
          biometric_user_id: string | null
          company_id: string | null
          created_at: string
          device_id: string | null
          early_leave_minutes: number
          exception_reason: string | null
          hr_remarks: string | null
          id: string
          late_minutes: number
          location_id: string
          missed_punch: boolean
          overtime_minutes: number
          punch_count: number
          raw_punch_times: Json
          regular_minutes: number
          scheduled_in: string | null
          scheduled_out: string | null
          shift_id: string | null
          shift_template_id: string | null
          staff_id: string | null
          status: string
          status_flags: string[]
          subject_key: string
          updated_at: string
          user_id: string | null
          work_date: string
          worked_minutes: number
        }
        Insert: {
          actual_in?: string | null
          actual_out?: string | null
          approval_status?: string
          biometric_user_id?: string | null
          company_id?: string | null
          created_at?: string
          device_id?: string | null
          early_leave_minutes?: number
          exception_reason?: string | null
          hr_remarks?: string | null
          id?: string
          late_minutes?: number
          location_id: string
          missed_punch?: boolean
          overtime_minutes?: number
          punch_count?: number
          raw_punch_times?: Json
          regular_minutes?: number
          scheduled_in?: string | null
          scheduled_out?: string | null
          shift_id?: string | null
          shift_template_id?: string | null
          staff_id?: string | null
          status?: string
          status_flags?: string[]
          subject_key?: string
          updated_at?: string
          user_id?: string | null
          work_date: string
          worked_minutes?: number
        }
        Update: {
          actual_in?: string | null
          actual_out?: string | null
          approval_status?: string
          biometric_user_id?: string | null
          company_id?: string | null
          created_at?: string
          device_id?: string | null
          early_leave_minutes?: number
          exception_reason?: string | null
          hr_remarks?: string | null
          id?: string
          late_minutes?: number
          location_id?: string
          missed_punch?: boolean
          overtime_minutes?: number
          punch_count?: number
          raw_punch_times?: Json
          regular_minutes?: number
          scheduled_in?: string | null
          scheduled_out?: string | null
          shift_id?: string | null
          shift_template_id?: string | null
          staff_id?: string | null
          status?: string
          status_flags?: string[]
          subject_key?: string
          updated_at?: string
          user_id?: string | null
          work_date?: string
          worked_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "attendance_daily_summary_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "hr_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_daily_summary_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "attendance_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_daily_summary_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_daily_summary_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_daily_summary_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_devices: {
        Row: {
          active: boolean
          adms_attlog_stamp: string | null
          adms_cmd_id: number
          adms_cmd_queued_at: string | null
          adms_diag_cmd_id: number
          adms_operlog_stamp: string | null
          adms_pending_cmd: string | null
          company_id: string | null
          connection_mode: string
          created_at: string
          device_code: string
          device_name: string
          id: string
          ip_address: string | null
          last_adms_at: string | null
          last_adms_endpoint: string | null
          last_adms_error: string | null
          last_adms_pushver: string | null
          last_adms_source_ip: string | null
          last_sync_at: string | null
          last_user_sync_at: string | null
          location_id: string
          notes: string | null
          serial_number: string | null
          sync_enabled: boolean
          timezone: string
          updated_at: string
          vendor: string
        }
        Insert: {
          active?: boolean
          adms_attlog_stamp?: string | null
          adms_cmd_id?: number
          adms_cmd_queued_at?: string | null
          adms_diag_cmd_id?: number
          adms_operlog_stamp?: string | null
          adms_pending_cmd?: string | null
          company_id?: string | null
          connection_mode?: string
          created_at?: string
          device_code: string
          device_name: string
          id?: string
          ip_address?: string | null
          last_adms_at?: string | null
          last_adms_endpoint?: string | null
          last_adms_error?: string | null
          last_adms_pushver?: string | null
          last_adms_source_ip?: string | null
          last_sync_at?: string | null
          last_user_sync_at?: string | null
          location_id: string
          notes?: string | null
          serial_number?: string | null
          sync_enabled?: boolean
          timezone?: string
          updated_at?: string
          vendor?: string
        }
        Update: {
          active?: boolean
          adms_attlog_stamp?: string | null
          adms_cmd_id?: number
          adms_cmd_queued_at?: string | null
          adms_diag_cmd_id?: number
          adms_operlog_stamp?: string | null
          adms_pending_cmd?: string | null
          company_id?: string | null
          connection_mode?: string
          created_at?: string
          device_code?: string
          device_name?: string
          id?: string
          ip_address?: string | null
          last_adms_at?: string | null
          last_adms_endpoint?: string | null
          last_adms_error?: string | null
          last_adms_pushver?: string | null
          last_adms_source_ip?: string | null
          last_sync_at?: string | null
          last_user_sync_at?: string | null
          location_id?: string
          notes?: string | null
          serial_number?: string | null
          sync_enabled?: boolean
          timezone?: string
          updated_at?: string
          vendor?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_devices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "hr_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_devices_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_exceptions: {
        Row: {
          approved_by: string | null
          correction_in: string | null
          correction_out: string | null
          created_at: string
          description: string | null
          exception_type: string
          id: string
          location_id: string
          requested_by: string | null
          staff_id: string | null
          status: string
          summary_id: string
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          correction_in?: string | null
          correction_out?: string | null
          created_at?: string
          description?: string | null
          exception_type: string
          id?: string
          location_id: string
          requested_by?: string | null
          staff_id?: string | null
          status?: string
          summary_id: string
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          correction_in?: string | null
          correction_out?: string | null
          created_at?: string
          description?: string | null
          exception_type?: string
          id?: string
          location_id?: string
          requested_by?: string | null
          staff_id?: string | null
          status?: string
          summary_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_exceptions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_exceptions_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_exceptions_summary_id_fkey"
            columns: ["summary_id"]
            isOneToOne: false
            referencedRelation: "attendance_daily_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_geofences: {
        Row: {
          active: boolean
          created_at: string
          id: string
          latitude: number
          location_id: string
          longitude: number
          mode: string
          name: string
          notes: string | null
          radius_meters: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          latitude: number
          location_id: string
          longitude: number
          mode?: string
          name: string
          notes?: string | null
          radius_meters?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          latitude?: number
          location_id?: string
          longitude?: number
          mode?: string
          name?: string
          notes?: string | null
          radius_meters?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_geofences_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: true
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_holidays: {
        Row: {
          company_id: string
          created_at: string
          holiday_date: string
          id: string
          location_id: string | null
          name: string
        }
        Insert: {
          company_id: string
          created_at?: string
          holiday_date: string
          id?: string
          location_id?: string | null
          name: string
        }
        Update: {
          company_id?: string
          created_at?: string
          holiday_date?: string
          id?: string
          location_id?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_holidays_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "hr_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_holidays_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_import_errors: {
        Row: {
          code: string
          created_at: string
          file_id: string | null
          id: string
          import_id: string
          message: string
          raw_row: Json | null
          row_number: number | null
        }
        Insert: {
          code: string
          created_at?: string
          file_id?: string | null
          id?: string
          import_id: string
          message: string
          raw_row?: Json | null
          row_number?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          file_id?: string | null
          id?: string
          import_id?: string
          message?: string
          raw_row?: Json | null
          row_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_import_errors_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "attendance_import_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_import_errors_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "attendance_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_import_files: {
        Row: {
          byte_size: number
          created_at: string
          device_id: string
          duplicate_count: number
          encrypted: boolean
          error_message: string | null
          file_hash: string
          file_type: string
          id: string
          import_id: string
          imported_count: number
          location_id: string
          original_filename: string
          preview: Json
          rejected_count: number
          retention_until: string | null
          row_count: number
          status: string
          storage_path: string | null
          unmatched_count: number
        }
        Insert: {
          byte_size?: number
          created_at?: string
          device_id: string
          duplicate_count?: number
          encrypted?: boolean
          error_message?: string | null
          file_hash: string
          file_type: string
          id?: string
          import_id: string
          imported_count?: number
          location_id: string
          original_filename: string
          preview?: Json
          rejected_count?: number
          retention_until?: string | null
          row_count?: number
          status?: string
          storage_path?: string | null
          unmatched_count?: number
        }
        Update: {
          byte_size?: number
          created_at?: string
          device_id?: string
          duplicate_count?: number
          encrypted?: boolean
          error_message?: string | null
          file_hash?: string
          file_type?: string
          id?: string
          import_id?: string
          imported_count?: number
          location_id?: string
          original_filename?: string
          preview?: Json
          rejected_count?: number
          retention_until?: string | null
          row_count?: number
          status?: string
          storage_path?: string | null
          unmatched_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "attendance_import_files_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "attendance_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_import_files_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "attendance_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_import_files_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_imports: {
        Row: {
          company_id: string
          completed_at: string | null
          created_at: string
          date_from: string | null
          date_to: string | null
          duplicate_count: number
          error_message: string | null
          file_count: number
          id: string
          imported_count: number
          rejected_count: number
          row_count: number
          started_at: string | null
          status: string
          summary: Json
          unmatched_count: number
          uploaded_by: string | null
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          created_at?: string
          date_from?: string | null
          date_to?: string | null
          duplicate_count?: number
          error_message?: string | null
          file_count?: number
          id?: string
          imported_count?: number
          rejected_count?: number
          row_count?: number
          started_at?: string | null
          status?: string
          summary?: Json
          unmatched_count?: number
          uploaded_by?: string | null
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          created_at?: string
          date_from?: string | null
          date_to?: string | null
          duplicate_count?: number
          error_message?: string | null
          file_count?: number
          id?: string
          imported_count?: number
          rejected_count?: number
          row_count?: number
          started_at?: string | null
          status?: string
          summary?: Json
          unmatched_count?: number
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_imports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "hr_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_ingest_hits: {
        Row: {
          called_at: string
          created_at: string
          failed_count: number
          id: string
          imported_count: number
          location_codes: string[]
          payload: Json
          record_count: number
          response_summary: Json
          source_ip: string | null
        }
        Insert: {
          called_at?: string
          created_at?: string
          failed_count?: number
          id?: string
          imported_count?: number
          location_codes?: string[]
          payload?: Json
          record_count?: number
          response_summary?: Json
          source_ip?: string | null
        }
        Update: {
          called_at?: string
          created_at?: string
          failed_count?: number
          id?: string
          imported_count?: number
          location_codes?: string[]
          payload?: Json
          record_count?: number
          response_summary?: Json
          source_ip?: string | null
        }
        Relationships: []
      }
      attendance_ingest_settings: {
        Row: {
          id: boolean
          log_api_hits: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: boolean
          log_api_hits?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: boolean
          log_api_hits?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      attendance_leave_records: {
        Row: {
          comp_off_for_date: string | null
          created_at: string
          created_by: string | null
          hr_leave_request_id: string | null
          id: string
          leave_date: string
          leave_type: string
          location_id: string
          notes: string | null
          source: string
          staff_id: string
        }
        Insert: {
          comp_off_for_date?: string | null
          created_at?: string
          created_by?: string | null
          hr_leave_request_id?: string | null
          id?: string
          leave_date: string
          leave_type: string
          location_id: string
          notes?: string | null
          source?: string
          staff_id: string
        }
        Update: {
          comp_off_for_date?: string | null
          created_at?: string
          created_by?: string | null
          hr_leave_request_id?: string | null
          id?: string
          leave_date?: string
          leave_type?: string
          location_id?: string
          notes?: string | null
          source?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_leave_records_hr_leave_request_id_fkey"
            columns: ["hr_leave_request_id"]
            isOneToOne: false
            referencedRelation: "hr_leave_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_leave_records_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_leave_records_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_logs: {
        Row: {
          attendance_date: string | null
          biometric_user_id: string | null
          company_id: string | null
          created_at: string
          device_id: string | null
          device_user_name: string | null
          excluded_from_calc: boolean
          id: string
          import_id: string | null
          in_out_status: number | null
          location_id: string
          probable_duplicate: boolean
          punch_at: string
          punch_hash: string | null
          punch_type: string
          raw_payload: Json
          reserved_field: string | null
          source: string
          staff_id: string | null
          user_id: string | null
          verify_method: number | null
          work_code: number | null
        }
        Insert: {
          attendance_date?: string | null
          biometric_user_id?: string | null
          company_id?: string | null
          created_at?: string
          device_id?: string | null
          device_user_name?: string | null
          excluded_from_calc?: boolean
          id?: string
          import_id?: string | null
          in_out_status?: number | null
          location_id: string
          probable_duplicate?: boolean
          punch_at: string
          punch_hash?: string | null
          punch_type?: string
          raw_payload?: Json
          reserved_field?: string | null
          source?: string
          staff_id?: string | null
          user_id?: string | null
          verify_method?: number | null
          work_code?: number | null
        }
        Update: {
          attendance_date?: string | null
          biometric_user_id?: string | null
          company_id?: string | null
          created_at?: string
          device_id?: string | null
          device_user_name?: string | null
          excluded_from_calc?: boolean
          id?: string
          import_id?: string | null
          in_out_status?: number | null
          location_id?: string
          probable_duplicate?: boolean
          punch_at?: string
          punch_hash?: string | null
          punch_type?: string
          raw_payload?: Json
          reserved_field?: string | null
          source?: string
          staff_id?: string | null
          user_id?: string | null
          verify_method?: number | null
          work_code?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "hr_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_logs_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "attendance_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_logs_import_fk"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "attendance_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_logs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_logs_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_roster_assignments: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_week_off: boolean
          location_id: string
          shift_end: string | null
          shift_start: string | null
          shift_template_id: string | null
          source: string
          staff_id: string
          work_date: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_week_off?: boolean
          location_id: string
          shift_end?: string | null
          shift_start?: string | null
          shift_template_id?: string | null
          source?: string
          staff_id: string
          work_date: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_week_off?: boolean
          location_id?: string
          shift_end?: string | null
          shift_start?: string | null
          shift_template_id?: string | null
          source?: string
          staff_id?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_roster_assignments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_roster_assignments_shift_template_id_fkey"
            columns: ["shift_template_id"]
            isOneToOne: false
            referencedRelation: "attendance_shift_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_roster_assignments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_rule_sets: {
        Row: {
          absent_requires_roster: boolean
          auto_map_employee_code: boolean
          company_id: string | null
          created_at: string
          duplicate_window_seconds: number
          extra_punches_need_review: boolean
          file_retention_days: number
          id: string
          location_id: string | null
          max_upload_bytes: number
          odd_punches_need_review: boolean
          scope: string
          timezone: string
          updated_at: string
        }
        Insert: {
          absent_requires_roster?: boolean
          auto_map_employee_code?: boolean
          company_id?: string | null
          created_at?: string
          duplicate_window_seconds?: number
          extra_punches_need_review?: boolean
          file_retention_days?: number
          id?: string
          location_id?: string | null
          max_upload_bytes?: number
          odd_punches_need_review?: boolean
          scope?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          absent_requires_roster?: boolean
          auto_map_employee_code?: boolean
          company_id?: string | null
          created_at?: string
          duplicate_window_seconds?: number
          extra_punches_need_review?: boolean
          file_retention_days?: number
          id?: string
          location_id?: string | null
          max_upload_bytes?: number
          odd_punches_need_review?: boolean
          scope?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_rule_sets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "hr_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_rule_sets_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_shift_templates: {
        Row: {
          active: boolean
          break_minutes: number
          company_id: string
          created_at: string
          day_cutoff_time: string
          early_in_window_minutes: number
          end_time: string
          grace_minutes: number
          id: string
          late_out_window_minutes: number
          location_id: string | null
          min_work_minutes: number
          name: string
          overnight: boolean
          overtime_after_minutes: number
          start_time: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          break_minutes?: number
          company_id: string
          created_at?: string
          day_cutoff_time?: string
          early_in_window_minutes?: number
          end_time: string
          grace_minutes?: number
          id?: string
          late_out_window_minutes?: number
          location_id?: string | null
          min_work_minutes?: number
          name: string
          overnight?: boolean
          overtime_after_minutes?: number
          start_time: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          break_minutes?: number
          company_id?: string
          created_at?: string
          day_cutoff_time?: string
          early_in_window_minutes?: number
          end_time?: string
          grace_minutes?: number
          id?: string
          late_out_window_minutes?: number
          location_id?: string | null
          min_work_minutes?: number
          name?: string
          overnight?: boolean
          overtime_after_minutes?: number
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_shift_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "hr_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_shift_templates_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_site_settings: {
        Row: {
          attendance_enabled: boolean
          break_minutes: number | null
          buffer_minutes: number | null
          company_id: string
          created_at: string
          joker_hours: number | null
          location_id: string
          notes: string | null
          permanent_hours: number | null
          reporting_time_minutes: number | null
          secondment_hours: number | null
          timezone: string
          updated_at: string
        }
        Insert: {
          attendance_enabled?: boolean
          break_minutes?: number | null
          buffer_minutes?: number | null
          company_id: string
          created_at?: string
          joker_hours?: number | null
          location_id: string
          notes?: string | null
          permanent_hours?: number | null
          reporting_time_minutes?: number | null
          secondment_hours?: number | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          attendance_enabled?: boolean
          break_minutes?: number | null
          buffer_minutes?: number | null
          company_id?: string
          created_at?: string
          joker_hours?: number | null
          location_id?: string
          notes?: string | null
          permanent_hours?: number | null
          reporting_time_minutes?: number | null
          secondment_hours?: number | null
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_site_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "hr_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_site_settings_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: true
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_sync_jobs: {
        Row: {
          completed_at: string | null
          device_id: string | null
          error_message: string | null
          id: string
          location_id: string | null
          records_processed: number
          records_received: number
          started_at: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          device_id?: string | null
          error_message?: string | null
          id?: string
          location_id?: string | null
          records_processed?: number
          records_received?: number
          started_at?: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          device_id?: string | null
          error_message?: string | null
          id?: string
          location_id?: string | null
          records_processed?: number
          records_received?: number
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_sync_jobs_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "attendance_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_sync_jobs_location_id_fkey"
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
      chat_acknowledgements: {
        Row: {
          acknowledged_at: string
          conversation_id: string
          message_id: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string
          conversation_id: string
          message_id: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string
          conversation_id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_acknowledgements_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_acknowledgements_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_acknowledgements_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages_visible"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_attachments: {
        Row: {
          byte_size: number
          conversation_id: string
          created_at: string
          created_by: string
          id: string
          message_id: string | null
          mime_type: string
          original_filename: string
          scan_status: string
          storage_bucket: string
          storage_path: string
        }
        Insert: {
          byte_size: number
          conversation_id: string
          created_at?: string
          created_by: string
          id?: string
          message_id?: string | null
          mime_type: string
          original_filename: string
          scan_status?: string
          storage_bucket?: string
          storage_path: string
        }
        Update: {
          byte_size?: number
          conversation_id?: string
          created_at?: string
          created_by?: string
          id?: string
          message_id?: string | null
          mime_type?: string
          original_filename?: string
          scan_status?: string
          storage_bucket?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_attachments_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages_visible"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_audit_logs: {
        Row: {
          actor_id: string | null
          conversation_id: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json
        }
        Insert: {
          actor_id?: string | null
          conversation_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
        }
        Update: {
          actor_id?: string | null
          conversation_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "chat_audit_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_call_participants: {
        Row: {
          call_id: string
          joined_at: string | null
          left_at: string | null
          outcome: string | null
          user_id: string
        }
        Insert: {
          call_id: string
          joined_at?: string | null
          left_at?: string | null
          outcome?: string | null
          user_id: string
        }
        Update: {
          call_id?: string
          joined_at?: string | null
          left_at?: string | null
          outcome?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_call_participants_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "chat_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_calls: {
        Row: {
          conversation_id: string
          created_at: string
          ended_at: string | null
          id: string
          kind: string
          provider: string
          recording_enabled: boolean
          room_name: string | null
          started_at: string
          started_by: string
          status: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          ended_at?: string | null
          id?: string
          kind: string
          provider?: string
          recording_enabled?: boolean
          room_name?: string | null
          started_at?: string
          started_by: string
          status: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          kind?: string
          provider?: string
          recording_enabled?: boolean
          room_name?: string | null
          started_at?: string
          started_by?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_calls_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_conversations: {
        Row: {
          archive_at: string | null
          archived_at: string | null
          call_policy: string
          created_at: string
          created_by: string
          deleted_at: string | null
          department_id: string | null
          description: string | null
          file_policy: string
          id: string
          kind: string
          location_id: string | null
          posting_policy: string
          retention_policy: string
          retention_until: string | null
          sensitive: boolean
          title: string | null
          updated_at: string
        }
        Insert: {
          archive_at?: string | null
          archived_at?: string | null
          call_policy?: string
          created_at?: string
          created_by: string
          deleted_at?: string | null
          department_id?: string | null
          description?: string | null
          file_policy?: string
          id?: string
          kind: string
          location_id?: string | null
          posting_policy?: string
          retention_policy?: string
          retention_until?: string | null
          sensitive?: boolean
          title?: string | null
          updated_at?: string
        }
        Update: {
          archive_at?: string | null
          archived_at?: string | null
          call_policy?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          department_id?: string | null
          description?: string | null
          file_policy?: string
          id?: string
          kind?: string
          location_id?: string | null
          posting_policy?: string
          retention_policy?: string
          retention_until?: string | null
          sensitive?: boolean
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "master_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_dm_pairs: {
        Row: {
          conversation_id: string
          user_high: string
          user_low: string
        }
        Insert: {
          conversation_id: string
          user_high: string
          user_low: string
        }
        Update: {
          conversation_id?: string
          user_high?: string
          user_low?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_dm_pairs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_entity_links: {
        Row: {
          conversation_id: string
          created_at: string
          created_by: string
          entity_id: string
          entity_type: string
          id: string
          message_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          created_by: string
          entity_id: string
          entity_type: string
          id?: string
          message_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          created_by?: string
          entity_id?: string
          entity_type?: string
          id?: string
          message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_entity_links_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_entity_links_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_entity_links_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages_visible"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_livekit_settings: {
        Row: {
          api_key: string
          api_secret: string
          enabled: boolean
          id: string
          server_url: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          api_key?: string
          api_secret?: string
          enabled?: boolean
          id: string
          server_url?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          api_key?: string
          api_secret?: string
          enabled?: boolean
          id?: string
          server_url?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      chat_members: {
        Row: {
          added_by: string | null
          conversation_id: string
          created_at: string
          joined_at: string
          left_at: string | null
          membership_source: string
          role: string
          staff_id: string | null
          user_id: string
        }
        Insert: {
          added_by?: string | null
          conversation_id: string
          created_at?: string
          joined_at?: string
          left_at?: string | null
          membership_source: string
          role: string
          staff_id?: string | null
          user_id: string
        }
        Update: {
          added_by?: string | null
          conversation_id?: string
          created_at?: string
          joined_at?: string
          left_at?: string | null
          membership_source?: string
          role?: string
          staff_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_members_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_mentions: {
        Row: {
          conversation_id: string
          mentioned_user_id: string
          message_id: string
        }
        Insert: {
          conversation_id: string
          mentioned_user_id: string
          message_id: string
        }
        Update: {
          conversation_id?: string
          mentioned_user_id?: string
          message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_mentions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_mentions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_mentions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages_visible"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_message_edits: {
        Row: {
          edited_at: string
          edited_by: string
          id: string
          message_id: string
          previous_body: string | null
          previous_metadata: Json | null
        }
        Insert: {
          edited_at?: string
          edited_by: string
          id?: string
          message_id: string
          previous_body?: string | null
          previous_metadata?: Json | null
        }
        Update: {
          edited_at?: string
          edited_by?: string
          id?: string
          message_id?: string
          previous_body?: string | null
          previous_metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_message_edits_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_message_edits_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages_visible"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          body: string | null
          client_message_id: string | null
          content_hidden: boolean
          conversation_id: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          deletion_scope: string | null
          edited_at: string | null
          forwarded_from_message_id: string | null
          id: string
          metadata: Json
          reply_to_message_id: string | null
          sender_id: string
          thread_root_message_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          client_message_id?: string | null
          content_hidden?: boolean
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_scope?: string | null
          edited_at?: string | null
          forwarded_from_message_id?: string | null
          id?: string
          metadata?: Json
          reply_to_message_id?: string | null
          sender_id: string
          thread_root_message_id?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          client_message_id?: string | null
          content_hidden?: boolean
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_scope?: string | null
          edited_at?: string | null
          forwarded_from_message_id?: string | null
          id?: string
          metadata?: Json
          reply_to_message_id?: string | null
          sender_id?: string
          thread_root_message_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_forwarded_from_message_id_fkey"
            columns: ["forwarded_from_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_forwarded_from_message_id_fkey"
            columns: ["forwarded_from_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_thread_root_message_id_fkey"
            columns: ["thread_root_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_thread_root_message_id_fkey"
            columns: ["thread_root_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages_visible"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_notification_preferences: {
        Row: {
          conversation_id: string | null
          id: string
          level: string
          notify_announcements: boolean
          notify_calls: boolean
          notify_mentions: boolean
          notify_messages: boolean
          user_id: string
        }
        Insert: {
          conversation_id?: string | null
          id?: string
          level: string
          notify_announcements?: boolean
          notify_calls?: boolean
          notify_mentions?: boolean
          notify_messages?: boolean
          user_id: string
        }
        Update: {
          conversation_id?: string | null
          id?: string
          level?: string
          notify_announcements?: boolean
          notify_calls?: boolean
          notify_mentions?: boolean
          notify_messages?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_notification_preferences_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_pins: {
        Row: {
          conversation_id: string
          message_id: string
          pinned_at: string
          pinned_by: string
        }
        Insert: {
          conversation_id: string
          message_id: string
          pinned_at?: string
          pinned_by: string
        }
        Update: {
          conversation_id?: string
          message_id?: string
          pinned_at?: string
          pinned_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_pins_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_pins_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_pins_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages_visible"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_poll_options: {
        Row: {
          id: string
          label: string
          poll_id: string
          position: number
        }
        Insert: {
          id?: string
          label: string
          poll_id: string
          position: number
        }
        Update: {
          id?: string
          label?: string
          poll_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "chat_poll_options_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "chat_polls"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_poll_votes: {
        Row: {
          created_at: string
          option_id: string
          poll_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          option_id: string
          poll_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          option_id?: string
          poll_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_poll_votes_option_fk"
            columns: ["poll_id", "option_id"]
            isOneToOne: false
            referencedRelation: "chat_poll_options"
            referencedColumns: ["poll_id", "id"]
          },
          {
            foreignKeyName: "chat_poll_votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "chat_polls"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_polls: {
        Row: {
          allow_multiple: boolean
          anonymous: boolean
          conversation_id: string
          created_at: string
          expires_at: string | null
          id: string
          message_id: string
        }
        Insert: {
          allow_multiple?: boolean
          anonymous?: boolean
          conversation_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          message_id: string
        }
        Update: {
          allow_multiple?: boolean
          anonymous?: boolean
          conversation_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_polls_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_polls_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_polls_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "chat_messages_visible"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_push_settings: {
        Row: {
          enabled: boolean
          id: string
          updated_at: string
          updated_by: string | null
          vapid_private_key: string
          vapid_public_key: string
        }
        Insert: {
          enabled?: boolean
          id: string
          updated_at?: string
          updated_by?: string | null
          vapid_private_key?: string
          vapid_public_key?: string
        }
        Update: {
          enabled?: boolean
          id?: string
          updated_at?: string
          updated_by?: string | null
          vapid_private_key?: string
          vapid_public_key?: string
        }
        Relationships: []
      }
      chat_push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_reactions: {
        Row: {
          conversation_id: string
          created_at: string
          emoji: string
          message_id: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          emoji: string
          message_id: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          emoji?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_reactions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages_visible"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_read_states: {
        Row: {
          conversation_id: string
          last_read_at: string
          last_read_message_id: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          last_read_at?: string
          last_read_message_id?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          last_read_at?: string
          last_read_message_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_read_states_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_read_states_last_read_message_id_fkey"
            columns: ["last_read_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_read_states_last_read_message_id_fkey"
            columns: ["last_read_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages_visible"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_saved_messages: {
        Row: {
          conversation_id: string
          message_id: string
          saved_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          message_id: string
          saved_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          message_id?: string
          saved_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_saved_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_saved_messages_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_saved_messages_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages_visible"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_sync_guard: {
        Row: {
          kind: string
          pid: number
        }
        Insert: {
          kind: string
          pid: number
        }
        Update: {
          kind?: string
          pid?: number
        }
        Relationships: []
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
      compliance_calendar_events: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string | null
          document_id: string | null
          due_date: string
          event_type: string
          id: string
          location_id: string
          owner_id: string | null
          proof_file_path: string | null
          reminder_days: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          document_id?: string | null
          due_date: string
          event_type: string
          id?: string
          location_id: string
          owner_id?: string | null
          proof_file_path?: string | null
          reminder_days?: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          document_id?: string | null
          due_date?: string
          event_type?: string
          id?: string
          location_id?: string
          owner_id?: string | null
          proof_file_path?: string | null
          reminder_days?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_calendar_events_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "compliance_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_calendar_events_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "compliance_documents_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_calendar_events_location_id_fkey"
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
          outstanding_amount: number | null
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
          outstanding_amount?: number | null
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
          outstanding_amount?: number | null
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
            foreignKeyName: "compliance_documents_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "amc_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_documents_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_documents_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_followups: {
        Row: {
          completed_at: string | null
          created_at: string
          event_id: string | null
          followup_date: string
          id: string
          location_id: string
          notes: string | null
          owner_id: string | null
          recurring_task_id: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          event_id?: string | null
          followup_date: string
          id?: string
          location_id: string
          notes?: string | null
          owner_id?: string | null
          recurring_task_id?: string | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          event_id?: string | null
          followup_date?: string
          id?: string
          location_id?: string
          notes?: string | null
          owner_id?: string | null
          recurring_task_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_followups_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "compliance_calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_followups_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_followups_recurring_task_id_fkey"
            columns: ["recurring_task_id"]
            isOneToOne: false
            referencedRelation: "compliance_recurring_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_items: {
        Row: {
          contract_number: string | null
          created_at: string
          doc_link: string | null
          domain: string
          expiry_date: string | null
          frequency: string | null
          id: string
          item_name: string
          last_service_date: string | null
          next_due_date: string | null
          owner: string | null
          remarks: string | null
          reminder_days: number | null
          renewal_cost: number | null
          risk_level: string | null
          start_date: string | null
          status: string
          updated_at: string
          vendor_authority: string | null
          venue_scope: string
        }
        Insert: {
          contract_number?: string | null
          created_at?: string
          doc_link?: string | null
          domain: string
          expiry_date?: string | null
          frequency?: string | null
          id?: string
          item_name: string
          last_service_date?: string | null
          next_due_date?: string | null
          owner?: string | null
          remarks?: string | null
          reminder_days?: number | null
          renewal_cost?: number | null
          risk_level?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          vendor_authority?: string | null
          venue_scope?: string
        }
        Update: {
          contract_number?: string | null
          created_at?: string
          doc_link?: string | null
          domain?: string
          expiry_date?: string | null
          frequency?: string | null
          id?: string
          item_name?: string
          last_service_date?: string | null
          next_due_date?: string | null
          owner?: string | null
          remarks?: string | null
          reminder_days?: number | null
          renewal_cost?: number | null
          risk_level?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          vendor_authority?: string | null
          venue_scope?: string
        }
        Relationships: []
      }
      compliance_notification_log: {
        Row: {
          created_at: string
          fired_on: string
          id: string
          item_id: string
          rule_type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          fired_on?: string
          id?: string
          item_id: string
          rule_type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          fired_on?: string
          id?: string
          item_id?: string
          rule_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_notification_log_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "location_compliance_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_notification_log_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "location_compliance_items_enriched"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_recurring_tasks: {
        Row: {
          active: boolean
          created_at: string
          id: string
          location_id: string
          next_due_date: string
          owner_id: string | null
          recurrence_rule: string
          reminder_days: number
          task_type: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          location_id: string
          next_due_date: string
          owner_id?: string | null
          recurrence_rule?: string
          reminder_days?: number
          task_type: string
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          location_id?: string
          next_due_date?: string
          owner_id?: string | null
          recurrence_rule?: string
          reminder_days?: number
          task_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_recurring_tasks_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_requirements: {
        Row: {
          area_sub_area: string | null
          category: string
          created_at: string
          default_department: string | null
          default_frequency: string | null
          default_owner: string | null
          default_risk_level: string
          document_contract_type: string | null
          id: string
          is_required: boolean
          location_type: string
          requirement_name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          area_sub_area?: string | null
          category: string
          created_at?: string
          default_department?: string | null
          default_frequency?: string | null
          default_owner?: string | null
          default_risk_level?: string
          document_contract_type?: string | null
          id?: string
          is_required?: boolean
          location_type: string
          requirement_name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          area_sub_area?: string | null
          category?: string
          created_at?: string
          default_department?: string | null
          default_frequency?: string | null
          default_owner?: string | null
          default_risk_level?: string
          document_contract_type?: string | null
          id?: string
          is_required?: boolean
          location_type?: string
          requirement_name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      compliance_service_history: {
        Row: {
          contract_item: string
          cost: number | null
          created_at: string
          domain: string | null
          id: string
          next_due_date: string | null
          remarks: string | null
          result: string
          service_date: string
          service_type: string
          technician: string | null
          updated_at: string
          vendor: string | null
          venue_scope: string
        }
        Insert: {
          contract_item: string
          cost?: number | null
          created_at?: string
          domain?: string | null
          id?: string
          next_due_date?: string | null
          remarks?: string | null
          result?: string
          service_date: string
          service_type?: string
          technician?: string | null
          updated_at?: string
          vendor?: string | null
          venue_scope?: string
        }
        Update: {
          contract_item?: string
          cost?: number | null
          created_at?: string
          domain?: string | null
          id?: string
          next_due_date?: string | null
          remarks?: string | null
          result?: string
          service_date?: string
          service_type?: string
          technician?: string | null
          updated_at?: string
          vendor?: string | null
          venue_scope?: string
        }
        Relationships: []
      }
      corporate_deal_codes: {
        Row: {
          category: string
          created_at: string
          id: string
          notes: string | null
          partner_id: string | null
          promocode: string
          updated_at: string
          venue: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          notes?: string | null
          partner_id?: string | null
          promocode: string
          updated_at?: string
          venue?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          notes?: string | null
          partner_id?: string | null
          promocode?: string
          updated_at?: string
          venue?: string
        }
        Relationships: [
          {
            foreignKeyName: "corporate_deal_codes_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "corporate_deal_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      corporate_deal_month_data: {
        Row: {
          booking_lines: number
          category: string
          company_name: string | null
          description: string
          event_id: string | null
          event_title: string | null
          id: string
          imported_at: string
          partner_id: string | null
          partner_name: string | null
          period_month: string
          promocode: string
          promocode_id: string | null
          tickets: number
          times_used: number
          total_discount: number
          venue: string
        }
        Insert: {
          booking_lines?: number
          category?: string
          company_name?: string | null
          description?: string
          event_id?: string | null
          event_title?: string | null
          id?: string
          imported_at?: string
          partner_id?: string | null
          partner_name?: string | null
          period_month: string
          promocode: string
          promocode_id?: string | null
          tickets?: number
          times_used?: number
          total_discount?: number
          venue?: string
        }
        Update: {
          booking_lines?: number
          category?: string
          company_name?: string | null
          description?: string
          event_id?: string | null
          event_title?: string | null
          id?: string
          imported_at?: string
          partner_id?: string | null
          partner_name?: string | null
          period_month?: string
          promocode?: string
          promocode_id?: string | null
          tickets?: number
          times_used?: number
          total_discount?: number
          venue?: string
        }
        Relationships: [
          {
            foreignKeyName: "corporate_deal_month_data_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "corporate_deal_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      corporate_deal_partners: {
        Row: {
          active: boolean
          category: string
          created_at: string
          id: string
          name: string
          redemption_mechanism: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          category: string
          created_at?: string
          id?: string
          name: string
          redemption_mechanism?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          id?: string
          name?: string
          redemption_mechanism?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      corporate_deal_trend_data: {
        Row: {
          booking_lines: number
          category: string
          company_name: string | null
          description: string
          event_id: string | null
          event_title: string | null
          id: string
          imported_at: string
          partner_id: string | null
          partner_name: string | null
          period_month: string
          promocode: string
          promocode_id: string | null
          tickets: number
          times_used: number
          total_discount: number
          venue: string
        }
        Insert: {
          booking_lines?: number
          category?: string
          company_name?: string | null
          description?: string
          event_id?: string | null
          event_title?: string | null
          id?: string
          imported_at?: string
          partner_id?: string | null
          partner_name?: string | null
          period_month: string
          promocode: string
          promocode_id?: string | null
          tickets?: number
          times_used?: number
          total_discount?: number
          venue?: string
        }
        Update: {
          booking_lines?: number
          category?: string
          company_name?: string | null
          description?: string
          event_id?: string | null
          event_title?: string | null
          id?: string
          imported_at?: string
          partner_id?: string | null
          partner_name?: string | null
          period_month?: string
          promocode?: string
          promocode_id?: string | null
          tickets?: number
          times_used?: number
          total_discount?: number
          venue?: string
        }
        Relationships: [
          {
            foreignKeyName: "corporate_deal_trend_data_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "corporate_deal_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      corporate_deal_weekly_log: {
        Row: {
          booking_lines: number
          category: string
          company_name: string | null
          description: string
          event_id: string | null
          event_title: string | null
          id: string
          imported_at: string
          iso_week: string
          partner_id: string | null
          partner_name: string | null
          promocode: string
          promocode_id: string | null
          tickets: number
          times_used: number
          total_discount: number
          venue: string
        }
        Insert: {
          booking_lines?: number
          category?: string
          company_name?: string | null
          description?: string
          event_id?: string | null
          event_title?: string | null
          id?: string
          imported_at?: string
          iso_week: string
          partner_id?: string | null
          partner_name?: string | null
          promocode: string
          promocode_id?: string | null
          tickets?: number
          times_used?: number
          total_discount?: number
          venue?: string
        }
        Update: {
          booking_lines?: number
          category?: string
          company_name?: string | null
          description?: string
          event_id?: string | null
          event_title?: string | null
          id?: string
          imported_at?: string
          iso_week?: string
          partner_id?: string | null
          partner_name?: string | null
          promocode?: string
          promocode_id?: string | null
          tickets?: number
          times_used?: number
          total_discount?: number
          venue?: string
        }
        Relationships: [
          {
            foreignKeyName: "corporate_deal_weekly_log_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "corporate_deal_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_ops_roster_uploads: {
        Row: {
          created_at: string
          file_name: string
          file_path: string | null
          file_type: string
          id: string
          location_id: string
          notes: string | null
          period_end: string | null
          period_start: string | null
          rows_imported: number
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path?: string | null
          file_type?: string
          id?: string
          location_id: string
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          rows_imported?: number
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string | null
          file_type?: string
          id?: string
          location_id?: string
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          rows_imported?: number
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_ops_roster_uploads_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_reports: {
        Row: {
          created_at: string
          footfall: number | null
          highlights: string | null
          id: string
          incidents: number | null
          issues_closed: number | null
          issues_raised: number | null
          location_id: string
          opening_readiness_pct: number | null
          report_date: string
          revenue: number | null
          staff_on_duty: number | null
          supervisor: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          footfall?: number | null
          highlights?: string | null
          id?: string
          incidents?: number | null
          issues_closed?: number | null
          issues_raised?: number | null
          location_id: string
          opening_readiness_pct?: number | null
          report_date?: string
          revenue?: number | null
          staff_on_duty?: number | null
          supervisor?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          footfall?: number | null
          highlights?: string | null
          id?: string
          incidents?: number | null
          issues_closed?: number | null
          issues_raised?: number | null
          location_id?: string
          opening_readiness_pct?: number | null
          report_date?: string
          revenue?: number | null
          staff_on_duty?: number | null
          supervisor?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_reports_location_id_fkey"
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
          category: Database["public"]["Enums"]["delivery_item_category"]
          created_at: string
          delivery_request_id: string
          id: string
          item_name: string
          quantity_dispatched: number | null
          quantity_received: number | null
          quantity_requested: number
          remarks: string | null
          unit: string | null
        }
        Insert: {
          category?: Database["public"]["Enums"]["delivery_item_category"]
          created_at?: string
          delivery_request_id: string
          id?: string
          item_name: string
          quantity_dispatched?: number | null
          quantity_received?: number | null
          quantity_requested?: number
          remarks?: string | null
          unit?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["delivery_item_category"]
          created_at?: string
          delivery_request_id?: string
          id?: string
          item_name?: string
          quantity_dispatched?: number | null
          quantity_received?: number | null
          quantity_requested?: number
          remarks?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_request_items_delivery_request_id_fkey"
            columns: ["delivery_request_id"]
            isOneToOne: false
            referencedRelation: "delivery_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_request_photos: {
        Row: {
          created_at: string
          created_by: string | null
          delivery_request_id: string
          file_path: string
          id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delivery_request_id: string
          file_path: string
          id?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delivery_request_id?: string
          file_path?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_request_photos_delivery_request_id_fkey"
            columns: ["delivery_request_id"]
            isOneToOne: false
            referencedRelation: "delivery_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_requests: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          department: string | null
          dispatch_notes: string | null
          dispatch_personnel_id: string | null
          dispatched_at: string | null
          id: string
          location_id: string
          priority: Database["public"]["Enums"]["maintenance_priority"]
          remarks: string | null
          request_date: string
          request_number: string
          requested_by: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          shortage_notes: string | null
          status: Database["public"]["Enums"]["delivery_request_status"]
          updated_at: string
          verification_remarks: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department?: string | null
          dispatch_notes?: string | null
          dispatch_personnel_id?: string | null
          dispatched_at?: string | null
          id?: string
          location_id: string
          priority?: Database["public"]["Enums"]["maintenance_priority"]
          remarks?: string | null
          request_date?: string
          request_number: string
          requested_by: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shortage_notes?: string | null
          status?: Database["public"]["Enums"]["delivery_request_status"]
          updated_at?: string
          verification_remarks?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department?: string | null
          dispatch_notes?: string | null
          dispatch_personnel_id?: string | null
          dispatched_at?: string | null
          id?: string
          location_id?: string
          priority?: Database["public"]["Enums"]["maintenance_priority"]
          remarks?: string | null
          request_date?: string
          request_number?: string
          requested_by?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shortage_notes?: string | null
          status?: Database["public"]["Enums"]["delivery_request_status"]
          updated_at?: string
          verification_remarks?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_requests_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_signatures: {
        Row: {
          delivery_request_id: string
          id: string
          signature_data: string
          signed_at: string
          signed_by: string | null
          signer_name: string
          signer_role: string
        }
        Insert: {
          delivery_request_id: string
          id?: string
          signature_data: string
          signed_at?: string
          signed_by?: string | null
          signer_name: string
          signer_role: string
        }
        Update: {
          delivery_request_id?: string
          id?: string
          signature_data?: string
          signed_at?: string
          signed_by?: string | null
          signer_name?: string
          signer_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_signatures_delivery_request_id_fkey"
            columns: ["delivery_request_id"]
            isOneToOne: false
            referencedRelation: "delivery_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      department_budget_increases: {
        Row: {
          acted_by: string | null
          amount: number
          budget_id: string | null
          created_at: string
          department_id: string
          id: string
          pr_id: string | null
          year: number
        }
        Insert: {
          acted_by?: string | null
          amount: number
          budget_id?: string | null
          created_at?: string
          department_id: string
          id?: string
          pr_id?: string | null
          year: number
        }
        Update: {
          acted_by?: string | null
          amount?: number
          budget_id?: string | null
          created_at?: string
          department_id?: string
          id?: string
          pr_id?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "department_budget_increases_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "department_budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_budget_increases_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "master_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_budget_increases_pr_id_fkey"
            columns: ["pr_id"]
            isOneToOne: false
            referencedRelation: "purchase_requisitions"
            referencedColumns: ["id"]
          },
        ]
      }
      department_budgets: {
        Row: {
          amount: number
          department_id: string
          id: string
          updated_at: string
          updated_by: string | null
          year: number
        }
        Insert: {
          amount?: number
          department_id: string
          id?: string
          updated_at?: string
          updated_by?: string | null
          year: number
        }
        Update: {
          amount?: number
          department_id?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "department_budgets_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "master_departments"
            referencedColumns: ["id"]
          },
        ]
      }
      document_attachments: {
        Row: {
          attachment_type: string
          document_id: string
          file_mime: string | null
          file_name: string
          file_path: string
          id: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          attachment_type?: string
          document_id: string
          file_mime?: string | null
          file_name: string
          file_path: string
          id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          attachment_type?: string
          document_id?: string
          file_mime?: string | null
          file_name?: string
          file_path?: string
          id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_attachments_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "compliance_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_attachments_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "compliance_documents_enriched"
            referencedColumns: ["id"]
          },
        ]
      }
      document_notifications: {
        Row: {
          created_at: string
          document_id: string
          id: string
          notification_date: string
          notification_type: string
          recipient_user_id: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          notification_date: string
          notification_type: string
          recipient_user_id?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          notification_date?: string
          notification_type?: string
          recipient_user_id?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_notifications_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "compliance_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_notifications_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "compliance_documents_enriched"
            referencedColumns: ["id"]
          },
        ]
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
      e3_compliance_items: {
        Row: {
          area: string
          category: string
          contract_end: string | null
          contract_start: string | null
          created_at: string
          drive_link: string | null
          expiry_date: string | null
          frequency: string
          id: string
          issue_date: string | null
          item: string
          last_service: string | null
          location: string
          next_service: string | null
          owner: string
          remarks: string | null
          updated_at: string
          vendor: string
        }
        Insert: {
          area: string
          category: string
          contract_end?: string | null
          contract_start?: string | null
          created_at?: string
          drive_link?: string | null
          expiry_date?: string | null
          frequency: string
          id: string
          issue_date?: string | null
          item: string
          last_service?: string | null
          location: string
          next_service?: string | null
          owner: string
          remarks?: string | null
          updated_at?: string
          vendor: string
        }
        Update: {
          area?: string
          category?: string
          contract_end?: string | null
          contract_start?: string | null
          created_at?: string
          drive_link?: string | null
          expiry_date?: string | null
          frequency?: string
          id?: string
          issue_date?: string | null
          item?: string
          last_service?: string | null
          location?: string
          next_service?: string | null
          owner?: string
          remarks?: string | null
          updated_at?: string
          vendor?: string
        }
        Relationships: []
      }
      employee_achievements: {
        Row: {
          achieved_on: string
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          location_id: string | null
          points: number
          staff_id: string
          title: string
          updated_at: string
        }
        Insert: {
          achieved_on?: string
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          location_id?: string | null
          points?: number
          staff_id: string
          title: string
          updated_at?: string
        }
        Update: {
          achieved_on?: string
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          location_id?: string | null
          points?: number
          staff_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_achievements_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_achievements_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_awards: {
        Row: {
          approved_by: string | null
          award_month: string
          award_type: string
          citation: string | null
          created_at: string
          id: string
          location_id: string | null
          nomination_id: string | null
          staff_id: string
          title: string
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          award_month: string
          award_type?: string
          citation?: string | null
          created_at?: string
          id?: string
          location_id?: string | null
          nomination_id?: string | null
          staff_id: string
          title?: string
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          award_month?: string
          award_type?: string
          citation?: string | null
          created_at?: string
          id?: string
          location_id?: string | null
          nomination_id?: string | null
          staff_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_awards_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_awards_nomination_id_fkey"
            columns: ["nomination_id"]
            isOneToOne: false
            referencedRelation: "employee_nominations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_awards_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_evaluations: {
        Row: {
          created_at: string
          created_by: string | null
          cycle_id: string
          employee_comments: string | null
          finalized_at: string | null
          id: string
          kpi_score: number | null
          kra_score: number | null
          location_id: string | null
          manager_comments: string | null
          rating_band: string | null
          staff_id: string
          status: string
          supervisor_comments: string | null
          total_score: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          cycle_id: string
          employee_comments?: string | null
          finalized_at?: string | null
          id?: string
          kpi_score?: number | null
          kra_score?: number | null
          location_id?: string | null
          manager_comments?: string | null
          rating_band?: string | null
          staff_id: string
          status?: string
          supervisor_comments?: string | null
          total_score?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          cycle_id?: string
          employee_comments?: string | null
          finalized_at?: string | null
          id?: string
          kpi_score?: number | null
          kra_score?: number | null
          location_id?: string | null
          manager_comments?: string | null
          rating_band?: string | null
          staff_id?: string
          status?: string
          supervisor_comments?: string | null
          total_score?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_evaluations_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "performance_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_evaluations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_evaluations_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_kpis: {
        Row: {
          assigned_by: string | null
          auto_query_key: string | null
          code: string
          created_at: string
          cycle_id: string
          data_source: string
          higher_is_better: boolean
          id: string
          kpi_assignment_id: string | null
          kpi_template_item_id: string | null
          label: string
          max_cap_pct: number
          staff_id: string
          status: string
          target_value: number | null
          unit: string | null
          updated_at: string
          weight_pct: number
        }
        Insert: {
          assigned_by?: string | null
          auto_query_key?: string | null
          code: string
          created_at?: string
          cycle_id: string
          data_source?: string
          higher_is_better?: boolean
          id?: string
          kpi_assignment_id?: string | null
          kpi_template_item_id?: string | null
          label: string
          max_cap_pct?: number
          staff_id: string
          status?: string
          target_value?: number | null
          unit?: string | null
          updated_at?: string
          weight_pct?: number
        }
        Update: {
          assigned_by?: string | null
          auto_query_key?: string | null
          code?: string
          created_at?: string
          cycle_id?: string
          data_source?: string
          higher_is_better?: boolean
          id?: string
          kpi_assignment_id?: string | null
          kpi_template_item_id?: string | null
          label?: string
          max_cap_pct?: number
          staff_id?: string
          status?: string
          target_value?: number | null
          unit?: string | null
          updated_at?: string
          weight_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "employee_kpis_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "performance_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_kpis_kpi_assignment_id_fkey"
            columns: ["kpi_assignment_id"]
            isOneToOne: false
            referencedRelation: "kpi_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_kpis_kpi_template_item_id_fkey"
            columns: ["kpi_template_item_id"]
            isOneToOne: false
            referencedRelation: "kpi_template_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_kpis_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_kras: {
        Row: {
          assigned_by: string | null
          created_at: string
          cycle_id: string
          description: string | null
          id: string
          kra_template_item_id: string | null
          staff_id: string
          status: string
          target_text: string | null
          title: string
          updated_at: string
          weight_pct: number
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          cycle_id: string
          description?: string | null
          id?: string
          kra_template_item_id?: string | null
          staff_id: string
          status?: string
          target_text?: string | null
          title: string
          updated_at?: string
          weight_pct?: number
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          cycle_id?: string
          description?: string | null
          id?: string
          kra_template_item_id?: string | null
          staff_id?: string
          status?: string
          target_text?: string | null
          title?: string
          updated_at?: string
          weight_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "employee_kras_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "performance_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_kras_kra_template_item_id_fkey"
            columns: ["kra_template_item_id"]
            isOneToOne: false
            referencedRelation: "kra_template_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_kras_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_nominations: {
        Row: {
          award_type: string
          created_at: string
          cycle_id: string | null
          id: string
          location_id: string | null
          nominated_by: string | null
          nomination_month: string
          rationale: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          staff_id: string
          status: string
          updated_at: string
        }
        Insert: {
          award_type?: string
          created_at?: string
          cycle_id?: string | null
          id?: string
          location_id?: string | null
          nominated_by?: string | null
          nomination_month: string
          rationale?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          award_type?: string
          created_at?: string
          cycle_id?: string | null
          id?: string
          location_id?: string | null
          nominated_by?: string | null
          nomination_month?: string
          rationale?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_nominations_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "performance_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_nominations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_nominations_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
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
      evaluation_reviews: {
        Row: {
          comments: string | null
          created_at: string
          evaluation_id: string
          from_status: string
          id: string
          reviewer_id: string | null
          to_status: string
        }
        Insert: {
          comments?: string | null
          created_at?: string
          evaluation_id: string
          from_status: string
          id?: string
          reviewer_id?: string | null
          to_status: string
        }
        Update: {
          comments?: string | null
          created_at?: string
          evaluation_id?: string
          from_status?: string
          id?: string
          reviewer_id?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_reviews_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "employee_evaluations"
            referencedColumns: ["id"]
          },
        ]
      }
      event_asset_movements: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          due_date: string | null
          event_id: string
          id: string
          item_name: string
          notes: string | null
          qty: number
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          due_date?: string | null
          event_id: string
          id?: string
          item_name: string
          notes?: string | null
          qty?: number
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          due_date?: string | null
          event_id?: string
          id?: string
          item_name?: string
          notes?: string | null
          qty?: number
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_asset_movements_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          event_id: string | null
          id: string
          location_id: string | null
          metadata: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          event_id?: string | null
          id?: string
          location_id?: string | null
          metadata?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          event_id?: string | null
          id?: string
          location_id?: string | null
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "event_audit_logs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_audit_logs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      event_baselines: {
        Row: {
          baseline_type: string
          created_at: string
          created_by: string | null
          event_id: string
          id: string
          snapshot: Json
        }
        Insert: {
          baseline_type: string
          created_at?: string
          created_by?: string | null
          event_id: string
          id?: string
          snapshot: Json
        }
        Update: {
          baseline_type?: string
          created_at?: string
          created_by?: string | null
          event_id?: string
          id?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "event_baselines_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_boq_lines: {
        Row: {
          amount: number
          cost_category: string | null
          created_at: string
          created_by: string | null
          department_id: string | null
          description: string
          document_id: string
          event_id: string
          id: string
          line_no: number
          qty: number
          rate: number | null
          unit: string | null
          workstream_code: string | null
        }
        Insert: {
          amount?: number
          cost_category?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description: string
          document_id: string
          event_id: string
          id?: string
          line_no?: number
          qty?: number
          rate?: number | null
          unit?: string | null
          workstream_code?: string | null
        }
        Update: {
          amount?: number
          cost_category?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string
          document_id?: string
          event_id?: string
          id?: string
          line_no?: number
          qty?: number
          rate?: number | null
          unit?: string | null
          workstream_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_boq_lines_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "master_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_boq_lines_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "event_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_boq_lines_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_budget_lines: {
        Row: {
          actual_amount: number
          approved_changes: number
          budget_id: string
          category_id: string
          committed_amount: number
          event_id: string
          forecast_amount: number
          id: string
          notes: string | null
          original_amount: number
          revised_amount: number
          sort_order: number
          subcategory_id: string | null
          title: string
        }
        Insert: {
          actual_amount?: number
          approved_changes?: number
          budget_id: string
          category_id: string
          committed_amount?: number
          event_id: string
          forecast_amount?: number
          id?: string
          notes?: string | null
          original_amount?: number
          revised_amount?: number
          sort_order?: number
          subcategory_id?: string | null
          title?: string
        }
        Update: {
          actual_amount?: number
          approved_changes?: number
          budget_id?: string
          category_id?: string
          committed_amount?: number
          event_id?: string
          forecast_amount?: number
          id?: string
          notes?: string | null
          original_amount?: number
          revised_amount?: number
          sort_order?: number
          subcategory_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_budget_lines_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "event_budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_budget_lines_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "evt_cost_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_budget_lines_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_budget_lines_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "evt_cost_subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
      event_budgets: {
        Row: {
          additional_revenue: number
          approved_at: string | null
          approved_by: string | null
          approved_change_orders: number
          contingency_usage_threshold_pct: number
          contract_value: number
          created_at: string
          created_by: string | null
          currency: string
          discounts: number
          event_id: string
          id: string
          line_alert_threshold_pct: number
          locked_at: string | null
          locked_by: string | null
          notes: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          taxes: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          additional_revenue?: number
          approved_at?: string | null
          approved_by?: string | null
          approved_change_orders?: number
          contingency_usage_threshold_pct?: number
          contract_value?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          discounts?: number
          event_id: string
          id?: string
          line_alert_threshold_pct?: number
          locked_at?: string | null
          locked_by?: string | null
          notes?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          taxes?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          additional_revenue?: number
          approved_at?: string | null
          approved_by?: string | null
          approved_change_orders?: number
          contingency_usage_threshold_pct?: number
          contract_value?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          discounts?: number
          event_id?: string
          id?: string
          line_alert_threshold_pct?: number
          locked_at?: string | null
          locked_by?: string | null
          notes?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          taxes?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_budgets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_client_invoices: {
        Row: {
          amount: number
          base_amount: number
          created_at: string
          created_by: string | null
          currency: string
          due_date: string | null
          event_id: string
          fx_rate: number
          id: string
          invoice_number: string
          issue_date: string | null
          notes: string | null
          paid_amount: number
          status: string
          title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount?: number
          base_amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          due_date?: string | null
          event_id: string
          fx_rate?: number
          id?: string
          invoice_number: string
          issue_date?: string | null
          notes?: string | null
          paid_amount?: number
          status?: string
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          base_amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          due_date?: string | null
          event_id?: string
          fx_rate?: number
          id?: string
          invoice_number?: string
          issue_date?: string | null
          notes?: string | null
          paid_amount?: number
          status?: string
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_client_invoices_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_decisions: {
        Row: {
          context: string | null
          created_at: string
          created_by: string | null
          decided_at: string
          decided_by_staff_id: string | null
          decision: string
          document_id: string | null
          event_id: string
          id: string
          meeting_id: string | null
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          context?: string | null
          created_at?: string
          created_by?: string | null
          decided_at?: string
          decided_by_staff_id?: string | null
          decision: string
          document_id?: string | null
          event_id: string
          id?: string
          meeting_id?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          context?: string | null
          created_at?: string
          created_by?: string | null
          decided_at?: string
          decided_by_staff_id?: string | null
          decision?: string
          document_id?: string | null
          event_id?: string
          id?: string
          meeting_id?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_decisions_decided_by_staff_id_fkey"
            columns: ["decided_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_decisions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "event_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_decisions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_decisions_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "event_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      event_deliverables: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          due_date: string | null
          event_id: string
          id: string
          owner_staff_id: string | null
          sort_order: number
          status: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          event_id: string
          id?: string
          owner_staff_id?: string | null
          sort_order?: number
          status?: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          event_id?: string
          id?: string
          owner_staff_id?: string | null
          sort_order?: number
          status?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_deliverables_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_deliverables_owner_staff_id_fkey"
            columns: ["owner_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      event_discussion_posts: {
        Row: {
          author_staff_id: string | null
          body: string
          created_at: string
          created_by: string | null
          discussion_id: string
          event_id: string
          id: string
          mentioned_staff_ids: string[]
          parent_post_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          author_staff_id?: string | null
          body: string
          created_at?: string
          created_by?: string | null
          discussion_id: string
          event_id: string
          id?: string
          mentioned_staff_ids?: string[]
          parent_post_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          author_staff_id?: string | null
          body?: string
          created_at?: string
          created_by?: string | null
          discussion_id?: string
          event_id?: string
          id?: string
          mentioned_staff_ids?: string[]
          parent_post_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_discussion_posts_author_staff_id_fkey"
            columns: ["author_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_discussion_posts_discussion_id_fkey"
            columns: ["discussion_id"]
            isOneToOne: false
            referencedRelation: "event_discussions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_discussion_posts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_discussion_posts_parent_post_id_fkey"
            columns: ["parent_post_id"]
            isOneToOne: false
            referencedRelation: "event_discussion_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      event_discussions: {
        Row: {
          created_at: string
          created_by: string | null
          document_id: string | null
          event_id: string
          id: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          event_id: string
          id?: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          event_id?: string
          id?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_discussions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "event_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_discussions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_documents: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          department_id: string | null
          doc_type: string
          event_id: string
          file_mime: string | null
          file_name: string | null
          file_path: string | null
          id: string
          is_addendum: boolean
          notes: string | null
          owner_staff_id: string | null
          required: boolean
          status: string
          title: string
          updated_at: string
          updated_by: string | null
          uploaded_at: string | null
          uploaded_by: string | null
          url: string | null
          wbs_id: string | null
          workstream_code: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department_id?: string | null
          doc_type?: string
          event_id: string
          file_mime?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          is_addendum?: boolean
          notes?: string | null
          owner_staff_id?: string | null
          required?: boolean
          status?: string
          title: string
          updated_at?: string
          updated_by?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
          url?: string | null
          wbs_id?: string | null
          workstream_code?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department_id?: string | null
          doc_type?: string
          event_id?: string
          file_mime?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          is_addendum?: boolean
          notes?: string | null
          owner_staff_id?: string | null
          required?: boolean
          status?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
          url?: string | null
          wbs_id?: string | null
          workstream_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_documents_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "master_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_documents_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_documents_owner_staff_id_fkey"
            columns: ["owner_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_documents_wbs_id_fkey"
            columns: ["wbs_id"]
            isOneToOne: false
            referencedRelation: "event_wbs_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      event_gate_completions: {
        Row: {
          event_id: string
          id: string
          is_satisfied: boolean
          notes: string | null
          requirement_id: string
          satisfied_at: string | null
        }
        Insert: {
          event_id: string
          id?: string
          is_satisfied?: boolean
          notes?: string | null
          requirement_id: string
          satisfied_at?: string | null
        }
        Update: {
          event_id?: string
          id?: string
          is_satisfied?: boolean
          notes?: string | null
          requirement_id?: string
          satisfied_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_gate_completions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_gate_completions_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "evt_stage_gate_requirements"
            referencedColumns: ["id"]
          },
        ]
      }
      event_issues: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          due_date: string | null
          event_id: string
          id: string
          is_safety: boolean
          is_snag: boolean
          owner_staff_id: string | null
          severity: string
          sla_due_date: string | null
          status: string
          task_id: string | null
          title: string
          updated_at: string
          updated_by: string | null
          wbs_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          event_id: string
          id?: string
          is_safety?: boolean
          is_snag?: boolean
          owner_staff_id?: string | null
          severity?: string
          sla_due_date?: string | null
          status?: string
          task_id?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
          wbs_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          event_id?: string
          id?: string
          is_safety?: boolean
          is_snag?: boolean
          owner_staff_id?: string | null
          severity?: string
          sla_due_date?: string | null
          status?: string
          task_id?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
          wbs_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_issues_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_issues_owner_staff_id_fkey"
            columns: ["owner_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_issues_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "event_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_issues_wbs_id_fkey"
            columns: ["wbs_id"]
            isOneToOne: false
            referencedRelation: "event_wbs_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      event_meeting_actions: {
        Row: {
          assignee_staff_id: string | null
          created_at: string
          created_by: string | null
          due_date: string | null
          event_id: string
          id: string
          meeting_id: string
          notes: string | null
          status: string
          task_id: string | null
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          assignee_staff_id?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          event_id: string
          id?: string
          meeting_id: string
          notes?: string | null
          status?: string
          task_id?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          assignee_staff_id?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          event_id?: string
          id?: string
          meeting_id?: string
          notes?: string | null
          status?: string
          task_id?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_meeting_actions_assignee_staff_id_fkey"
            columns: ["assignee_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_meeting_actions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_meeting_actions_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "event_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_meeting_actions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "event_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      event_meetings: {
        Row: {
          agenda: string | null
          attendee_staff_ids: string[]
          created_at: string
          created_by: string | null
          document_id: string | null
          event_id: string
          id: string
          minutes: string | null
          phase_code: string | null
          scheduled_at: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          agenda?: string | null
          attendee_staff_ids?: string[]
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          event_id: string
          id?: string
          minutes?: string | null
          phase_code?: string | null
          scheduled_at: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          agenda?: string | null
          attendee_staff_ids?: string[]
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          event_id?: string
          id?: string
          minutes?: string | null
          phase_code?: string | null
          scheduled_at?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_meetings_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "event_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_meetings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_milestones: {
        Row: {
          achieved_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string
          event_id: string
          id: string
          is_critical: boolean
          owner_staff_id: string | null
          status: string
          task_id: string | null
          title: string
          updated_at: string
          wbs_id: string | null
        }
        Insert: {
          achieved_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date: string
          event_id: string
          id?: string
          is_critical?: boolean
          owner_staff_id?: string | null
          status?: string
          task_id?: string | null
          title: string
          updated_at?: string
          wbs_id?: string | null
        }
        Update: {
          achieved_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string
          event_id?: string
          id?: string
          is_critical?: boolean
          owner_staff_id?: string | null
          status?: string
          task_id?: string | null
          title?: string
          updated_at?: string
          wbs_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_milestones_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_milestones_owner_staff_id_fkey"
            columns: ["owner_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_milestones_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "event_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_milestones_wbs_id_fkey"
            columns: ["wbs_id"]
            isOneToOne: false
            referencedRelation: "event_wbs_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      event_payables: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          due_date: string | null
          event_id: string
          id: string
          kind: string
          notes: string | null
          po_id: string | null
          reference: string | null
          status: string
          title: string
          updated_at: string
          updated_by: string | null
          vendor_name: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          due_date?: string | null
          event_id: string
          id?: string
          kind?: string
          notes?: string | null
          po_id?: string | null
          reference?: string | null
          status?: string
          title: string
          updated_at?: string
          updated_by?: string | null
          vendor_name?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          due_date?: string | null
          event_id?: string
          id?: string
          kind?: string
          notes?: string | null
          po_id?: string | null
          reference?: string | null
          status?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_payables_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_payables_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      event_readiness_items: {
        Row: {
          category: string
          code: string
          completed_at: string | null
          event_id: string
          id: string
          is_complete: boolean
          is_required: boolean
          phase_code: string | null
          title: string
          weight: number
        }
        Insert: {
          category?: string
          code: string
          completed_at?: string | null
          event_id: string
          id?: string
          is_complete?: boolean
          is_required?: boolean
          phase_code?: string | null
          title: string
          weight?: number
        }
        Update: {
          category?: string
          code?: string
          completed_at?: string | null
          event_id?: string
          id?: string
          is_complete?: boolean
          is_required?: boolean
          phase_code?: string | null
          title?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_readiness_items_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_resource_allocations: {
        Row: {
          allocated_hours: number | null
          allocation_pct: number | null
          created_at: string
          created_by: string | null
          end_date: string
          event_id: string
          id: string
          notes: string | null
          staff_id: string
          start_date: string
          task_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allocated_hours?: number | null
          allocation_pct?: number | null
          created_at?: string
          created_by?: string | null
          end_date: string
          event_id: string
          id?: string
          notes?: string | null
          staff_id: string
          start_date: string
          task_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allocated_hours?: number | null
          allocation_pct?: number | null
          created_at?: string
          created_by?: string | null
          end_date?: string
          event_id?: string
          id?: string
          notes?: string | null
          staff_id?: string
          start_date?: string
          task_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_resource_allocations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_resource_allocations_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_resource_allocations_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "event_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      event_risks: {
        Row: {
          created_at: string
          created_by: string | null
          due_date: string | null
          escalated_at: string | null
          escalated_by: string | null
          escalation_level: string
          event_id: string
          id: string
          impact: string | null
          likelihood: string | null
          mitigation: string | null
          owner_staff_id: string | null
          severity: string
          status: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          escalated_at?: string | null
          escalated_by?: string | null
          escalation_level?: string
          event_id: string
          id?: string
          impact?: string | null
          likelihood?: string | null
          mitigation?: string | null
          owner_staff_id?: string | null
          severity?: string
          status?: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          escalated_at?: string | null
          escalated_by?: string | null
          escalation_level?: string
          event_id?: string
          id?: string
          impact?: string | null
          likelihood?: string | null
          mitigation?: string | null
          owner_staff_id?: string | null
          severity?: string
          status?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_risks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_risks_owner_staff_id_fkey"
            columns: ["owner_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      event_saved_filters: {
        Row: {
          created_at: string
          event_id: string | null
          filters: Json
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id?: string | null
          filters?: Json
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string | null
          filters?: Json
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_saved_filters_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_scope_versions: {
        Row: {
          created_at: string
          created_by: string | null
          event_id: string
          id: string
          is_baseline: boolean
          sections: Json
          title: string
          version_no: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_id: string
          id?: string
          is_baseline?: boolean
          sections?: Json
          title?: string
          version_no?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_id?: string
          id?: string
          is_baseline?: boolean
          sections?: Json
          title?: string
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_scope_versions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_sprints: {
        Row: {
          created_at: string
          created_by: string | null
          end_date: string | null
          event_id: string
          goal: string | null
          id: string
          name: string
          sort_order: number
          start_date: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          event_id: string
          goal?: string | null
          id?: string
          name: string
          sort_order?: number
          start_date?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          event_id?: string
          goal?: string | null
          id?: string
          name?: string
          sort_order?: number
          start_date?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_sprints_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_staff_capacity: {
        Row: {
          notes: string | null
          staff_id: string
          updated_at: string
          updated_by: string | null
          weekly_hours: number
        }
        Insert: {
          notes?: string | null
          staff_id: string
          updated_at?: string
          updated_by?: string | null
          weekly_hours?: number
        }
        Update: {
          notes?: string | null
          staff_id?: string
          updated_at?: string
          updated_by?: string | null
          weekly_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_staff_capacity_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: true
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      event_task_assignees: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          staff_id: string
          task_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          staff_id: string
          task_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          staff_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_task_assignees_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_task_assignees_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "event_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      event_task_attachments: {
        Row: {
          content_type: string | null
          created_at: string
          event_id: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          task_id: string
          title: string
          uploaded_by: string | null
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          event_id: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          task_id: string
          title: string
          uploaded_by?: string | null
        }
        Update: {
          content_type?: string | null
          created_at?: string
          event_id?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          task_id?: string
          title?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_task_attachments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "event_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      event_task_dependencies: {
        Row: {
          dep_type: string
          event_id: string
          id: string
          lag_days: number
          predecessor_id: string
          successor_id: string
        }
        Insert: {
          dep_type?: string
          event_id: string
          id?: string
          lag_days?: number
          predecessor_id: string
          successor_id: string
        }
        Update: {
          dep_type?: string
          event_id?: string
          id?: string
          lag_days?: number
          predecessor_id?: string
          successor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_task_dependencies_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_task_dependencies_predecessor_id_fkey"
            columns: ["predecessor_id"]
            isOneToOne: false
            referencedRelation: "event_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_task_dependencies_successor_id_fkey"
            columns: ["successor_id"]
            isOneToOne: false
            referencedRelation: "event_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      event_task_history: {
        Row: {
          actor_id: string | null
          change_type: string
          created_at: string
          event_id: string
          field_name: string | null
          id: string
          metadata: Json
          new_value: string | null
          old_value: string | null
          task_id: string
        }
        Insert: {
          actor_id?: string | null
          change_type: string
          created_at?: string
          event_id: string
          field_name?: string | null
          id?: string
          metadata?: Json
          new_value?: string | null
          old_value?: string | null
          task_id: string
        }
        Update: {
          actor_id?: string | null
          change_type?: string
          created_at?: string
          event_id?: string
          field_name?: string | null
          id?: string
          metadata?: Json
          new_value?: string | null
          old_value?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_task_history_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_task_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "event_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      event_task_reminder_log: {
        Row: {
          created_at: string
          due_date: string
          event_id: string
          id: string
          reminder_kind: string
          sent_on: string
          task_id: string
        }
        Insert: {
          created_at?: string
          due_date: string
          event_id: string
          id?: string
          reminder_kind: string
          sent_on?: string
          task_id: string
        }
        Update: {
          created_at?: string
          due_date?: string
          event_id?: string
          id?: string
          reminder_kind?: string
          sent_on?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_task_reminder_log_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_task_reminder_log_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "event_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      event_task_supporters: {
        Row: {
          created_at: string
          id: string
          staff_id: string
          task_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          staff_id: string
          task_id: string
        }
        Update: {
          created_at?: string
          id?: string
          staff_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_task_supporters_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_task_supporters_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "event_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      event_task_watchers: {
        Row: {
          created_at: string
          created_by: string | null
          event_id: string
          id: string
          staff_id: string
          task_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_id: string
          id?: string
          staff_id: string
          task_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_id?: string
          id?: string
          staff_id?: string
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_task_watchers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_task_watchers_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_task_watchers_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "event_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      event_tasks: {
        Row: {
          actual_cost: number | null
          actual_hours: number | null
          approval_status: string
          assignee_staff_id: string | null
          checklist: Json
          comments: Json
          completed_at: string | null
          cost_impact: number | null
          created_at: string
          created_by: string | null
          delay_reason: string | null
          deleted_at: string | null
          department_id: string | null
          description: string | null
          documents: Json
          due_date: string | null
          duration_days: number | null
          escalation_level: string
          estimated_cost: number | null
          estimated_hours: number | null
          event_id: string
          evidence_url: string | null
          id: string
          is_critical: boolean
          is_milestone: boolean
          is_snag: boolean
          lifecycle_phase: string | null
          owner_staff_id: string | null
          parent_task_id: string | null
          percent_complete: number
          priority: string
          recurrence_count: number | null
          recurrence_freq: string | null
          recurrence_interval: number
          recurrence_source_id: string | null
          recurrence_until: string | null
          reminder_days_before: number
          sprint_id: string | null
          start_date: string | null
          status: string
          story_points: number | null
          task_number: string | null
          title: string
          updated_at: string
          updated_by: string | null
          wbs_id: string | null
        }
        Insert: {
          actual_cost?: number | null
          actual_hours?: number | null
          approval_status?: string
          assignee_staff_id?: string | null
          checklist?: Json
          comments?: Json
          completed_at?: string | null
          cost_impact?: number | null
          created_at?: string
          created_by?: string | null
          delay_reason?: string | null
          deleted_at?: string | null
          department_id?: string | null
          description?: string | null
          documents?: Json
          due_date?: string | null
          duration_days?: number | null
          escalation_level?: string
          estimated_cost?: number | null
          estimated_hours?: number | null
          event_id: string
          evidence_url?: string | null
          id?: string
          is_critical?: boolean
          is_milestone?: boolean
          is_snag?: boolean
          lifecycle_phase?: string | null
          owner_staff_id?: string | null
          parent_task_id?: string | null
          percent_complete?: number
          priority?: string
          recurrence_count?: number | null
          recurrence_freq?: string | null
          recurrence_interval?: number
          recurrence_source_id?: string | null
          recurrence_until?: string | null
          reminder_days_before?: number
          sprint_id?: string | null
          start_date?: string | null
          status?: string
          story_points?: number | null
          task_number?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
          wbs_id?: string | null
        }
        Update: {
          actual_cost?: number | null
          actual_hours?: number | null
          approval_status?: string
          assignee_staff_id?: string | null
          checklist?: Json
          comments?: Json
          completed_at?: string | null
          cost_impact?: number | null
          created_at?: string
          created_by?: string | null
          delay_reason?: string | null
          deleted_at?: string | null
          department_id?: string | null
          description?: string | null
          documents?: Json
          due_date?: string | null
          duration_days?: number | null
          escalation_level?: string
          estimated_cost?: number | null
          estimated_hours?: number | null
          event_id?: string
          evidence_url?: string | null
          id?: string
          is_critical?: boolean
          is_milestone?: boolean
          is_snag?: boolean
          lifecycle_phase?: string | null
          owner_staff_id?: string | null
          parent_task_id?: string | null
          percent_complete?: number
          priority?: string
          recurrence_count?: number | null
          recurrence_freq?: string | null
          recurrence_interval?: number
          recurrence_source_id?: string | null
          recurrence_until?: string | null
          reminder_days_before?: number
          sprint_id?: string | null
          start_date?: string | null
          status?: string
          story_points?: number | null
          task_number?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
          wbs_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_tasks_assignee_staff_id_fkey"
            columns: ["assignee_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_tasks_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "master_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_tasks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_tasks_owner_staff_id_fkey"
            columns: ["owner_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "event_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_tasks_recurrence_source_id_fkey"
            columns: ["recurrence_source_id"]
            isOneToOne: false
            referencedRelation: "event_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_tasks_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "event_sprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_tasks_wbs_id_fkey"
            columns: ["wbs_id"]
            isOneToOne: false
            referencedRelation: "event_wbs_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      event_team_members: {
        Row: {
          created_at: string
          created_by: string | null
          event_id: string
          id: string
          is_pm: boolean
          role_label: string
          staff_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_id: string
          id?: string
          is_pm?: boolean
          role_label?: string
          staff_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_id?: string
          id?: string
          is_pm?: boolean
          role_label?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_team_members_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_team_members_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      event_timesheet_entries: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          event_id: string
          hours: number
          id: string
          note: string | null
          staff_id: string
          status: string
          task_id: string | null
          updated_at: string
          updated_by: string | null
          work_date: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          event_id: string
          hours: number
          id?: string
          note?: string | null
          staff_id: string
          status?: string
          task_id?: string | null
          updated_at?: string
          updated_by?: string | null
          work_date: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          event_id?: string
          hours?: number
          id?: string
          note?: string | null
          staff_id?: string
          status?: string
          task_id?: string | null
          updated_at?: string
          updated_by?: string | null
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_timesheet_entries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_timesheet_entries_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_timesheet_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "event_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      event_wbs_nodes: {
        Row: {
          actual_cost: number
          budget_amount: number
          code: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          documents: Json
          due_date: string | null
          event_id: string
          id: string
          node_type: string
          owner_staff_id: string | null
          parent_id: string | null
          percent_complete: number
          sort_order: number
          start_date: string | null
          title: string
        }
        Insert: {
          actual_cost?: number
          budget_amount?: number
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          documents?: Json
          due_date?: string | null
          event_id: string
          id?: string
          node_type: string
          owner_staff_id?: string | null
          parent_id?: string | null
          percent_complete?: number
          sort_order?: number
          start_date?: string | null
          title: string
        }
        Update: {
          actual_cost?: number
          budget_amount?: number
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          documents?: Json
          due_date?: string | null
          event_id?: string
          id?: string
          node_type?: string
          owner_staff_id?: string | null
          parent_id?: string | null
          percent_complete?: number
          sort_order?: number
          start_date?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_wbs_nodes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_wbs_nodes_owner_staff_id_fkey"
            columns: ["owner_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_wbs_nodes_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "event_wbs_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      event_wiki_pages: {
        Row: {
          body_md: string
          created_at: string
          created_by: string | null
          event_id: string
          id: string
          slug: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body_md?: string
          created_at?: string
          created_by?: string | null
          event_id: string
          id?: string
          slug?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body_md?: string
          created_at?: string
          created_by?: string | null
          event_id?: string
          id?: string
          slug?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_wiki_pages_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          business_unit: string | null
          city: string | null
          classification_id: string | null
          client_contact: string | null
          client_inspection_date: string | null
          client_name: string | null
          contract_date: string | null
          contracted_value: number | null
          country: string | null
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          department_id: string | null
          description: string | null
          director_staff_id: string | null
          dismantle_date: string | null
          dismantle_end: string | null
          dismantle_start: string | null
          event_end: string | null
          event_name: string | null
          event_number: string | null
          event_start: string | null
          event_type_id: string | null
          final_closure_date: string | null
          financial_close_target: string | null
          go_live_approved: boolean
          go_live_approved_at: string | null
          go_live_approved_by: string | null
          handover_date: string | null
          health_override_at: string | null
          health_override_by: string | null
          health_override_justification: string | null
          health_override_rag: string | null
          health_rag: string
          health_score: number
          id: string
          inquiry_date: string | null
          lessons_learned: string | null
          location_id: string
          name: string
          notes: string | null
          planning_start: string | null
          pm_staff_id: string | null
          prior_stage_id: string | null
          priority: string
          readiness_pct: number
          rehearsal_date: string | null
          setup_end: string | null
          setup_start: string | null
          stage_id: string | null
          status: string
          updated_at: string
          updated_by: string | null
          venue_access: string | null
          venue_name: string | null
        }
        Insert: {
          business_unit?: string | null
          city?: string | null
          classification_id?: string | null
          client_contact?: string | null
          client_inspection_date?: string | null
          client_name?: string | null
          contract_date?: string | null
          contracted_value?: number | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          department_id?: string | null
          description?: string | null
          director_staff_id?: string | null
          dismantle_date?: string | null
          dismantle_end?: string | null
          dismantle_start?: string | null
          event_end?: string | null
          event_name?: string | null
          event_number?: string | null
          event_start?: string | null
          event_type_id?: string | null
          final_closure_date?: string | null
          financial_close_target?: string | null
          go_live_approved?: boolean
          go_live_approved_at?: string | null
          go_live_approved_by?: string | null
          handover_date?: string | null
          health_override_at?: string | null
          health_override_by?: string | null
          health_override_justification?: string | null
          health_override_rag?: string | null
          health_rag?: string
          health_score?: number
          id?: string
          inquiry_date?: string | null
          lessons_learned?: string | null
          location_id: string
          name: string
          notes?: string | null
          planning_start?: string | null
          pm_staff_id?: string | null
          prior_stage_id?: string | null
          priority?: string
          readiness_pct?: number
          rehearsal_date?: string | null
          setup_end?: string | null
          setup_start?: string | null
          stage_id?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          venue_access?: string | null
          venue_name?: string | null
        }
        Update: {
          business_unit?: string | null
          city?: string | null
          classification_id?: string | null
          client_contact?: string | null
          client_inspection_date?: string | null
          client_name?: string | null
          contract_date?: string | null
          contracted_value?: number | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          department_id?: string | null
          description?: string | null
          director_staff_id?: string | null
          dismantle_date?: string | null
          dismantle_end?: string | null
          dismantle_start?: string | null
          event_end?: string | null
          event_name?: string | null
          event_number?: string | null
          event_start?: string | null
          event_type_id?: string | null
          final_closure_date?: string | null
          financial_close_target?: string | null
          go_live_approved?: boolean
          go_live_approved_at?: string | null
          go_live_approved_by?: string | null
          handover_date?: string | null
          health_override_at?: string | null
          health_override_by?: string | null
          health_override_justification?: string | null
          health_override_rag?: string | null
          health_rag?: string
          health_score?: number
          id?: string
          inquiry_date?: string | null
          lessons_learned?: string | null
          location_id?: string
          name?: string
          notes?: string | null
          planning_start?: string | null
          pm_staff_id?: string | null
          prior_stage_id?: string | null
          priority?: string
          readiness_pct?: number
          rehearsal_date?: string | null
          setup_end?: string | null
          setup_start?: string | null
          stage_id?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          venue_access?: string | null
          venue_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_classification_id_fkey"
            columns: ["classification_id"]
            isOneToOne: false
            referencedRelation: "evt_classifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "master_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_director_staff_id_fkey"
            columns: ["director_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_event_type_id_fkey"
            columns: ["event_type_id"]
            isOneToOne: false
            referencedRelation: "evt_event_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_pm_staff_id_fkey"
            columns: ["pm_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_prior_stage_id_fkey"
            columns: ["prior_stage_id"]
            isOneToOne: false
            referencedRelation: "evt_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "evt_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      evt_classifications: {
        Row: {
          active: boolean
          code: string
          id: string
          label_ar: string
          label_en: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          code: string
          id?: string
          label_ar: string
          label_en: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          code?: string
          id?: string
          label_ar?: string
          label_en?: string
          sort_order?: number
        }
        Relationships: []
      }
      evt_cost_categories: {
        Row: {
          active: boolean
          code: string
          id: string
          label_ar: string
          label_en: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          code: string
          id?: string
          label_ar: string
          label_en: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          code?: string
          id?: string
          label_ar?: string
          label_en?: string
          sort_order?: number
        }
        Relationships: []
      }
      evt_cost_subcategories: {
        Row: {
          active: boolean
          category_id: string
          code: string
          id: string
          label_ar: string
          label_en: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          category_id: string
          code: string
          id?: string
          label_ar: string
          label_en: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          category_id?: string
          code?: string
          id?: string
          label_ar?: string
          label_en?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "evt_cost_subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "evt_cost_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      evt_event_types: {
        Row: {
          active: boolean
          code: string
          id: string
          label_ar: string
          label_en: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          code: string
          id?: string
          label_ar: string
          label_en: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          code?: string
          id?: string
          label_ar?: string
          label_en?: string
          sort_order?: number
        }
        Relationships: []
      }
      evt_plan_template_items: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_critical: boolean
          item_key: string | null
          item_kind: string
          lifecycle_phase: string | null
          metadata: Json
          parent_key: string | null
          priority: string
          readiness_category: string | null
          readiness_code: string | null
          readiness_weight: number
          sort_order: number
          template_id: string
          title: string
          workstream_code: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_critical?: boolean
          item_key?: string | null
          item_kind: string
          lifecycle_phase?: string | null
          metadata?: Json
          parent_key?: string | null
          priority?: string
          readiness_category?: string | null
          readiness_code?: string | null
          readiness_weight?: number
          sort_order?: number
          template_id: string
          title: string
          workstream_code?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_critical?: boolean
          item_key?: string | null
          item_kind?: string
          lifecycle_phase?: string | null
          metadata?: Json
          parent_key?: string | null
          priority?: string
          readiness_category?: string | null
          readiness_code?: string | null
          readiness_weight?: number
          sort_order?: number
          template_id?: string
          title?: string
          workstream_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evt_plan_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "evt_plan_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      evt_plan_templates: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          event_type_id: string | null
          id: string
          is_active: boolean
          location_id: string | null
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          event_type_id?: string | null
          id?: string
          is_active?: boolean
          location_id?: string | null
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          event_type_id?: string | null
          id?: string
          is_active?: boolean
          location_id?: string | null
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evt_plan_templates_event_type_id_fkey"
            columns: ["event_type_id"]
            isOneToOne: false
            referencedRelation: "evt_event_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evt_plan_templates_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      evt_settings: {
        Row: {
          id: number
          number_pad: number
          number_prefix: string
          tsk_pad: number
          tsk_prefix: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: number
          number_pad?: number
          number_prefix?: string
          tsk_pad?: number
          tsk_prefix?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: number
          number_pad?: number
          number_prefix?: string
          tsk_pad?: number
          tsk_prefix?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      evt_stage_gate_requirements: {
        Row: {
          active: boolean
          code: string
          id: string
          is_blocking: boolean
          label_ar: string
          label_en: string
          readiness_code: string | null
          requirement_kind: string
          sort_order: number
          stage_id: string
          threshold: number | null
        }
        Insert: {
          active?: boolean
          code: string
          id?: string
          is_blocking?: boolean
          label_ar: string
          label_en: string
          readiness_code?: string | null
          requirement_kind: string
          sort_order?: number
          stage_id: string
          threshold?: number | null
        }
        Update: {
          active?: boolean
          code?: string
          id?: string
          is_blocking?: boolean
          label_ar?: string
          label_en?: string
          readiness_code?: string | null
          requirement_kind?: string
          sort_order?: number
          stage_id?: string
          threshold?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "evt_stage_gate_requirements_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "evt_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      evt_stages: {
        Row: {
          active: boolean
          code: string
          id: string
          is_critical: boolean
          is_linear: boolean
          is_terminal: boolean
          label_ar: string
          label_en: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          code: string
          id?: string
          is_critical?: boolean
          is_linear?: boolean
          is_terminal?: boolean
          label_ar: string
          label_en: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          code?: string
          id?: string
          is_critical?: boolean
          is_linear?: boolean
          is_terminal?: boolean
          label_ar?: string
          label_en?: string
          sort_order?: number
        }
        Relationships: []
      }
      executive_report_actions: {
        Row: {
          action_text: string
          created_at: string
          created_by: string | null
          due_date: string | null
          executive_report_id: string
          id: string
          owner_role: string | null
          priority: Database["public"]["Enums"]["report_review_priority"]
          status: string
          updated_at: string
        }
        Insert: {
          action_text: string
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          executive_report_id: string
          id?: string
          owner_role?: string | null
          priority?: Database["public"]["Enums"]["report_review_priority"]
          status?: string
          updated_at?: string
        }
        Update: {
          action_text?: string
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          executive_report_id?: string
          id?: string
          owner_role?: string | null
          priority?: Database["public"]["Enums"]["report_review_priority"]
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "executive_report_actions_executive_report_id_fkey"
            columns: ["executive_report_id"]
            isOneToOne: false
            referencedRelation: "executive_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      executive_reports: {
        Row: {
          ai_generated: boolean
          content: Json
          created_at: string
          generated_by: string | null
          id: string
          narrative: string | null
          published_at: string | null
          reporting_week_end: string
          reporting_week_start: string
          status: Database["public"]["Enums"]["executive_report_status"]
          title: string
          updated_at: string
        }
        Insert: {
          ai_generated?: boolean
          content?: Json
          created_at?: string
          generated_by?: string | null
          id?: string
          narrative?: string | null
          published_at?: string | null
          reporting_week_end: string
          reporting_week_start: string
          status?: Database["public"]["Enums"]["executive_report_status"]
          title: string
          updated_at?: string
        }
        Update: {
          ai_generated?: boolean
          content?: Json
          created_at?: string
          generated_by?: string | null
          id?: string
          narrative?: string | null
          published_at?: string | null
          reporting_week_end?: string
          reporting_week_start?: string
          status?: Database["public"]["Enums"]["executive_report_status"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      facility_tasks: {
        Row: {
          assigned_to: string | null
          category: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          location_id: string
          notes: string | null
          priority: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          location_id: string
          notes?: string | null
          priority?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          location_id?: string
          notes?: string | null
          priority?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "facility_tasks_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
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
      hr_air_ticket_entitlements: {
        Row: {
          carry_forward: boolean
          created_at: string
          created_by: string | null
          cycle_end: string
          cycle_start: string
          destination: string | null
          eligibility_on: string
          expiry_on: string | null
          family_eligible: boolean
          id: string
          notes: string | null
          staff_id: string
          status: string
          updated_at: string
        }
        Insert: {
          carry_forward?: boolean
          created_at?: string
          created_by?: string | null
          cycle_end: string
          cycle_start: string
          destination?: string | null
          eligibility_on: string
          expiry_on?: string | null
          family_eligible?: boolean
          id?: string
          notes?: string | null
          staff_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          carry_forward?: boolean
          created_at?: string
          created_by?: string | null
          cycle_end?: string
          cycle_start?: string
          destination?: string | null
          eligibility_on?: string
          expiry_on?: string | null
          family_eligible?: boolean
          id?: string
          notes?: string | null
          staff_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_air_ticket_entitlements_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_air_ticket_issue_actions: {
        Row: {
          acted_at: string
          action: string
          actor_id: string | null
          created_at: string
          id: string
          issue_id: string
          note: string | null
        }
        Insert: {
          acted_at?: string
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          issue_id: string
          note?: string | null
        }
        Update: {
          acted_at?: string
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          issue_id?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_air_ticket_issue_actions_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "hr_air_ticket_issues"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_air_ticket_issues: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          booking_ref: string | null
          cash_allowance_qar: number
          created_at: string
          created_by: string | null
          entitlement_id: string
          id: string
          invoice_doc_id: string | null
          issued_on: string | null
          notes: string | null
          paid_at: string | null
          paid_by: string | null
          payroll_payment_status: string
          payroll_period_id: string | null
          price_qar: number
          status: string
          travel_date_from: string | null
          travel_date_to: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          booking_ref?: string | null
          cash_allowance_qar?: number
          created_at?: string
          created_by?: string | null
          entitlement_id: string
          id?: string
          invoice_doc_id?: string | null
          issued_on?: string | null
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payroll_payment_status?: string
          payroll_period_id?: string | null
          price_qar?: number
          status?: string
          travel_date_from?: string | null
          travel_date_to?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          booking_ref?: string | null
          cash_allowance_qar?: number
          created_at?: string
          created_by?: string | null
          entitlement_id?: string
          id?: string
          invoice_doc_id?: string | null
          issued_on?: string | null
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payroll_payment_status?: string
          payroll_period_id?: string | null
          price_qar?: number
          status?: string
          travel_date_from?: string | null
          travel_date_to?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_air_ticket_issues_entitlement_id_fkey"
            columns: ["entitlement_id"]
            isOneToOne: false
            referencedRelation: "hr_air_ticket_entitlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_air_ticket_issues_invoice_doc_id_fkey"
            columns: ["invoice_doc_id"]
            isOneToOne: false
            referencedRelation: "hr_employee_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_air_ticket_issues_payroll_period_id_fkey"
            columns: ["payroll_period_id"]
            isOneToOne: false
            referencedRelation: "hr_payroll_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_announcements: {
        Row: {
          active: boolean
          body: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          published_at: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          body: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          published_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          body?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          published_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      hr_application_stage_history: {
        Row: {
          acted_at: string
          acted_by: string | null
          application_id: string
          communication_channel: string | null
          from_stage: string | null
          id: string
          metadata: Json
          note: string | null
          to_stage: string
        }
        Insert: {
          acted_at?: string
          acted_by?: string | null
          application_id: string
          communication_channel?: string | null
          from_stage?: string | null
          id?: string
          metadata?: Json
          note?: string | null
          to_stage: string
        }
        Update: {
          acted_at?: string
          acted_by?: string | null
          application_id?: string
          communication_channel?: string | null
          from_stage?: string | null
          id?: string
          metadata?: Json
          note?: string | null
          to_stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_application_stage_history_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "hr_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_applications: {
        Row: {
          ai_score: number | null
          applied_at: string
          assigned_recruiter: string | null
          candidate_id: string
          created_at: string
          created_by: string | null
          hold_reason: string | null
          id: string
          match_explanation: Json
          match_score: number | null
          rejection_reason: string | null
          stage: string
          stage_changed_at: string
          updated_at: string
          vacancy_id: string
        }
        Insert: {
          ai_score?: number | null
          applied_at?: string
          assigned_recruiter?: string | null
          candidate_id: string
          created_at?: string
          created_by?: string | null
          hold_reason?: string | null
          id?: string
          match_explanation?: Json
          match_score?: number | null
          rejection_reason?: string | null
          stage?: string
          stage_changed_at?: string
          updated_at?: string
          vacancy_id: string
        }
        Update: {
          ai_score?: number | null
          applied_at?: string
          assigned_recruiter?: string | null
          candidate_id?: string
          created_at?: string
          created_by?: string | null
          hold_reason?: string | null
          id?: string
          match_explanation?: Json
          match_score?: number | null
          rejection_reason?: string | null
          stage?: string
          stage_changed_at?: string
          updated_at?: string
          vacancy_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_applications_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "hr_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_applications_vacancy_id_fkey"
            columns: ["vacancy_id"]
            isOneToOne: false
            referencedRelation: "hr_vacancies"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_approval_rules: {
        Row: {
          active: boolean
          approver_role: string
          created_at: string
          id: string
          kind: string
          required: boolean
          sort_order: number
          title: string
        }
        Insert: {
          active?: boolean
          approver_role?: string
          created_at?: string
          id?: string
          kind: string
          required?: boolean
          sort_order?: number
          title: string
        }
        Update: {
          active?: boolean
          approver_role?: string
          created_at?: string
          id?: string
          kind?: string
          required?: boolean
          sort_order?: number
          title?: string
        }
        Relationships: []
      }
      hr_candidates: {
        Row: {
          consent_at: string | null
          consent_note: string | null
          created_at: string
          created_by: string | null
          cv_file_name: string | null
          cv_path: string | null
          cv_text: string | null
          duplicate_of: string | null
          education: string | null
          email: string | null
          expected_salary_qar: number | null
          experience_years: number | null
          full_name: string
          id: string
          location: string | null
          nationality: string | null
          notes: string | null
          notice_period_days: number | null
          phone: string | null
          qid: string | null
          skills: string | null
          source: string
          updated_at: string
          visa_status: string | null
        }
        Insert: {
          consent_at?: string | null
          consent_note?: string | null
          created_at?: string
          created_by?: string | null
          cv_file_name?: string | null
          cv_path?: string | null
          cv_text?: string | null
          duplicate_of?: string | null
          education?: string | null
          email?: string | null
          expected_salary_qar?: number | null
          experience_years?: number | null
          full_name: string
          id?: string
          location?: string | null
          nationality?: string | null
          notes?: string | null
          notice_period_days?: number | null
          phone?: string | null
          qid?: string | null
          skills?: string | null
          source?: string
          updated_at?: string
          visa_status?: string | null
        }
        Update: {
          consent_at?: string | null
          consent_note?: string | null
          created_at?: string
          created_by?: string | null
          cv_file_name?: string | null
          cv_path?: string | null
          cv_text?: string | null
          duplicate_of?: string | null
          education?: string | null
          email?: string | null
          expected_salary_qar?: number | null
          experience_years?: number | null
          full_name?: string
          id?: string
          location?: string | null
          nationality?: string | null
          notes?: string | null
          notice_period_days?: number | null
          phone?: string | null
          qid?: string | null
          skills?: string | null
          source?: string
          updated_at?: string
          visa_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_candidates_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "hr_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_checklist_template_acks: {
        Row: {
          id: string
          required: boolean
          sort_order: number
          template_id: string
          title: string
        }
        Insert: {
          id?: string
          required?: boolean
          sort_order?: number
          template_id: string
          title: string
        }
        Update: {
          id?: string
          required?: boolean
          sort_order?: number
          template_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_checklist_template_acks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "hr_checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_checklist_template_items: {
        Row: {
          due_offset_days: number
          evidence_hint: string | null
          id: string
          needs_review: boolean
          owner_role: string
          required: boolean
          section: string
          sort_order: number
          template_id: string
          title: string
        }
        Insert: {
          due_offset_days?: number
          evidence_hint?: string | null
          id?: string
          needs_review?: boolean
          owner_role?: string
          required?: boolean
          section?: string
          sort_order?: number
          template_id: string
          title: string
        }
        Update: {
          due_offset_days?: number
          evidence_hint?: string | null
          id?: string
          needs_review?: boolean
          owner_role?: string
          required?: boolean
          section?: string
          sort_order?: number
          template_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_checklist_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "hr_checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_checklist_template_training: {
        Row: {
          due_offset_days: number
          id: string
          required: boolean
          sort_order: number
          template_id: string
          title: string
        }
        Insert: {
          due_offset_days?: number
          id?: string
          required?: boolean
          sort_order?: number
          template_id: string
          title: string
        }
        Update: {
          due_offset_days?: number
          id?: string
          required?: boolean
          sort_order?: number
          template_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_checklist_template_training_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "hr_checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_checklist_templates: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          kind: string
          sort_order: number
          title: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          kind: string
          sort_order?: number
          title: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          sort_order?: number
          title?: string
        }
        Relationships: []
      }
      hr_clearance_items: {
        Row: {
          completed: boolean
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          department: string | null
          id: string
          item_kind: string
          label: string
          notes: string | null
          resignation_id: string | null
          sort_order: number
          staff_id: string
          termination_id: string | null
          updated_at: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          id?: string
          item_kind?: string
          label: string
          notes?: string | null
          resignation_id?: string | null
          sort_order?: number
          staff_id: string
          termination_id?: string | null
          updated_at?: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          id?: string
          item_kind?: string
          label?: string
          notes?: string | null
          resignation_id?: string | null
          sort_order?: number
          staff_id?: string
          termination_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_clearance_items_resignation_id_fkey"
            columns: ["resignation_id"]
            isOneToOne: false
            referencedRelation: "hr_resignations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_clearance_items_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_clearance_items_termination_id_fkey"
            columns: ["termination_id"]
            isOneToOne: false
            referencedRelation: "hr_terminations"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_comp_off_balances: {
        Row: {
          created_at: string
          created_by: string | null
          days: number
          earned_on: string
          expires_on: string | null
          hours: number | null
          hr_exception: boolean
          id: string
          leave_request_id: string | null
          reason: string | null
          remaining_days: number | null
          staff_id: string
          updated_at: string
          used_days: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          days?: number
          earned_on: string
          expires_on?: string | null
          hours?: number | null
          hr_exception?: boolean
          id?: string
          leave_request_id?: string | null
          reason?: string | null
          remaining_days?: number | null
          staff_id: string
          updated_at?: string
          used_days?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          days?: number
          earned_on?: string
          expires_on?: string | null
          hours?: number | null
          hr_exception?: boolean
          id?: string
          leave_request_id?: string | null
          reason?: string | null
          remaining_days?: number | null
          staff_id?: string
          updated_at?: string
          used_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_comp_off_balances_leave_request_id_fkey"
            columns: ["leave_request_id"]
            isOneToOne: false
            referencedRelation: "hr_leave_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_comp_off_balances_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_companies: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      hr_document_expiry_reminders: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          channel: string
          created_at: string
          document_id: string
          id: string
          milestone_days: number
          sent_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          channel?: string
          created_at?: string
          document_id: string
          id?: string
          milestone_days: number
          sent_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          channel?: string
          created_at?: string
          document_id?: string
          id?: string
          milestone_days?: number
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_document_expiry_reminders_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "hr_employee_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_employee_documents: {
        Row: {
          created_at: string
          deleted_at: string | null
          doc_type: string
          document_number: string | null
          expiry_date: string | null
          file_mime: string | null
          file_name: string | null
          file_path: string | null
          graduation_year: number | null
          id: string
          institution: string | null
          issue_date: string | null
          mofa_status: string | null
          notes: string | null
          qualification: string | null
          staff_id: string
          status: string
          status_at: string | null
          status_by: string | null
          status_remarks: string | null
          supersedes_id: string | null
          title: string | null
          updated_at: string
          uploaded_by: string | null
          verification_remarks: string | null
          verification_status: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          doc_type?: string
          document_number?: string | null
          expiry_date?: string | null
          file_mime?: string | null
          file_name?: string | null
          file_path?: string | null
          graduation_year?: number | null
          id?: string
          institution?: string | null
          issue_date?: string | null
          mofa_status?: string | null
          notes?: string | null
          qualification?: string | null
          staff_id: string
          status?: string
          status_at?: string | null
          status_by?: string | null
          status_remarks?: string | null
          supersedes_id?: string | null
          title?: string | null
          updated_at?: string
          uploaded_by?: string | null
          verification_remarks?: string | null
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          doc_type?: string
          document_number?: string | null
          expiry_date?: string | null
          file_mime?: string | null
          file_name?: string | null
          file_path?: string | null
          graduation_year?: number | null
          id?: string
          institution?: string | null
          issue_date?: string | null
          mofa_status?: string | null
          notes?: string | null
          qualification?: string | null
          staff_id?: string
          status?: string
          status_at?: string | null
          status_by?: string | null
          status_remarks?: string | null
          supersedes_id?: string | null
          title?: string | null
          updated_at?: string
          uploaded_by?: string | null
          verification_remarks?: string | null
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_employee_documents_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_employee_documents_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "hr_employee_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_employee_events: {
        Row: {
          actor_id: string | null
          created_at: string
          document_id: string | null
          effective_on: string
          event_type: string
          id: string
          payload: Json
          source_id: string | null
          source_table: string | null
          staff_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          document_id?: string | null
          effective_on: string
          event_type: string
          id?: string
          payload?: Json
          source_id?: string | null
          source_table?: string | null
          staff_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          document_id?: string | null
          effective_on?: string
          event_type?: string
          id?: string
          payload?: Json
          source_id?: string | null
          source_table?: string | null
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_employee_events_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_field_settings: {
        Row: {
          company_id: string | null
          created_at: string
          default_geofence_radius_meters: number
          face_liveness_required: boolean
          id: string
          notify_corrections: boolean
          notify_geofence_exit: boolean
          notify_late: boolean
          notify_missed_punch: boolean
          require_face_on_checkin: boolean
          require_gps_on_checkin: boolean
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          default_geofence_radius_meters?: number
          face_liveness_required?: boolean
          id?: string
          notify_corrections?: boolean
          notify_geofence_exit?: boolean
          notify_late?: boolean
          notify_missed_punch?: boolean
          require_face_on_checkin?: boolean
          require_gps_on_checkin?: boolean
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          default_geofence_radius_meters?: number
          face_liveness_required?: boolean
          id?: string
          notify_corrections?: boolean
          notify_geofence_exit?: boolean
          notify_late?: boolean
          notify_missed_punch?: boolean
          require_face_on_checkin?: boolean
          require_gps_on_checkin?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_field_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "hr_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_helpdesk_articles: {
        Row: {
          body: string
          category: string
          created_at: string
          created_by: string | null
          id: string
          published: boolean
          title: string
          updated_at: string
          visibility: string
        }
        Insert: {
          body: string
          category: string
          created_at?: string
          created_by?: string | null
          id?: string
          published?: boolean
          title: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          published?: boolean
          title?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: []
      }
      hr_helpdesk_history: {
        Row: {
          actor_id: string | null
          actor_name: string
          created_at: string
          detail: Json
          event_id: string
          id: string
          kind: string
        }
        Insert: {
          actor_id?: string | null
          actor_name: string
          created_at?: string
          detail?: Json
          event_id: string
          id?: string
          kind: string
        }
        Update: {
          actor_id?: string | null
          actor_name?: string
          created_at?: string
          detail?: Json
          event_id?: string
          id?: string
          kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_helpdesk_history_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "hr_employee_events"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_helpdesk_messages: {
        Row: {
          attachment: Json | null
          author_id: string | null
          author_name: string
          author_staff_id: string | null
          body: string
          created_at: string
          event_id: string
          id: string
          visibility: string
        }
        Insert: {
          attachment?: Json | null
          author_id?: string | null
          author_name: string
          author_staff_id?: string | null
          body: string
          created_at?: string
          event_id: string
          id?: string
          visibility?: string
        }
        Update: {
          attachment?: Json | null
          author_id?: string | null
          author_name?: string
          author_staff_id?: string | null
          body?: string
          created_at?: string
          event_id?: string
          id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_helpdesk_messages_author_staff_id_fkey"
            columns: ["author_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_helpdesk_messages_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "hr_employee_events"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_helpdesk_rules: {
        Row: {
          active: boolean
          assignee_staff_id: string | null
          category: string
          condition: string
          created_at: string
          created_by: string | null
          id: string
          kind: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          assignee_staff_id?: string | null
          category: string
          condition: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          assignee_staff_id?: string | null
          category?: string
          condition?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_helpdesk_rules_assignee_staff_id_fkey"
            columns: ["assignee_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_helpdesk_settings: {
        Row: {
          assignment_notes: string | null
          categories: Json
          created_at: string
          default_assignee_staff_id: string | null
          description: string | null
          first_response_hours: number
          id: string
          name: string | null
          resolution_hours: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          assignment_notes?: string | null
          categories?: Json
          created_at?: string
          default_assignee_staff_id?: string | null
          description?: string | null
          first_response_hours?: number
          id?: string
          name?: string | null
          resolution_hours?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          assignment_notes?: string | null
          categories?: Json
          created_at?: string
          default_assignee_staff_id?: string | null
          description?: string | null
          first_response_hours?: number
          id?: string
          name?: string | null
          resolution_hours?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_helpdesk_settings_default_assignee_staff_id_fkey"
            columns: ["default_assignee_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_job_request_approvals: {
        Row: {
          acted_at: string | null
          acted_by: string | null
          comments: string | null
          created_at: string
          id: string
          job_request_id: string
          status: string
          step_order: number
          step_role: string
        }
        Insert: {
          acted_at?: string | null
          acted_by?: string | null
          comments?: string | null
          created_at?: string
          id?: string
          job_request_id: string
          status?: string
          step_order: number
          step_role: string
        }
        Update: {
          acted_at?: string | null
          acted_by?: string | null
          comments?: string | null
          created_at?: string
          id?: string
          job_request_id?: string
          status?: string
          step_order?: number
          step_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_job_request_approvals_job_request_id_fkey"
            columns: ["job_request_id"]
            isOneToOne: false
            referencedRelation: "hr_job_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_job_requests: {
        Row: {
          attachments: Json
          created_at: string
          current_step_role: string | null
          department_id: string | null
          education: string | null
          employment_category: string | null
          exceeds_quota: boolean
          experience_years: number | null
          id: string
          job_description: string | null
          job_title: string
          justification: string | null
          location_id: string | null
          priority: string
          quota_override_at: string | null
          quota_override_by: string | null
          quota_override_reason: string | null
          quota_override_status: string
          rejection_reason: string | null
          replaced_staff_id: string | null
          request_number: string | null
          request_type: string
          requested_by: string | null
          required_joining_date: string | null
          requires_finance: boolean
          return_reason: string | null
          salary_budget_qar: number | null
          skills: string | null
          status: string
          updated_at: string
          vacancies_count: number
        }
        Insert: {
          attachments?: Json
          created_at?: string
          current_step_role?: string | null
          department_id?: string | null
          education?: string | null
          employment_category?: string | null
          exceeds_quota?: boolean
          experience_years?: number | null
          id?: string
          job_description?: string | null
          job_title: string
          justification?: string | null
          location_id?: string | null
          priority?: string
          quota_override_at?: string | null
          quota_override_by?: string | null
          quota_override_reason?: string | null
          quota_override_status?: string
          rejection_reason?: string | null
          replaced_staff_id?: string | null
          request_number?: string | null
          request_type?: string
          requested_by?: string | null
          required_joining_date?: string | null
          requires_finance?: boolean
          return_reason?: string | null
          salary_budget_qar?: number | null
          skills?: string | null
          status?: string
          updated_at?: string
          vacancies_count?: number
        }
        Update: {
          attachments?: Json
          created_at?: string
          current_step_role?: string | null
          department_id?: string | null
          education?: string | null
          employment_category?: string | null
          exceeds_quota?: boolean
          experience_years?: number | null
          id?: string
          job_description?: string | null
          job_title?: string
          justification?: string | null
          location_id?: string | null
          priority?: string
          quota_override_at?: string | null
          quota_override_by?: string | null
          quota_override_reason?: string | null
          quota_override_status?: string
          rejection_reason?: string | null
          replaced_staff_id?: string | null
          request_number?: string | null
          request_type?: string
          requested_by?: string | null
          required_joining_date?: string | null
          requires_finance?: boolean
          return_reason?: string | null
          salary_budget_qar?: number | null
          skills?: string | null
          status?: string
          updated_at?: string
          vacancies_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_job_requests_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "master_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_job_requests_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_job_requests_replaced_staff_id_fkey"
            columns: ["replaced_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_journey_acknowledgments: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          checklist_id: string
          id: string
          required: boolean
          sort_order: number
          status: string
          title: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          checklist_id: string
          id?: string
          required?: boolean
          sort_order?: number
          status?: string
          title: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          checklist_id?: string
          id?: string
          required?: boolean
          sort_order?: number
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_journey_acknowledgments_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "hr_staff_checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_journey_events: {
        Row: {
          actor_name: string | null
          actor_user_id: string | null
          checklist_id: string
          created_at: string
          event_type: string
          id: string
          reason: string | null
        }
        Insert: {
          actor_name?: string | null
          actor_user_id?: string | null
          checklist_id: string
          created_at?: string
          event_type: string
          id?: string
          reason?: string | null
        }
        Update: {
          actor_name?: string | null
          actor_user_id?: string | null
          checklist_id?: string
          created_at?: string
          event_type?: string
          id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_journey_events_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "hr_staff_checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_journey_training: {
        Row: {
          assignment_id: string | null
          checklist_id: string
          course_id: string | null
          created_at: string
          due_on: string | null
          id: string
          reason: string | null
          required: boolean
          sort_order: number
          status: string
          title: string
        }
        Insert: {
          assignment_id?: string | null
          checklist_id: string
          course_id?: string | null
          created_at?: string
          due_on?: string | null
          id?: string
          reason?: string | null
          required?: boolean
          sort_order?: number
          status?: string
          title: string
        }
        Update: {
          assignment_id?: string | null
          checklist_id?: string
          course_id?: string | null
          created_at?: string
          due_on?: string | null
          id?: string
          reason?: string | null
          required?: boolean
          sort_order?: number
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_journey_training_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "hr_staff_checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_leave_approvals: {
        Row: {
          acted_at: string | null
          acted_by: string | null
          comments: string | null
          created_at: string
          id: string
          leave_id: string
          status: string
          step_order: number
          step_role: string
        }
        Insert: {
          acted_at?: string | null
          acted_by?: string | null
          comments?: string | null
          created_at?: string
          id?: string
          leave_id: string
          status?: string
          step_order: number
          step_role: string
        }
        Update: {
          acted_at?: string | null
          acted_by?: string | null
          comments?: string | null
          created_at?: string
          id?: string
          leave_id?: string
          status?: string
          step_order?: number
          step_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_leave_approvals_leave_id_fkey"
            columns: ["leave_id"]
            isOneToOne: false
            referencedRelation: "hr_leave_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_leave_balances: {
        Row: {
          allotted_days: number
          carried_forward: number
          created_at: string
          expired_days: number
          id: string
          leave_type: string
          notes: string | null
          pending_days: number
          period_year: number
          staff_id: string
          updated_at: string
        }
        Insert: {
          allotted_days?: number
          carried_forward?: number
          created_at?: string
          expired_days?: number
          id?: string
          leave_type?: string
          notes?: string | null
          pending_days?: number
          period_year: number
          staff_id: string
          updated_at?: string
        }
        Update: {
          allotted_days?: number
          carried_forward?: number
          created_at?: string
          expired_days?: number
          id?: string
          leave_type?: string
          notes?: string | null
          pending_days?: number
          period_year?: number
          staff_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_leave_balances_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_leave_requests: {
        Row: {
          attach_annual_after: number
          attach_annual_before: number
          comp_off_balance_id: string | null
          compassionate_scope: string | null
          created_at: string
          created_by: string | null
          current_step_role: string | null
          date_from: string
          date_to: string
          days: number
          emergency_treatment: string | null
          id: string
          leave_type: string
          maternity_delivery_date: string | null
          payroll_impact: boolean
          reason: string | null
          request_number: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          staff_id: string
          status: string
          updated_at: string
        }
        Insert: {
          attach_annual_after?: number
          attach_annual_before?: number
          comp_off_balance_id?: string | null
          compassionate_scope?: string | null
          created_at?: string
          created_by?: string | null
          current_step_role?: string | null
          date_from: string
          date_to: string
          days?: number
          emergency_treatment?: string | null
          id?: string
          leave_type?: string
          maternity_delivery_date?: string | null
          payroll_impact?: boolean
          reason?: string | null
          request_number?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          attach_annual_after?: number
          attach_annual_before?: number
          comp_off_balance_id?: string | null
          compassionate_scope?: string | null
          created_at?: string
          created_by?: string | null
          current_step_role?: string | null
          date_from?: string
          date_to?: string
          days?: number
          emergency_treatment?: string | null
          id?: string
          leave_type?: string
          maternity_delivery_date?: string | null
          payroll_impact?: boolean
          reason?: string | null
          request_number?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_leave_requests_comp_off_fk"
            columns: ["comp_off_balance_id"]
            isOneToOne: false
            referencedRelation: "hr_comp_off_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_requests_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_leave_types: {
        Row: {
          active: boolean
          code: string
          config: Json
          created_at: string
          default_days: number | null
          name_ar: string | null
          name_en: string
          paid: boolean
          requires_doc: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          config?: Json
          created_at?: string
          default_days?: number | null
          name_ar?: string | null
          name_en: string
          paid?: boolean
          requires_doc?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          config?: Json
          created_at?: string
          default_days?: number | null
          name_ar?: string | null
          name_en?: string
          paid?: boolean
          requires_doc?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      hr_offers: {
        Row: {
          application_id: string
          created_at: string
          created_by: string | null
          currency: string
          decline_reason: string | null
          id: string
          issued_at: string | null
          joining_date: string | null
          notes: string | null
          offer_letter_path: string | null
          responded_at: string | null
          salary_qar: number | null
          status: string
          updated_at: string
        }
        Insert: {
          application_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          decline_reason?: string | null
          id?: string
          issued_at?: string | null
          joining_date?: string | null
          notes?: string | null
          offer_letter_path?: string | null
          responded_at?: string | null
          salary_qar?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          application_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          decline_reason?: string | null
          id?: string
          issued_at?: string | null
          joining_date?: string | null
          notes?: string | null
          offer_letter_path?: string | null
          responded_at?: string | null
          salary_qar?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_offers_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "hr_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_ot_claim_approvals: {
        Row: {
          acted_at: string
          action: string
          actor_id: string | null
          claim_id: string
          created_at: string
          id: string
          note: string | null
          step: string
        }
        Insert: {
          acted_at?: string
          action: string
          actor_id?: string | null
          claim_id: string
          created_at?: string
          id?: string
          note?: string | null
          step: string
        }
        Update: {
          acted_at?: string
          action?: string
          actor_id?: string | null
          claim_id?: string
          created_at?: string
          id?: string
          note?: string | null
          step?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_ot_claim_approvals_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "hr_ot_claims"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_ot_claims: {
        Row: {
          actual_in: string | null
          actual_out: string | null
          amount_qar: number
          approved_at: string | null
          approved_by: string | null
          approved_minutes: number | null
          approved_signer_name: string | null
          approved_signer_signature_url: string | null
          attendance_daily_id: string | null
          basic_qar_snapshot: number | null
          claim_source: string
          claimed_minutes: number
          contract_working_days: number | null
          created_at: string
          created_by: string | null
          days_per_month_snapshot: number | null
          eligible_minutes: number
          evidence_path: string | null
          gm_approved_at: string | null
          gm_approved_by: string | null
          gm_approved_signer_name: string | null
          gm_approved_signer_signature_url: string | null
          hours_per_day_snapshot: number | null
          housing_qar_snapshot: number | null
          id: string
          location_id: string | null
          notes: string | null
          ops_approved_at: string | null
          ops_approved_by: string | null
          ops_approved_signer_name: string | null
          ops_approved_signer_signature_url: string | null
          payroll_period_id: string | null
          payroll_posted_at: string | null
          payroll_posted_by: string | null
          period_from: string | null
          period_to: string | null
          purpose: string | null
          rate_multiplier: number
          rate_type: string
          request_batch_id: string | null
          request_number: string | null
          scheduled_in: string | null
          scheduled_out: string | null
          staff_id: string
          status: string
          submitted_at: string | null
          submitted_by: string | null
          transport_qar_snapshot: number | null
          updated_at: string
          verified_at: string | null
          verified_by: string | null
          verified_signer_name: string | null
          verified_signer_signature_url: string | null
          work_date: string
        }
        Insert: {
          actual_in?: string | null
          actual_out?: string | null
          amount_qar?: number
          approved_at?: string | null
          approved_by?: string | null
          approved_minutes?: number | null
          approved_signer_name?: string | null
          approved_signer_signature_url?: string | null
          attendance_daily_id?: string | null
          basic_qar_snapshot?: number | null
          claim_source?: string
          claimed_minutes?: number
          contract_working_days?: number | null
          created_at?: string
          created_by?: string | null
          days_per_month_snapshot?: number | null
          eligible_minutes?: number
          evidence_path?: string | null
          gm_approved_at?: string | null
          gm_approved_by?: string | null
          gm_approved_signer_name?: string | null
          gm_approved_signer_signature_url?: string | null
          hours_per_day_snapshot?: number | null
          housing_qar_snapshot?: number | null
          id?: string
          location_id?: string | null
          notes?: string | null
          ops_approved_at?: string | null
          ops_approved_by?: string | null
          ops_approved_signer_name?: string | null
          ops_approved_signer_signature_url?: string | null
          payroll_period_id?: string | null
          payroll_posted_at?: string | null
          payroll_posted_by?: string | null
          period_from?: string | null
          period_to?: string | null
          purpose?: string | null
          rate_multiplier?: number
          rate_type?: string
          request_batch_id?: string | null
          request_number?: string | null
          scheduled_in?: string | null
          scheduled_out?: string | null
          staff_id: string
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          transport_qar_snapshot?: number | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          verified_signer_name?: string | null
          verified_signer_signature_url?: string | null
          work_date: string
        }
        Update: {
          actual_in?: string | null
          actual_out?: string | null
          amount_qar?: number
          approved_at?: string | null
          approved_by?: string | null
          approved_minutes?: number | null
          approved_signer_name?: string | null
          approved_signer_signature_url?: string | null
          attendance_daily_id?: string | null
          basic_qar_snapshot?: number | null
          claim_source?: string
          claimed_minutes?: number
          contract_working_days?: number | null
          created_at?: string
          created_by?: string | null
          days_per_month_snapshot?: number | null
          eligible_minutes?: number
          evidence_path?: string | null
          gm_approved_at?: string | null
          gm_approved_by?: string | null
          gm_approved_signer_name?: string | null
          gm_approved_signer_signature_url?: string | null
          hours_per_day_snapshot?: number | null
          housing_qar_snapshot?: number | null
          id?: string
          location_id?: string | null
          notes?: string | null
          ops_approved_at?: string | null
          ops_approved_by?: string | null
          ops_approved_signer_name?: string | null
          ops_approved_signer_signature_url?: string | null
          payroll_period_id?: string | null
          payroll_posted_at?: string | null
          payroll_posted_by?: string | null
          period_from?: string | null
          period_to?: string | null
          purpose?: string | null
          rate_multiplier?: number
          rate_type?: string
          request_batch_id?: string | null
          request_number?: string | null
          scheduled_in?: string | null
          scheduled_out?: string | null
          staff_id?: string
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          transport_qar_snapshot?: number | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          verified_signer_name?: string | null
          verified_signer_signature_url?: string | null
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_ot_claims_attendance_daily_id_fkey"
            columns: ["attendance_daily_id"]
            isOneToOne: false
            referencedRelation: "attendance_daily_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_ot_claims_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_ot_claims_payroll_period_id_fkey"
            columns: ["payroll_period_id"]
            isOneToOne: false
            referencedRelation: "hr_payroll_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_ot_claims_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_ot_policy: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          max_daily_ot_minutes: number | null
          max_weekly_ot_minutes: number | null
          overtime_after_minutes: number
          requires_preapproval: boolean
          summary_notes: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          max_daily_ot_minutes?: number | null
          max_weekly_ot_minutes?: number | null
          overtime_after_minutes?: number
          requires_preapproval?: boolean
          summary_notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          max_daily_ot_minutes?: number | null
          max_weekly_ot_minutes?: number | null
          overtime_after_minutes?: number
          requires_preapproval?: boolean
          summary_notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_ot_policy_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "hr_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_payroll_adjustments: {
        Row: {
          adj_type: string
          amount_qar: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          document_ref: string | null
          id: string
          line_id: string | null
          period_id: string
          reason: string | null
          staff_id: string
          status: string
          updated_at: string
        }
        Insert: {
          adj_type: string
          amount_qar: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          document_ref?: string | null
          id?: string
          line_id?: string | null
          period_id: string
          reason?: string | null
          staff_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          adj_type?: string
          amount_qar?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          document_ref?: string | null
          id?: string
          line_id?: string | null
          period_id?: string
          reason?: string | null
          staff_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_payroll_adjustments_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "hr_payroll_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_payroll_adjustments_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "hr_payroll_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_payroll_adjustments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_payroll_import_batches: {
        Row: {
          committed_at: string | null
          committed_by: string | null
          created_at: string
          created_by: string | null
          file_name: string | null
          id: string
          month: string
          period_id: string | null
          preview: Json
          reconciliation: Json
          sheet_summary: Json
          status: string
        }
        Insert: {
          committed_at?: string | null
          committed_by?: string | null
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          id?: string
          month: string
          period_id?: string | null
          preview?: Json
          reconciliation?: Json
          sheet_summary?: Json
          status?: string
        }
        Update: {
          committed_at?: string | null
          committed_by?: string | null
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          id?: string
          month?: string
          period_id?: string | null
          preview?: Json
          reconciliation?: Json
          sheet_summary?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_payroll_import_batches_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "hr_payroll_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_payroll_line_overrides: {
        Row: {
          field_code: string
          id: string
          line_id: string
          original_amount_qar: number
          overridden_at: string
          overridden_by: string | null
          override_amount_qar: number
          reason: string
        }
        Insert: {
          field_code: string
          id?: string
          line_id: string
          original_amount_qar: number
          overridden_at?: string
          overridden_by?: string | null
          override_amount_qar: number
          reason: string
        }
        Update: {
          field_code?: string
          id?: string
          line_id?: string
          original_amount_qar?: number
          overridden_at?: string
          overridden_by?: string | null
          override_amount_qar?: number
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_payroll_line_overrides_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "hr_payroll_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_payroll_lines: {
        Row: {
          created_at: string
          deductions: Json
          earnings: Json
          employment_category: string | null
          gross_qar: number
          id: string
          imported_amounts: Json | null
          imported_net_qar: number | null
          line_source: string
          net_qar: number
          notes: string | null
          override_meta: Json | null
          payment_method: string
          period_id: string
          position_snapshot: string | null
          proration_factor: number
          review_status: string
          snapshot: Json
          staff_id: string
          system_net_qar: number | null
          updated_at: string
          variance_import_qar: number | null
          variance_vs_prev: number | null
          working_days: number | null
          working_hours: number | null
          workplace_snapshot: string | null
          wps_eligible: boolean
        }
        Insert: {
          created_at?: string
          deductions?: Json
          earnings?: Json
          employment_category?: string | null
          gross_qar?: number
          id?: string
          imported_amounts?: Json | null
          imported_net_qar?: number | null
          line_source?: string
          net_qar?: number
          notes?: string | null
          override_meta?: Json | null
          payment_method: string
          period_id: string
          position_snapshot?: string | null
          proration_factor?: number
          review_status?: string
          snapshot?: Json
          staff_id: string
          system_net_qar?: number | null
          updated_at?: string
          variance_import_qar?: number | null
          variance_vs_prev?: number | null
          working_days?: number | null
          working_hours?: number | null
          workplace_snapshot?: string | null
          wps_eligible?: boolean
        }
        Update: {
          created_at?: string
          deductions?: Json
          earnings?: Json
          employment_category?: string | null
          gross_qar?: number
          id?: string
          imported_amounts?: Json | null
          imported_net_qar?: number | null
          line_source?: string
          net_qar?: number
          notes?: string | null
          override_meta?: Json | null
          payment_method?: string
          period_id?: string
          position_snapshot?: string | null
          proration_factor?: number
          review_status?: string
          snapshot?: Json
          staff_id?: string
          system_net_qar?: number | null
          updated_at?: string
          variance_import_qar?: number | null
          variance_vs_prev?: number | null
          working_days?: number | null
          working_hours?: number | null
          workplace_snapshot?: string | null
          wps_eligible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "hr_payroll_lines_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "hr_payroll_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_payroll_lines_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_payroll_locks: {
        Row: {
          created_at: string
          id: string
          locked_at: string
          locked_by: string | null
          period_id: string
          reopen_approved_by: string | null
          reopen_reason: string | null
          reopened_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          locked_at?: string
          locked_by?: string | null
          period_id: string
          reopen_approved_by?: string | null
          reopen_reason?: string | null
          reopened_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          locked_at?: string
          locked_by?: string | null
          period_id?: string
          reopen_approved_by?: string | null
          reopen_reason?: string | null
          reopened_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_payroll_locks_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "hr_payroll_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_payroll_periods: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          date_from: string
          date_to: string
          display_name: string | null
          id: string
          import_batch_id: string | null
          month: string
          notes: string | null
          reconciled_at: string | null
          reconciled_by: string | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          date_from: string
          date_to: string
          display_name?: string | null
          id?: string
          import_batch_id?: string | null
          month: string
          notes?: string | null
          reconciled_at?: string | null
          reconciled_by?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          date_from?: string
          date_to?: string
          display_name?: string | null
          id?: string
          import_batch_id?: string | null
          month?: string
          notes?: string | null
          reconciled_at?: string | null
          reconciled_by?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_payroll_periods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "hr_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_payroll_periods_import_batch_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "hr_payroll_import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_payslips: {
        Row: {
          created_at: string
          file_path: string | null
          generated_at: string
          generated_by: string | null
          id: string
          line_id: string
        }
        Insert: {
          created_at?: string
          file_path?: string | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          line_id: string
        }
        Update: {
          created_at?: string
          file_path?: string | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          line_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_payslips_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: true
            referencedRelation: "hr_payroll_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_policy_settings: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          key: string
          section: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          key: string
          section: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          key?: string
          section?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "hr_policy_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "hr_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_probation_reminders: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          channel: string
          created_at: string
          id: string
          milestone_days: number
          probation_end: string
          sent_at: string
          staff_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          channel?: string
          created_at?: string
          id?: string
          milestone_days: number
          probation_end: string
          sent_at?: string
          staff_id: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          channel?: string
          created_at?: string
          id?: string
          milestone_days?: number
          probation_end?: string
          sent_at?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_probation_reminders_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_probation_reviews: {
        Row: {
          approval_note: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          decided_at: string | null
          decided_by: string | null
          decision: string | null
          decision_note: string | null
          flags_phase6_termination: boolean
          id: string
          manager_feedback: string | null
          performance_evaluation_id: string | null
          performance_rating: string | null
          probation_end: string
          probation_start: string
          staff_id: string
          status: string
          supporting_comments: string | null
          updated_at: string
        }
        Insert: {
          approval_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision?: string | null
          decision_note?: string | null
          flags_phase6_termination?: boolean
          id?: string
          manager_feedback?: string | null
          performance_evaluation_id?: string | null
          performance_rating?: string | null
          probation_end: string
          probation_start: string
          staff_id: string
          status?: string
          supporting_comments?: string | null
          updated_at?: string
        }
        Update: {
          approval_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision?: string | null
          decision_note?: string | null
          flags_phase6_termination?: boolean
          id?: string
          manager_feedback?: string | null
          performance_evaluation_id?: string | null
          performance_rating?: string | null
          probation_end?: string
          probation_start?: string
          staff_id?: string
          status?: string
          supporting_comments?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_probation_reviews_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_resignations: {
        Row: {
          air_ticket_eligible: boolean
          approval_note: string | null
          approved_at: string | null
          approved_by: string | null
          approved_lwd: string | null
          asset_clearance: boolean
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          dept_clearance: boolean
          employment_category: string | null
          final_settlement_stub: Json
          finance_clearance: boolean
          handover_notes: string | null
          id: string
          length_of_service_days: number | null
          letter_document_id: string | null
          notice_override: boolean
          notice_override_approved_at: string | null
          notice_override_approved_by: string | null
          notice_override_reason: string | null
          notice_recovery: boolean
          notice_waiver: boolean
          proposed_lwd: string | null
          reason: string
          releasing_date: string | null
          required_notice_days: number
          staff_id: string
          status: string
          submitted_by: string | null
          submitted_on: string
          suggested_notice_days: number
          updated_at: string
        }
        Insert: {
          air_ticket_eligible?: boolean
          approval_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          approved_lwd?: string | null
          asset_clearance?: boolean
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          dept_clearance?: boolean
          employment_category?: string | null
          final_settlement_stub?: Json
          finance_clearance?: boolean
          handover_notes?: string | null
          id?: string
          length_of_service_days?: number | null
          letter_document_id?: string | null
          notice_override?: boolean
          notice_override_approved_at?: string | null
          notice_override_approved_by?: string | null
          notice_override_reason?: string | null
          notice_recovery?: boolean
          notice_waiver?: boolean
          proposed_lwd?: string | null
          reason?: string
          releasing_date?: string | null
          required_notice_days?: number
          staff_id: string
          status?: string
          submitted_by?: string | null
          submitted_on: string
          suggested_notice_days?: number
          updated_at?: string
        }
        Update: {
          air_ticket_eligible?: boolean
          approval_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          approved_lwd?: string | null
          asset_clearance?: boolean
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          dept_clearance?: boolean
          employment_category?: string | null
          final_settlement_stub?: Json
          finance_clearance?: boolean
          handover_notes?: string | null
          id?: string
          length_of_service_days?: number | null
          letter_document_id?: string | null
          notice_override?: boolean
          notice_override_approved_at?: string | null
          notice_override_approved_by?: string | null
          notice_override_reason?: string | null
          notice_recovery?: boolean
          notice_waiver?: boolean
          proposed_lwd?: string | null
          reason?: string
          releasing_date?: string | null
          required_notice_days?: number
          staff_id?: string
          status?: string
          submitted_by?: string | null
          submitted_on?: string
          suggested_notice_days?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_resignations_letter_document_id_fkey"
            columns: ["letter_document_id"]
            isOneToOne: false
            referencedRelation: "hr_employee_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_resignations_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_staff_checklist_items: {
        Row: {
          checklist_id: string
          completed_at: string | null
          completed_by: string | null
          due_on: string | null
          evidence_note: string | null
          id: string
          needs_review: boolean
          owner_role: string
          owner_staff_id: string | null
          required: boolean
          review_status: string
          reviewed_at: string | null
          reviewer_staff_id: string | null
          section: string
          sort_order: number
          status: string
          title: string
          updated_reason: string | null
        }
        Insert: {
          checklist_id: string
          completed_at?: string | null
          completed_by?: string | null
          due_on?: string | null
          evidence_note?: string | null
          id?: string
          needs_review?: boolean
          owner_role?: string
          owner_staff_id?: string | null
          required?: boolean
          review_status?: string
          reviewed_at?: string | null
          reviewer_staff_id?: string | null
          section?: string
          sort_order?: number
          status?: string
          title: string
          updated_reason?: string | null
        }
        Update: {
          checklist_id?: string
          completed_at?: string | null
          completed_by?: string | null
          due_on?: string | null
          evidence_note?: string | null
          id?: string
          needs_review?: boolean
          owner_role?: string
          owner_staff_id?: string | null
          required?: boolean
          review_status?: string
          reviewed_at?: string | null
          reviewer_staff_id?: string | null
          section?: string
          sort_order?: number
          status?: string
          title?: string
          updated_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_staff_checklist_items_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "hr_staff_checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_staff_checklist_items_owner_staff_id_fkey"
            columns: ["owner_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_staff_checklist_items_reviewer_staff_id_fkey"
            columns: ["reviewer_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_staff_checklists: {
        Row: {
          anchor_date: string | null
          cancelled_reason: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          department_name: string | null
          eligibility_checked_at: string | null
          exit_cause: string | null
          id: string
          kind: string
          manager_staff_id: string | null
          notice_days: number | null
          owner_staff_id: string | null
          payroll_reviewed_at: string | null
          payroll_reviewed_by: string | null
          reason_note: string | null
          reference_code: string | null
          role_title: string | null
          staff_id: string
          started_at: string
          status: string
          template_id: string | null
          template_title: string | null
          updated_at: string
        }
        Insert: {
          anchor_date?: string | null
          cancelled_reason?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          department_name?: string | null
          eligibility_checked_at?: string | null
          exit_cause?: string | null
          id?: string
          kind: string
          manager_staff_id?: string | null
          notice_days?: number | null
          owner_staff_id?: string | null
          payroll_reviewed_at?: string | null
          payroll_reviewed_by?: string | null
          reason_note?: string | null
          reference_code?: string | null
          role_title?: string | null
          staff_id: string
          started_at?: string
          status?: string
          template_id?: string | null
          template_title?: string | null
          updated_at?: string
        }
        Update: {
          anchor_date?: string | null
          cancelled_reason?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          department_name?: string | null
          eligibility_checked_at?: string | null
          exit_cause?: string | null
          id?: string
          kind?: string
          manager_staff_id?: string | null
          notice_days?: number | null
          owner_staff_id?: string | null
          payroll_reviewed_at?: string | null
          payroll_reviewed_by?: string | null
          reason_note?: string | null
          reference_code?: string | null
          role_title?: string | null
          staff_id?: string
          started_at?: string
          status?: string
          template_id?: string | null
          template_title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_staff_checklists_manager_staff_id_fkey"
            columns: ["manager_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_staff_checklists_owner_staff_id_fkey"
            columns: ["owner_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_staff_checklists_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_staff_checklists_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "hr_checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_suggestions: {
        Row: {
          admin_note: string | null
          body: string
          category: string | null
          closed_at: string | null
          closed_by: string | null
          created_at: string
          id: string
          seen_at: string | null
          seen_by: string | null
          staff_id: string
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          body: string
          category?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          seen_at?: string | null
          seen_by?: string | null
          staff_id: string
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          body?: string
          category?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          seen_at?: string | null
          seen_by?: string | null
          staff_id?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_suggestions_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_terminations: {
        Row: {
          air_ticket_eligible: boolean
          applied_at: string | null
          asset_clearance: boolean
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          dept_clearance: boolean
          effective_on: string
          employment_category: string | null
          exec_approval_note: string | null
          exec_approved_at: string | null
          exec_approved_by: string | null
          final_settlement_stub: Json
          finance_clearance: boolean
          hr_approval_note: string | null
          hr_approved_at: string | null
          hr_approved_by: string | null
          id: string
          initiated_by: string | null
          last_working_date: string
          leave_treatment: string | null
          loan_treatment: string | null
          notice_treatment: string
          reason: string
          releasing_date: string | null
          source_probation_review_id: string | null
          staff_id: string
          status: string
          supporting_document_id: string | null
          termination_type: string
          updated_at: string
        }
        Insert: {
          air_ticket_eligible?: boolean
          applied_at?: string | null
          asset_clearance?: boolean
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          dept_clearance?: boolean
          effective_on: string
          employment_category?: string | null
          exec_approval_note?: string | null
          exec_approved_at?: string | null
          exec_approved_by?: string | null
          final_settlement_stub?: Json
          finance_clearance?: boolean
          hr_approval_note?: string | null
          hr_approved_at?: string | null
          hr_approved_by?: string | null
          id?: string
          initiated_by?: string | null
          last_working_date: string
          leave_treatment?: string | null
          loan_treatment?: string | null
          notice_treatment?: string
          reason?: string
          releasing_date?: string | null
          source_probation_review_id?: string | null
          staff_id: string
          status?: string
          supporting_document_id?: string | null
          termination_type?: string
          updated_at?: string
        }
        Update: {
          air_ticket_eligible?: boolean
          applied_at?: string | null
          asset_clearance?: boolean
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          dept_clearance?: boolean
          effective_on?: string
          employment_category?: string | null
          exec_approval_note?: string | null
          exec_approved_at?: string | null
          exec_approved_by?: string | null
          final_settlement_stub?: Json
          finance_clearance?: boolean
          hr_approval_note?: string | null
          hr_approved_at?: string | null
          hr_approved_by?: string | null
          id?: string
          initiated_by?: string | null
          last_working_date?: string
          leave_treatment?: string | null
          loan_treatment?: string | null
          notice_treatment?: string
          reason?: string
          releasing_date?: string | null
          source_probation_review_id?: string | null
          staff_id?: string
          status?: string
          supporting_document_id?: string | null
          termination_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_terminations_source_probation_review_id_fkey"
            columns: ["source_probation_review_id"]
            isOneToOne: false
            referencedRelation: "hr_probation_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_terminations_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_terminations_supporting_document_id_fkey"
            columns: ["supporting_document_id"]
            isOneToOne: false
            referencedRelation: "hr_employee_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_vacancies: {
        Row: {
          close_reason: string | null
          closed_at: string | null
          created_at: string
          created_by: string | null
          department_id: string | null
          employment_category: string | null
          hold_reason: string | null
          id: string
          job_request_id: string | null
          job_title: string
          location_id: string | null
          match_weights: Json
          published_at: string | null
          recruiter_user_id: string | null
          required_location: string | null
          requires_qid: boolean
          requires_visa: boolean
          status: string
          updated_at: string
          vacancies_count: number
        }
        Insert: {
          close_reason?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          employment_category?: string | null
          hold_reason?: string | null
          id?: string
          job_request_id?: string | null
          job_title: string
          location_id?: string | null
          match_weights?: Json
          published_at?: string | null
          recruiter_user_id?: string | null
          required_location?: string | null
          requires_qid?: boolean
          requires_visa?: boolean
          status?: string
          updated_at?: string
          vacancies_count?: number
        }
        Update: {
          close_reason?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          employment_category?: string | null
          hold_reason?: string | null
          id?: string
          job_request_id?: string | null
          job_title?: string
          location_id?: string | null
          match_weights?: Json
          published_at?: string | null
          recruiter_user_id?: string | null
          required_location?: string | null
          requires_qid?: boolean
          requires_visa?: boolean
          status?: string
          updated_at?: string
          vacancies_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_vacancies_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "master_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_vacancies_job_request_id_fkey"
            columns: ["job_request_id"]
            isOneToOne: false
            referencedRelation: "hr_job_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_vacancies_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_warning_actions: {
        Row: {
          acted_at: string
          action: string
          actor_id: string | null
          created_at: string
          id: string
          note: string | null
          warning_id: string
        }
        Insert: {
          acted_at?: string
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          warning_id: string
        }
        Update: {
          acted_at?: string
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          warning_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_warning_actions_warning_id_fkey"
            columns: ["warning_id"]
            isOneToOne: false
            referencedRelation: "hr_warnings"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_warnings: {
        Row: {
          acknowledgement: Json
          active_count_at_issue: number
          appeal: Json
          blocks_casual_leave: boolean
          category: string
          created_at: string
          created_by: string | null
          description: string
          employee_explanation: string | null
          evidence: string | null
          id: string
          incident_on: string
          issued_on: string
          letter_document_id: string
          location: string | null
          management_decision: Json
          reported_by: string | null
          requires_formal_review: boolean
          staff_id: string
          status: string
          triggers_probation_review: boolean
          updated_at: string
          valid_until: string | null
          warning_level: string
          witnesses: string | null
        }
        Insert: {
          acknowledgement?: Json
          active_count_at_issue?: number
          appeal?: Json
          blocks_casual_leave?: boolean
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string
          employee_explanation?: string | null
          evidence?: string | null
          id?: string
          incident_on: string
          issued_on: string
          letter_document_id: string
          location?: string | null
          management_decision?: Json
          reported_by?: string | null
          requires_formal_review?: boolean
          staff_id: string
          status?: string
          triggers_probation_review?: boolean
          updated_at?: string
          valid_until?: string | null
          warning_level?: string
          witnesses?: string | null
        }
        Update: {
          acknowledgement?: Json
          active_count_at_issue?: number
          appeal?: Json
          blocks_casual_leave?: boolean
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string
          employee_explanation?: string | null
          evidence?: string | null
          id?: string
          incident_on?: string
          issued_on?: string
          letter_document_id?: string
          location?: string | null
          management_decision?: Json
          reported_by?: string | null
          requires_formal_review?: boolean
          staff_id?: string
          status?: string
          triggers_probation_review?: boolean
          updated_at?: string
          valid_until?: string | null
          warning_level?: string
          witnesses?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_warnings_letter_document_id_fkey"
            columns: ["letter_document_id"]
            isOneToOne: false
            referencedRelation: "hr_employee_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_warnings_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_workforce_quotas: {
        Row: {
          active: boolean
          approved_headcount: number
          created_at: string
          created_by: string | null
          department_id: string | null
          designation: string | null
          effective_on: string
          employment_category: string | null
          id: string
          location_id: string | null
          notes: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          approved_headcount: number
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          designation?: string | null
          effective_on?: string
          employment_category?: string | null
          id?: string
          location_id?: string | null
          notes?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          approved_headcount?: number
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          designation?: string | null
          effective_on?: string
          employment_category?: string | null
          id?: string
          location_id?: string | null
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_workforce_quotas_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "master_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_workforce_quotas_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      i18n_overrides: {
        Row: {
          key: string
          locale: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          key: string
          locale: string
          updated_at?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          key?: string
          locale?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: []
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
      inventory_items: {
        Row: {
          active: boolean
          category: string
          cost_per_unit: number | null
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          notes: string | null
          par_level: number | null
          reorder_level: number
          size: string | null
          sku: string
          unit: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string
          cost_per_unit?: number | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          notes?: string | null
          par_level?: number | null
          reorder_level?: number
          size?: string | null
          sku: string
          unit?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          cost_per_unit?: number | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          notes?: string | null
          par_level?: number | null
          reorder_level?: number
          size?: string | null
          sku?: string
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      inventory_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          item_id: string
          location_id: string
          movement_type: string
          notes: string | null
          quantity: number
          quantity_after: number
          quantity_before: number
          reference_id: string | null
          reference_type: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          item_id: string
          location_id: string
          movement_type: string
          notes?: string | null
          quantity: number
          quantity_after: number
          quantity_before: number
          reference_id?: string | null
          reference_type?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string
          location_id?: string
          movement_type?: string
          notes?: string | null
          quantity?: number
          quantity_after?: number
          quantity_before?: number
          reference_id?: string | null
          reference_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_stock: {
        Row: {
          id: string
          item_id: string
          last_counted_at: string | null
          location_id: string
          quantity_on_hand: number
          quantity_reserved: number
          updated_at: string
        }
        Insert: {
          id?: string
          item_id: string
          last_counted_at?: string | null
          location_id: string
          quantity_on_hand?: number
          quantity_reserved?: number
          updated_at?: string
        }
        Update: {
          id?: string
          item_id?: string
          last_counted_at?: string | null
          location_id?: string
          quantity_on_hand?: number
          quantity_reserved?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_stock_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stock_location_id_fkey"
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
      kpi_actuals: {
        Row: {
          actual_value: number | null
          created_at: string
          employee_kpi_id: string
          entered_by: string | null
          id: string
          normalized_score: number | null
          notes: string | null
          period_end: string
          period_start: string
          source: string
          updated_at: string
          weighted_score: number | null
        }
        Insert: {
          actual_value?: number | null
          created_at?: string
          employee_kpi_id: string
          entered_by?: string | null
          id?: string
          normalized_score?: number | null
          notes?: string | null
          period_end: string
          period_start: string
          source?: string
          updated_at?: string
          weighted_score?: number | null
        }
        Update: {
          actual_value?: number | null
          created_at?: string
          employee_kpi_id?: string
          entered_by?: string | null
          id?: string
          normalized_score?: number | null
          notes?: string | null
          period_end?: string
          period_start?: string
          source?: string
          updated_at?: string
          weighted_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kpi_actuals_employee_kpi_id_fkey"
            columns: ["employee_kpi_id"]
            isOneToOne: false
            referencedRelation: "employee_kpis"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_assignments: {
        Row: {
          active: boolean
          created_at: string
          department: string | null
          id: string
          location_id: string | null
          staff_id: string | null
          template_id: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          department?: string | null
          id?: string
          location_id?: string | null
          staff_id?: string | null
          template_id: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          department?: string | null
          id?: string
          location_id?: string | null
          staff_id?: string | null
          template_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kpi_assignments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_assignments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_assignments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "kpi_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_periods: {
        Row: {
          created_at: string
          id: string
          label: string
          period_end: string
          period_kind: string
          period_start: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          period_end: string
          period_kind?: string
          period_start: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          period_end?: string
          period_kind?: string
          period_start?: string
          status?: string
        }
        Relationships: []
      }
      kpi_score_details: {
        Row: {
          created_at: string
          entered_by: string | null
          id: string
          item_id: string
          normalized_score: number
          notes: string | null
          raw_value: number | null
          score_id: string
          source: string
          updated_at: string
          weighted_score: number
        }
        Insert: {
          created_at?: string
          entered_by?: string | null
          id?: string
          item_id: string
          normalized_score?: number
          notes?: string | null
          raw_value?: number | null
          score_id: string
          source?: string
          updated_at?: string
          weighted_score?: number
        }
        Update: {
          created_at?: string
          entered_by?: string | null
          id?: string
          item_id?: string
          normalized_score?: number
          notes?: string | null
          raw_value?: number | null
          score_id?: string
          source?: string
          updated_at?: string
          weighted_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "kpi_score_details_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "kpi_template_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_score_details_score_id_fkey"
            columns: ["score_id"]
            isOneToOne: false
            referencedRelation: "kpi_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_scores: {
        Row: {
          assignment_id: string
          calculated_at: string | null
          created_at: string
          id: string
          location_id: string | null
          period_id: string
          rating: string | null
          staff_id: string | null
          total_score: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          assignment_id: string
          calculated_at?: string | null
          created_at?: string
          id?: string
          location_id?: string | null
          period_id: string
          rating?: string | null
          staff_id?: string | null
          total_score?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          assignment_id?: string
          calculated_at?: string | null
          created_at?: string
          id?: string
          location_id?: string | null
          period_id?: string
          rating?: string | null
          staff_id?: string | null
          total_score?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kpi_scores_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "kpi_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_scores_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_scores_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "kpi_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_scores_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_template_items: {
        Row: {
          auto_query_key: string | null
          code: string
          created_at: string
          data_source: string
          description: string | null
          higher_is_better: boolean
          id: string
          label: string
          max_cap_pct: number
          sort_order: number
          target_value: number | null
          template_id: string
          unit: string | null
          weight: number
        }
        Insert: {
          auto_query_key?: string | null
          code: string
          created_at?: string
          data_source?: string
          description?: string | null
          higher_is_better?: boolean
          id?: string
          label: string
          max_cap_pct?: number
          sort_order?: number
          target_value?: number | null
          template_id: string
          unit?: string | null
          weight?: number
        }
        Update: {
          auto_query_key?: string | null
          code?: string
          created_at?: string
          data_source?: string
          description?: string | null
          higher_is_better?: boolean
          id?: string
          label?: string
          max_cap_pct?: number
          sort_order?: number
          target_value?: number | null
          template_id?: string
          unit?: string | null
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "kpi_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "kpi_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_templates: {
        Row: {
          active: boolean
          code: string
          created_at: string
          created_by: string | null
          department: string | null
          description: string | null
          id: string
          job_role_key: string | null
          name: string
          target_role: Database["public"]["Enums"]["app_role"] | null
          updated_at: string
          weight_total_pct: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          created_by?: string | null
          department?: string | null
          description?: string | null
          id?: string
          job_role_key?: string | null
          name: string
          target_role?: Database["public"]["Enums"]["app_role"] | null
          updated_at?: string
          weight_total_pct?: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          created_by?: string | null
          department?: string | null
          description?: string | null
          id?: string
          job_role_key?: string | null
          name?: string
          target_role?: Database["public"]["Enums"]["app_role"] | null
          updated_at?: string
          weight_total_pct?: number
        }
        Relationships: []
      }
      kra_scorecard_framework_items: {
        Row: {
          evidence_to_keep: string
          expected_standard: string
          how_to_rate: string
          id: string
          master_sheet_mapping: string
          points: number
          role_category: string
          sort_order: number
          title: string
        }
        Insert: {
          evidence_to_keep?: string
          expected_standard?: string
          how_to_rate?: string
          id?: string
          master_sheet_mapping?: string
          points?: number
          role_category: string
          sort_order: number
          title: string
        }
        Update: {
          evidence_to_keep?: string
          expected_standard?: string
          how_to_rate?: string
          id?: string
          master_sheet_mapping?: string
          points?: number
          role_category?: string
          sort_order?: number
          title?: string
        }
        Relationships: []
      }
      kra_scorecard_items: {
        Row: {
          created_at: string
          id: string
          item_no: number
          sop_reference: string
          target_standard: string
          template_id: string
          title: string
          updated_at: string
          weight_attendant: number
          weight_cashier: number
          weight_supervisor: number
        }
        Insert: {
          created_at?: string
          id?: string
          item_no: number
          sop_reference?: string
          target_standard?: string
          template_id: string
          title: string
          updated_at?: string
          weight_attendant?: number
          weight_cashier?: number
          weight_supervisor?: number
        }
        Update: {
          created_at?: string
          id?: string
          item_no?: number
          sop_reference?: string
          target_standard?: string
          template_id?: string
          title?: string
          updated_at?: string
          weight_attendant?: number
          weight_cashier?: number
          weight_supervisor?: number
        }
        Relationships: [
          {
            foreignKeyName: "kra_scorecard_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "kra_scorecard_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      kra_scorecard_lines: {
        Row: {
          actual_result: string
          created_at: string
          evidence: string
          id: string
          item_id: string
          line_status: string
          rating: number | null
          review_id: string
          updated_at: string
        }
        Insert: {
          actual_result?: string
          created_at?: string
          evidence?: string
          id?: string
          item_id: string
          line_status?: string
          rating?: number | null
          review_id: string
          updated_at?: string
        }
        Update: {
          actual_result?: string
          created_at?: string
          evidence?: string
          id?: string
          item_id?: string
          line_status?: string
          rating?: number | null
          review_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kra_scorecard_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "kra_scorecard_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kra_scorecard_lines_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "kra_scorecard_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      kra_scorecard_reviews: {
        Row: {
          agreed_action: string
          assigned_post: string
          cashier_share: number
          created_at: string
          created_by: string | null
          critical_evidence: string
          critical_status: string
          employee_ack_at: string | null
          employee_ack_note: string | null
          follow_up: string
          id: string
          review_period: string
          reviewer_approval_note: string
          reviewer_approved_at: string | null
          reviewer_name: string
          role_category: string
          staff_id: string
          template_id: string
          updated_at: string
        }
        Insert: {
          agreed_action?: string
          assigned_post?: string
          cashier_share?: number
          created_at?: string
          created_by?: string | null
          critical_evidence?: string
          critical_status?: string
          employee_ack_at?: string | null
          employee_ack_note?: string | null
          follow_up?: string
          id?: string
          review_period: string
          reviewer_approval_note?: string
          reviewer_approved_at?: string | null
          reviewer_name?: string
          role_category: string
          staff_id: string
          template_id: string
          updated_at?: string
        }
        Update: {
          agreed_action?: string
          assigned_post?: string
          cashier_share?: number
          created_at?: string
          created_by?: string | null
          critical_evidence?: string
          critical_status?: string
          employee_ack_at?: string | null
          employee_ack_note?: string | null
          follow_up?: string
          id?: string
          review_period?: string
          reviewer_approval_note?: string
          reviewer_approved_at?: string | null
          reviewer_name?: string
          role_category?: string
          staff_id?: string
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kra_scorecard_reviews_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kra_scorecard_reviews_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "kra_scorecard_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      kra_scorecard_templates: {
        Row: {
          active: boolean
          baseline_note: string
          brand: string
          code: string
          created_at: string
          id: string
          location_id: string | null
          place_name: string
          sheet_title: string
          sop_label: string
          sort_order: number
          updated_at: string
          usage_note: string
        }
        Insert: {
          active?: boolean
          baseline_note?: string
          brand: string
          code: string
          created_at?: string
          id?: string
          location_id?: string | null
          place_name: string
          sheet_title: string
          sop_label?: string
          sort_order: number
          updated_at?: string
          usage_note?: string
        }
        Update: {
          active?: boolean
          baseline_note?: string
          brand?: string
          code?: string
          created_at?: string
          id?: string
          location_id?: string | null
          place_name?: string
          sheet_title?: string
          sop_label?: string
          sort_order?: number
          updated_at?: string
          usage_note?: string
        }
        Relationships: [
          {
            foreignKeyName: "kra_scorecard_templates_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      kra_template_items: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          sort_order: number
          template_id: string
          title: string
          weight_pct: number
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          sort_order?: number
          template_id: string
          title: string
          weight_pct?: number
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          sort_order?: number
          template_id?: string
          title?: string
          weight_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "kra_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "kra_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      kra_templates: {
        Row: {
          active: boolean
          code: string
          created_at: string
          created_by: string | null
          department: string | null
          description: string | null
          id: string
          job_role_key: string | null
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          created_by?: string | null
          department?: string | null
          description?: string | null
          id?: string
          job_role_key?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          created_by?: string | null
          department?: string | null
          description?: string | null
          id?: string
          job_role_key?: string | null
          name?: string
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
      location_areas: {
        Row: {
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          location_id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          location_id: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          location_id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_areas_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      location_compliance_attachments: {
        Row: {
          attachment_type: string
          file_mime: string | null
          file_name: string
          file_path: string
          id: string
          item_id: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          attachment_type: string
          file_mime?: string | null
          file_name: string
          file_path: string
          id?: string
          item_id: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          attachment_type?: string
          file_mime?: string | null
          file_name?: string
          file_path?: string
          id?: string
          item_id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "location_compliance_attachments_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "location_compliance_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_compliance_attachments_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "location_compliance_items_enriched"
            referencedColumns: ["id"]
          },
        ]
      }
      location_compliance_items: {
        Row: {
          amc_contract_id: string | null
          area_sub_area: string | null
          attachment_status: string
          category: string
          cert_contract_number: string | null
          compliance_document_id: string | null
          created_at: string
          department: string | null
          document_contract_type: string | null
          expiry_date: string | null
          id: string
          is_required: boolean
          issue_date: string | null
          issuing_authority: string | null
          last_service_date: string | null
          location_id: string
          manual_status: string | null
          next_service_date: string | null
          outstanding_amount: number | null
          owner: string | null
          paid_amount: number
          payment_status: string
          quotation_amount: number
          remarks: string | null
          renewal_due_date: string | null
          requirement_id: string | null
          requirement_name: string
          risk_level: string
          service_frequency: string | null
          start_date: string | null
          updated_at: string
          updated_by: string | null
          vendor_contract_id: string | null
          vendor_id: string | null
          vendor_name: string | null
        }
        Insert: {
          amc_contract_id?: string | null
          area_sub_area?: string | null
          attachment_status?: string
          category: string
          cert_contract_number?: string | null
          compliance_document_id?: string | null
          created_at?: string
          department?: string | null
          document_contract_type?: string | null
          expiry_date?: string | null
          id?: string
          is_required?: boolean
          issue_date?: string | null
          issuing_authority?: string | null
          last_service_date?: string | null
          location_id: string
          manual_status?: string | null
          next_service_date?: string | null
          outstanding_amount?: number | null
          owner?: string | null
          paid_amount?: number
          payment_status?: string
          quotation_amount?: number
          remarks?: string | null
          renewal_due_date?: string | null
          requirement_id?: string | null
          requirement_name: string
          risk_level?: string
          service_frequency?: string | null
          start_date?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_contract_id?: string | null
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Update: {
          amc_contract_id?: string | null
          area_sub_area?: string | null
          attachment_status?: string
          category?: string
          cert_contract_number?: string | null
          compliance_document_id?: string | null
          created_at?: string
          department?: string | null
          document_contract_type?: string | null
          expiry_date?: string | null
          id?: string
          is_required?: boolean
          issue_date?: string | null
          issuing_authority?: string | null
          last_service_date?: string | null
          location_id?: string
          manual_status?: string | null
          next_service_date?: string | null
          outstanding_amount?: number | null
          owner?: string | null
          paid_amount?: number
          payment_status?: string
          quotation_amount?: number
          remarks?: string | null
          renewal_due_date?: string | null
          requirement_id?: string | null
          requirement_name?: string
          risk_level?: string
          service_frequency?: string | null
          start_date?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_contract_id?: string | null
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "location_compliance_items_amc_contract_id_fkey"
            columns: ["amc_contract_id"]
            isOneToOne: false
            referencedRelation: "amc_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_compliance_items_compliance_document_id_fkey"
            columns: ["compliance_document_id"]
            isOneToOne: false
            referencedRelation: "compliance_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_compliance_items_compliance_document_id_fkey"
            columns: ["compliance_document_id"]
            isOneToOne: false
            referencedRelation: "compliance_documents_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_compliance_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_compliance_items_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "compliance_requirements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_compliance_items_vendor_contract_id_fkey"
            columns: ["vendor_contract_id"]
            isOneToOne: false
            referencedRelation: "vendor_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_compliance_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
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
          floor: string | null
          gla_sqm: number | null
          id: string
          kind: string
          launched_on: string | null
          mall: string | null
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
          floor?: string | null
          gla_sqm?: number | null
          id?: string
          kind?: string
          launched_on?: string | null
          mall?: string | null
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
          floor?: string | null
          gla_sqm?: number | null
          id?: string
          kind?: string
          launched_on?: string | null
          mall?: string | null
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
      maintenance_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      maintenance_email_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          recipient_email: string | null
          sent_at: string | null
          source_id: string | null
          source_type: string
          status: string
          subject: string
          template_key: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          recipient_email?: string | null
          sent_at?: string | null
          source_id?: string | null
          source_type: string
          status?: string
          subject: string
          template_key: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          recipient_email?: string | null
          sent_at?: string | null
          source_id?: string | null
          source_type?: string
          status?: string
          subject?: string
          template_key?: string
        }
        Relationships: []
      }
      maintenance_executive_reports: {
        Row: {
          ai_generated: boolean
          content: Json
          created_at: string
          generated_by: string | null
          id: string
          narrative: string | null
          published_at: string | null
          reporting_week_end: string
          reporting_week_start: string
          status: Database["public"]["Enums"]["executive_report_status"]
          title: string
          updated_at: string
        }
        Insert: {
          ai_generated?: boolean
          content?: Json
          created_at?: string
          generated_by?: string | null
          id?: string
          narrative?: string | null
          published_at?: string | null
          reporting_week_end: string
          reporting_week_start: string
          status?: Database["public"]["Enums"]["executive_report_status"]
          title: string
          updated_at?: string
        }
        Update: {
          ai_generated?: boolean
          content?: Json
          created_at?: string
          generated_by?: string | null
          id?: string
          narrative?: string | null
          published_at?: string | null
          reporting_week_end?: string
          reporting_week_start?: string
          status?: Database["public"]["Enums"]["executive_report_status"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      maintenance_issue_types: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      maintenance_report_kpi_snapshots: {
        Row: {
          charts: Json
          id: string
          kpis: Json
          maintenance_executive_report_id: string
          snapshot_at: string
        }
        Insert: {
          charts?: Json
          id?: string
          kpis?: Json
          maintenance_executive_report_id: string
          snapshot_at?: string
        }
        Update: {
          charts?: Json
          id?: string
          kpis?: Json
          maintenance_executive_report_id?: string
          snapshot_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_report_kpi_snapsh_maintenance_executive_report_fkey"
            columns: ["maintenance_executive_report_id"]
            isOneToOne: false
            referencedRelation: "maintenance_executive_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_report_review_comments: {
        Row: {
          comment_text: string
          created_at: string
          created_by: string | null
          id: string
          is_internal: boolean
          maintenance_weekly_report_id: string
          priority: Database["public"]["Enums"]["report_review_priority"] | null
        }
        Insert: {
          comment_text: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_internal?: boolean
          maintenance_weekly_report_id: string
          priority?:
            | Database["public"]["Enums"]["report_review_priority"]
            | null
        }
        Update: {
          comment_text?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_internal?: boolean
          maintenance_weekly_report_id?: string
          priority?:
            | Database["public"]["Enums"]["report_review_priority"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_report_review_com_maintenance_weekly_report_id_fkey"
            columns: ["maintenance_weekly_report_id"]
            isOneToOne: false
            referencedRelation: "maintenance_weekly_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_request_attachments: {
        Row: {
          created_at: string
          created_by: string | null
          file_name: string | null
          file_path: string
          id: string
          kind: string
          mime_type: string | null
          request_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          file_path: string
          id?: string
          kind?: string
          mime_type?: string | null
          request_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          file_path?: string
          id?: string
          kind?: string
          mime_type?: string | null
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_request_attachments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "maintenance_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_requests: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          area: string | null
          assigned_technician_id: string | null
          category: string
          completed_at: string | null
          completed_by: string | null
          completed_by_name: string | null
          completion_signature_path: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string
          event_id: string | null
          id: string
          issue_type: string | null
          location_id: string
          priority: Database["public"]["Enums"]["maintenance_priority"]
          progress_notes: string | null
          remarks: string | null
          reported_at: string
          reporter_name: string | null
          request_number: string
          status: Database["public"]["Enums"]["maintenance_request_status"]
          updated_at: string
          work_order_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          area?: string | null
          assigned_technician_id?: string | null
          category?: string
          completed_at?: string | null
          completed_by?: string | null
          completed_by_name?: string | null
          completion_signature_path?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description: string
          event_id?: string | null
          id?: string
          issue_type?: string | null
          location_id: string
          priority?: Database["public"]["Enums"]["maintenance_priority"]
          progress_notes?: string | null
          remarks?: string | null
          reported_at?: string
          reporter_name?: string | null
          request_number: string
          status?: Database["public"]["Enums"]["maintenance_request_status"]
          updated_at?: string
          work_order_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          area?: string | null
          assigned_technician_id?: string | null
          category?: string
          completed_at?: string | null
          completed_by?: string | null
          completed_by_name?: string | null
          completion_signature_path?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          event_id?: string | null
          id?: string
          issue_type?: string | null
          location_id?: string
          priority?: Database["public"]["Enums"]["maintenance_priority"]
          progress_notes?: string | null
          remarks?: string | null
          reported_at?: string
          reporter_name?: string | null
          request_number?: string
          status?: Database["public"]["Enums"]["maintenance_request_status"]
          updated_at?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_requests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_weekly_report_attachments: {
        Row: {
          content_base64: string | null
          created_at: string
          file_name: string
          file_size: number | null
          id: string
          maintenance_weekly_report_id: string
          mime_type: string
          storage_path: string | null
          uploaded_by: string | null
        }
        Insert: {
          content_base64?: string | null
          created_at?: string
          file_name: string
          file_size?: number | null
          id?: string
          maintenance_weekly_report_id: string
          mime_type: string
          storage_path?: string | null
          uploaded_by?: string | null
        }
        Update: {
          content_base64?: string | null
          created_at?: string
          file_name?: string
          file_size?: number | null
          id?: string
          maintenance_weekly_report_id?: string
          mime_type?: string
          storage_path?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_weekly_report_att_maintenance_weekly_report_id_fkey"
            columns: ["maintenance_weekly_report_id"]
            isOneToOne: false
            referencedRelation: "maintenance_weekly_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_weekly_reports: {
        Row: {
          created_at: string
          created_by: string | null
          critical_issues: string | null
          executive_report_id: string | null
          id: string
          kpi_snapshot: Json
          location_id: string
          missing_info_flag: boolean
          next_week_action_plan: string | null
          operational_notes: string | null
          priority: Database["public"]["Enums"]["report_review_priority"]
          reporting_week_end: string
          reporting_week_start: string
          review_remarks: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["weekly_report_status"]
          submitted_at: string | null
          submitted_by_name: string | null
          support_required: string | null
          team: Database["public"]["Enums"]["maintenance_report_team"]
          top_achievements: string | null
          top_challenges: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          critical_issues?: string | null
          executive_report_id?: string | null
          id?: string
          kpi_snapshot?: Json
          location_id: string
          missing_info_flag?: boolean
          next_week_action_plan?: string | null
          operational_notes?: string | null
          priority?: Database["public"]["Enums"]["report_review_priority"]
          reporting_week_end: string
          reporting_week_start: string
          review_remarks?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["weekly_report_status"]
          submitted_at?: string | null
          submitted_by_name?: string | null
          support_required?: string | null
          team: Database["public"]["Enums"]["maintenance_report_team"]
          top_achievements?: string | null
          top_challenges?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          critical_issues?: string | null
          executive_report_id?: string | null
          id?: string
          kpi_snapshot?: Json
          location_id?: string
          missing_info_flag?: boolean
          next_week_action_plan?: string | null
          operational_notes?: string | null
          priority?: Database["public"]["Enums"]["report_review_priority"]
          reporting_week_end?: string
          reporting_week_start?: string
          review_remarks?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["weekly_report_status"]
          submitted_at?: string | null
          submitted_by_name?: string | null
          support_required?: string | null
          team?: Database["public"]["Enums"]["maintenance_report_team"]
          top_achievements?: string | null
          top_challenges?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_weekly_reports_executive_fk"
            columns: ["executive_report_id"]
            isOneToOne: false
            referencedRelation: "maintenance_executive_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_weekly_reports_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
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
      master_departments: {
        Row: {
          active: boolean
          audience: string
          code: string | null
          created_at: string
          id: string
          name: string
          parent_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          audience?: string
          code?: string | null
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          audience?: string
          code?: string | null
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "master_departments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "master_departments"
            referencedColumns: ["id"]
          },
        ]
      }
      master_genders: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      master_nationalities: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      master_positions: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_delivery_logs: {
        Row: {
          channel: string
          created_at: string
          error_message: string | null
          id: string
          notification_id: string
          provider: string
          provider_ref: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          channel: string
          created_at?: string
          error_message?: string | null
          id?: string
          notification_id: string
          provider?: string
          provider_ref?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          channel?: string
          created_at?: string
          error_message?: string | null
          id?: string
          notification_id?: string
          provider?: string
          provider_ref?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_delivery_logs_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          category: string
          channel_email: boolean
          channel_in_app: boolean
          channel_sms: boolean
          channel_whatsapp: boolean
          id: string
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          channel_email?: boolean
          channel_in_app?: boolean
          channel_sms?: boolean
          channel_whatsapp?: boolean
          id?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          channel_email?: boolean
          channel_in_app?: boolean
          channel_sms?: boolean
          channel_whatsapp?: boolean
          id?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action_url: string | null
          body: string | null
          category: string
          created_at: string
          dismissed_at: string | null
          id: string
          location_id: string | null
          metadata: Json
          read_at: string | null
          severity: string
          source_id: string | null
          source_type: string | null
          title: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          body?: string | null
          category?: string
          created_at?: string
          dismissed_at?: string | null
          id?: string
          location_id?: string | null
          metadata?: Json
          read_at?: string | null
          severity?: string
          source_id?: string | null
          source_type?: string | null
          title: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          body?: string | null
          category?: string
          created_at?: string
          dismissed_at?: string | null
          id?: string
          location_id?: string | null
          metadata?: Json
          read_at?: string | null
          severity?: string
          source_id?: string | null
          source_type?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_location_id_fkey"
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
      opening_readiness: {
        Row: {
          check_date: string
          check_item: string
          check_time: string | null
          checked_by: string | null
          created_at: string
          id: string
          location_id: string
          notes: string | null
          status: string
          updated_at: string
          zone: string | null
        }
        Insert: {
          check_date?: string
          check_item: string
          check_time?: string | null
          checked_by?: string | null
          created_at?: string
          id?: string
          location_id: string
          notes?: string | null
          status?: string
          updated_at?: string
          zone?: string | null
        }
        Update: {
          check_date?: string
          check_item?: string
          check_time?: string | null
          checked_by?: string | null
          created_at?: string
          id?: string
          location_id?: string
          notes?: string | null
          status?: string
          updated_at?: string
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opening_readiness_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          location_id: string | null
          metadata: Json
          staff_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          location_id?: string | null
          metadata?: Json
          staff_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          location_id?: string | null
          metadata?: Json
          staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "performance_audit_logs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_audit_logs_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_cycles: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          id: string
          kpi_period_id: string | null
          name: string
          notes: string | null
          period_end: string
          period_kind: string
          period_start: string
          status: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          kpi_period_id?: string | null
          name: string
          notes?: string | null
          period_end: string
          period_kind?: string
          period_start: string
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kpi_period_id?: string | null
          name?: string
          notes?: string | null
          period_end?: string
          period_kind?: string
          period_start?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_cycles_kpi_period_id_fkey"
            columns: ["kpi_period_id"]
            isOneToOne: false
            referencedRelation: "kpi_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_evidence: {
        Row: {
          created_at: string
          employee_kpi_id: string | null
          evaluation_id: string | null
          file_path: string | null
          id: string
          mime_type: string | null
          notes: string | null
          staff_id: string
          title: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          employee_kpi_id?: string | null
          evaluation_id?: string | null
          file_path?: string | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          staff_id: string
          title: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          employee_kpi_id?: string | null
          evaluation_id?: string | null
          file_path?: string | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          staff_id?: string
          title?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "performance_evidence_employee_kpi_id_fkey"
            columns: ["employee_kpi_id"]
            isOneToOne: false
            referencedRelation: "employee_kpis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_evidence_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "employee_evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_evidence_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_improvement_plans: {
        Row: {
          created_at: string
          created_by: string | null
          end_date: string | null
          evaluation_id: string | null
          goals: string | null
          id: string
          notes: string | null
          staff_id: string
          start_date: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          evaluation_id?: string | null
          goals?: string | null
          id?: string
          notes?: string | null
          staff_id: string
          start_date?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          evaluation_id?: string | null
          goals?: string | null
          id?: string
          notes?: string | null
          staff_id?: string
          start_date?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_improvement_plans_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "employee_evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_improvement_plans_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      planned_notifications: {
        Row: {
          body: string | null
          created_at: string
          due_date: string
          id: string
          location_id: string | null
          notification_id: string | null
          reminder_type: string
          scheduled_for: string
          sent_at: string | null
          source_id: string | null
          source_type: string | null
          status: string
          title: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          due_date: string
          id?: string
          location_id?: string | null
          notification_id?: string | null
          reminder_type: string
          scheduled_for: string
          sent_at?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          due_date?: string
          id?: string
          location_id?: string | null
          notification_id?: string | null
          reminder_type?: string
          scheduled_for?: string
          sent_at?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "planned_notifications_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_notifications_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
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
      pr_approval_history: {
        Row: {
          action: string
          actor_id: string | null
          comments: string | null
          created_at: string
          from_status: string | null
          id: string
          metadata: Json
          pr_id: string
          step_id: string | null
          to_status: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          comments?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          metadata?: Json
          pr_id: string
          step_id?: string | null
          to_status?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          comments?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          metadata?: Json
          pr_id?: string
          step_id?: string | null
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pr_approval_history_pr_id_fkey"
            columns: ["pr_id"]
            isOneToOne: false
            referencedRelation: "purchase_requisitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pr_approval_history_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "pr_approval_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      pr_approval_steps: {
        Row: {
          acted_at: string | null
          acted_by: string | null
          comments: string | null
          id: string
          pr_id: string
          status: string
          step_order: number
          step_role: string
        }
        Insert: {
          acted_at?: string | null
          acted_by?: string | null
          comments?: string | null
          id?: string
          pr_id: string
          status?: string
          step_order: number
          step_role: string
        }
        Update: {
          acted_at?: string | null
          acted_by?: string | null
          comments?: string | null
          id?: string
          pr_id?: string
          status?: string
          step_order?: number
          step_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "pr_approval_steps_pr_id_fkey"
            columns: ["pr_id"]
            isOneToOne: false
            referencedRelation: "purchase_requisitions"
            referencedColumns: ["id"]
          },
        ]
      }
      pr_attachments: {
        Row: {
          created_at: string
          doc_type: string
          file_mime: string | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          pr_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          doc_type?: string
          file_mime?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          pr_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          doc_type?: string
          file_mime?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          pr_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pr_attachments_pr_id_fkey"
            columns: ["pr_id"]
            isOneToOne: false
            referencedRelation: "purchase_requisitions"
            referencedColumns: ["id"]
          },
        ]
      }
      pr_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          location_id: string | null
          metadata: Json
          pr_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          location_id?: string | null
          metadata?: Json
          pr_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          location_id?: string | null
          metadata?: Json
          pr_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pr_audit_logs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      pr_doa_matrix: {
        Row: {
          active: boolean
          band_code: string
          created_at: string
          id: string
          label: string
          max_amount: number | null
          min_amount: number
          require_ceo: boolean
          require_dept_head: boolean
          require_finance: boolean
          require_gm: boolean
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          band_code: string
          created_at?: string
          id?: string
          label: string
          max_amount?: number | null
          min_amount?: number
          require_ceo?: boolean
          require_dept_head?: boolean
          require_finance?: boolean
          require_gm?: boolean
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          band_code?: string
          created_at?: string
          id?: string
          label?: string
          max_amount?: number | null
          min_amount?: number
          require_ceo?: boolean
          require_dept_head?: boolean
          require_finance?: boolean
          require_gm?: boolean
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      pr_doa_settings: {
        Row: {
          finance_always_required: boolean
          force_ceo_on_budget_exception: boolean
          force_ceo_on_price_variance: boolean
          id: number
          price_variance_pct_threshold: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          finance_always_required?: boolean
          force_ceo_on_budget_exception?: boolean
          force_ceo_on_price_variance?: boolean
          id?: number
          price_variance_pct_threshold?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          finance_always_required?: boolean
          force_ceo_on_budget_exception?: boolean
          force_ceo_on_price_variance?: boolean
          id?: number
          price_variance_pct_threshold?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      pr_lines: {
        Row: {
          category: string | null
          description: string | null
          id: string
          item_id: string | null
          line_no: number
          line_total: number | null
          name: string
          pr_id: string
          preferred_vendor_id: string | null
          qty: number
          remarks: string | null
          unit: string
          unit_price: number
        }
        Insert: {
          category?: string | null
          description?: string | null
          id?: string
          item_id?: string | null
          line_no?: number
          line_total?: number | null
          name: string
          pr_id: string
          preferred_vendor_id?: string | null
          qty?: number
          remarks?: string | null
          unit?: string
          unit_price?: number
        }
        Update: {
          category?: string | null
          description?: string | null
          id?: string
          item_id?: string | null
          line_no?: number
          line_total?: number | null
          name?: string
          pr_id?: string
          preferred_vendor_id?: string | null
          qty?: number
          remarks?: string | null
          unit?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "pr_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "proc_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pr_lines_pr_id_fkey"
            columns: ["pr_id"]
            isOneToOne: false
            referencedRelation: "purchase_requisitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pr_lines_preferred_vendor_id_fkey"
            columns: ["preferred_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      pr_payment_milestones: {
        Row: {
          amount: number
          cleared_at: string | null
          cleared_by: string | null
          conditions: string | null
          created_at: string
          due_date: string | null
          due_timing: string | null
          evidence_note: string | null
          id: string
          line_no: number
          paid_amount: number
          paid_at: string | null
          paid_by: string | null
          pr_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          amount?: number
          cleared_at?: string | null
          cleared_by?: string | null
          conditions?: string | null
          created_at?: string
          due_date?: string | null
          due_timing?: string | null
          evidence_note?: string | null
          id?: string
          line_no?: number
          paid_amount?: number
          paid_at?: string | null
          paid_by?: string | null
          pr_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          amount?: number
          cleared_at?: string | null
          cleared_by?: string | null
          conditions?: string | null
          created_at?: string
          due_date?: string | null
          due_timing?: string | null
          evidence_note?: string | null
          id?: string
          line_no?: number
          paid_amount?: number
          paid_at?: string | null
          paid_by?: string | null
          pr_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pr_payment_milestones_pr_id_fkey"
            columns: ["pr_id"]
            isOneToOne: false
            referencedRelation: "purchase_requisitions"
            referencedColumns: ["id"]
          },
        ]
      }
      proc_budget_commitments: {
        Row: {
          amount: number
          budget_id: string
          created_at: string
          id: string
          pr_id: string | null
          status: string
        }
        Insert: {
          amount: number
          budget_id: string
          created_at?: string
          id?: string
          pr_id?: string | null
          status?: string
        }
        Update: {
          amount?: number
          budget_id?: string
          created_at?: string
          id?: string
          pr_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "proc_budget_commitments_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "proc_budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proc_budget_commitments_pr_id_fkey"
            columns: ["pr_id"]
            isOneToOne: false
            referencedRelation: "purchase_requisitions"
            referencedColumns: ["id"]
          },
        ]
      }
      proc_budgets: {
        Row: {
          amount: number
          cost_center: string | null
          created_at: string
          currency: string
          department_id: string | null
          fiscal_year: number
          id: string
          location_id: string | null
          notes: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          cost_center?: string | null
          created_at?: string
          currency?: string
          department_id?: string | null
          fiscal_year?: number
          id?: string
          location_id?: string | null
          notes?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          cost_center?: string | null
          created_at?: string
          currency?: string
          department_id?: string | null
          fiscal_year?: number
          id?: string
          location_id?: string | null
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proc_budgets_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "master_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proc_budgets_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      proc_items: {
        Row: {
          active: boolean
          category: string
          created_at: string
          description: string | null
          id: string
          name: string
          sku: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          sku?: string | null
          unit?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          sku?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      proc_price_history: {
        Row: {
          category: string | null
          currency: string
          id: string
          item_id: string | null
          item_name: string | null
          recorded_at: string
          recorded_by: string | null
          source: string
          source_id: string | null
          unit_price: number
          vendor_id: string | null
        }
        Insert: {
          category?: string | null
          currency?: string
          id?: string
          item_id?: string | null
          item_name?: string | null
          recorded_at?: string
          recorded_by?: string | null
          source?: string
          source_id?: string | null
          unit_price: number
          vendor_id?: string | null
        }
        Update: {
          category?: string | null
          currency?: string
          id?: string
          item_id?: string | null
          item_name?: string | null
          recorded_at?: string
          recorded_by?: string | null
          source?: string
          source_id?: string | null
          unit_price?: number
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proc_price_history_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "proc_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proc_price_history_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      proc_quotation_lines: {
        Row: {
          id: string
          item_id: string | null
          line_no: number
          line_total: number | null
          name: string
          qty: number
          quotation_id: string
          remarks: string | null
          unit: string
          unit_price: number
        }
        Insert: {
          id?: string
          item_id?: string | null
          line_no?: number
          line_total?: number | null
          name: string
          qty?: number
          quotation_id: string
          remarks?: string | null
          unit?: string
          unit_price?: number
        }
        Update: {
          id?: string
          item_id?: string | null
          line_no?: number
          line_total?: number | null
          name?: string
          qty?: number
          quotation_id?: string
          remarks?: string | null
          unit?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "proc_quotation_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "proc_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proc_quotation_lines_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "proc_quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      proc_quotations: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          id: string
          notes: string | null
          pr_id: string | null
          quote_date: string | null
          quote_ref: string | null
          status: string
          total_amount: number
          updated_at: string
          valid_until: string | null
          vendor_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          notes?: string | null
          pr_id?: string | null
          quote_date?: string | null
          quote_ref?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
          valid_until?: string | null
          vendor_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          notes?: string | null
          pr_id?: string | null
          quote_date?: string | null
          quote_ref?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
          valid_until?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proc_quotations_pr_id_fkey"
            columns: ["pr_id"]
            isOneToOne: false
            referencedRelation: "purchase_requisitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proc_quotations_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
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
          login_email_self_edit_at: string | null
          phone: string | null
          pin_hash: string | null
          preferred_language: string
          signature_auto_apply: boolean
          signature_url: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          employee_code?: string | null
          id: string
          login_email_self_edit_at?: string | null
          phone?: string | null
          pin_hash?: string | null
          preferred_language?: string
          signature_auto_apply?: boolean
          signature_url?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          employee_code?: string | null
          id?: string
          login_email_self_edit_at?: string | null
          phone?: string | null
          pin_hash?: string | null
          preferred_language?: string
          signature_auto_apply?: boolean
          signature_url?: string | null
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
          event_id: string | null
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
          event_id?: string | null
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
          event_id?: string | null
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
            foreignKeyName: "purchase_orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_requisitions: {
        Row: {
          budget_exception: boolean
          budget_increase_pending: boolean
          cost_category_id: string | null
          cost_center: string | null
          created_at: string
          currency: string
          current_step_role: string | null
          department_id: string | null
          emergency: boolean
          estimated_exposure: number | null
          event_id: string | null
          excess_amount: number
          hold_reason: string | null
          id: string
          justification: string
          location_id: string
          over_budget: boolean
          payment_notes: string | null
          payment_structure: string
          po_id: string | null
          pr_number: string | null
          price_variance_flag: boolean
          priority: string
          project_name: string | null
          purpose_category: string | null
          request_type: string
          requested_at: string
          requested_by: string
          requester_staff_id: string | null
          required_by: string | null
          spend_type: string
          status: string
          submitted_at: string | null
          title: string | null
          total_amount: number
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          budget_exception?: boolean
          budget_increase_pending?: boolean
          cost_category_id?: string | null
          cost_center?: string | null
          created_at?: string
          currency?: string
          current_step_role?: string | null
          department_id?: string | null
          emergency?: boolean
          estimated_exposure?: number | null
          event_id?: string | null
          excess_amount?: number
          hold_reason?: string | null
          id?: string
          justification?: string
          location_id: string
          over_budget?: boolean
          payment_notes?: string | null
          payment_structure?: string
          po_id?: string | null
          pr_number?: string | null
          price_variance_flag?: boolean
          priority?: string
          project_name?: string | null
          purpose_category?: string | null
          request_type?: string
          requested_at?: string
          requested_by: string
          requester_staff_id?: string | null
          required_by?: string | null
          spend_type?: string
          status?: string
          submitted_at?: string | null
          title?: string | null
          total_amount?: number
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          budget_exception?: boolean
          budget_increase_pending?: boolean
          cost_category_id?: string | null
          cost_center?: string | null
          created_at?: string
          currency?: string
          current_step_role?: string | null
          department_id?: string | null
          emergency?: boolean
          estimated_exposure?: number | null
          event_id?: string | null
          excess_amount?: number
          hold_reason?: string | null
          id?: string
          justification?: string
          location_id?: string
          over_budget?: boolean
          payment_notes?: string | null
          payment_structure?: string
          po_id?: string | null
          pr_number?: string | null
          price_variance_flag?: boolean
          priority?: string
          project_name?: string | null
          purpose_category?: string | null
          request_type?: string
          requested_at?: string
          requested_by?: string
          requester_staff_id?: string | null
          required_by?: string | null
          spend_type?: string
          status?: string
          submitted_at?: string | null
          title?: string | null
          total_amount?: number
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_requisitions_cost_category_id_fkey"
            columns: ["cost_category_id"]
            isOneToOne: false
            referencedRelation: "evt_cost_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requisitions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "master_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requisitions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requisitions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requisitions_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requisitions_requester_staff_id_fkey"
            columns: ["requester_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requisitions_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      report_kpi_snapshots: {
        Row: {
          charts: Json
          executive_report_id: string
          id: string
          kpis: Json
          location_rankings: Json
          snapshot_at: string
        }
        Insert: {
          charts?: Json
          executive_report_id: string
          id?: string
          kpis?: Json
          location_rankings?: Json
          snapshot_at?: string
        }
        Update: {
          charts?: Json
          executive_report_id?: string
          id?: string
          kpis?: Json
          location_rankings?: Json
          snapshot_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_kpi_snapshots_executive_report_id_fkey"
            columns: ["executive_report_id"]
            isOneToOne: false
            referencedRelation: "executive_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_review_comments: {
        Row: {
          comment_text: string
          created_at: string
          created_by: string | null
          id: string
          is_internal: boolean
          priority: Database["public"]["Enums"]["report_review_priority"] | null
          weekly_report_id: string
        }
        Insert: {
          comment_text: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_internal?: boolean
          priority?:
            | Database["public"]["Enums"]["report_review_priority"]
            | null
          weekly_report_id: string
        }
        Update: {
          comment_text?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_internal?: boolean
          priority?:
            | Database["public"]["Enums"]["report_review_priority"]
            | null
          weekly_report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_review_comments_weekly_report_id_fkey"
            columns: ["weekly_report_id"]
            isOneToOne: false
            referencedRelation: "weekly_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_register: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          id: string
          impact: number
          likelihood: number
          location_id: string
          mitigation_action: string | null
          owner_id: string | null
          risk_category: string
          risk_score: number | null
          status: string
          target_date: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          impact: number
          likelihood: number
          location_id: string
          mitigation_action?: string | null
          owner_id?: string | null
          risk_category: string
          risk_score?: number | null
          status?: string
          target_date?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          impact?: number
          likelihood?: number
          location_id?: string
          mitigation_action?: string | null
          owner_id?: string | null
          risk_category?: string
          risk_score?: number | null
          status?: string
          target_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_register_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      role_capability_grants: {
        Row: {
          allowed: boolean
          capability: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allowed: boolean
          capability: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allowed?: boolean
          capability?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      schema_migrations: {
        Row: {
          applied_at: string
          version: string
        }
        Insert: {
          applied_at?: string
          version: string
        }
        Update: {
          applied_at?: string
          version?: string
        }
        Relationships: []
      }
      shift_briefings: {
        Row: {
          attendance_pct: number | null
          briefing_date: string
          created_at: string
          filled_by: string | null
          handover_items: string | null
          id: string
          key_notes: string | null
          location_id: string
          shift: Database["public"]["Enums"]["shift_period"]
          staff_absent: number | null
          staff_present: number
          staff_scheduled: number
          supervisor_name: string
          updated_at: string
        }
        Insert: {
          attendance_pct?: number | null
          briefing_date?: string
          created_at?: string
          filled_by?: string | null
          handover_items?: string | null
          id?: string
          key_notes?: string | null
          location_id: string
          shift?: Database["public"]["Enums"]["shift_period"]
          staff_absent?: number | null
          staff_present?: number
          staff_scheduled?: number
          supervisor_name: string
          updated_at?: string
        }
        Update: {
          attendance_pct?: number | null
          briefing_date?: string
          created_at?: string
          filled_by?: string | null
          handover_items?: string | null
          id?: string
          key_notes?: string | null
          location_id?: string
          shift?: Database["public"]["Enums"]["shift_period"]
          staff_absent?: number | null
          staff_present?: number
          staff_scheduled?: number
          supervisor_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_briefings_location_id_fkey"
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
          {
            foreignKeyName: "shifts_roster_upload_id_fkey"
            columns: ["roster_upload_id"]
            isOneToOne: false
            referencedRelation: "daily_ops_roster_uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      sidebar_nav_order: {
        Row: {
          department_ids: string[]
          id: string
          item_orders: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          department_ids?: string[]
          id: string
          item_orders?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          department_ids?: string[]
          id?: string
          item_orders?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      snag_assignments: {
        Row: {
          assigned_at: string
          assignee_id: string | null
          id: string
          notes: string | null
          snag_id: string
          vendor_id: string | null
        }
        Insert: {
          assigned_at?: string
          assignee_id?: string | null
          id?: string
          notes?: string | null
          snag_id: string
          vendor_id?: string | null
        }
        Update: {
          assigned_at?: string
          assignee_id?: string | null
          id?: string
          notes?: string | null
          snag_id?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "snag_assignments_snag_id_fkey"
            columns: ["snag_id"]
            isOneToOne: false
            referencedRelation: "snag_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "snag_assignments_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      snag_items: {
        Row: {
          action_remarks: string | null
          area: string | null
          assigned_to: string | null
          category: string
          closure_date: string | null
          created_at: string
          created_by: string | null
          department: string | null
          description: string
          id: string
          list_id: string | null
          location_id: string
          priority: string
          raised_at: string
          reopen_reason: string | null
          risk_score: number
          severity: string
          snag_number: string
          status: string
          target_date: string | null
          updated_at: string
          vendor_id: string | null
          verified_by: string | null
        }
        Insert: {
          action_remarks?: string | null
          area?: string | null
          assigned_to?: string | null
          category?: string
          closure_date?: string | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          description: string
          id?: string
          list_id?: string | null
          location_id: string
          priority?: string
          raised_at?: string
          reopen_reason?: string | null
          risk_score?: number
          severity?: string
          snag_number?: string
          status?: string
          target_date?: string | null
          updated_at?: string
          vendor_id?: string | null
          verified_by?: string | null
        }
        Update: {
          action_remarks?: string | null
          area?: string | null
          assigned_to?: string | null
          category?: string
          closure_date?: string | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          description?: string
          id?: string
          list_id?: string | null
          location_id?: string
          priority?: string
          raised_at?: string
          reopen_reason?: string | null
          risk_score?: number
          severity?: string
          snag_number?: string
          status?: string
          target_date?: string | null
          updated_at?: string
          vendor_id?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "snag_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "snag_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "snag_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "snag_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      snag_lists: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          list_type: string
          location_id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          list_type?: string
          location_id: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          list_type?: string
          location_id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "snag_lists_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      snag_photos: {
        Row: {
          created_at: string
          file_name: string | null
          file_path: string
          id: string
          photo_type: string
          snag_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          file_path: string
          id?: string
          photo_type?: string
          snag_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string | null
          file_path?: string
          id?: string
          photo_type?: string
          snag_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "snag_photos_snag_id_fkey"
            columns: ["snag_id"]
            isOneToOne: false
            referencedRelation: "snag_items"
            referencedColumns: ["id"]
          },
        ]
      }
      snag_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          from_status: string | null
          id: string
          remarks: string | null
          snag_id: string
          to_status: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          remarks?: string | null
          snag_id: string
          to_status: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          remarks?: string | null
          snag_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "snag_status_history_snag_id_fkey"
            columns: ["snag_id"]
            isOneToOne: false
            referencedRelation: "snag_items"
            referencedColumns: ["id"]
          },
        ]
      }
      sop_acknowledgments: {
        Row: {
          acknowledged_at: string | null
          created_at: string
          document_id: string
          due_date: string | null
          id: string
          read_at: string | null
          status: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          acknowledged_at?: string | null
          created_at?: string
          document_id: string
          due_date?: string | null
          id?: string
          read_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
          version: number
        }
        Update: {
          acknowledged_at?: string | null
          created_at?: string
          document_id?: string
          due_date?: string | null
          id?: string
          read_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "sop_acknowledgments_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "sop_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      sop_assignments: {
        Row: {
          active: boolean
          created_at: string
          document_id: string
          due_date: string | null
          id: string
          location_id: string | null
          staff_id: string | null
          target_role: Database["public"]["Enums"]["app_role"] | null
          user_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          document_id: string
          due_date?: string | null
          id?: string
          location_id?: string | null
          staff_id?: string | null
          target_role?: Database["public"]["Enums"]["app_role"] | null
          user_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          document_id?: string
          due_date?: string | null
          id?: string
          location_id?: string | null
          staff_id?: string | null
          target_role?: Database["public"]["Enums"]["app_role"] | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sop_assignments_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "sop_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sop_assignments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sop_assignments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      sop_documents: {
        Row: {
          category: string
          code: string
          created_at: string
          created_by: string | null
          current_version: number
          department: string | null
          effective_date: string | null
          expiry_date: string | null
          file_mime: string | null
          file_name: string | null
          file_path: string | null
          id: string
          kra_template_id: string | null
          location_id: string | null
          mandatory_ack: boolean
          owner_id: string | null
          requires_quiz: boolean
          review_date: string | null
          scope: string
          sop_code: string | null
          status: string
          target_role: Database["public"]["Enums"]["app_role"] | null
          title: string
          updated_at: string
        }
        Insert: {
          category: string
          code: string
          created_at?: string
          created_by?: string | null
          current_version?: number
          department?: string | null
          effective_date?: string | null
          expiry_date?: string | null
          file_mime?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          kra_template_id?: string | null
          location_id?: string | null
          mandatory_ack?: boolean
          owner_id?: string | null
          requires_quiz?: boolean
          review_date?: string | null
          scope?: string
          sop_code?: string | null
          status?: string
          target_role?: Database["public"]["Enums"]["app_role"] | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          created_by?: string | null
          current_version?: number
          department?: string | null
          effective_date?: string | null
          expiry_date?: string | null
          file_mime?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          kra_template_id?: string | null
          location_id?: string | null
          mandatory_ack?: boolean
          owner_id?: string | null
          requires_quiz?: boolean
          review_date?: string | null
          scope?: string
          sop_code?: string | null
          status?: string
          target_role?: Database["public"]["Enums"]["app_role"] | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sop_documents_kra_template_id_fkey"
            columns: ["kra_template_id"]
            isOneToOne: false
            referencedRelation: "kra_scorecard_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sop_documents_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      sop_quiz_attempts: {
        Row: {
          answers: Json
          attempted_at: string
          id: string
          passed: boolean
          quiz_id: string
          score: number
          user_id: string
        }
        Insert: {
          answers?: Json
          attempted_at?: string
          id?: string
          passed?: boolean
          quiz_id: string
          score?: number
          user_id: string
        }
        Update: {
          answers?: Json
          attempted_at?: string
          id?: string
          passed?: boolean
          quiz_id?: string
          score?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sop_quiz_attempts_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "sop_quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      sop_quiz_questions: {
        Row: {
          correct_option: number
          created_at: string
          id: string
          options: Json
          question: string
          quiz_id: string
          sort_order: number
        }
        Insert: {
          correct_option?: number
          created_at?: string
          id?: string
          options?: Json
          question: string
          quiz_id: string
          sort_order?: number
        }
        Update: {
          correct_option?: number
          created_at?: string
          id?: string
          options?: Json
          question?: string
          quiz_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "sop_quiz_questions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "sop_quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      sop_quizzes: {
        Row: {
          active: boolean
          created_at: string
          document_id: string
          id: string
          passing_score: number
          version: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          document_id: string
          id?: string
          passing_score?: number
          version?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          document_id?: string
          id?: string
          passing_score?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "sop_quizzes_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "sop_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      sop_sections: {
        Row: {
          content: string
          created_at: string
          document_id: string
          heading: string | null
          id: string
          sort_order: number
          version: number
        }
        Insert: {
          content: string
          created_at?: string
          document_id: string
          heading?: string | null
          id?: string
          sort_order?: number
          version?: number
        }
        Update: {
          content?: string
          created_at?: string
          document_id?: string
          heading?: string | null
          id?: string
          sort_order?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "sop_sections_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "sop_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      sop_versions: {
        Row: {
          change_summary: string | null
          document_id: string
          id: string
          published_at: string
          published_by: string | null
          version: number
        }
        Insert: {
          change_summary?: string | null
          document_id: string
          id?: string
          published_at?: string
          published_by?: string | null
          version: number
        }
        Update: {
          change_summary?: string | null
          document_id?: string
          id?: string
          published_at?: string
          published_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "sop_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "sop_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          break_minutes: number | null
          buffer_minutes: number | null
          can_self_check_in: boolean
          created_at: string
          deleted_at: string | null
          department: string | null
          e3_enrolled: boolean | null
          email: string | null
          employee_code: string
          employment_type: string | null
          expected_hours: number | null
          flexible_attendance: boolean
          flexible_shift_end: string | null
          flexible_shift_start: string | null
          full_name: string
          hire_date: string | null
          id: string
          is_roaming: boolean
          job_title: string | null
          location_id: string
          phone: string | null
          photo_data: string | null
          photo_mime: string | null
          photo_updated_at: string | null
          qid: string | null
          reporting_time_minutes: number | null
          source_row_no: number | null
          staff_role: Database["public"]["Enums"]["staff_role"] | null
          status: string
          updated_at: string
          user_id: string | null
          weekly_off_weekday: number | null
        }
        Insert: {
          break_minutes?: number | null
          buffer_minutes?: number | null
          can_self_check_in?: boolean
          created_at?: string
          deleted_at?: string | null
          department?: string | null
          e3_enrolled?: boolean | null
          email?: string | null
          employee_code: string
          employment_type?: string | null
          expected_hours?: number | null
          flexible_attendance?: boolean
          flexible_shift_end?: string | null
          flexible_shift_start?: string | null
          full_name: string
          hire_date?: string | null
          id?: string
          is_roaming?: boolean
          job_title?: string | null
          location_id: string
          phone?: string | null
          photo_data?: string | null
          photo_mime?: string | null
          photo_updated_at?: string | null
          qid?: string | null
          reporting_time_minutes?: number | null
          source_row_no?: number | null
          staff_role?: Database["public"]["Enums"]["staff_role"] | null
          status?: string
          updated_at?: string
          user_id?: string | null
          weekly_off_weekday?: number | null
        }
        Update: {
          break_minutes?: number | null
          buffer_minutes?: number | null
          can_self_check_in?: boolean
          created_at?: string
          deleted_at?: string | null
          department?: string | null
          e3_enrolled?: boolean | null
          email?: string | null
          employee_code?: string
          employment_type?: string | null
          expected_hours?: number | null
          flexible_attendance?: boolean
          flexible_shift_end?: string | null
          flexible_shift_start?: string | null
          full_name?: string
          hire_date?: string | null
          id?: string
          is_roaming?: boolean
          job_title?: string | null
          location_id?: string
          phone?: string | null
          photo_data?: string | null
          photo_mime?: string | null
          photo_updated_at?: string | null
          qid?: string | null
          reporting_time_minutes?: number | null
          source_row_no?: number | null
          staff_role?: Database["public"]["Enums"]["staff_role"] | null
          status?: string
          updated_at?: string
          user_id?: string | null
          weekly_off_weekday?: number | null
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
      staff_certifications: {
        Row: {
          created_at: string
          first_aid_expiry: string | null
          food_handler_expiry: string | null
          id: string
          location_id: string | null
          medical_expiry: string | null
          qid_expiry: string | null
          role: string | null
          staff_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          first_aid_expiry?: string | null
          food_handler_expiry?: string | null
          id?: string
          location_id?: string | null
          medical_expiry?: string | null
          qid_expiry?: string | null
          role?: string | null
          staff_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          first_aid_expiry?: string | null
          food_handler_expiry?: string | null
          id?: string
          location_id?: string | null
          medical_expiry?: string | null
          qid_expiry?: string | null
          role?: string | null
          staff_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_certifications_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_compensation: {
        Row: {
          basic_qar: number | null
          currency: string
          daily_rate_qar: number | null
          extras: Json
          housing_qar: number | null
          monthly_salary_qar: number | null
          staff_id: string
          transport_qar: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          basic_qar?: number | null
          currency?: string
          daily_rate_qar?: number | null
          extras?: Json
          housing_qar?: number | null
          monthly_salary_qar?: number | null
          staff_id: string
          transport_qar?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          basic_qar?: number | null
          currency?: string
          daily_rate_qar?: number | null
          extras?: Json
          housing_qar?: number | null
          monthly_salary_qar?: number | null
          staff_id?: string
          transport_qar?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_compensation_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: true
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
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
      staff_face_enrollments: {
        Row: {
          enrolled_at: string
          enrolled_by: string | null
          liveness_passed: boolean
          notes: string | null
          staff_id: string
          status: string
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          enrolled_at?: string
          enrolled_by?: string | null
          liveness_passed?: boolean
          notes?: string | null
          staff_id: string
          status?: string
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          enrolled_at?: string
          enrolled_by?: string | null
          liveness_passed?: boolean
          notes?: string | null
          staff_id?: string
          status?: string
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_face_enrollments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: true
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_import_batches: {
        Row: {
          archive_count: number
          completed_at: string | null
          confirm_hard_delete: boolean
          create_count: number
          created_at: string
          delete_count: number
          error_message: string | null
          file_count: number
          id: string
          mode: string
          review_count: number
          rolled_back_at: string | null
          row_count: number
          started_at: string | null
          status: string
          summary: Json
          unchanged_count: number
          update_count: number
          uploaded_by: string | null
        }
        Insert: {
          archive_count?: number
          completed_at?: string | null
          confirm_hard_delete?: boolean
          create_count?: number
          created_at?: string
          delete_count?: number
          error_message?: string | null
          file_count?: number
          id?: string
          mode?: string
          review_count?: number
          rolled_back_at?: string | null
          row_count?: number
          started_at?: string | null
          status?: string
          summary?: Json
          unchanged_count?: number
          update_count?: number
          uploaded_by?: string | null
        }
        Update: {
          archive_count?: number
          completed_at?: string | null
          confirm_hard_delete?: boolean
          create_count?: number
          created_at?: string
          delete_count?: number
          error_message?: string | null
          file_count?: number
          id?: string
          mode?: string
          review_count?: number
          rolled_back_at?: string | null
          row_count?: number
          started_at?: string | null
          status?: string
          summary?: Json
          unchanged_count?: number
          update_count?: number
          uploaded_by?: string | null
        }
        Relationships: []
      }
      staff_import_files: {
        Row: {
          batch_id: string
          byte_size: number
          created_at: string
          encrypted: boolean
          file_hash: string
          file_type: string
          filename: string
          id: string
          storage_path: string | null
          worksheet_name: string | null
        }
        Insert: {
          batch_id: string
          byte_size?: number
          created_at?: string
          encrypted?: boolean
          file_hash: string
          file_type: string
          filename: string
          id?: string
          storage_path?: string | null
          worksheet_name?: string | null
        }
        Update: {
          batch_id?: string
          byte_size?: number
          created_at?: string
          encrypted?: boolean
          file_hash?: string
          file_type?: string
          filename?: string
          id?: string
          storage_path?: string | null
          worksheet_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_import_files_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "staff_import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_import_rows: {
        Row: {
          action: string
          batch_id: string
          field_diffs: Json
          id: string
          match_rule: string | null
          match_staff_id: string | null
          new_values: Json
          old_values: Json
          raw: Json
          row_number: number
          warnings: string[]
        }
        Insert: {
          action: string
          batch_id: string
          field_diffs?: Json
          id?: string
          match_rule?: string | null
          match_staff_id?: string | null
          new_values?: Json
          old_values?: Json
          raw?: Json
          row_number: number
          warnings?: string[]
        }
        Update: {
          action?: string
          batch_id?: string
          field_diffs?: Json
          id?: string
          match_rule?: string | null
          match_staff_id?: string | null
          new_values?: Json
          old_values?: Json
          raw?: Json
          row_number?: number
          warnings?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "staff_import_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "staff_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_import_rows_match_staff_id_fkey"
            columns: ["match_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_import_snapshots: {
        Row: {
          batch_id: string
          before: Json
          created_at: string
          id: string
          staff_id: string
        }
        Insert: {
          batch_id: string
          before?: Json
          created_at?: string
          id?: string
          staff_id: string
        }
        Update: {
          batch_id?: string
          before?: Json
          created_at?: string
          id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_import_snapshots_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "staff_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_import_snapshots_staff_id_fkey"
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
      staff_location_events: {
        Row: {
          accuracy_meters: number | null
          client_event_id: string | null
          created_at: string
          created_by: string | null
          distance_meters: number | null
          event_type: string
          face_liveness_passed: boolean | null
          face_status: string
          geofence_id: string | null
          id: string
          inside_geofence: boolean | null
          latitude: number
          location_id: string | null
          longitude: number
          photo_path: string | null
          queued_offline: boolean
          recorded_at: string
          source: string
          staff_id: string
        }
        Insert: {
          accuracy_meters?: number | null
          client_event_id?: string | null
          created_at?: string
          created_by?: string | null
          distance_meters?: number | null
          event_type?: string
          face_liveness_passed?: boolean | null
          face_status?: string
          geofence_id?: string | null
          id?: string
          inside_geofence?: boolean | null
          latitude: number
          location_id?: string | null
          longitude: number
          photo_path?: string | null
          queued_offline?: boolean
          recorded_at?: string
          source?: string
          staff_id: string
        }
        Update: {
          accuracy_meters?: number | null
          client_event_id?: string | null
          created_at?: string
          created_by?: string | null
          distance_meters?: number | null
          event_type?: string
          face_liveness_passed?: boolean | null
          face_status?: string
          geofence_id?: string | null
          id?: string
          inside_geofence?: boolean | null
          latitude?: number
          location_id?: string | null
          longitude?: number
          photo_path?: string | null
          queued_offline?: boolean
          recorded_at?: string
          source?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_location_events_geofence_id_fkey"
            columns: ["geofence_id"]
            isOneToOne: false
            referencedRelation: "attendance_geofences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_location_events_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_location_events_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_profile_ext: {
        Row: {
          bank_name: string | null
          contract_end: string | null
          contract_start: string | null
          contract_working_days: number | null
          created_at: string
          date_of_birth: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relation: string | null
          employment_category: string | null
          exit_reason: string | null
          gender: string | null
          iban: string | null
          last_working_date: string | null
          nationality: string | null
          notes: string | null
          org_chart_placed: boolean
          passport_expiry: string | null
          passport_number: string | null
          payment_method: string | null
          probation_end: string | null
          probation_start: string | null
          qid_expiry: string | null
          releasing_date: string | null
          reporting_manager_staff_id: string | null
          skills: string | null
          sponsorship_info: string | null
          staff_id: string
          ticket_amount: number | null
          ticket_eligibility: boolean | null
          ticket_eligibility_months: number | null
          updated_at: string
          updated_by: string | null
          visa_expiry: string | null
          visa_number: string | null
          wps_employee_id: string | null
        }
        Insert: {
          bank_name?: string | null
          contract_end?: string | null
          contract_start?: string | null
          contract_working_days?: number | null
          created_at?: string
          date_of_birth?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          employment_category?: string | null
          exit_reason?: string | null
          gender?: string | null
          iban?: string | null
          last_working_date?: string | null
          nationality?: string | null
          notes?: string | null
          org_chart_placed?: boolean
          passport_expiry?: string | null
          passport_number?: string | null
          payment_method?: string | null
          probation_end?: string | null
          probation_start?: string | null
          qid_expiry?: string | null
          releasing_date?: string | null
          reporting_manager_staff_id?: string | null
          skills?: string | null
          sponsorship_info?: string | null
          staff_id: string
          ticket_amount?: number | null
          ticket_eligibility?: boolean | null
          ticket_eligibility_months?: number | null
          updated_at?: string
          updated_by?: string | null
          visa_expiry?: string | null
          visa_number?: string | null
          wps_employee_id?: string | null
        }
        Update: {
          bank_name?: string | null
          contract_end?: string | null
          contract_start?: string | null
          contract_working_days?: number | null
          created_at?: string
          date_of_birth?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          employment_category?: string | null
          exit_reason?: string | null
          gender?: string | null
          iban?: string | null
          last_working_date?: string | null
          nationality?: string | null
          notes?: string | null
          org_chart_placed?: boolean
          passport_expiry?: string | null
          passport_number?: string | null
          payment_method?: string | null
          probation_end?: string | null
          probation_start?: string | null
          qid_expiry?: string | null
          releasing_date?: string | null
          reporting_manager_staff_id?: string | null
          skills?: string | null
          sponsorship_info?: string | null
          staff_id?: string
          ticket_amount?: number | null
          ticket_eligibility?: boolean | null
          ticket_eligibility_months?: number | null
          updated_at?: string
          updated_by?: string | null
          visa_expiry?: string | null
          visa_number?: string | null
          wps_employee_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_profile_ext_reporting_manager_staff_id_fkey"
            columns: ["reporting_manager_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_profile_ext_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: true
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_salary_history: {
        Row: {
          allowances: Json
          approved_at: string | null
          approved_by: string | null
          basic_qar: number | null
          created_at: string
          created_by: string | null
          currency: string
          daily_rate_qar: number | null
          effective_on: string
          id: string
          letter_document_id: string | null
          monthly_total_qar: number | null
          reason: string | null
          staff_id: string
        }
        Insert: {
          allowances?: Json
          approved_at?: string | null
          approved_by?: string | null
          basic_qar?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          daily_rate_qar?: number | null
          effective_on: string
          id?: string
          letter_document_id?: string | null
          monthly_total_qar?: number | null
          reason?: string | null
          staff_id: string
        }
        Update: {
          allowances?: Json
          approved_at?: string | null
          approved_by?: string | null
          basic_qar?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          daily_rate_qar?: number | null
          effective_on?: string
          id?: string
          letter_document_id?: string | null
          monthly_total_qar?: number | null
          reason?: string | null
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_salary_history_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_status_history: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          document_id: string | null
          effective_on: string
          from_status: string | null
          id: string
          reason: string | null
          staff_id: string
          to_status: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          effective_on: string
          from_status?: string | null
          id?: string
          reason?: string | null
          staff_id: string
          to_status: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          effective_on?: string
          from_status?: string | null
          id?: string
          reason?: string | null
          staff_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_status_history_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_temporary_site_moves: {
        Row: {
          created_at: string
          created_by: string | null
          ends_on: string
          from_location_id: string | null
          id: string
          note: string | null
          staff_id: string
          starts_on: string
          to_location_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_on: string
          from_location_id?: string | null
          id?: string
          note?: string | null
          staff_id: string
          starts_on: string
          to_location_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_on?: string
          from_location_id?: string | null
          id?: string
          note?: string | null
          staff_id?: string
          starts_on?: string
          to_location_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_temporary_site_moves_from_location_id_fkey"
            columns: ["from_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_temporary_site_moves_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_temporary_site_moves_to_location_id_fkey"
            columns: ["to_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_transfers: {
        Row: {
          created_at: string
          created_by: string | null
          effective_on: string
          from_location_id: string | null
          id: string
          reason: string | null
          staff_id: string
          to_location_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_on: string
          from_location_id?: string | null
          id?: string
          reason?: string | null
          staff_id: string
          to_location_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_on?: string
          from_location_id?: string | null
          id?: string
          reason?: string | null
          staff_id?: string
          to_location_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_transfers_from_location_id_fkey"
            columns: ["from_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_transfers_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_transfers_to_location_id_fkey"
            columns: ["to_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_work_locations: {
        Row: {
          created_at: string
          created_by: string | null
          location_id: string
          staff_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          location_id: string
          staff_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          location_id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_work_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_work_locations_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      supervisor_issues: {
        Row: {
          assigned_to: string | null
          category: string
          cost: number | null
          created_at: string
          created_by: string | null
          date_resolved: string | null
          description: string
          due_date: string | null
          entry_ref: string | null
          id: string
          location_id: string
          log_date: string
          priority: string
          remarks: string | null
          status: string
          updated_at: string
          vendor: string | null
          zone: string | null
        }
        Insert: {
          assigned_to?: string | null
          category: string
          cost?: number | null
          created_at?: string
          created_by?: string | null
          date_resolved?: string | null
          description: string
          due_date?: string | null
          entry_ref?: string | null
          id?: string
          location_id: string
          log_date?: string
          priority?: string
          remarks?: string | null
          status?: string
          updated_at?: string
          vendor?: string | null
          zone?: string | null
        }
        Update: {
          assigned_to?: string | null
          category?: string
          cost?: number | null
          created_at?: string
          created_by?: string | null
          date_resolved?: string | null
          description?: string
          due_date?: string | null
          entry_ref?: string | null
          id?: string
          location_id?: string
          log_date?: string
          priority?: string
          remarks?: string | null
          status?: string
          updated_at?: string
          vendor?: string | null
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supervisor_issues_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      sys_crash_incidents: {
        Row: {
          created_at: string
          id: string
          message: string
          metadata: Json
          resolved_at: string | null
          resolved_by: string | null
          route: string | null
          severity: string
          source: string
          stack: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          metadata?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          route?: string | null
          severity?: string
          source?: string
          stack?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          metadata?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          route?: string | null
          severity?: string
          source?: string
          stack?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
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
      training_assignment_rules: {
        Row: {
          assignment_id: string
          business_unit: string | null
          created_at: string
          custom_label: string | null
          department_id: string | null
          employment_type: string | null
          id: string
          location_id: string | null
          role_code: string | null
          staff_id: string | null
          target: string
          team_label: string | null
        }
        Insert: {
          assignment_id: string
          business_unit?: string | null
          created_at?: string
          custom_label?: string | null
          department_id?: string | null
          employment_type?: string | null
          id?: string
          location_id?: string | null
          role_code?: string | null
          staff_id?: string | null
          target: string
          team_label?: string | null
        }
        Update: {
          assignment_id?: string
          business_unit?: string | null
          created_at?: string
          custom_label?: string | null
          department_id?: string | null
          employment_type?: string | null
          id?: string
          location_id?: string | null
          role_code?: string | null
          staff_id?: string | null
          target?: string
          team_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_assignment_rules_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "training_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_assignment_rules_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "master_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_assignment_rules_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_assignment_rules_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      training_assignments: {
        Row: {
          course_id: string | null
          created_at: string
          created_by: string
          due_on: string | null
          id: string
          path_id: string | null
          priority: string
          reason: string | null
          reminder_offsets_days: number[]
          required: boolean
          start_on: string | null
          version_id: string | null
        }
        Insert: {
          course_id?: string | null
          created_at?: string
          created_by: string
          due_on?: string | null
          id?: string
          path_id?: string | null
          priority?: string
          reason?: string | null
          reminder_offsets_days?: number[]
          required?: boolean
          start_on?: string | null
          version_id?: string | null
        }
        Update: {
          course_id?: string | null
          created_at?: string
          created_by?: string
          due_on?: string | null
          id?: string
          path_id?: string | null
          priority?: string
          reason?: string | null
          reminder_offsets_days?: number[]
          required?: boolean
          start_on?: string | null
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_assignments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "training_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_assignments_path_id_fkey"
            columns: ["path_id"]
            isOneToOne: false
            referencedRelation: "training_paths"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_assignments_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "training_course_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      training_attempts: {
        Row: {
          answers: Json
          enrollment_id: string
          id: string
          passed: boolean | null
          question_id: string | null
          score: number | null
          staff_id: string
          started_at: string
          submitted_at: string | null
        }
        Insert: {
          answers?: Json
          enrollment_id: string
          id?: string
          passed?: boolean | null
          question_id?: string | null
          score?: number | null
          staff_id: string
          started_at?: string
          submitted_at?: string | null
        }
        Update: {
          answers?: Json
          enrollment_id?: string
          id?: string
          passed?: boolean | null
          question_id?: string | null
          score?: number | null
          staff_id?: string
          started_at?: string
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_attempts_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "training_course_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_attempts_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "training_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_attempts_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      training_attendance: {
        Row: {
          marked_at: string
          marked_by: string
          session_id: string
          staff_id: string
          status: string
        }
        Insert: {
          marked_at?: string
          marked_by: string
          session_id: string
          staff_id: string
          status: string
        }
        Update: {
          marked_at?: string
          marked_by?: string
          session_id?: string
          staff_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "training_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_attendance_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      training_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          id: string
          location_id: string | null
          reason: string | null
          row_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          location_id?: string | null
          reason?: string | null
          row_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          location_id?: string | null
          reason?: string | null
          row_id?: string | null
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_audit_logs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      training_bank_question_keys: {
        Row: {
          correct: Json
          explanation: string | null
          question_id: string
        }
        Insert: {
          correct: Json
          explanation?: string | null
          question_id: string
        }
        Update: {
          correct?: Json
          explanation?: string | null
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_bank_question_keys_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: true
            referencedRelation: "training_bank_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      training_bank_questions: {
        Row: {
          bank_id: string
          course_id: string | null
          created_at: string
          difficulty: string | null
          id: string
          inner_kind: string | null
          kind: string
          options: Json
          points: number
          prompt: string
          scenario_prompt: string | null
          tags: string[]
          topic: string | null
        }
        Insert: {
          bank_id: string
          course_id?: string | null
          created_at?: string
          difficulty?: string | null
          id?: string
          inner_kind?: string | null
          kind: string
          options?: Json
          points?: number
          prompt: string
          scenario_prompt?: string | null
          tags?: string[]
          topic?: string | null
        }
        Update: {
          bank_id?: string
          course_id?: string | null
          created_at?: string
          difficulty?: string | null
          id?: string
          inner_kind?: string | null
          kind?: string
          options?: Json
          points?: number
          prompt?: string
          scenario_prompt?: string | null
          tags?: string[]
          topic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_bank_questions_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "training_question_banks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_bank_questions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "training_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      training_certificate_notices: {
        Row: {
          certificate_id: string
          created_at: string
          notice: string
        }
        Insert: {
          certificate_id: string
          created_at?: string
          notice: string
        }
        Update: {
          certificate_id?: string
          created_at?: string
          notice?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_certificate_notices_certificate_id_fkey"
            columns: ["certificate_id"]
            isOneToOne: false
            referencedRelation: "training_certificates"
            referencedColumns: ["id"]
          },
        ]
      }
      training_certificates: {
        Row: {
          course_code: string | null
          course_id: string
          course_title: string
          enrollment_id: string | null
          holder_name: string
          id: string
          issued_at: string
          path_id: string | null
          public_token: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          score: number | null
          signatory_name: string | null
          staff_id: string
          status: string
          valid_until: string | null
        }
        Insert: {
          course_code?: string | null
          course_id: string
          course_title: string
          enrollment_id?: string | null
          holder_name: string
          id?: string
          issued_at?: string
          path_id?: string | null
          public_token?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          score?: number | null
          signatory_name?: string | null
          staff_id: string
          status?: string
          valid_until?: string | null
        }
        Update: {
          course_code?: string | null
          course_id?: string
          course_title?: string
          enrollment_id?: string | null
          holder_name?: string
          id?: string
          issued_at?: string
          path_id?: string | null
          public_token?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          score?: number | null
          signatory_name?: string | null
          staff_id?: string
          status?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_certificates_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "training_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_certificates_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: true
            referencedRelation: "training_course_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_certificates_path_id_fkey"
            columns: ["path_id"]
            isOneToOne: false
            referencedRelation: "training_paths"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_certificates_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      training_competencies: {
        Row: {
          awarded_at: string
          code: string
          enrollment_id: string | null
          expires_on: string | null
          id: string
          level: string
          name: string
          staff_id: string
        }
        Insert: {
          awarded_at?: string
          code: string
          enrollment_id?: string | null
          expires_on?: string | null
          id?: string
          level?: string
          name: string
          staff_id: string
        }
        Update: {
          awarded_at?: string
          code?: string
          enrollment_id?: string | null
          expires_on?: string | null
          id?: string
          level?: string
          name?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_competencies_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "training_course_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_competencies_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      training_course_enrollments: {
        Row: {
          assignment_id: string | null
          completed_at: string | null
          course_id: string
          created_at: string
          due_on: string | null
          enrolled_at: string
          id: string
          last_lesson_id: string | null
          path_id: string | null
          score: number | null
          staff_id: string
          started_at: string | null
          status: string
          version_id: string
        }
        Insert: {
          assignment_id?: string | null
          completed_at?: string | null
          course_id: string
          created_at?: string
          due_on?: string | null
          enrolled_at?: string
          id?: string
          last_lesson_id?: string | null
          path_id?: string | null
          score?: number | null
          staff_id: string
          started_at?: string | null
          status?: string
          version_id: string
        }
        Update: {
          assignment_id?: string | null
          completed_at?: string | null
          course_id?: string
          created_at?: string
          due_on?: string | null
          enrolled_at?: string
          id?: string
          last_lesson_id?: string | null
          path_id?: string | null
          score?: number | null
          staff_id?: string
          started_at?: string | null
          status?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_course_enrollments_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "training_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_course_enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "training_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_course_enrollments_last_lesson_id_fkey"
            columns: ["last_lesson_id"]
            isOneToOne: false
            referencedRelation: "training_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_course_enrollments_path_id_fkey"
            columns: ["path_id"]
            isOneToOne: false
            referencedRelation: "training_paths"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_course_enrollments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_course_enrollments_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "training_course_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      training_course_prerequisites: {
        Row: {
          course_id: string
          prerequisite_course_id: string
        }
        Insert: {
          course_id: string
          prerequisite_course_id: string
        }
        Update: {
          course_id?: string
          prerequisite_course_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_course_prerequisites_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "training_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_course_prerequisites_prerequisite_course_id_fkey"
            columns: ["prerequisite_course_id"]
            isOneToOne: false
            referencedRelation: "training_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      training_course_versions: {
        Row: {
          change_summary: string | null
          course_id: string
          created_at: string
          id: string
          published_at: string | null
          published_by: string | null
          status: string
          title: string
          updated_at: string
          version_no: number
        }
        Insert: {
          change_summary?: string | null
          course_id: string
          created_at?: string
          id?: string
          published_at?: string | null
          published_by?: string | null
          status?: string
          title: string
          updated_at?: string
          version_no: number
        }
        Update: {
          change_summary?: string | null
          course_id?: string
          created_at?: string
          id?: string
          published_at?: string | null
          published_by?: string | null
          status?: string
          title?: string
          updated_at?: string
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "training_course_versions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "training_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      training_courses: {
        Row: {
          business_unit: string | null
          category: string | null
          certificate_enabled: boolean
          certificate_validity_days: number | null
          code: string
          competency_code: string | null
          competency_name: string | null
          created_at: string
          created_by: string
          department_id: string | null
          description: string | null
          difficulty: string | null
          estimated_minutes: number | null
          id: string
          instructor_staff_id: string | null
          location_id: string | null
          max_attempts: number | null
          passing_score: number | null
          published_version_id: string | null
          refresher_course_id: string | null
          required: boolean
          requires_session_attendance: boolean
          retrain_on_publish: boolean
          retraining_lead_days: number
          status: string
          summary: string | null
          tags: string[]
          thumbnail_path: string | null
          title: string
          training_type: string | null
          updated_at: string
          validity_days: number | null
        }
        Insert: {
          business_unit?: string | null
          category?: string | null
          certificate_enabled?: boolean
          certificate_validity_days?: number | null
          code: string
          competency_code?: string | null
          competency_name?: string | null
          created_at?: string
          created_by: string
          department_id?: string | null
          description?: string | null
          difficulty?: string | null
          estimated_minutes?: number | null
          id?: string
          instructor_staff_id?: string | null
          location_id?: string | null
          max_attempts?: number | null
          passing_score?: number | null
          published_version_id?: string | null
          refresher_course_id?: string | null
          required?: boolean
          requires_session_attendance?: boolean
          retrain_on_publish?: boolean
          retraining_lead_days?: number
          status?: string
          summary?: string | null
          tags?: string[]
          thumbnail_path?: string | null
          title: string
          training_type?: string | null
          updated_at?: string
          validity_days?: number | null
        }
        Update: {
          business_unit?: string | null
          category?: string | null
          certificate_enabled?: boolean
          certificate_validity_days?: number | null
          code?: string
          competency_code?: string | null
          competency_name?: string | null
          created_at?: string
          created_by?: string
          department_id?: string | null
          description?: string | null
          difficulty?: string | null
          estimated_minutes?: number | null
          id?: string
          instructor_staff_id?: string | null
          location_id?: string | null
          max_attempts?: number | null
          passing_score?: number | null
          published_version_id?: string | null
          refresher_course_id?: string | null
          required?: boolean
          requires_session_attendance?: boolean
          retrain_on_publish?: boolean
          retraining_lead_days?: number
          status?: string
          summary?: string | null
          tags?: string[]
          thumbnail_path?: string | null
          title?: string
          training_type?: string | null
          updated_at?: string
          validity_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "training_courses_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "master_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_courses_instructor_staff_id_fkey"
            columns: ["instructor_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_courses_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_courses_published_version_fkey"
            columns: ["published_version_id"]
            isOneToOne: false
            referencedRelation: "training_course_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_courses_refresher_course_id_fkey"
            columns: ["refresher_course_id"]
            isOneToOne: false
            referencedRelation: "training_courses"
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
      training_entity_links: {
        Row: {
          course_id: string | null
          created_at: string
          created_by: string
          enforce_mode: string
          enrollment_id: string | null
          entity_id: string
          entity_type: string
          id: string
          requirement_type: string
        }
        Insert: {
          course_id?: string | null
          created_at?: string
          created_by: string
          enforce_mode?: string
          enrollment_id?: string | null
          entity_id: string
          entity_type: string
          id?: string
          requirement_type?: string
        }
        Update: {
          course_id?: string | null
          created_at?: string
          created_by?: string
          enforce_mode?: string
          enrollment_id?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          requirement_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_entity_links_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "training_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_entity_links_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "training_course_enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      training_feedback: {
        Row: {
          comment: string | null
          created_at: string
          enrollment_id: string
          id: string
          rating: number
          staff_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          enrollment_id: string
          id?: string
          rating: number
          staff_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          enrollment_id?: string
          id?: string
          rating?: number
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_feedback_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "training_course_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_feedback_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      training_lesson_quizzes: {
        Row: {
          bank_id: string
          draw_count: number
          lesson_id: string
          max_attempts: number
          passing_score: number
          shuffle_options: boolean
          shuffle_questions: boolean
        }
        Insert: {
          bank_id: string
          draw_count: number
          lesson_id: string
          max_attempts?: number
          passing_score?: number
          shuffle_options?: boolean
          shuffle_questions?: boolean
        }
        Update: {
          bank_id?: string
          draw_count?: number
          lesson_id?: string
          max_attempts?: number
          passing_score?: number
          shuffle_options?: boolean
          shuffle_questions?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "training_lesson_quizzes_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "training_question_banks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_lesson_quizzes_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: true
            referencedRelation: "training_lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      training_lessons: {
        Row: {
          body: string | null
          created_at: string
          duration_seconds: number | null
          external_url: string | null
          id: string
          kind: string
          required: boolean
          section_id: string
          sort_order: number
          storage_path: string | null
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          duration_seconds?: number | null
          external_url?: string | null
          id?: string
          kind?: string
          required?: boolean
          section_id: string
          sort_order?: number
          storage_path?: string | null
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          duration_seconds?: number | null
          external_url?: string | null
          id?: string
          kind?: string
          required?: boolean
          section_id?: string
          sort_order?: number
          storage_path?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_lessons_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "training_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      training_path_items: {
        Row: {
          course_id: string
          path_id: string
          sort_order: number
        }
        Insert: {
          course_id: string
          path_id: string
          sort_order?: number
        }
        Update: {
          course_id?: string
          path_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "training_path_items_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "training_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_path_items_path_id_fkey"
            columns: ["path_id"]
            isOneToOne: false
            referencedRelation: "training_paths"
            referencedColumns: ["id"]
          },
        ]
      }
      training_paths: {
        Row: {
          certificate_enabled: boolean
          code: string
          created_at: string
          created_by: string
          id: string
          status: string
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          certificate_enabled?: boolean
          code: string
          created_at?: string
          created_by: string
          id?: string
          status?: string
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          certificate_enabled?: boolean
          code?: string
          created_at?: string
          created_by?: string
          id?: string
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      training_practical_assessments: {
        Row: {
          assessed_at: string | null
          assessor_staff_id: string | null
          confirmation_name: string | null
          confirmed_by: string | null
          created_at: string
          enrollment_id: string
          id: string
          lesson_id: string | null
          notes: string | null
          passed: boolean | null
          rubric: Json
          score: number | null
        }
        Insert: {
          assessed_at?: string | null
          assessor_staff_id?: string | null
          confirmation_name?: string | null
          confirmed_by?: string | null
          created_at?: string
          enrollment_id: string
          id?: string
          lesson_id?: string | null
          notes?: string | null
          passed?: boolean | null
          rubric?: Json
          score?: number | null
        }
        Update: {
          assessed_at?: string | null
          assessor_staff_id?: string | null
          confirmation_name?: string | null
          confirmed_by?: string | null
          created_at?: string
          enrollment_id?: string
          id?: string
          lesson_id?: string | null
          notes?: string | null
          passed?: boolean | null
          rubric?: Json
          score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "training_practical_assessments_assessor_staff_id_fkey"
            columns: ["assessor_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_practical_assessments_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "training_course_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_practical_assessments_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "training_lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      training_progress: {
        Row: {
          acknowledged_at: string | null
          checklist: Json
          completed_at: string | null
          enrollment_id: string
          id: string
          lesson_id: string
          position_seconds: number
          time_spent_seconds: number
          updated_at: string
          viewed_at: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          checklist?: Json
          completed_at?: string | null
          enrollment_id: string
          id?: string
          lesson_id: string
          position_seconds?: number
          time_spent_seconds?: number
          updated_at?: string
          viewed_at?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          checklist?: Json
          completed_at?: string | null
          enrollment_id?: string
          id?: string
          lesson_id?: string
          position_seconds?: number
          time_spent_seconds?: number
          updated_at?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_progress_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "training_course_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "training_lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      training_question_banks: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          tags: string[]
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          tags?: string[]
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          tags?: string[]
        }
        Relationships: []
      }
      training_question_keys: {
        Row: {
          correct: Json
          question_id: string
        }
        Insert: {
          correct: Json
          question_id: string
        }
        Update: {
          correct?: Json
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_question_keys_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: true
            referencedRelation: "training_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      training_questions: {
        Row: {
          created_at: string
          id: string
          kind: string
          options: Json
          points: number
          prompt: string
          sort_order: number
          version_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          options?: Json
          points?: number
          prompt: string
          sort_order?: number
          version_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          options?: Json
          points?: number
          prompt?: string
          sort_order?: number
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_questions_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "training_course_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      training_quiz_attempts: {
        Row: {
          answers: Json | null
          enrollment_id: string
          id: string
          lesson_id: string
          option_order: Json
          passed: boolean | null
          score: number | null
          served_question_ids: string[]
          staff_id: string
          started_at: string
          submitted_at: string | null
        }
        Insert: {
          answers?: Json | null
          enrollment_id: string
          id?: string
          lesson_id: string
          option_order?: Json
          passed?: boolean | null
          score?: number | null
          served_question_ids: string[]
          staff_id: string
          started_at?: string
          submitted_at?: string | null
        }
        Update: {
          answers?: Json | null
          enrollment_id?: string
          id?: string
          lesson_id?: string
          option_order?: Json
          passed?: boolean | null
          score?: number | null
          served_question_ids?: string[]
          staff_id?: string
          started_at?: string
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_quiz_attempts_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "training_course_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_quiz_attempts_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "training_lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      training_saved_rules: {
        Row: {
          business_unit: string | null
          course_id: string
          created_at: string
          created_by: string
          custom_label: string | null
          department_id: string | null
          due_offset_days: number | null
          employment_type: string | null
          id: string
          location_id: string | null
          priority: string
          reason: string | null
          reminder_offsets_days: number[]
          required: boolean
          role_code: string | null
          staff_id: string | null
          target: string
          team_label: string | null
          trigger_kind: string
          version_id: string
        }
        Insert: {
          business_unit?: string | null
          course_id: string
          created_at?: string
          created_by: string
          custom_label?: string | null
          department_id?: string | null
          due_offset_days?: number | null
          employment_type?: string | null
          id?: string
          location_id?: string | null
          priority?: string
          reason?: string | null
          reminder_offsets_days?: number[]
          required?: boolean
          role_code?: string | null
          staff_id?: string | null
          target: string
          team_label?: string | null
          trigger_kind: string
          version_id: string
        }
        Update: {
          business_unit?: string | null
          course_id?: string
          created_at?: string
          created_by?: string
          custom_label?: string | null
          department_id?: string | null
          due_offset_days?: number | null
          employment_type?: string | null
          id?: string
          location_id?: string | null
          priority?: string
          reason?: string | null
          reminder_offsets_days?: number[]
          required?: boolean
          role_code?: string | null
          staff_id?: string | null
          target?: string
          team_label?: string | null
          trigger_kind?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_saved_rules_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "training_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_saved_rules_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "master_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_saved_rules_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_saved_rules_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_saved_rules_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "training_course_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      training_sections: {
        Row: {
          created_at: string
          id: string
          sort_order: number
          title: string
          version_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          sort_order?: number
          title: string
          version_id: string
        }
        Update: {
          created_at?: string
          id?: string
          sort_order?: number
          title?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_sections_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "training_course_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      training_session_participants: {
        Row: {
          added_at: string
          added_by: string
          session_id: string
          staff_id: string
        }
        Insert: {
          added_at?: string
          added_by: string
          session_id: string
          staff_id: string
        }
        Update: {
          added_at?: string
          added_by?: string
          session_id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_session_participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "training_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_session_participants_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      training_sessions: {
        Row: {
          capacity: number | null
          course_id: string
          created_at: string
          created_by: string
          ends_at: string
          id: string
          location_id: string
          room: string | null
          starts_at: string
          status: string
          trainer_staff_id: string | null
          updated_at: string
          version_id: string
        }
        Insert: {
          capacity?: number | null
          course_id: string
          created_at?: string
          created_by: string
          ends_at: string
          id?: string
          location_id: string
          room?: string | null
          starts_at: string
          status?: string
          trainer_staff_id?: string | null
          updated_at?: string
          version_id: string
        }
        Update: {
          capacity?: number | null
          course_id?: string
          created_at?: string
          created_by?: string
          ends_at?: string
          id?: string
          location_id?: string
          room?: string | null
          starts_at?: string
          status?: string
          trainer_staff_id?: string | null
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_sessions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "training_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_sessions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_sessions_trainer_staff_id_fkey"
            columns: ["trainer_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_sessions_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "training_course_versions"
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
      utility_consumption: {
        Row: {
          bill_amount: number
          closing_reading: number | null
          consumption: number | null
          created_at: string
          created_by: string | null
          currency: string
          file_name: string | null
          file_path: string | null
          id: string
          location_id: string
          meter_account_number: string | null
          opening_reading: number | null
          period_month: string
          remarks: string | null
          updated_at: string
          utility_type: string
        }
        Insert: {
          bill_amount?: number
          closing_reading?: number | null
          consumption?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          file_name?: string | null
          file_path?: string | null
          id?: string
          location_id: string
          meter_account_number?: string | null
          opening_reading?: number | null
          period_month: string
          remarks?: string | null
          updated_at?: string
          utility_type: string
        }
        Update: {
          bill_amount?: number
          closing_reading?: number | null
          consumption?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          file_name?: string | null
          file_path?: string | null
          id?: string
          location_id?: string
          meter_account_number?: string | null
          opening_reading?: number | null
          period_month?: string
          remarks?: string | null
          updated_at?: string
          utility_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "utility_consumption_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_contacts: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_primary: boolean
          name: string
          phone: string | null
          role: string | null
          vendor_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name: string
          phone?: string | null
          role?: string | null
          vendor_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name?: string
          phone?: string | null
          role?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_contacts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_contracts: {
        Row: {
          contract_ref: string | null
          created_at: string
          currency: string
          end_date: string | null
          id: string
          location_id: string | null
          sla_terms: string | null
          start_date: string | null
          status: string
          title: string
          updated_at: string
          value_amount: number | null
          vendor_id: string
        }
        Insert: {
          contract_ref?: string | null
          created_at?: string
          currency?: string
          end_date?: string | null
          id?: string
          location_id?: string | null
          sla_terms?: string | null
          start_date?: string | null
          status?: string
          title: string
          updated_at?: string
          value_amount?: number | null
          vendor_id: string
        }
        Update: {
          contract_ref?: string | null
          created_at?: string
          currency?: string
          end_date?: string | null
          id?: string
          location_id?: string | null
          sla_terms?: string | null
          start_date?: string | null
          status?: string
          title?: string
          updated_at?: string
          value_amount?: number | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_contracts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_contracts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_documents: {
        Row: {
          contract_id: string | null
          created_at: string
          doc_type: string
          expiry_date: string | null
          file_name: string | null
          file_path: string | null
          id: string
          vendor_id: string
        }
        Insert: {
          contract_id?: string | null
          created_at?: string
          doc_type: string
          expiry_date?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          vendor_id: string
        }
        Update: {
          contract_id?: string | null
          created_at?: string
          doc_type?: string
          expiry_date?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_documents_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "vendor_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_documents_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_followups: {
        Row: {
          completed_at: string | null
          created_at: string
          due_date: string
          id: string
          location_id: string | null
          notes: string | null
          owner_id: string | null
          related_id: string | null
          related_type: string | null
          status: string
          title: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          due_date: string
          id?: string
          location_id?: string | null
          notes?: string | null
          owner_id?: string | null
          related_id?: string | null
          related_type?: string | null
          status?: string
          title: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          due_date?: string
          id?: string
          location_id?: string | null
          notes?: string | null
          owner_id?: string | null
          related_id?: string | null
          related_type?: string | null
          status?: string
          title?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_followups_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_followups_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_repairs: {
        Row: {
          actual_return: string | null
          asset: string
          cost: number | null
          created_at: string
          expected_return: string | null
          id: string
          location_id: string | null
          sent_date: string
          status: string
          updated_at: string
          vendor: string
        }
        Insert: {
          actual_return?: string | null
          asset: string
          cost?: number | null
          created_at?: string
          expected_return?: string | null
          id?: string
          location_id?: string | null
          sent_date: string
          status?: string
          updated_at?: string
          vendor: string
        }
        Update: {
          actual_return?: string | null
          asset?: string
          cost?: number | null
          created_at?: string
          expected_return?: string | null
          id?: string
          location_id?: string | null
          sent_date?: string
          status?: string
          updated_at?: string
          vendor?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_repairs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_service_levels: {
        Row: {
          contract_id: string
          created_at: string
          id: string
          metric_name: string
          penalty_clause: string | null
          target_value: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          id?: string
          metric_name: string
          penalty_clause?: string | null
          target_value: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          id?: string
          metric_name?: string
          penalty_clause?: string | null
          target_value?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_service_levels_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "vendor_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          active: boolean
          address: string | null
          amc_status: string | null
          branch_coverage: string[]
          category: string
          compliance_deadline: string | null
          compliance_status: string
          contact_person: string | null
          cr_no: string | null
          created_at: string
          email: string | null
          engagement_type: string | null
          entity_type: string
          id: string
          name: string
          notes: string | null
          payment_terms: string | null
          phone: string | null
          service_category: string | null
          status: string | null
          trade_license_no: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          amc_status?: string | null
          branch_coverage?: string[]
          category?: string
          compliance_deadline?: string | null
          compliance_status?: string
          contact_person?: string | null
          cr_no?: string | null
          created_at?: string
          email?: string | null
          engagement_type?: string | null
          entity_type?: string
          id?: string
          name: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          service_category?: string | null
          status?: string | null
          trade_license_no?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          amc_status?: string | null
          branch_coverage?: string[]
          category?: string
          compliance_deadline?: string | null
          compliance_status?: string
          contact_person?: string | null
          cr_no?: string | null
          created_at?: string
          email?: string | null
          engagement_type?: string | null
          entity_type?: string
          id?: string
          name?: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          service_category?: string | null
          status?: string | null
          trade_license_no?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      webauthn_challenges: {
        Row: {
          challenge: string
          created_at: string
          expires_at: string
          id: string
          type: string
          user_id: string | null
        }
        Insert: {
          challenge: string
          created_at?: string
          expires_at: string
          id?: string
          type: string
          user_id?: string | null
        }
        Update: {
          challenge?: string
          created_at?: string
          expires_at?: string
          id?: string
          type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      webauthn_credentials: {
        Row: {
          aaguid: string | null
          counter: number
          created_at: string
          credential_id: string
          device_name: string | null
          id: string
          last_used_at: string | null
          public_key: string
          transports: string[] | null
          user_id: string
        }
        Insert: {
          aaguid?: string | null
          counter?: number
          created_at?: string
          credential_id: string
          device_name?: string | null
          id?: string
          last_used_at?: string | null
          public_key: string
          transports?: string[] | null
          user_id: string
        }
        Update: {
          aaguid?: string | null
          counter?: number
          created_at?: string
          credential_id?: string
          device_name?: string | null
          id?: string
          last_used_at?: string | null
          public_key?: string
          transports?: string[] | null
          user_id?: string
        }
        Relationships: []
      }
      weekly_report_attachments: {
        Row: {
          content_base64: string | null
          created_at: string
          file_name: string
          file_size: number | null
          id: string
          mime_type: string
          storage_path: string | null
          uploaded_by: string | null
          weekly_report_id: string
        }
        Insert: {
          content_base64?: string | null
          created_at?: string
          file_name: string
          file_size?: number | null
          id?: string
          mime_type: string
          storage_path?: string | null
          uploaded_by?: string | null
          weekly_report_id: string
        }
        Update: {
          content_base64?: string | null
          created_at?: string
          file_name?: string
          file_size?: number | null
          id?: string
          mime_type?: string
          storage_path?: string | null
          uploaded_by?: string | null
          weekly_report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_report_attachments_weekly_report_id_fkey"
            columns: ["weekly_report_id"]
            isOneToOne: false
            referencedRelation: "weekly_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_reports: {
        Row: {
          absentees_late: string | null
          cashier_pos_issues: string | null
          compliance_score: number | null
          compliance_updates: string | null
          created_at: string
          created_by: string | null
          critical_issues: string | null
          customer_complaints: number
          executive_report_id: string | null
          footfall: number | null
          id: string
          incidents_count: number
          incidents_detail: string | null
          inventory_issues: string | null
          location_id: string
          maintenance_closed: number
          maintenance_issues: string | null
          maintenance_open: number
          marketing_events: string | null
          missing_info_flag: boolean
          next_week_action_plan: string | null
          positive_feedback: string | null
          priority: Database["public"]["Enums"]["report_review_priority"]
          reporting_week_end: string
          reporting_week_start: string
          revenue: number | null
          review_remarks: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          staff_attendance_pct: number | null
          staff_present: number
          staff_scheduled: number
          status: Database["public"]["Enums"]["weekly_report_status"]
          submitted_at: string | null
          submitted_by_name: string | null
          support_required: string | null
          top_achievements: string | null
          top_challenges: string | null
          updated_at: string
        }
        Insert: {
          absentees_late?: string | null
          cashier_pos_issues?: string | null
          compliance_score?: number | null
          compliance_updates?: string | null
          created_at?: string
          created_by?: string | null
          critical_issues?: string | null
          customer_complaints?: number
          executive_report_id?: string | null
          footfall?: number | null
          id?: string
          incidents_count?: number
          incidents_detail?: string | null
          inventory_issues?: string | null
          location_id: string
          maintenance_closed?: number
          maintenance_issues?: string | null
          maintenance_open?: number
          marketing_events?: string | null
          missing_info_flag?: boolean
          next_week_action_plan?: string | null
          positive_feedback?: string | null
          priority?: Database["public"]["Enums"]["report_review_priority"]
          reporting_week_end: string
          reporting_week_start: string
          revenue?: number | null
          review_remarks?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_attendance_pct?: number | null
          staff_present?: number
          staff_scheduled?: number
          status?: Database["public"]["Enums"]["weekly_report_status"]
          submitted_at?: string | null
          submitted_by_name?: string | null
          support_required?: string | null
          top_achievements?: string | null
          top_challenges?: string | null
          updated_at?: string
        }
        Update: {
          absentees_late?: string | null
          cashier_pos_issues?: string | null
          compliance_score?: number | null
          compliance_updates?: string | null
          created_at?: string
          created_by?: string | null
          critical_issues?: string | null
          customer_complaints?: number
          executive_report_id?: string | null
          footfall?: number | null
          id?: string
          incidents_count?: number
          incidents_detail?: string | null
          inventory_issues?: string | null
          location_id?: string
          maintenance_closed?: number
          maintenance_issues?: string | null
          maintenance_open?: number
          marketing_events?: string | null
          missing_info_flag?: boolean
          next_week_action_plan?: string | null
          positive_feedback?: string | null
          priority?: Database["public"]["Enums"]["report_review_priority"]
          reporting_week_end?: string
          reporting_week_start?: string
          revenue?: number | null
          review_remarks?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_attendance_pct?: number | null
          staff_present?: number
          staff_scheduled?: number
          status?: Database["public"]["Enums"]["weekly_report_status"]
          submitted_at?: string | null
          submitted_by_name?: string | null
          support_required?: string | null
          top_achievements?: string | null
          top_challenges?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_reports_executive_report_fk"
            columns: ["executive_report_id"]
            isOneToOne: false
            referencedRelation: "executive_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_reports_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_review_actions: {
        Row: {
          action: string
          carried_from: string | null
          created_at: string
          due: string | null
          id: string
          owner: string | null
          review_id: string
          sort_order: number
          source_module: string | null
          status: string
          update_note: string | null
          updated_at: string
          venue_text: string | null
        }
        Insert: {
          action?: string
          carried_from?: string | null
          created_at?: string
          due?: string | null
          id?: string
          owner?: string | null
          review_id: string
          sort_order?: number
          source_module?: string | null
          status?: string
          update_note?: string | null
          updated_at?: string
          venue_text?: string | null
        }
        Update: {
          action?: string
          carried_from?: string | null
          created_at?: string
          due?: string | null
          id?: string
          owner?: string | null
          review_id?: string
          sort_order?: number
          source_module?: string | null
          status?: string
          update_note?: string | null
          updated_at?: string
          venue_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "weekly_review_actions_carried_from_fkey"
            columns: ["carried_from"]
            isOneToOne: false
            referencedRelation: "weekly_review_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_review_actions_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "weekly_review_summary"
            referencedColumns: ["review_id"]
          },
          {
            foreignKeyName: "weekly_review_actions_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "weekly_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_review_aggregators: {
        Row: {
          created_at: string
          id: string
          location_id: string
          platform: string
          redemptions: number
          review_id: string
          saving_qar: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_id: string
          platform: string
          redemptions?: number
          review_id: string
          saving_qar?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string
          platform?: string
          redemptions?: number
          review_id?: string
          saving_qar?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_review_aggregators_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_review_aggregators_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "weekly_review_summary"
            referencedColumns: ["review_id"]
          },
          {
            foreignKeyName: "weekly_review_aggregators_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "weekly_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_review_corporate: {
        Row: {
          company: string
          created_at: string
          deals: number
          id: string
          location_id: string | null
          revenue_qar: number
          review_id: string
          updated_at: string
        }
        Insert: {
          company?: string
          created_at?: string
          deals?: number
          id?: string
          location_id?: string | null
          revenue_qar?: number
          review_id: string
          updated_at?: string
        }
        Update: {
          company?: string
          created_at?: string
          deals?: number
          id?: string
          location_id?: string | null
          revenue_qar?: number
          review_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_review_corporate_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_review_corporate_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "weekly_review_summary"
            referencedColumns: ["review_id"]
          },
          {
            foreignKeyName: "weekly_review_corporate_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "weekly_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_review_decisions: {
        Row: {
          created_at: string
          decision_required: string
          id: string
          location_id: string | null
          matter: string
          note: string | null
          outcome: string
          priority: string
          review_id: string
          sort_order: number
          updated_at: string
          venue_text: string | null
        }
        Insert: {
          created_at?: string
          decision_required?: string
          id?: string
          location_id?: string | null
          matter?: string
          note?: string | null
          outcome?: string
          priority?: string
          review_id: string
          sort_order?: number
          updated_at?: string
          venue_text?: string | null
        }
        Update: {
          created_at?: string
          decision_required?: string
          id?: string
          location_id?: string | null
          matter?: string
          note?: string | null
          outcome?: string
          priority?: string
          review_id?: string
          sort_order?: number
          updated_at?: string
          venue_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "weekly_review_decisions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_review_decisions_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "weekly_review_summary"
            referencedColumns: ["review_id"]
          },
          {
            foreignKeyName: "weekly_review_decisions_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "weekly_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_review_incidents: {
        Row: {
          action_taken: string | null
          closed: boolean
          created_at: string
          description: string
          id: string
          location_id: string | null
          review_id: string
          updated_at: string
        }
        Insert: {
          action_taken?: string | null
          closed?: boolean
          created_at?: string
          description?: string
          id?: string
          location_id?: string | null
          review_id: string
          updated_at?: string
        }
        Update: {
          action_taken?: string | null
          closed?: boolean
          created_at?: string
          description?: string
          id?: string
          location_id?: string | null
          review_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_review_incidents_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_review_incidents_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "weekly_review_summary"
            referencedColumns: ["review_id"]
          },
          {
            foreignKeyName: "weekly_review_incidents_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "weekly_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_review_loyalty: {
        Row: {
          active_members: number
          created_at: string
          id: string
          location_id: string
          new_members: number
          review_id: string
          rewards_redeemed: number
          updated_at: string
        }
        Insert: {
          active_members?: number
          created_at?: string
          id?: string
          location_id: string
          new_members?: number
          review_id: string
          rewards_redeemed?: number
          updated_at?: string
        }
        Update: {
          active_members?: number
          created_at?: string
          id?: string
          location_id?: string
          new_members?: number
          review_id?: string
          rewards_redeemed?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_review_loyalty_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_review_loyalty_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "weekly_review_summary"
            referencedColumns: ["review_id"]
          },
          {
            foreignKeyName: "weekly_review_loyalty_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "weekly_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_review_social: {
        Row: {
          created_at: string
          google_rating: number | null
          id: string
          ig_followers: number
          location_id: string
          new_reviews_campaign: number
          new_reviews_organic: number
          review_id: string
          rewards_15min: number
          total_reviews: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          google_rating?: number | null
          id?: string
          ig_followers?: number
          location_id: string
          new_reviews_campaign?: number
          new_reviews_organic?: number
          review_id: string
          rewards_15min?: number
          total_reviews?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          google_rating?: number | null
          id?: string
          ig_followers?: number
          location_id?: string
          new_reviews_campaign?: number
          new_reviews_organic?: number
          review_id?: string
          rewards_15min?: number
          total_reviews?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_review_social_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_review_social_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "weekly_review_summary"
            referencedColumns: ["review_id"]
          },
          {
            foreignKeyName: "weekly_review_social_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "weekly_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_reviews: {
        Row: {
          created_at: string
          id: string
          meeting_date: string
          notes: string | null
          prepared_by: string | null
          status: string
          updated_at: string
          week_end: string
          week_label: string
          week_start: string
        }
        Insert: {
          created_at?: string
          id?: string
          meeting_date: string
          notes?: string | null
          prepared_by?: string | null
          status?: string
          updated_at?: string
          week_end: string
          week_label: string
          week_start: string
        }
        Update: {
          created_at?: string
          id?: string
          meeting_date?: string
          notes?: string | null
          prepared_by?: string | null
          status?: string
          updated_at?: string
          week_end?: string
          week_label?: string
          week_start?: string
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
            foreignKeyName: "work_orders_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "maintenance_requests"
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
    }
    Views: {
      arcade_fault_kpis: {
        Row: {
          open_faults: number | null
          repeat_faults: number | null
        }
        Relationships: []
      }
      arcade_site_health: {
        Row: {
          active_machines: number | null
          down: number | null
          location_id: string | null
          out_of_service: number | null
          pm_due: number | null
          pm_overdue: number | null
          under_observation: number | null
          under_repair: number | null
          waiting_part: number | null
          waiting_supplier: number | null
          working: number | null
        }
        Relationships: [
          {
            foreignKeyName: "arcade_machines_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages_visible: {
        Row: {
          body: string | null
          client_message_id: string | null
          content_hidden: boolean | null
          conversation_id: string | null
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_scope: string | null
          edited_at: string | null
          forwarded_from_message_id: string | null
          id: string | null
          metadata: Json | null
          reply_to_message_id: string | null
          sender_id: string | null
          thread_root_message_id: string | null
          type: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_forwarded_from_message_id_fkey"
            columns: ["forwarded_from_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_forwarded_from_message_id_fkey"
            columns: ["forwarded_from_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_thread_root_message_id_fkey"
            columns: ["thread_root_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_thread_root_message_id_fkey"
            columns: ["thread_root_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages_visible"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_documents_enriched: {
        Row: {
          certificate_number: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          contract_id: string | null
          created_at: string | null
          created_by: string | null
          days_to_expiry: number | null
          document_name: string | null
          document_type: string | null
          expiry_date: string | null
          expiry_tier: string | null
          file_mime: string | null
          file_name: string | null
          file_path: string | null
          id: string | null
          issue_date: string | null
          issuing_authority: string | null
          location_id: string | null
          notes: string | null
          notification_date: string | null
          outstanding_amount: number | null
          paid_amount: number | null
          payment_status: string | null
          priority: string | null
          quotation_amount: number | null
          reference_number: string | null
          remarks: string | null
          renewal_due_date: string | null
          renewal_status: string | null
          responsible_person: string | null
          status: string | null
          submission_deadline: string | null
          submitted_at: string | null
          updated_at: string | null
          vendor_id: string | null
        }
        Insert: {
          certificate_number?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contract_id?: string | null
          created_at?: string | null
          created_by?: string | null
          days_to_expiry?: never
          document_name?: string | null
          document_type?: string | null
          expiry_date?: string | null
          expiry_tier?: never
          file_mime?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string | null
          issue_date?: string | null
          issuing_authority?: string | null
          location_id?: string | null
          notes?: string | null
          notification_date?: string | null
          outstanding_amount?: number | null
          paid_amount?: number | null
          payment_status?: string | null
          priority?: string | null
          quotation_amount?: number | null
          reference_number?: string | null
          remarks?: string | null
          renewal_due_date?: string | null
          renewal_status?: string | null
          responsible_person?: string | null
          status?: string | null
          submission_deadline?: string | null
          submitted_at?: string | null
          updated_at?: string | null
          vendor_id?: string | null
        }
        Update: {
          certificate_number?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contract_id?: string | null
          created_at?: string | null
          created_by?: string | null
          days_to_expiry?: never
          document_name?: string | null
          document_type?: string | null
          expiry_date?: string | null
          expiry_tier?: never
          file_mime?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string | null
          issue_date?: string | null
          issuing_authority?: string | null
          location_id?: string | null
          notes?: string | null
          notification_date?: string | null
          outstanding_amount?: number | null
          paid_amount?: number | null
          payment_status?: string | null
          priority?: string | null
          quotation_amount?: number | null
          reference_number?: string | null
          remarks?: string | null
          renewal_due_date?: string | null
          renewal_status?: string | null
          responsible_person?: string | null
          status?: string | null
          submission_deadline?: string | null
          submitted_at?: string | null
          updated_at?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_documents_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "amc_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_documents_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_documents_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_items_enriched: {
        Row: {
          alert_tier: string | null
          contract_number: string | null
          created_at: string | null
          days_remaining: number | null
          doc_link: string | null
          domain: string | null
          expiry_date: string | null
          frequency: string | null
          governing_date: string | null
          id: string | null
          item_name: string | null
          last_service_date: string | null
          next_due_date: string | null
          owner: string | null
          remarks: string | null
          reminder_days: number | null
          renewal_cost: number | null
          risk_level: string | null
          start_date: string | null
          status: string | null
          updated_at: string | null
          vendor_authority: string | null
          venue_scope: string | null
        }
        Insert: {
          alert_tier?: never
          contract_number?: string | null
          created_at?: string | null
          days_remaining?: never
          doc_link?: string | null
          domain?: string | null
          expiry_date?: string | null
          frequency?: string | null
          governing_date?: never
          id?: string | null
          item_name?: string | null
          last_service_date?: string | null
          next_due_date?: string | null
          owner?: string | null
          remarks?: string | null
          reminder_days?: number | null
          renewal_cost?: number | null
          risk_level?: string | null
          start_date?: string | null
          status?: string | null
          updated_at?: string | null
          vendor_authority?: string | null
          venue_scope?: string | null
        }
        Update: {
          alert_tier?: never
          contract_number?: string | null
          created_at?: string | null
          days_remaining?: never
          doc_link?: string | null
          domain?: string | null
          expiry_date?: string | null
          frequency?: string | null
          governing_date?: never
          id?: string | null
          item_name?: string | null
          last_service_date?: string | null
          next_due_date?: string | null
          owner?: string | null
          remarks?: string | null
          reminder_days?: number | null
          renewal_cost?: number | null
          risk_level?: string | null
          start_date?: string | null
          status?: string | null
          updated_at?: string | null
          vendor_authority?: string | null
          venue_scope?: string | null
        }
        Relationships: []
      }
      e3_compliance_items_enriched: {
        Row: {
          area: string | null
          category: string | null
          computed_status: string | null
          contract_end: string | null
          contract_start: string | null
          created_at: string | null
          days_to_expiry: number | null
          drive_link: string | null
          expiry_date: string | null
          frequency: string | null
          id: string | null
          issue_date: string | null
          item: string | null
          last_service: string | null
          location: string | null
          next_service: string | null
          owner: string | null
          remarks: string | null
          updated_at: string | null
          vendor: string | null
        }
        Insert: {
          area?: string | null
          category?: string | null
          computed_status?: never
          contract_end?: string | null
          contract_start?: string | null
          created_at?: string | null
          days_to_expiry?: never
          drive_link?: string | null
          expiry_date?: string | null
          frequency?: string | null
          id?: string | null
          issue_date?: string | null
          item?: string | null
          last_service?: string | null
          location?: string | null
          next_service?: string | null
          owner?: string | null
          remarks?: string | null
          updated_at?: string | null
          vendor?: string | null
        }
        Update: {
          area?: string | null
          category?: string | null
          computed_status?: never
          contract_end?: string | null
          contract_start?: string | null
          created_at?: string | null
          days_to_expiry?: never
          drive_link?: string | null
          expiry_date?: string | null
          frequency?: string | null
          id?: string | null
          issue_date?: string | null
          item?: string | null
          last_service?: string | null
          location?: string | null
          next_service?: string | null
          owner?: string | null
          remarks?: string | null
          updated_at?: string | null
          vendor?: string | null
        }
        Relationships: []
      }
      location_compliance_items_enriched: {
        Row: {
          amc_contract_id: string | null
          area_sub_area: string | null
          attachment_count: number | null
          attachment_status: string | null
          category: string | null
          cert_contract_number: string | null
          compliance_document_id: string | null
          computed_status: string | null
          created_at: string | null
          days_remaining: number | null
          department: string | null
          document_contract_type: string | null
          expiry_bucket: string | null
          expiry_date: string | null
          governing_date: string | null
          has_certificate: boolean | null
          has_invoice: boolean | null
          has_payment_proof: boolean | null
          has_quotation: boolean | null
          has_service_report: boolean | null
          id: string | null
          is_required: boolean | null
          issue_date: string | null
          issuing_authority: string | null
          last_service_date: string | null
          location_code: string | null
          location_id: string | null
          location_name: string | null
          location_region: string | null
          manual_status: string | null
          next_service_date: string | null
          outstanding_amount: number | null
          owner: string | null
          paid_amount: number | null
          payment_status: string | null
          quotation_amount: number | null
          remarks: string | null
          renewal_due_date: string | null
          requirement_id: string | null
          requirement_name: string | null
          risk_level: string | null
          service_frequency: string | null
          start_date: string | null
          updated_at: string | null
          updated_by: string | null
          vendor_contract_id: string | null
          vendor_id: string | null
          vendor_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "location_compliance_items_amc_contract_id_fkey"
            columns: ["amc_contract_id"]
            isOneToOne: false
            referencedRelation: "amc_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_compliance_items_compliance_document_id_fkey"
            columns: ["compliance_document_id"]
            isOneToOne: false
            referencedRelation: "compliance_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_compliance_items_compliance_document_id_fkey"
            columns: ["compliance_document_id"]
            isOneToOne: false
            referencedRelation: "compliance_documents_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_compliance_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_compliance_items_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "compliance_requirements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_compliance_items_vendor_contract_id_fkey"
            columns: ["vendor_contract_id"]
            isOneToOne: false
            referencedRelation: "vendor_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_compliance_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      supervisor_issues_enriched: {
        Row: {
          area_equipment: string | null
          assigned_to: string | null
          category: string | null
          cost: number | null
          created_at: string | null
          created_by: string | null
          date_reported: string | null
          date_resolved: string | null
          days_open: number | null
          description: string | null
          due_date: string | null
          entry_ref: string | null
          id: string | null
          location_id: string | null
          log_date: string | null
          priority: string | null
          remarks: string | null
          status: string | null
          updated_at: string | null
          vendor: string | null
          zone: string | null
        }
        Insert: {
          area_equipment?: never
          assigned_to?: string | null
          category?: string | null
          cost?: number | null
          created_at?: string | null
          created_by?: string | null
          date_reported?: string | null
          date_resolved?: string | null
          days_open?: never
          description?: string | null
          due_date?: string | null
          entry_ref?: string | null
          id?: string | null
          location_id?: string | null
          log_date?: string | null
          priority?: string | null
          remarks?: string | null
          status?: string | null
          updated_at?: string | null
          vendor?: string | null
          zone?: string | null
        }
        Update: {
          area_equipment?: never
          assigned_to?: string | null
          category?: string | null
          cost?: number | null
          created_at?: string | null
          created_by?: string | null
          date_reported?: string | null
          date_resolved?: string | null
          days_open?: never
          description?: string | null
          due_date?: string | null
          entry_ref?: string | null
          id?: string | null
          location_id?: string | null
          log_date?: string | null
          priority?: string | null
          remarks?: string | null
          status?: string | null
          updated_at?: string | null
          vendor?: string | null
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supervisor_issues_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_review_summary: {
        Row: {
          actions_open: number | null
          actions_total: number | null
          aggregator_redemptions: number | null
          corporate_deals: number | null
          decisions_pending: number | null
          incidents: number | null
          new_reviews: number | null
          prev_actions_open: number | null
          prev_actions_total: number | null
          prev_aggregator_redemptions: number | null
          prev_corporate_deals: number | null
          prev_decisions_pending: number | null
          prev_incidents: number | null
          prev_new_reviews: number | null
          review_id: string | null
          week_label: string | null
          week_start: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      amc_refresh_overdue_schedules: { Args: never; Returns: number }
      approve_shift_swap: { Args: { _id: string }; Returns: undefined }
      arcade_consume_part: {
        Args: {
          p_fault_id: string
          p_item_id: string
          p_location_id: string
          p_machine_id: string
          p_notes: string
          p_part_id: string
          p_qty: number
          p_staff_id: string
        }
        Returns: string
      }
      arcade_fnb_manager_blocked: { Args: never; Returns: boolean }
      arcade_is_fec_technician: {
        Args: { p_staff_role: string; p_title: string }
        Returns: boolean
      }
      arcade_is_fnb_manager: {
        Args: { p_department: string; p_title: string }
        Returns: boolean
      }
      arcade_is_operations_lead: {
        Args: { p_department: string; p_title: string }
        Returns: boolean
      }
      arcade_is_supervisor: {
        Args: { p_staff_role: string; p_title: string }
        Returns: boolean
      }
      arcade_next_number: { Args: { p_prefix: string }; Returns: string }
      arcade_text_has_word: {
        Args: { p_text: string; p_word: string }
        Returns: boolean
      }
      arcade_text_is_food_beverage: {
        Args: { p_text: string }
        Returns: boolean
      }
      arcade_transfer_stock: {
        Args: {
          p_from_location_id: string
          p_notes: string
          p_part_id: string
          p_qty: number
          p_to_location_id: string
        }
        Returns: Json
      }
      attendance_listing_punch_days: {
        Args: {
          p_date_from: string
          p_date_to: string
          p_location_id?: string
          p_staff_ids?: string[]
        }
        Returns: {
          attendance_date: string
          location_id: string
          staff_id: string
        }[]
      }
      can_edit_weekly_review: { Args: never; Returns: boolean }
      can_review_staff_suggestions: { Args: never; Returns: boolean }
      can_view_weekly_review: { Args: never; Returns: boolean }
      cancel_shift: {
        Args: { _id: string; _reason?: string }
        Returns: undefined
      }
      chat_apply_membership_sync: {
        Args: { _conversation_id: string; _desired: string[]; _source: string }
        Returns: undefined
      }
      chat_assert_hourly_create_limit: { Args: never; Returns: undefined }
      chat_caller_can_manage_departments: { Args: never; Returns: boolean }
      chat_caller_can_manage_sites: { Args: never; Returns: boolean }
      chat_caller_can_mark_sensitive: { Args: never; Returns: boolean }
      chat_caller_is_privileged: { Args: never; Returns: boolean }
      chat_can_acknowledge: {
        Args: { _conversation_id: string; _message_id: string }
        Returns: boolean
      }
      chat_can_add_poll_option: { Args: { _poll_id: string }; Returns: boolean }
      chat_can_attach: { Args: { _conversation_id: string }; Returns: boolean }
      chat_can_bootstrap_owner: {
        Args: { _conversation_id: string }
        Returns: boolean
      }
      chat_can_call: { Args: { _conversation_id: string }; Returns: boolean }
      chat_can_create_poll: {
        Args: { _conversation_id: string; _message_id: string }
        Returns: boolean
      }
      chat_can_insert_call_participant: {
        Args: { _call_id: string; _user_id: string }
        Returns: boolean
      }
      chat_can_insert_mention: {
        Args: {
          _conversation_id: string
          _mentioned_user_id: string
          _message_id: string
        }
        Returns: boolean
      }
      chat_can_manage_members: {
        Args: { _conversation_id: string }
        Returns: boolean
      }
      chat_can_moderate: {
        Args: { _conversation_id: string }
        Returns: boolean
      }
      chat_can_post: { Args: { _conversation_id: string }; Returns: boolean }
      chat_can_read_message_edit: {
        Args: { _message_id: string }
        Returns: boolean
      }
      chat_can_see_call: { Args: { _call_id: string }; Returns: boolean }
      chat_can_see_poll: { Args: { _poll_id: string }; Returns: boolean }
      chat_can_see_poll_vote: {
        Args: { _poll_id: string; _vote_user_id: string }
        Returns: boolean
      }
      chat_can_update_call: { Args: { _call_id: string }; Returns: boolean }
      chat_can_vote: {
        Args: { _option_id: string; _poll_id: string }
        Returns: boolean
      }
      chat_create_conversation: {
        Args: {
          _archive_at: string
          _call_policy: string
          _department_id: string
          _description: string
          _file_policy: string
          _kind: string
          _location_id: string
          _posting_policy: string
          _retention_policy: string
          _retention_until: string
          _sensitive: boolean
          _title: string
        }
        Returns: string
      }
      chat_department_member_ids: {
        Args: { _department_id: string }
        Returns: string[]
      }
      chat_dm_insert_allowed: {
        Args: {
          _conversation_id: string
          _user_high: string
          _user_low: string
        }
        Returns: boolean
      }
      chat_enable_department_chat: {
        Args: { _department_id: string }
        Returns: string
      }
      chat_enable_site_chat: { Args: { _location_id: string }; Returns: string }
      chat_has_manager_membership: {
        Args: { _conversation_id: string }
        Returns: boolean
      }
      chat_is_active_member: {
        Args: { _conversation_id: string }
        Returns: boolean
      }
      chat_mark_attachment_skipped: {
        Args: { attachment_id: string }
        Returns: undefined
      }
      chat_member_role: { Args: { _conversation_id: string }; Returns: string }
      chat_member_update_allowed: {
        Args: { _conversation_id: string; _row_user_id: string }
        Returns: boolean
      }
      chat_message_owned_by_caller: {
        Args: { _conversation_id: string; _message_id: string }
        Returns: boolean
      }
      chat_message_type_allowed: {
        Args: { _conversation_id: string; _type: string }
        Returns: boolean
      }
      chat_open_direct: { Args: { _other_user_id: string }; Returns: string }
      chat_poll_option_counts: {
        Args: { _poll_ids: string[] }
        Returns: {
          option_id: string
          poll_id: string
          vote_count: number
        }[]
      }
      chat_shares_reporting_manager: {
        Args: { _other_user_id: string }
        Returns: boolean
      }
      chat_site_member_ids: {
        Args: { _location_id: string }
        Returns: string[]
      }
      chat_staff_id_for_user: { Args: { _user_id: string }; Returns: string }
      chat_sync_department: {
        Args: { _department_id: string }
        Returns: undefined
      }
      chat_sync_site: { Args: { _location_id: string }; Returns: undefined }
      chat_user_is_active_member: {
        Args: { _conversation_id: string; _user_id: string }
        Returns: boolean
      }
      chat_visible_message_content: {
        Args: { p_message_id: string }
        Returns: {
          body: string
          metadata: Json
        }[]
      }
      chat_write_audit: {
        Args: {
          _conversation_id: string
          _event_type: string
          _metadata?: Json
        }
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
          _created_at?: string
          _priority: Database["public"]["Enums"]["maintenance_priority"]
        }
        Returns: {
          sla_due_at: string
          sla_response_due_at: string
        }[]
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
          _action_taken?: string
          _category: string
          _detail?: string
          _location_id: string
          _occurred_at: string
          _severity: string
          _summary: string
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
      create_next_weekly_review: { Args: never; Returns: string }
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
      current_user_is_fnb_manager: { Args: never; Returns: boolean }
      current_user_is_site_ot_supervisor: { Args: never; Returns: boolean }
      current_user_role_level: { Args: never; Returns: number }
      decision_vote_summary: { Args: { _decision_id: string }; Returns: Json }
      detect_silent_failures: { Args: never; Returns: number }
      end_downtime: {
        Args: { _id: string; _notes?: string }
        Returns: undefined
      }
      ensure_location_area: {
        Args: { p_location_id: string; p_name: string }
        Returns: string
      }
      ensure_maintenance_category: { Args: { p_name: string }; Returns: string }
      ensure_maintenance_issue_type: {
        Args: { p_name: string }
        Returns: string
      }
      event_document_path_event_id: {
        Args: { _object_name: string }
        Returns: string
      }
      events_capability_allows: {
        Args: { _capability: string }
        Returns: boolean
      }
      generate_delivery_request_number: { Args: never; Returns: string }
      generate_due_pm_work_orders: { Args: never; Returns: number }
      generate_job_request_number: { Args: never; Returns: string }
      generate_leave_request_number: { Args: never; Returns: string }
      generate_maintenance_request_number: { Args: never; Returns: string }
      generate_missed_punch_request_number: { Args: never; Returns: string }
      generate_ot_request_number: { Args: never; Returns: string }
      get_compliance_kpis: { Args: { p_location_id?: string }; Returns: Json }
      get_compliance_renewals: {
        Args: { p_limit?: number; p_location_code?: string }
        Returns: {
          alert_tier: string
          domain: string
          expiry_date: string
          id: string
          item_name: string
          status: string
          venue_scope: string
        }[]
      }
      get_daily_ops_kpis: { Args: { p_location_ids: string[] }; Returns: Json }
      get_dashboard_charts: {
        Args: { p_location_ids: string[]; p_year: number }
        Returns: Json
      }
      get_dashboard_kpis: { Args: { p_location_ids: string[] }; Returns: Json }
      get_e3_tracker_summary: {
        Args: { p_area?: string; p_location?: string }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hr_helpdesk_actor_name: { Args: never; Returns: string }
      hr_helpdesk_can_view: { Args: { p_event_id: string }; Returns: boolean }
      hr_helpdesk_clean_attachment: {
        Args: { p_attachment: Json }
        Returns: Json
      }
      hr_helpdesk_create_request: {
        Args: {
          p_attachment: Json
          p_category: string
          p_staff_id: string
          p_subject: string
        }
        Returns: string
      }
      hr_helpdesk_is_manager: { Args: never; Returns: boolean }
      hr_helpdesk_my_staff_id: { Args: never; Returns: string }
      hr_helpdesk_patch_request: {
        Args: {
          p_assignee: string
          p_category: string
          p_event_id: string
          p_status: string
        }
        Returns: undefined
      }
      hr_helpdesk_read_case: { Args: { p_event_id: string }; Returns: Json }
      hr_helpdesk_reply: {
        Args: {
          p_attachment: Json
          p_body: string
          p_event_id: string
          p_visibility: string
        }
        Returns: string
      }
      hr_helpdesk_set_assignee: {
        Args: { p_assignee: string; p_event_id: string }
        Returns: undefined
      }
      hr_helpdesk_set_confidential: {
        Args: { p_confidential: boolean; p_event_id: string }
        Returns: undefined
      }
      hr_helpdesk_set_status: {
        Args: { p_event_id: string; p_reason: string; p_status: string }
        Returns: undefined
      }
      kpi_rating_for_score: { Args: { _score: number }; Returns: string }
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
      merge_staff_into: {
        Args: { drop_id: string; keep_id: string }
        Returns: undefined
      }
      next_evt_number: { Args: never; Returns: string }
      next_pr_number: { Args: never; Returns: string }
      next_tsk_number: { Args: never; Returns: string }
      pr_insert_notification: {
        Args: {
          _action_url: string
          _body: string
          _location_id: string
          _source_id: string
          _title: string
          _user_id: string
        }
        Returns: string
      }
      read_staff_profile_ext: { Args: { _staff_id: string }; Returns: Json }
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
      resolve_master_department_id:
        | { Args: { token: string }; Returns: string }
        | { Args: { p_audience?: string; token: string }; Returns: string }
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
          action: string
          job_order_number: string
          work_order_id: string
        }[]
      }
      save_complaint_triage: {
        Args: { _id: string; _triage: Json }
        Returns: undefined
      }
      set_staff_photo_bytes: {
        Args: { _mime: string; _photo_base64: string; _staff_id: string }
        Returns: undefined
      }
      spawn_task_instance: {
        Args: { _assigned_to?: string; _due_at?: string; _template_id: string }
        Returns: string
      }
      split_staff_department_tokens: {
        Args: { raw: string }
        Returns: string[]
      }
      staff_has_arcade_technical_at: {
        Args: { _location_id: string }
        Returns: boolean
      }
      staff_row_is_arcade_technical: {
        Args: { p_department: string; p_staff_role: string; p_title: string }
        Returns: boolean
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
      sync_staff_department_display: {
        Args: { p_staff_id: string }
        Returns: undefined
      }
      sys_health_ping: { Args: never; Returns: string }
      sys_schema_inspect: {
        Args: { _tables: string[] }
        Returns: {
          exists: boolean
          table_name: string
        }[]
      }
      toggle_surge_mode: {
        Args: { _enable: boolean; _location_id: string; _reason?: string }
        Returns: undefined
      }
      training_actor_staff_id: { Args: never; Returns: string }
      training_apply_assignment: {
        Args: { _assignment_id: string }
        Returns: number
      }
      training_apply_completion: {
        Args: { _client_completed?: boolean; _enrollment_id: string }
        Returns: undefined
      }
      training_apply_expiry: { Args: never; Returns: Json }
      training_assign_published_retraining: {
        Args: { _course_id: string }
        Returns: number
      }
      training_attendance_blocks_completion: {
        Args: { _enrollment_id: string }
        Returns: boolean
      }
      training_authoritative: { Args: never; Returns: boolean }
      training_can_read_assignment: {
        Args: { _assignment_id: string }
        Returns: boolean
      }
      training_can_read_course: {
        Args: { _course_id: string }
        Returns: boolean
      }
      training_can_read_path: { Args: { _path_id: string }; Returns: boolean }
      training_can_read_version: {
        Args: { _version_id: string }
        Returns: boolean
      }
      training_certificate_queue: {
        Args: { _limit: number; _offset: number }
        Returns: Json
      }
      training_code_allows: { Args: { _capability: string }; Returns: boolean }
      training_dashboard: {
        Args: { _department_id: string; _location_id: string }
        Returns: Json
      }
      training_enroll_refresher: {
        Args: { _certificate_id: string }
        Returns: boolean
      }
      training_execute_saved_rules: {
        Args: {
          _entity_id: string
          _link_types: string[]
          _role_code: string
          _staff_id: string
          _trigger: string
        }
        Returns: Json
      }
      training_grade_answer: {
        Args: {
          _answer: Json
          _correct: Json
          _inner_kind: string
          _kind: string
        }
        Returns: boolean
      }
      training_issue_certificate: {
        Args: { _enrollment_id: string }
        Returns: string
      }
      training_issue_path_certificate: {
        Args: { _path_id: string; _staff_id: string }
        Returns: string
      }
      training_key_is_usable: {
        Args: { _correct: Json; _inner_kind: string; _kind: string }
        Returns: boolean
      }
      training_mark_started: {
        Args: { _enrollment_id: string }
        Returns: string
      }
      training_materialize_certificate: {
        Args: { _enrollment_id: string }
        Returns: string
      }
      training_materialize_path_certificate: {
        Args: { _path_id: string; _staff_id: string }
        Returns: string
      }
      training_materialize_staff_paths: {
        Args: { _staff_id: string }
        Returns: undefined
      }
      training_matrix: {
        Args: {
          _course_id: string
          _department_id: string
          _limit: number
          _location_id: string
          _offset: number
          _role_code: string
          _status: string
        }
        Returns: Json
      }
      training_matrix_cell: {
        Args: {
          _cert_status: string
          _completed_at: string
          _enrollment_id: string
          _today: string
          _valid_until: string
        }
        Returns: string
      }
      training_my_required_flags: {
        Args: never
        Returns: {
          enrollment_id: string
          required: boolean
        }[]
      }
      training_player_event: {
        Args: {
          _delta_seconds: number
          _enrollment_id: string
          _event: string
          _item_checked: boolean
          _item_id: string
          _lesson_id: string
          _position_seconds: number
        }
        Returns: Json
      }
      training_practical_checklist: { Args: { _body: string }; Returns: Json }
      training_practical_grade: {
        Args: {
          _confirmation_name: string
          _confirmed: boolean
          _enrollment_id: string
          _items: Json
          _lesson_id: string
          _notes: string
          _result: string
        }
        Returns: Json
      }
      training_practical_queue: {
        Args: { _limit: number; _offset: number }
        Returns: Json
      }
      training_quiz_public_questions: {
        Args: { _ids: string[]; _option_order: Json }
        Returns: Json
      }
      training_quiz_start: {
        Args: { _enrollment_id: string; _lesson_id: string }
        Returns: Json
      }
      training_quiz_submit: {
        Args: { _answers: Json; _attempt_id: string }
        Returns: Json
      }
      training_requirement_status: {
        Args: { _entity_id: string; _entity_type: string; _staff_id: string }
        Returns: Json
      }
      training_revoke_certificate: {
        Args: { _certificate_id: string; _reason: string }
        Returns: undefined
      }
      training_session_calendar: {
        Args: {
          _course_id: string
          _department_id: string
          _from: string
          _location_id: string
          _to: string
          _trainer_staff_id: string
        }
        Returns: Json
      }
      training_session_create: {
        Args: {
          _capacity: number
          _ends_at: string
          _location_id: string
          _participants: string[]
          _room: string
          _starts_at: string
          _trainer_staff_id: string
          _version_id: string
        }
        Returns: string
      }
      training_session_detail: { Args: { _session_id: string }; Returns: Json }
      training_session_mark_attendance: {
        Args: { _session_id: string; _staff_id: string; _status: string }
        Returns: Json
      }
      training_session_staff_page: {
        Args: { _limit: number; _offset: number; _query: string }
        Returns: Json
      }
      training_session_visible: {
        Args: {
          _location_id: string
          _session_id: string
          _trainer_staff_id: string
        }
        Returns: boolean
      }
      training_try_complete_enrollment: {
        Args: { _enrollment_id: string }
        Returns: boolean
      }
      training_verify_certificate: {
        Args: { _token: string }
        Returns: {
          course_title: string
          holder_name: string
          issued_at: string
          status: string
          valid_until: string
        }[]
      }
      training_write_audit: {
        Args: {
          _action: string
          _after?: Json
          _before?: Json
          _location_id?: string
          _reason?: string
          _row_id?: string
          _table_name: string
        }
        Returns: string
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
      update_complaint_status: {
        Args: {
          _id: string
          _reason?: string
          _status: Database["public"]["Enums"]["complaint_status"]
        }
        Returns: undefined
      }
      update_compliance_document_status: {
        Args: { _id: string; _reason?: string; _status: string }
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
      user_can_access_attendance: {
        Args: { _location_id: string }
        Returns: boolean
      }
      user_can_access_event: { Args: { _event_id: string }; Returns: boolean }
      user_can_access_location: {
        Args: { _location_id: string }
        Returns: boolean
      }
      user_can_access_staff: { Args: { _staff_id: string }; Returns: boolean }
      user_can_import_staff_roster: { Args: never; Returns: boolean }
      user_can_move_arcade_stock: {
        Args: { _from: string; _to: string }
        Returns: boolean
      }
      user_can_open_arcade: { Args: never; Returns: boolean }
      user_can_operate_arcade: {
        Args: { _location_id: string }
        Returns: boolean
      }
      user_can_operate_arcade_row: {
        Args: { _location_id: string }
        Returns: boolean
      }
      user_can_read_arcade: { Args: { _location_id: string }; Returns: boolean }
      user_can_read_event_document_object: {
        Args: { _object_name: string }
        Returns: boolean
      }
      user_can_read_site_sop: {
        Args: { _template_id: string }
        Returns: boolean
      }
      user_can_read_sop_file: { Args: { _name: string }; Returns: boolean }
      user_can_verify_arcade_task: {
        Args: { p_technician_staff_id: string }
        Returns: boolean
      }
      user_can_view_hr_sensitive: { Args: never; Returns: boolean }
      user_can_view_staff_salary: { Args: never; Returns: boolean }
      user_can_write_event_document_object: {
        Args: { _object_name: string }
        Returns: boolean
      }
      user_holds_arcade_operate: { Args: never; Returns: boolean }
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
      executive_report_status: "draft" | "generated" | "published" | "archived"
      finding_severity: "low" | "medium" | "high" | "critical"
      finding_status: "open" | "in_remediation" | "closed" | "accepted_risk"
      forecast_status: "draft" | "published" | "archived"
      incident_status: "reported" | "investigating" | "rca_complete" | "closed"
      leakage_status:
        | "detected"
        | "investigating"
        | "confirmed"
        | "recovered"
        | "dismissed"
      location_status: "active" | "maintenance" | "closed" | "pre_launch"
      maintenance_priority: "normal" | "medium" | "urgent"
      maintenance_report_team: "maintenance" | "logistics"
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
      report_review_priority: "critical" | "high" | "medium" | "low"
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
      weekly_report_status:
        | "draft"
        | "submitted"
        | "under_review"
        | "sent_back"
        | "approved"
        | "included_in_executive"
        | "closed"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
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
      executive_report_status: ["draft", "generated", "published", "archived"],
      finding_severity: ["low", "medium", "high", "critical"],
      finding_status: ["open", "in_remediation", "closed", "accepted_risk"],
      forecast_status: ["draft", "published", "archived"],
      incident_status: ["reported", "investigating", "rca_complete", "closed"],
      leakage_status: [
        "detected",
        "investigating",
        "confirmed",
        "recovered",
        "dismissed",
      ],
      location_status: ["active", "maintenance", "closed", "pre_launch"],
      maintenance_priority: ["normal", "medium", "urgent"],
      maintenance_report_team: ["maintenance", "logistics"],
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
      report_review_priority: ["critical", "high", "medium", "low"],
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
      weekly_report_status: [
        "draft",
        "submitted",
        "under_review",
        "sent_back",
        "approved",
        "included_in_executive",
        "closed",
      ],
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
