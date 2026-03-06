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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_type: string
          created_at: string
          details: Json | null
          id: string
          resource_id: string | null
          resource_type: string | null
          tenant_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_type: string
          created_at?: string
          details?: Json | null
          id?: string
          resource_id?: string | null
          resource_type?: string | null
          tenant_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          details?: Json | null
          id?: string
          resource_id?: string | null
          resource_type?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_memory: {
        Row: {
          category: string
          content: string
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          metadata: Json | null
          priority: number
          source_conversation_id: string | null
          source_message_id: string | null
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          content: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          metadata?: Json | null
          priority?: number
          source_conversation_id?: string | null
          source_message_id?: string | null
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          metadata?: Json | null
          priority?: number
          source_conversation_id?: string | null
          source_message_id?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_memory_source_conversation_id_fkey"
            columns: ["source_conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bot_memory_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bot_memory_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_labels: {
        Row: {
          auto_labeled: boolean | null
          conversation_id: string
          created_at: string
          created_by: string | null
          id: string
          label: string
        }
        Insert: {
          auto_labeled?: boolean | null
          conversation_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
        }
        Update: {
          auto_labeled?: boolean | null
          conversation_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_labels_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assigned_agent_id: string | null
          confidence: number | null
          created_at: string
          end_user_email: string | null
          end_user_name: string | null
          end_user_phone: string | null
          id: string
          intent: string | null
          metadata: Json | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          assigned_agent_id?: string | null
          confidence?: number | null
          created_at?: string
          end_user_email?: string | null
          end_user_name?: string | null
          end_user_phone?: string | null
          id?: string
          intent?: string | null
          metadata?: Json | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          assigned_agent_id?: string | null
          confidence?: number | null
          created_at?: string
          end_user_email?: string | null
          end_user_name?: string | null
          end_user_phone?: string | null
          id?: string
          intent?: string | null
          metadata?: Json | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_definitions: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_definitions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_versions: {
        Row: {
          config: Json
          created_at: string
          flow_id: string
          id: string
          published_at: string | null
          status: string
          version: number
        }
        Insert: {
          config?: Json
          created_at?: string
          flow_id: string
          id?: string
          published_at?: string | null
          status?: string
          version?: number
        }
        Update: {
          config?: Json
          created_at?: string
          flow_id?: string
          id?: string
          published_at?: string | null
          status?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "flow_versions_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flow_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      handoff_events: {
        Row: {
          assigned_to: string | null
          conversation_id: string
          created_at: string
          first_response_at: string | null
          id: string
          priority: string
          reason: string
          resolved_at: string | null
          sla_deadline_at: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          assigned_to?: string | null
          conversation_id: string
          created_at?: string
          first_response_at?: string | null
          id?: string
          priority?: string
          reason: string
          resolved_at?: string | null
          sla_deadline_at?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          assigned_to?: string | null
          conversation_id?: string
          created_at?: string
          first_response_at?: string | null
          id?: string
          priority?: string
          reason?: string
          resolved_at?: string | null
          sla_deadline_at?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "handoff_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handoff_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          embedding: string | null
          id: string
          metadata: Json | null
          tenant_id: string
        }
        Insert: {
          chunk_index?: number
          content: string
          created_at?: string
          document_id: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
          tenant_id: string
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kb_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "kb_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kb_chunks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_documents: {
        Row: {
          chunk_count: number | null
          created_at: string
          file_url: string | null
          id: string
          metadata: Json | null
          name: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          chunk_count?: number | null
          created_at?: string
          file_url?: string | null
          id?: string
          metadata?: Json | null
          name: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          chunk_count?: number | null
          created_at?: string
          file_url?: string | null
          id?: string
          metadata?: Json | null
          name?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kb_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_health_events: {
        Row: {
          created_at: string
          details: Json
          event_type: string
          id: string
          tenant_id: string
          tenant_mcp_binding_id: string
        }
        Insert: {
          created_at?: string
          details?: Json
          event_type: string
          id?: string
          tenant_id: string
          tenant_mcp_binding_id: string
        }
        Update: {
          created_at?: string
          details?: Json
          event_type?: string
          id?: string
          tenant_id?: string
          tenant_mcp_binding_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_health_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcp_health_events_tenant_mcp_binding_id_fkey"
            columns: ["tenant_mcp_binding_id"]
            isOneToOne: false
            referencedRelation: "tenant_mcp_bindings"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_runtime_state: {
        Row: {
          circuit_open_until: string | null
          circuit_state: string
          failure_count: number
          id: string
          last_error: string | null
          last_failure_at: string | null
          last_health_status: string | null
          last_healthcheck_at: string | null
          last_success_at: string | null
          tenant_id: string
          tenant_mcp_binding_id: string
          updated_at: string
        }
        Insert: {
          circuit_open_until?: string | null
          circuit_state?: string
          failure_count?: number
          id?: string
          last_error?: string | null
          last_failure_at?: string | null
          last_health_status?: string | null
          last_healthcheck_at?: string | null
          last_success_at?: string | null
          tenant_id: string
          tenant_mcp_binding_id: string
          updated_at?: string
        }
        Update: {
          circuit_open_until?: string | null
          circuit_state?: string
          failure_count?: number
          id?: string
          last_error?: string | null
          last_failure_at?: string | null
          last_health_status?: string | null
          last_healthcheck_at?: string | null
          last_success_at?: string | null
          tenant_id?: string
          tenant_mcp_binding_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_runtime_state_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcp_runtime_state_tenant_mcp_binding_id_fkey"
            columns: ["tenant_mcp_binding_id"]
            isOneToOne: false
            referencedRelation: "tenant_mcp_bindings"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_servers: {
        Row: {
          auth_type: string
          created_at: string
          endpoint: string
          healthcheck_path: string | null
          id: string
          metadata: Json
          name: string
          server_key: string
          status: string
          transport: string
          updated_at: string
        }
        Insert: {
          auth_type?: string
          created_at?: string
          endpoint: string
          healthcheck_path?: string | null
          id?: string
          metadata?: Json
          name: string
          server_key: string
          status?: string
          transport?: string
          updated_at?: string
        }
        Update: {
          auth_type?: string
          created_at?: string
          endpoint?: string
          healthcheck_path?: string | null
          id?: string
          metadata?: Json
          name?: string
          server_key?: string
          status?: string
          transport?: string
          updated_at?: string
        }
        Relationships: []
      }
      mcp_tool_policies: {
        Row: {
          config: Json
          created_at: string
          enabled: boolean
          id: string
          max_calls_per_minute: number | null
          pii_scope: string
          required_roles: Json
          tenant_id: string
          tenant_mcp_binding_id: string | null
          tool_id: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          max_calls_per_minute?: number | null
          pii_scope?: string
          required_roles?: Json
          tenant_id: string
          tenant_mcp_binding_id?: string | null
          tool_id: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          max_calls_per_minute?: number | null
          pii_scope?: string
          required_roles?: Json
          tenant_id?: string
          tenant_mcp_binding_id?: string | null
          tool_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_tool_policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcp_tool_policies_tenant_mcp_binding_id_fkey"
            columns: ["tenant_mcp_binding_id"]
            isOneToOne: false
            referencedRelation: "tenant_mcp_bindings"
            referencedColumns: ["id"]
          },
        ]
      }
      memory_access_logs: {
        Row: {
          action: string
          conversation_id: string | null
          created_at: string
          id: string
          memory_item_id: string | null
          relevance_score: number | null
          tenant_id: string
          user_ref: string | null
        }
        Insert: {
          action?: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          memory_item_id?: string | null
          relevance_score?: number | null
          tenant_id: string
          user_ref?: string | null
        }
        Update: {
          action?: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          memory_item_id?: string | null
          relevance_score?: number | null
          tenant_id?: string
          user_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memory_access_logs_memory_item_id_fkey"
            columns: ["memory_item_id"]
            isOneToOne: false
            referencedRelation: "memory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memory_access_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      memory_items: {
        Row: {
          confidence: number
          content: string
          created_at: string
          id: string
          importance: number
          last_seen_at: string | null
          memory_key: string
          memory_type: string
          risk_level: string
          source_conversation_id: string | null
          source_message_id: string | null
          status: string
          tenant_id: string
          updated_at: string
          user_ref: string | null
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          confidence?: number
          content: string
          created_at?: string
          id?: string
          importance?: number
          last_seen_at?: string | null
          memory_key: string
          memory_type?: string
          risk_level?: string
          source_conversation_id?: string | null
          source_message_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          user_ref?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          confidence?: number
          content?: string
          created_at?: string
          id?: string
          importance?: number
          last_seen_at?: string | null
          memory_key?: string
          memory_type?: string
          risk_level?: string
          source_conversation_id?: string | null
          source_message_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          user_ref?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memory_items_source_conversation_id_fkey"
            columns: ["source_conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memory_items_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memory_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          confidence: number | null
          content: string
          conversation_id: string
          created_at: string
          id: string
          metadata: Json | null
          role: string
          sources: Json | null
          tool_latency_ms: number | null
          tool_used: string | null
        }
        Insert: {
          confidence?: number | null
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role: string
          sources?: Json | null
          tool_latency_ms?: number | null
          tool_used?: string | null
        }
        Update: {
          confidence?: number | null
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role?: string
          sources?: Json | null
          tool_latency_ms?: number | null
          tool_used?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          resource_id: string | null
          resource_type: string | null
          tenant_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          resource_id?: string | null
          resource_type?: string | null
          tenant_id?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          resource_id?: string | null
          resource_type?: string | null
          tenant_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      skills_registry: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          manifest: Json
          name: string
          skill_id: string
          status: string
          updated_at: string
          version: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          manifest?: Json
          name: string
          skill_id: string
          status?: string
          updated_at?: string
          version?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          manifest?: Json
          name?: string
          skill_id?: string
          status?: string
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      tenant_bootstrap_runs: {
        Row: {
          created_at: string
          error_message: string | null
          finished_at: string | null
          id: string
          mode: string
          request: Json | null
          result: Json | null
          started_at: string
          status: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          mode?: string
          request?: Json | null
          result?: Json | null
          started_at?: string
          status?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          mode?: string
          request?: Json | null
          result?: Json | null
          started_at?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_bootstrap_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_configs: {
        Row: {
          api_key: string | null
          confidence_threshold: number | null
          created_at: string
          id: string
          max_tokens: number | null
          max_tool_retries: number | null
          notification_email: string | null
          pii_masking: boolean | null
          prompt_injection_defense: boolean | null
          provider_api_key: string | null
          provider_endpoint: string | null
          provider_model: string | null
          sla_resolution_minutes: number | null
          sla_response_minutes: number | null
          system_prompt: string | null
          temperature: number | null
          tenant_id: string
          updated_at: string
          webhook_url: string | null
          widget_auto_open: boolean | null
          widget_auto_open_delay: number | null
          widget_collect_email: boolean | null
          widget_collect_name: boolean | null
          widget_collect_phone: boolean | null
          widget_collect_role: boolean | null
          widget_placeholder: string | null
          widget_position: string | null
          widget_primary_color: string | null
          widget_role_options: Json | null
          widget_show_powered_by: boolean | null
          widget_subtitle: string | null
          widget_title: string | null
          widget_welcome_message: string | null
        }
        Insert: {
          api_key?: string | null
          confidence_threshold?: number | null
          created_at?: string
          id?: string
          max_tokens?: number | null
          max_tool_retries?: number | null
          notification_email?: string | null
          pii_masking?: boolean | null
          prompt_injection_defense?: boolean | null
          provider_api_key?: string | null
          provider_endpoint?: string | null
          provider_model?: string | null
          sla_resolution_minutes?: number | null
          sla_response_minutes?: number | null
          system_prompt?: string | null
          temperature?: number | null
          tenant_id: string
          updated_at?: string
          webhook_url?: string | null
          widget_auto_open?: boolean | null
          widget_auto_open_delay?: number | null
          widget_collect_email?: boolean | null
          widget_collect_name?: boolean | null
          widget_collect_phone?: boolean | null
          widget_collect_role?: boolean | null
          widget_placeholder?: string | null
          widget_position?: string | null
          widget_primary_color?: string | null
          widget_role_options?: Json | null
          widget_show_powered_by?: boolean | null
          widget_subtitle?: string | null
          widget_title?: string | null
          widget_welcome_message?: string | null
        }
        Update: {
          api_key?: string | null
          confidence_threshold?: number | null
          created_at?: string
          id?: string
          max_tokens?: number | null
          max_tool_retries?: number | null
          notification_email?: string | null
          pii_masking?: boolean | null
          prompt_injection_defense?: boolean | null
          provider_api_key?: string | null
          provider_endpoint?: string | null
          provider_model?: string | null
          sla_resolution_minutes?: number | null
          sla_response_minutes?: number | null
          system_prompt?: string | null
          temperature?: number | null
          tenant_id?: string
          updated_at?: string
          webhook_url?: string | null
          widget_auto_open?: boolean | null
          widget_auto_open_delay?: number | null
          widget_collect_email?: boolean | null
          widget_collect_name?: boolean | null
          widget_collect_phone?: boolean | null
          widget_collect_role?: boolean | null
          widget_placeholder?: string | null
          widget_position?: string | null
          widget_primary_color?: string | null
          widget_role_options?: Json | null
          widget_show_powered_by?: boolean | null
          widget_subtitle?: string | null
          widget_title?: string | null
          widget_welcome_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_mcp_bindings: {
        Row: {
          circuit_breaker_threshold: number
          config: Json
          created_at: string
          enabled: boolean
          id: string
          mcp_server_id: string
          priority: number
          retry_max: number
          tenant_id: string
          timeout_ms: number
          updated_at: string
        }
        Insert: {
          circuit_breaker_threshold?: number
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          mcp_server_id: string
          priority?: number
          retry_max?: number
          tenant_id: string
          timeout_ms?: number
          updated_at?: string
        }
        Update: {
          circuit_breaker_threshold?: number
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          mcp_server_id?: string
          priority?: number
          retry_max?: number
          tenant_id?: string
          timeout_ms?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_mcp_bindings_mcp_server_id_fkey"
            columns: ["mcp_server_id"]
            isOneToOne: false
            referencedRelation: "mcp_servers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_mcp_bindings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_skill_bindings: {
        Row: {
          config: Json
          created_at: string
          id: string
          pinned_version: string | null
          skill_registry_id: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          pinned_version?: string | null
          skill_registry_id: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          pinned_version?: string | null
          skill_registry_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_skill_bindings_skill_registry_id_fkey"
            columns: ["skill_registry_id"]
            isOneToOne: false
            referencedRelation: "skills_registry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_skill_bindings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          domain: string | null
          id: string
          name: string
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          domain?: string | null
          id?: string
          name: string
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          domain?: string | null
          id?: string
          name?: string
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      tool_call_logs: {
        Row: {
          conversation_id: string | null
          created_at: string
          error_message: string | null
          id: string
          input: Json | null
          latency_ms: number | null
          output: Json | null
          status: string
          tenant_id: string
          tool_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          input?: Json | null
          latency_ms?: number | null
          output?: Json | null
          status: string
          tenant_id: string
          tool_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          input?: Json | null
          latency_ms?: number | null
          output?: Json | null
          status?: string
          tenant_id?: string
          tool_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_call_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_call_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_definitions: {
        Row: {
          created_at: string
          description: string | null
          enabled: boolean | null
          endpoint: string
          id: string
          input_schema: Json | null
          name: string
          required_roles: Database["public"]["Enums"]["app_role"][] | null
          tenant_id: string
          tool_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled?: boolean | null
          endpoint: string
          id?: string
          input_schema?: Json | null
          name: string
          required_roles?: Database["public"]["Enums"]["app_role"][] | null
          tenant_id: string
          tool_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean | null
          endpoint?: string
          id?: string
          input_schema?: Json | null
          name?: string
          required_roles?: Database["public"]["Enums"]["app_role"][] | null
          tenant_id?: string
          tool_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_definitions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
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
          _tenant_id: string
          _user_id: string
        }
        Returns: boolean
      }
      is_system_admin: { Args: { _user_id: string }; Returns: boolean }
      is_tenant_member: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      match_kb_chunks: {
        Args: {
          _match_count?: number
          _match_threshold?: number
          _query_embedding: string
          _tenant_id: string
        }
        Returns: {
          chunk_index: number
          content: string
          document_id: string
          id: string
          similarity: number
        }[]
      }
    }
    Enums: {
      app_role:
        | "system_admin"
        | "tenant_admin"
        | "support_lead"
        | "support_agent"
        | "end_user"
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
      app_role: [
        "system_admin",
        "tenant_admin",
        "support_lead",
        "support_agent",
        "end_user",
      ],
    },
  },
} as const
