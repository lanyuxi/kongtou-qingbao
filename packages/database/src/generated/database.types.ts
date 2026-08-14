export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      ai_runs: {
        Row: {
          created_at: string
          error_detail: string | null
          id: string
          input_hash: string
          input_id: string
          input_kind: string
          latency_ms: number | null
          model_id: string
          output: Json | null
          pipeline_version: string
          prompt_version: string
          schema_version: string
          stage: string
          status: string
          usage: Json | null
        }
        Insert: {
          created_at?: string
          error_detail?: string | null
          id?: string
          input_hash: string
          input_id: string
          input_kind: string
          latency_ms?: number | null
          model_id: string
          output?: Json | null
          pipeline_version: string
          prompt_version: string
          schema_version: string
          stage: string
          status: string
          usage?: Json | null
        }
        Update: {
          created_at?: string
          error_detail?: string | null
          id?: string
          input_hash?: string
          input_id?: string
          input_kind?: string
          latency_ms?: number | null
          model_id?: string
          output?: Json | null
          pipeline_version?: string
          prompt_version?: string
          schema_version?: string
          stage?: string
          status?: string
          usage?: Json | null
        }
        Relationships: []
      }
      collection_attempts: {
        Row: {
          body_fetch_count: number
          collected_at: string
          completed_at: string
          created_at: string
          decompressed_bytes: number | null
          discovered_count: number
          error_code: string | null
          error_detail: string | null
          etag: string | null
          final_url: string | null
          http_status: number | null
          id: string
          idempotency_key: string
          last_modified: string | null
          media_type: string | null
          outcome: Database["public"]["Enums"]["collection_outcome"]
          parent_discovered_item_id: string | null
          project_id: string
          raw_item_id: string | null
          redirect_chain: Json
          requested_url: string
          source_id: string
          started_at: string
        }
        Insert: {
          body_fetch_count?: number
          collected_at: string
          completed_at: string
          created_at?: string
          decompressed_bytes?: number | null
          discovered_count?: number
          error_code?: string | null
          error_detail?: string | null
          etag?: string | null
          final_url?: string | null
          http_status?: number | null
          id: string
          idempotency_key: string
          last_modified?: string | null
          media_type?: string | null
          outcome: Database["public"]["Enums"]["collection_outcome"]
          parent_discovered_item_id?: string | null
          project_id: string
          raw_item_id?: string | null
          redirect_chain?: Json
          requested_url: string
          source_id: string
          started_at: string
        }
        Update: {
          body_fetch_count?: number
          collected_at?: string
          completed_at?: string
          created_at?: string
          decompressed_bytes?: number | null
          discovered_count?: number
          error_code?: string | null
          error_detail?: string | null
          etag?: string | null
          final_url?: string | null
          http_status?: number | null
          id?: string
          idempotency_key?: string
          last_modified?: string | null
          media_type?: string | null
          outcome?: Database["public"]["Enums"]["collection_outcome"]
          parent_discovered_item_id?: string | null
          project_id?: string
          raw_item_id?: string | null
          redirect_chain?: Json
          requested_url?: string
          source_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_attempts_parent_identity_fkey"
            columns: ["parent_discovered_item_id", "project_id", "source_id"]
            isOneToOne: false
            referencedRelation: "discovered_items"
            referencedColumns: ["id", "project_id", "source_id"]
          },
          {
            foreignKeyName: "collection_attempts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "opportunity_list"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "collection_attempts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_current_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "collection_attempts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_attempts_raw_item_identity_fkey"
            columns: ["raw_item_id", "project_id", "source_id"]
            isOneToOne: false
            referencedRelation: "raw_items"
            referencedColumns: ["id", "project_id", "source_id"]
          },
          {
            foreignKeyName: "collection_attempts_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      discovered_items: {
        Row: {
          article_collection_attempt_id: string | null
          article_raw_item_id: string | null
          author: string | null
          created_at: string
          disposition: Database["public"]["Enums"]["discovery_disposition"]
          entry_url: string | null
          external_entry_id: string | null
          feed_raw_item_id: string
          id: string
          is_authority_domain: boolean
          project_id: string
          published_at: string | null
          source_id: string
          stable_entry_key: string
          summary: string | null
          supersedes_discovered_item_id: string | null
          title: string | null
          updated_at: string | null
          version: number
        }
        Insert: {
          article_collection_attempt_id?: string | null
          article_raw_item_id?: string | null
          author?: string | null
          created_at?: string
          disposition: Database["public"]["Enums"]["discovery_disposition"]
          entry_url?: string | null
          external_entry_id?: string | null
          feed_raw_item_id: string
          id: string
          is_authority_domain: boolean
          project_id: string
          published_at?: string | null
          source_id: string
          stable_entry_key: string
          summary?: string | null
          supersedes_discovered_item_id?: string | null
          title?: string | null
          updated_at?: string | null
          version: number
        }
        Update: {
          article_collection_attempt_id?: string | null
          article_raw_item_id?: string | null
          author?: string | null
          created_at?: string
          disposition?: Database["public"]["Enums"]["discovery_disposition"]
          entry_url?: string | null
          external_entry_id?: string | null
          feed_raw_item_id?: string
          id?: string
          is_authority_domain?: boolean
          project_id?: string
          published_at?: string | null
          source_id?: string
          stable_entry_key?: string
          summary?: string | null
          supersedes_discovered_item_id?: string | null
          title?: string | null
          updated_at?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "discovered_items_article_attempt_identity_fkey"
            columns: [
              "article_collection_attempt_id",
              "project_id",
              "source_id",
            ]
            isOneToOne: false
            referencedRelation: "collection_attempts"
            referencedColumns: ["id", "project_id", "source_id"]
          },
          {
            foreignKeyName: "discovered_items_article_raw_identity_fkey"
            columns: ["article_raw_item_id", "project_id", "source_id"]
            isOneToOne: false
            referencedRelation: "raw_items"
            referencedColumns: ["id", "project_id", "source_id"]
          },
          {
            foreignKeyName: "discovered_items_feed_raw_identity_fkey"
            columns: ["feed_raw_item_id", "project_id", "source_id"]
            isOneToOne: false
            referencedRelation: "raw_items"
            referencedColumns: ["id", "project_id", "source_id"]
          },
          {
            foreignKeyName: "discovered_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "opportunity_list"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "discovered_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_current_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "discovered_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discovered_items_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discovered_items_supersedes_identity_fkey"
            columns: [
              "supersedes_discovered_item_id",
              "project_id",
              "source_id",
              "stable_entry_key",
            ]
            isOneToOne: false
            referencedRelation: "discovered_items"
            referencedColumns: [
              "id",
              "project_id",
              "source_id",
              "stable_entry_key",
            ]
          },
        ]
      }
      durable_job_events: {
        Row: {
          detail: string | null
          event_type: Database["public"]["Enums"]["durable_job_event_type"]
          execution_attempt: number | null
          id: string
          job_id: string
          job_state: Database["public"]["Enums"]["durable_job_state"]
          job_version: number
          lease_epoch: number | null
          occurred_at: string
          result_code: string | null
          worker_id: string | null
        }
        Insert: {
          detail?: string | null
          event_type: Database["public"]["Enums"]["durable_job_event_type"]
          execution_attempt?: number | null
          id?: string
          job_id: string
          job_state: Database["public"]["Enums"]["durable_job_state"]
          job_version: number
          lease_epoch?: number | null
          occurred_at: string
          result_code?: string | null
          worker_id?: string | null
        }
        Update: {
          detail?: string | null
          event_type?: Database["public"]["Enums"]["durable_job_event_type"]
          execution_attempt?: number | null
          id?: string
          job_id?: string
          job_state?: Database["public"]["Enums"]["durable_job_state"]
          job_version?: number
          lease_epoch?: number | null
          occurred_at?: string
          result_code?: string | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "durable_job_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "durable_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      durable_jobs: {
        Row: {
          available_at: string
          collection_rule_version: string
          completed_at: string | null
          contract_version: number
          created_at: string
          delivery_count: number
          execution_attempt: number
          id: string
          idempotency_key: string
          job_type: string
          last_error_detail: string | null
          last_result_code: string | null
          lease_epoch: number
          lease_expires_at: string | null
          lease_owner: string | null
          max_attempts: number
          payload: Json
          payload_hash: string
          project_id: string
          schedule_id: string
          schedule_version: number
          scheduled_for: string
          source_id: string
          state: Database["public"]["Enums"]["durable_job_state"]
          trigger: Database["public"]["Enums"]["collection_job_trigger"]
          updated_at: string
          version: number
        }
        Insert: {
          available_at: string
          collection_rule_version?: string
          completed_at?: string | null
          contract_version?: number
          created_at?: string
          delivery_count?: number
          execution_attempt?: number
          id?: string
          idempotency_key: string
          job_type?: string
          last_error_detail?: string | null
          last_result_code?: string | null
          lease_epoch?: number
          lease_expires_at?: string | null
          lease_owner?: string | null
          max_attempts?: number
          payload: Json
          payload_hash: string
          project_id: string
          schedule_id: string
          schedule_version: number
          scheduled_for: string
          source_id: string
          state?: Database["public"]["Enums"]["durable_job_state"]
          trigger: Database["public"]["Enums"]["collection_job_trigger"]
          updated_at?: string
          version?: number
        }
        Update: {
          available_at?: string
          collection_rule_version?: string
          completed_at?: string | null
          contract_version?: number
          created_at?: string
          delivery_count?: number
          execution_attempt?: number
          id?: string
          idempotency_key?: string
          job_type?: string
          last_error_detail?: string | null
          last_result_code?: string | null
          lease_epoch?: number
          lease_expires_at?: string | null
          lease_owner?: string | null
          max_attempts?: number
          payload?: Json
          payload_hash?: string
          project_id?: string
          schedule_id?: string
          schedule_version?: number
          scheduled_for?: string
          source_id?: string
          state?: Database["public"]["Enums"]["durable_job_state"]
          trigger?: Database["public"]["Enums"]["collection_job_trigger"]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "durable_jobs_schedule_identity_fkey"
            columns: ["schedule_id", "project_id", "source_id"]
            isOneToOne: false
            referencedRelation: "source_collection_schedules"
            referencedColumns: ["id", "project_id", "source_id"]
          },
        ]
      }
      extraction_candidates: {
        Row: {
          ai_run_id: string
          created_at: string
          decided_at: string | null
          discovered_item_id: string
          id: string
          payload: Json
          payload_sha256: string
          project_id: string
          raw_item_id: string | null
          signal_id: string | null
          source_id: string
          status: string
        }
        Insert: {
          ai_run_id: string
          created_at?: string
          decided_at?: string | null
          discovered_item_id: string
          id?: string
          payload: Json
          payload_sha256: string
          project_id: string
          raw_item_id?: string | null
          signal_id?: string | null
          source_id: string
          status?: string
        }
        Update: {
          ai_run_id?: string
          created_at?: string
          decided_at?: string | null
          discovered_item_id?: string
          id?: string
          payload?: Json
          payload_sha256?: string
          project_id?: string
          raw_item_id?: string | null
          signal_id?: string | null
          source_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "extraction_candidates_ai_run_fkey"
            columns: ["ai_run_id"]
            isOneToOne: false
            referencedRelation: "ai_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extraction_candidates_discovered_item_fkey"
            columns: ["discovered_item_id"]
            isOneToOne: false
            referencedRelation: "discovered_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extraction_candidates_project_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "opportunity_list"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "extraction_candidates_project_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_current_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "extraction_candidates_project_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extraction_candidates_raw_item_fkey"
            columns: ["raw_item_id"]
            isOneToOne: false
            referencedRelation: "raw_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extraction_candidates_signal_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extraction_candidates_source_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
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
          timezone: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_scores: {
        Row: {
          calculated_at: string
          confidence: number
          created_at: string
          explanation: string
          id: string
          input_version: string
          model_version: string
          opportunity_score: number
          project_id: string
          recommendation: Database["public"]["Enums"]["recommendation"]
          risk_score: number
        }
        Insert: {
          calculated_at: string
          confidence: number
          created_at?: string
          explanation: string
          id?: string
          input_version: string
          model_version: string
          opportunity_score: number
          project_id: string
          recommendation: Database["public"]["Enums"]["recommendation"]
          risk_score: number
        }
        Update: {
          calculated_at?: string
          confidence?: number
          created_at?: string
          explanation?: string
          id?: string
          input_version?: string
          model_version?: string
          opportunity_score?: number
          project_id?: string
          recommendation?: Database["public"]["Enums"]["recommendation"]
          risk_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_scores_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "opportunity_list"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_scores_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_current_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_scores_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_sources: {
        Row: {
          authority_domains: string[]
          created_at: string
          is_official: boolean
          project_id: string
          source_id: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          authority_domains?: string[]
          created_at?: string
          is_official?: boolean
          project_id: string
          source_id: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          authority_domains?: string[]
          created_at?: string
          is_official?: boolean
          project_id?: string
          source_id?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_sources_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "opportunity_list"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_sources_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_current_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_sources_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_sources_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_sources_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          id: string
          lifecycle: Database["public"]["Enums"]["project_lifecycle"]
          name: string
          official_website_url: string | null
          primary_chain: string | null
          slug: string
          summary: string | null
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          lifecycle?: Database["public"]["Enums"]["project_lifecycle"]
          name: string
          official_website_url?: string | null
          primary_chain?: string | null
          slug: string
          summary?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          lifecycle?: Database["public"]["Enums"]["project_lifecycle"]
          name?: string
          official_website_url?: string | null
          primary_chain?: string | null
          slug?: string
          summary?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      promotion_events: {
        Row: {
          actor: string
          candidate_id: string
          created_at: string
          id: string
          signal_id: string
        }
        Insert: {
          actor: string
          candidate_id: string
          created_at?: string
          id?: string
          signal_id: string
        }
        Update: {
          actor?: string
          candidate_id?: string
          created_at?: string
          id?: string
          signal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotion_events_candidate_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "extraction_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_events_signal_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_items: {
        Row: {
          collected_at: string
          content_kind: Database["public"]["Enums"]["collection_content_kind"]
          created_at: string
          final_url: string
          id: string
          logical_url: string
          media_type: string
          parent_discovered_item_id: string | null
          project_id: string
          published_at: string | null
          raw_text: string
          sha256: string
          source_id: string
        }
        Insert: {
          collected_at: string
          content_kind: Database["public"]["Enums"]["collection_content_kind"]
          created_at?: string
          final_url: string
          id: string
          logical_url: string
          media_type: string
          parent_discovered_item_id?: string | null
          project_id: string
          published_at?: string | null
          raw_text: string
          sha256: string
          source_id: string
        }
        Update: {
          collected_at?: string
          content_kind?: Database["public"]["Enums"]["collection_content_kind"]
          created_at?: string
          final_url?: string
          id?: string
          logical_url?: string
          media_type?: string
          parent_discovered_item_id?: string | null
          project_id?: string
          published_at?: string | null
          raw_text?: string
          sha256?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "raw_items_parent_identity_fkey"
            columns: ["parent_discovered_item_id", "project_id", "source_id"]
            isOneToOne: false
            referencedRelation: "discovered_items"
            referencedColumns: ["id", "project_id", "source_id"]
          },
          {
            foreignKeyName: "raw_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "opportunity_list"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "raw_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_current_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "raw_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_items_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      signals: {
        Row: {
          confidence: number
          created_at: string
          expires_at: string | null
          id: string
          lifecycle: Database["public"]["Enums"]["signal_lifecycle"]
          occurred_at: string | null
          project_id: string
          published_at: string | null
          signal_type: string
          summary: string
          supersedes_signal_id: string | null
          title: string
          verification: Database["public"]["Enums"]["signal_verification"]
        }
        Insert: {
          confidence: number
          created_at?: string
          expires_at?: string | null
          id?: string
          lifecycle?: Database["public"]["Enums"]["signal_lifecycle"]
          occurred_at?: string | null
          project_id: string
          published_at?: string | null
          signal_type: string
          summary: string
          supersedes_signal_id?: string | null
          title: string
          verification?: Database["public"]["Enums"]["signal_verification"]
        }
        Update: {
          confidence?: number
          created_at?: string
          expires_at?: string | null
          id?: string
          lifecycle?: Database["public"]["Enums"]["signal_lifecycle"]
          occurred_at?: string | null
          project_id?: string
          published_at?: string | null
          signal_type?: string
          summary?: string
          supersedes_signal_id?: string | null
          title?: string
          verification?: Database["public"]["Enums"]["signal_verification"]
        }
        Relationships: [
          {
            foreignKeyName: "signals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "opportunity_list"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "signals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_current_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "signals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signals_supersedes_signal_same_project_fkey"
            columns: ["project_id", "supersedes_signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["project_id", "id"]
          },
        ]
      }
      source_collection_schedules: {
        Row: {
          created_at: string
          enabled: boolean
          enablement_origin: Database["public"]["Enums"]["source_schedule_origin"]
          id: string
          interval_seconds: number
          last_enqueued_at: string | null
          next_run_at: string
          project_id: string
          source_id: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          enablement_origin?: Database["public"]["Enums"]["source_schedule_origin"]
          id?: string
          interval_seconds?: number
          last_enqueued_at?: string | null
          next_run_at: string
          project_id: string
          source_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          enabled?: boolean
          enablement_origin?: Database["public"]["Enums"]["source_schedule_origin"]
          id?: string
          interval_seconds?: number
          last_enqueued_at?: string | null
          next_run_at?: string
          project_id?: string
          source_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "source_collection_schedules_project_source_fkey"
            columns: ["project_id", "source_id"]
            isOneToOne: true
            referencedRelation: "project_sources"
            referencedColumns: ["project_id", "source_id"]
          },
        ]
      }
      source_schedule_commands: {
        Row: {
          actor_id: string
          command_type: Database["public"]["Enums"]["source_schedule_command_type"]
          created_at: string
          expected_version: number
          id: string
          idempotency_key: string
          input_hash: string
          job_id: string | null
          result_enabled: boolean
          result_interval_seconds: number
          result_next_run_at: string
          resulting_version: number
          schedule_id: string
        }
        Insert: {
          actor_id: string
          command_type: Database["public"]["Enums"]["source_schedule_command_type"]
          created_at?: string
          expected_version: number
          id?: string
          idempotency_key: string
          input_hash: string
          job_id?: string | null
          result_enabled: boolean
          result_interval_seconds: number
          result_next_run_at: string
          resulting_version: number
          schedule_id: string
        }
        Update: {
          actor_id?: string
          command_type?: Database["public"]["Enums"]["source_schedule_command_type"]
          created_at?: string
          expected_version?: number
          id?: string
          idempotency_key?: string
          input_hash?: string
          job_id?: string | null
          result_enabled?: boolean
          result_interval_seconds?: number
          result_next_run_at?: string
          resulting_version?: number
          schedule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_schedule_commands_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_schedule_commands_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "durable_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_schedule_commands_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "source_collection_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      source_schedule_events: {
        Row: {
          actor_id: string | null
          command_id: string | null
          event_type: Database["public"]["Enums"]["source_schedule_event_type"]
          id: string
          occurred_at: string
          schedule_id: string
          schedule_version: number
        }
        Insert: {
          actor_id?: string | null
          command_id?: string | null
          event_type: Database["public"]["Enums"]["source_schedule_event_type"]
          id?: string
          occurred_at: string
          schedule_id: string
          schedule_version: number
        }
        Update: {
          actor_id?: string | null
          command_id?: string | null
          event_type?: Database["public"]["Enums"]["source_schedule_event_type"]
          id?: string
          occurred_at?: string
          schedule_id?: string
          schedule_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "source_schedule_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_schedule_events_command_id_fkey"
            columns: ["command_id"]
            isOneToOne: false
            referencedRelation: "source_schedule_commands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_schedule_events_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "source_collection_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          canonical_url: string
          created_at: string
          id: string
          name: string
          reputation_score: number
          source_type: Database["public"]["Enums"]["source_type"]
          status: Database["public"]["Enums"]["source_status"]
          updated_at: string
        }
        Insert: {
          canonical_url: string
          created_at?: string
          id?: string
          name: string
          reputation_score?: number
          source_type: Database["public"]["Enums"]["source_type"]
          status?: Database["public"]["Enums"]["source_status"]
          updated_at?: string
        }
        Update: {
          canonical_url?: string
          created_at?: string
          id?: string
          name?: string
          reputation_score?: number
          source_type?: Database["public"]["Enums"]["source_type"]
          status?: Database["public"]["Enums"]["source_status"]
          updated_at?: string
        }
        Relationships: []
      }
      user_projects: {
        Row: {
          notes: string | null
          participation_status: Database["public"]["Enums"]["participation_status"]
          project_id: string
          started_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          notes?: string | null
          participation_status?: Database["public"]["Enums"]["participation_status"]
          project_id: string
          started_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          notes?: string | null
          participation_status?: Database["public"]["Enums"]["participation_status"]
          project_id?: string
          started_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "opportunity_list"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "user_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_current_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "user_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_projects_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          granted_at: string
          granted_by: string | null
          revoked_at: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          revoked_at?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          due_at: string | null
          id: string
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "opportunity_list"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "user_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_current_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "user_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_tasks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlist_projects: {
        Row: {
          added_at: string
          project_id: string
          watchlist_id: string
        }
        Insert: {
          added_at?: string
          project_id: string
          watchlist_id: string
        }
        Update: {
          added_at?: string
          project_id?: string
          watchlist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "opportunity_list"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "watchlist_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_current_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "watchlist_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watchlist_projects_watchlist_id_fkey"
            columns: ["watchlist_id"]
            isOneToOne: false
            referencedRelation: "watchlists"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlists: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlists_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      opportunity_list: {
        Row: {
          calculated_at: string | null
          confidence: number | null
          latest_published_signal_at: string | null
          lifecycle: Database["public"]["Enums"]["project_lifecycle"] | null
          name: string | null
          opportunity_score: number | null
          primary_chain: string | null
          project_id: string | null
          recommendation: Database["public"]["Enums"]["recommendation"] | null
          risk_score: number | null
          slug: string | null
          summary: string | null
        }
        Relationships: []
      }
      project_current_state: {
        Row: {
          latest_published_signal_at: string | null
          lifecycle: Database["public"]["Enums"]["project_lifecycle"] | null
          name: string | null
          official_website_url: string | null
          opportunity_score: number | null
          primary_chain: string | null
          project_id: string | null
          project_updated_at: string | null
          project_version: number | null
          recommendation: Database["public"]["Enums"]["recommendation"] | null
          risk_score: number | null
          score_calculated_at: string | null
          score_confidence: number | null
          score_explanation: string | null
          score_input_version: string | null
          score_model_version: string | null
          slug: string | null
          summary: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      assert_collection_job_fence: {
        Args: {
          job_id: string
          lease_epoch: number
          now_at: string
          worker_id: string
        }
        Returns: {
          available_at: string
          collection_rule_version: string
          completed_at: string | null
          contract_version: number
          created_at: string
          delivery_count: number
          execution_attempt: number
          id: string
          idempotency_key: string
          job_type: string
          last_error_detail: string | null
          last_result_code: string | null
          lease_epoch: number
          lease_expires_at: string | null
          lease_owner: string | null
          max_attempts: number
          payload: Json
          payload_hash: string
          project_id: string
          schedule_id: string
          schedule_version: number
          scheduled_for: string
          source_id: string
          state: Database["public"]["Enums"]["durable_job_state"]
          trigger: Database["public"]["Enums"]["collection_job_trigger"]
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "durable_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_collection_job: {
        Args: {
          job_id: string
          lease_epoch: number
          now_at: string
          result_code: string
          worker_id: string
        }
        Returns: {
          canceled_job_id: string
        }[]
      }
      claim_collection_jobs: {
        Args: { batch_limit: number; now_at: string; worker_id: string }
        Returns: {
          delivery_count: number
          execution_attempt: number
          job_id: string
          lease_epoch: number
          lease_expires_at: string
          lease_owner: string
          max_attempts: number
          payload: Json
        }[]
      }
      collection_queue_health: {
        Args: { now_at: string }
        Returns: {
          dead_letter_count: number
          expired_lease_count: number
          leased_count: number
          oldest_runnable_age_seconds: number
          queued_count: number
          retry_wait_count: number
        }[]
      }
      collection_schedule_jitter_seconds: {
        Args: {
          interval_seconds: number
          project_id: string
          scheduled_for: string
          source_id: string
        }
        Returns: number
      }
      complete_collection_job: {
        Args: {
          job_id: string
          lease_epoch: number
          now_at: string
          result_code: string
          worker_id: string
        }
        Returns: {
          completed_job_id: string
        }[]
      }
      dead_letter_collection_job: {
        Args: {
          detail: string
          job_id: string
          lease_epoch: number
          now_at: string
          result_code: string
          worker_id: string
        }
        Returns: {
          dead_lettered_job_id: string
        }[]
      }
      execute_source_schedule_command: {
        Args: {
          p_actor_id: string
          p_command_payload: Json
          p_idempotency_key: string
          p_input_hash: string
          p_now_at: string
          p_schedule_id: string
        }
        Returns: {
          command: Database["public"]["Enums"]["source_schedule_command_type"]
          enabled: boolean
          interval_seconds: number
          job_id: string
          next_run_at: string
          replayed: boolean
          schedule_id: string
          schedule_version: number
        }[]
      }
      has_active_role: {
        Args: { requested_role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      is_source_collection_eligible: {
        Args: { project_id: string; source_id: string }
        Returns: boolean
      }
      load_source_collection_context: {
        Args: { requested_project_id: string; requested_source_id: string }
        Returns: {
          authority_domains: string[]
          canonical_url: string
          project_id: string
          source_id: string
        }[]
      }
      promote_extraction_candidate: {
        Args: { p_actor: string; p_candidate_id: string }
        Returns: string
      }
      reconcile_due_source_schedules: {
        Args: { batch_limit: number; now_at: string }
        Returns: {
          canceled_count: number
          created_schedule_count: number
          enqueued_count: number
          lock_acquired: boolean
        }[]
      }
      renew_collection_job_lease: {
        Args: {
          job_id: string
          lease_epoch: number
          now_at: string
          worker_id: string
        }
        Returns: {
          lease_expires_at: string
        }[]
      }
      retry_collection_job: {
        Args: {
          available_at: string
          detail: string
          job_id: string
          lease_epoch: number
          now_at: string
          result_code: string
          worker_id: string
        }
        Returns: {
          retried_job_id: string
        }[]
      }
      update_user_task: {
        Args: { expected_version: number; patch: Json; task_id: string }
        Returns: {
          completed_at: string | null
          created_at: string
          due_at: string | null
          id: string
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
          user_id: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "user_tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      valid_authority_domains: { Args: { domains: string[] }; Returns: boolean }
      valid_collection_job_payload: {
        Args: {
          candidate: Json
          normalized_project_id: string
          normalized_rule_version: string
          normalized_schedule_id: string
          normalized_schedule_version: number
          normalized_scheduled_for: string
          normalized_source_id: string
          normalized_trigger: Database["public"]["Enums"]["collection_job_trigger"]
        }
        Returns: boolean
      }
      valid_collection_redirect_chain: {
        Args: { candidate: Json }
        Returns: boolean
      }
      valid_https_url: { Args: { candidate_url: string }; Returns: boolean }
      valid_source_schedule_command_payload: {
        Args: { candidate: Json }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "user"
        | "reviewer"
        | "senior_reviewer"
        | "security_reviewer"
        | "admin"
      collection_content_kind:
        | "official_html"
        | "rss_feed"
        | "atom_feed"
        | "feed_article_html"
      collection_job_trigger: "scheduled" | "manual"
      collection_outcome:
        | "stored_new_content"
        | "not_modified"
        | "unchanged_content"
        | "discovered_only"
        | "body_fetch_budget_exhausted"
        | "rejected_url"
        | "rejected_dns_target"
        | "redirect_rejected"
        | "unsupported_content_type"
        | "invalid_text_encoding"
        | "response_too_large"
        | "timeout"
        | "http_error"
        | "invalid_feed"
        | "persistence_failed"
      discovery_disposition:
        | "eligible"
        | "discovered_only"
        | "body_fetch_budget_exhausted"
        | "fetched"
        | "fetch_failed"
      durable_job_event_type:
        | "enqueued"
        | "claimed"
        | "lease_renewed"
        | "lease_expired"
        | "retry_scheduled"
        | "succeeded"
        | "dead_lettered"
        | "canceled"
      durable_job_state:
        | "queued"
        | "leased"
        | "retry_wait"
        | "succeeded"
        | "dead_letter"
        | "canceled"
      participation_status:
        | "interested"
        | "researching"
        | "participating"
        | "paused"
        | "completed"
        | "abandoned"
      project_lifecycle: "rumored" | "active" | "paused" | "ended" | "archived"
      recommendation: "act_now" | "watch" | "research" | "avoid" | "blocked"
      risk_level: "low" | "medium" | "high" | "critical"
      signal_lifecycle:
        | "detected"
        | "normalized"
        | "linked"
        | "under_review"
        | "published"
        | "superseded"
        | "expired"
        | "rejected"
      signal_verification:
        | "unverified"
        | "corroborated"
        | "verified"
        | "disputed"
        | "retracted"
      source_schedule_command_type:
        | "pause"
        | "resume"
        | "change_interval"
        | "collect_now"
      source_schedule_event_type:
        | "auto_created"
        | "paused"
        | "resumed"
        | "interval_changed"
      source_schedule_origin: "automatic" | "manual"
      source_status: "active" | "degraded" | "suspended" | "retired"
      source_type:
        | "official_web"
        | "official_social"
        | "official_docs"
        | "code_repository"
        | "chain_explorer"
        | "independent_research"
        | "news"
        | "community"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status:
        | "backlog"
        | "planned"
        | "in_progress"
        | "completed"
        | "skipped"
        | "blocked"
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
        "user",
        "reviewer",
        "senior_reviewer",
        "security_reviewer",
        "admin",
      ],
      collection_content_kind: [
        "official_html",
        "rss_feed",
        "atom_feed",
        "feed_article_html",
      ],
      collection_job_trigger: ["scheduled", "manual"],
      collection_outcome: [
        "stored_new_content",
        "not_modified",
        "unchanged_content",
        "discovered_only",
        "body_fetch_budget_exhausted",
        "rejected_url",
        "rejected_dns_target",
        "redirect_rejected",
        "unsupported_content_type",
        "invalid_text_encoding",
        "response_too_large",
        "timeout",
        "http_error",
        "invalid_feed",
        "persistence_failed",
      ],
      discovery_disposition: [
        "eligible",
        "discovered_only",
        "body_fetch_budget_exhausted",
        "fetched",
        "fetch_failed",
      ],
      durable_job_event_type: [
        "enqueued",
        "claimed",
        "lease_renewed",
        "lease_expired",
        "retry_scheduled",
        "succeeded",
        "dead_lettered",
        "canceled",
      ],
      durable_job_state: [
        "queued",
        "leased",
        "retry_wait",
        "succeeded",
        "dead_letter",
        "canceled",
      ],
      participation_status: [
        "interested",
        "researching",
        "participating",
        "paused",
        "completed",
        "abandoned",
      ],
      project_lifecycle: ["rumored", "active", "paused", "ended", "archived"],
      recommendation: ["act_now", "watch", "research", "avoid", "blocked"],
      risk_level: ["low", "medium", "high", "critical"],
      signal_lifecycle: [
        "detected",
        "normalized",
        "linked",
        "under_review",
        "published",
        "superseded",
        "expired",
        "rejected",
      ],
      signal_verification: [
        "unverified",
        "corroborated",
        "verified",
        "disputed",
        "retracted",
      ],
      source_schedule_command_type: [
        "pause",
        "resume",
        "change_interval",
        "collect_now",
      ],
      source_schedule_event_type: [
        "auto_created",
        "paused",
        "resumed",
        "interval_changed",
      ],
      source_schedule_origin: ["automatic", "manual"],
      source_status: ["active", "degraded", "suspended", "retired"],
      source_type: [
        "official_web",
        "official_social",
        "official_docs",
        "code_repository",
        "chain_explorer",
        "independent_research",
        "news",
        "community",
      ],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: [
        "backlog",
        "planned",
        "in_progress",
        "completed",
        "skipped",
        "blocked",
      ],
    },
  },
} as const

