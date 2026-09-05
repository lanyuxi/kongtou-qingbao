export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      ai_run_review_commands: {
        Row: {
          ai_run_id: string
          created_at: string
          decision: string
          decision_id: string
          expected_review_version: number
          id: string
          idempotency_key: string
          note: string | null
          reason_code: string
          resulting_review_version: number
          reviewer_user_id: string
        }
        Insert: {
          ai_run_id: string
          created_at: string
          decision: string
          decision_id: string
          expected_review_version: number
          id: string
          idempotency_key: string
          note?: string | null
          reason_code: string
          resulting_review_version: number
          reviewer_user_id: string
        }
        Update: {
          ai_run_id?: string
          created_at?: string
          decision?: string
          decision_id?: string
          expected_review_version?: number
          id?: string
          idempotency_key?: string
          note?: string | null
          reason_code?: string
          resulting_review_version?: number
          reviewer_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_run_review_commands_ai_run_id_fkey"
            columns: ["ai_run_id"]
            isOneToOne: false
            referencedRelation: "ai_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_run_review_commands_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "ai_run_review_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_run_review_commands_reviewer_user_id_fkey"
            columns: ["reviewer_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_run_review_decisions: {
        Row: {
          ai_run_id: string
          created_at: string
          decision: string
          id: string
          note: string | null
          reason_code: string
          review_version: number
          reviewer_user_id: string
        }
        Insert: {
          ai_run_id: string
          created_at: string
          decision: string
          id: string
          note?: string | null
          reason_code: string
          review_version: number
          reviewer_user_id: string
        }
        Update: {
          ai_run_id?: string
          created_at?: string
          decision?: string
          id?: string
          note?: string | null
          reason_code?: string
          review_version?: number
          reviewer_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_run_review_decisions_ai_run_id_fkey"
            columns: ["ai_run_id"]
            isOneToOne: false
            referencedRelation: "ai_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_run_review_decisions_reviewer_user_id_fkey"
            columns: ["reviewer_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
      candidate_review_decisions: {
        Row: {
          candidate_id: string
          candidate_version: number
          created_at: string
          decision: string
          evidence_id: string | null
          id: string
          note: string | null
          reason_code: string
          reviewer_user_id: string
          signal_id: string | null
        }
        Insert: {
          candidate_id: string
          candidate_version: number
          created_at?: string
          decision: string
          evidence_id?: string | null
          id?: string
          note?: string | null
          reason_code: string
          reviewer_user_id: string
          signal_id?: string | null
        }
        Update: {
          candidate_id?: string
          candidate_version?: number
          created_at?: string
          decision?: string
          evidence_id?: string | null
          id?: string
          note?: string | null
          reason_code?: string
          reviewer_user_id?: string
          signal_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candidate_review_decisions_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "extraction_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_review_decisions_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_review_decisions_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "project_current_score_evidence_citations"
            referencedColumns: ["evidence_id"]
          },
          {
            foreignKeyName: "candidate_review_decisions_reviewer_user_id_fkey"
            columns: ["reviewer_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_review_decisions_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "project_current_score_evidence_citations"
            referencedColumns: ["signal_id"]
          },
          {
            foreignKeyName: "candidate_review_decisions_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "collection_attempts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "collection_attempts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["target_id"]
          },
          {
            foreignKeyName: "collection_attempts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_project_security_state"
            referencedColumns: ["project_id"]
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
            referencedRelation: "project_current_score_evidence_citations"
            referencedColumns: ["source_id"]
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
            foreignKeyName: "discovered_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "discovered_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["target_id"]
          },
          {
            foreignKeyName: "discovered_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_project_security_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "discovered_items_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "project_current_score_evidence_citations"
            referencedColumns: ["source_id"]
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
      evidence: {
        Row: {
          created_at: string
          discovered_item_id: string | null
          id: string
          locator_kind: string
          locator_version: number
          normalized_quote_sha256: string
          quote_text: string
          raw_item_id: string
          source_field: string
          source_id: string
          verification_method: string
          verified_at: string
        }
        Insert: {
          created_at?: string
          discovered_item_id?: string | null
          id?: string
          locator_kind?: string
          locator_version?: number
          normalized_quote_sha256: string
          quote_text: string
          raw_item_id: string
          source_field: string
          source_id: string
          verification_method?: string
          verified_at: string
        }
        Update: {
          created_at?: string
          discovered_item_id?: string | null
          id?: string
          locator_kind?: string
          locator_version?: number
          normalized_quote_sha256?: string
          quote_text?: string
          raw_item_id?: string
          source_field?: string
          source_id?: string
          verification_method?: string
          verified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_discovered_item_id_fkey"
            columns: ["discovered_item_id"]
            isOneToOne: false
            referencedRelation: "discovered_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_raw_item_id_fkey"
            columns: ["raw_item_id"]
            isOneToOne: false
            referencedRelation: "raw_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "project_current_score_evidence_citations"
            referencedColumns: ["source_id"]
          },
          {
            foreignKeyName: "evidence_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
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
          review_status: string
          signal_id: string | null
          source_id: string
          status: string
          version: number
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
          review_status?: string
          signal_id?: string | null
          source_id: string
          status?: string
          version?: number
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
          review_status?: string
          signal_id?: string | null
          source_id?: string
          status?: string
          version?: number
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
            foreignKeyName: "extraction_candidates_project_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "extraction_candidates_project_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["target_id"]
          },
          {
            foreignKeyName: "extraction_candidates_project_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_project_security_state"
            referencedColumns: ["project_id"]
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
            referencedRelation: "project_current_score_evidence_citations"
            referencedColumns: ["signal_id"]
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
            referencedRelation: "project_current_score_evidence_citations"
            referencedColumns: ["source_id"]
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
      identity_command_receipts: {
        Row: {
          command: string
          created_at: string
          expected_version: number
          id: string
          idempotency_key: string
          input_hash: string
          response: Json
          resulting_version: number
          user_id: string
        }
        Insert: {
          command: string
          created_at?: string
          expected_version: number
          id?: string
          idempotency_key: string
          input_hash: string
          response: Json
          resulting_version: number
          user_id: string
        }
        Update: {
          command?: string
          created_at?: string
          expected_version?: number
          id?: string
          idempotency_key?: string
          input_hash?: string
          response?: Json
          resulting_version?: number
          user_id?: string
        }
        Relationships: []
      }
      identity_profile_events: {
        Row: {
          actor_user_id: string
          avatar_url: string | null
          display_name: string | null
          event_type: string
          id: number
          occurred_at: string
          profile_version: number
          timezone: string | null
          user_id: string
        }
        Insert: {
          actor_user_id: string
          avatar_url?: string | null
          display_name?: string | null
          event_type: string
          id?: never
          occurred_at?: string
          profile_version: number
          timezone?: string | null
          user_id: string
        }
        Update: {
          actor_user_id?: string
          avatar_url?: string | null
          display_name?: string | null
          event_type?: string
          id?: never
          occurred_at?: string
          profile_version?: number
          timezone?: string | null
          user_id?: string
        }
        Relationships: []
      }
      outbox_events: {
        Row: {
          aggregate_id: string
          aggregate_type: string
          aggregate_version: number
          created_at: string
          delivery_attempts: number
          event_type: string
          event_version: number
          id: string
          last_error_code: string | null
          occurred_at: string
          payload: Json
          published_at: string | null
        }
        Insert: {
          aggregate_id: string
          aggregate_type: string
          aggregate_version: number
          created_at?: string
          delivery_attempts?: number
          event_type: string
          event_version?: number
          id?: string
          last_error_code?: string | null
          occurred_at: string
          payload: Json
          published_at?: string | null
        }
        Update: {
          aggregate_id?: string
          aggregate_type?: string
          aggregate_version?: number
          created_at?: string
          delivery_attempts?: number
          event_type?: string
          event_version?: number
          id?: string
          last_error_code?: string | null
          occurred_at?: string
          payload?: Json
          published_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          timezone: string | null
          updated_at: string
          version: number
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          timezone?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          timezone?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      project_domain_authorities: {
        Row: {
          created_at: string
          id: string
          normalized_domain: string
          project_id: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          normalized_domain: string
          project_id: string
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          normalized_domain?: string
          project_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_domain_authorities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "opportunity_list"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_domain_authorities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_current_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_domain_authorities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_domain_authorities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_domain_authorities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["target_id"]
          },
          {
            foreignKeyName: "project_domain_authorities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_project_security_state"
            referencedColumns: ["project_id"]
          },
        ]
      }
      project_domain_authority_decisions: {
        Row: {
          actor_user_id: string
          aggregate_version: number
          authority_id: string
          created_at: string
          decision: string
          evidence_id: string | null
          id: string
          idempotency_key: string
          note: string | null
          reason_code: string
          resulting_state: string
        }
        Insert: {
          actor_user_id: string
          aggregate_version: number
          authority_id: string
          created_at?: string
          decision: string
          evidence_id?: string | null
          id?: string
          idempotency_key: string
          note?: string | null
          reason_code: string
          resulting_state: string
        }
        Update: {
          actor_user_id?: string
          aggregate_version?: number
          authority_id?: string
          created_at?: string
          decision?: string
          evidence_id?: string | null
          id?: string
          idempotency_key?: string
          note?: string | null
          reason_code?: string
          resulting_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_domain_authority_decisions_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_domain_authority_decisions_authority_id_fkey"
            columns: ["authority_id"]
            isOneToOne: false
            referencedRelation: "project_domain_authorities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_domain_authority_decisions_authority_id_fkey"
            columns: ["authority_id"]
            isOneToOne: false
            referencedRelation: "public_project_domain_authorities"
            referencedColumns: ["authority_id"]
          },
          {
            foreignKeyName: "project_domain_authority_decisions_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_domain_authority_decisions_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "project_current_score_evidence_citations"
            referencedColumns: ["evidence_id"]
          },
        ]
      }
      project_reference_decisions: {
        Row: {
          actor_user_id: string
          aggregate_version: number
          created_at: string
          decision: string
          evidence_id: string | null
          id: string
          idempotency_key: string
          note: string | null
          reason_code: string
          reference_id: string
          resulting_state: string
        }
        Insert: {
          actor_user_id: string
          aggregate_version: number
          created_at?: string
          decision: string
          evidence_id?: string | null
          id?: string
          idempotency_key: string
          note?: string | null
          reason_code: string
          reference_id: string
          resulting_state: string
        }
        Update: {
          actor_user_id?: string
          aggregate_version?: number
          created_at?: string
          decision?: string
          evidence_id?: string | null
          id?: string
          idempotency_key?: string
          note?: string | null
          reason_code?: string
          reference_id?: string
          resulting_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_reference_decisions_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_reference_decisions_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_reference_decisions_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "project_current_score_evidence_citations"
            referencedColumns: ["evidence_id"]
          },
          {
            foreignKeyName: "project_reference_decisions_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "project_reference_current_state"
            referencedColumns: ["reference_id"]
          },
          {
            foreignKeyName: "project_reference_decisions_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "project_references"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_reference_decisions_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "public_project_references"
            referencedColumns: ["reference_id"]
          },
        ]
      }
      project_references: {
        Row: {
          created_at: string
          id: string
          kind: string
          label: string
          normalized_domain: string
          normalized_url: string
          project_id: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          label: string
          normalized_domain: string
          normalized_url: string
          project_id: string
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          label?: string
          normalized_domain?: string
          normalized_url?: string
          project_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_references_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "opportunity_list"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_references_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_current_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_references_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_references_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_references_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["target_id"]
          },
          {
            foreignKeyName: "project_references_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_project_security_state"
            referencedColumns: ["project_id"]
          },
        ]
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
          {
            foreignKeyName: "project_scores_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_scores_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["target_id"]
          },
          {
            foreignKeyName: "project_scores_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_project_security_state"
            referencedColumns: ["project_id"]
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
            foreignKeyName: "project_sources_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_sources_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["target_id"]
          },
          {
            foreignKeyName: "project_sources_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_project_security_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_sources_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "project_current_score_evidence_citations"
            referencedColumns: ["source_id"]
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
      promotion_commands: {
        Row: {
          candidate_id: string
          created_at: string
          decision_id: string
          evidence_id: string | null
          expected_candidate_version: number
          id: string
          idempotency_key: string
          input_hash: string
          outcome: string
          resulting_candidate_version: number
          reviewer_user_id: string
          signal_id: string | null
        }
        Insert: {
          candidate_id: string
          created_at?: string
          decision_id: string
          evidence_id?: string | null
          expected_candidate_version: number
          id?: string
          idempotency_key: string
          input_hash: string
          outcome: string
          resulting_candidate_version: number
          reviewer_user_id: string
          signal_id?: string | null
        }
        Update: {
          candidate_id?: string
          created_at?: string
          decision_id?: string
          evidence_id?: string | null
          expected_candidate_version?: number
          id?: string
          idempotency_key?: string
          input_hash?: string
          outcome?: string
          resulting_candidate_version?: number
          reviewer_user_id?: string
          signal_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promotion_commands_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "extraction_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_commands_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "candidate_review_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_commands_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_commands_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "project_current_score_evidence_citations"
            referencedColumns: ["evidence_id"]
          },
          {
            foreignKeyName: "promotion_commands_reviewer_user_id_fkey"
            columns: ["reviewer_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_commands_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "project_current_score_evidence_citations"
            referencedColumns: ["signal_id"]
          },
          {
            foreignKeyName: "promotion_commands_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_events: {
        Row: {
          actor: string
          candidate_id: string
          created_at: string
          id: string
          review_decision_id: string | null
          reviewer_user_id: string | null
          signal_id: string
        }
        Insert: {
          actor: string
          candidate_id: string
          created_at?: string
          id?: string
          review_decision_id?: string | null
          reviewer_user_id?: string | null
          signal_id: string
        }
        Update: {
          actor?: string
          candidate_id?: string
          created_at?: string
          id?: string
          review_decision_id?: string | null
          reviewer_user_id?: string | null
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
            foreignKeyName: "promotion_events_review_decision_id_fkey"
            columns: ["review_decision_id"]
            isOneToOne: false
            referencedRelation: "candidate_review_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_events_reviewer_user_id_fkey"
            columns: ["reviewer_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_events_signal_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "project_current_score_evidence_citations"
            referencedColumns: ["signal_id"]
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
            foreignKeyName: "raw_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "raw_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["target_id"]
          },
          {
            foreignKeyName: "raw_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_project_security_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "raw_items_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "project_current_score_evidence_citations"
            referencedColumns: ["source_id"]
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
      reference_review_commands: {
        Row: {
          actor_user_id: string
          aggregate_id: string
          aggregate_type: string
          created_at: string
          decision_id: string | null
          expected_version: number | null
          id: string
          idempotency_key: string
          input_hash: string
          operation: string
          result_payload: Json
          resulting_version: number | null
        }
        Insert: {
          actor_user_id: string
          aggregate_id: string
          aggregate_type: string
          created_at?: string
          decision_id?: string | null
          expected_version?: number | null
          id?: string
          idempotency_key: string
          input_hash: string
          operation: string
          result_payload: Json
          resulting_version?: number | null
        }
        Update: {
          actor_user_id?: string
          aggregate_id?: string
          aggregate_type?: string
          created_at?: string
          decision_id?: string | null
          expected_version?: number | null
          id?: string
          idempotency_key?: string
          input_hash?: string
          operation?: string
          result_payload?: Json
          resulting_version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reference_review_commands_actor_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reference_security_flags: {
        Row: {
          created_at: string
          id: string
          indicator_id: string
          reference_id: string
          release_evidence_id: string | null
          released_at: string | null
          released_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          indicator_id: string
          reference_id: string
          release_evidence_id?: string | null
          released_at?: string | null
          released_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          indicator_id?: string
          reference_id?: string
          release_evidence_id?: string | null
          released_at?: string | null
          released_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reference_security_flags_indicator_id_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "public_safe_security_indicators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_security_flags_indicator_id_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "security_indicators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_security_flags_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "project_reference_current_state"
            referencedColumns: ["reference_id"]
          },
          {
            foreignKeyName: "reference_security_flags_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "project_references"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_security_flags_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "public_project_references"
            referencedColumns: ["reference_id"]
          },
          {
            foreignKeyName: "reference_security_flags_release_evidence_id_fkey"
            columns: ["release_evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_security_flags_release_evidence_id_fkey"
            columns: ["release_evidence_id"]
            isOneToOne: false
            referencedRelation: "project_current_score_evidence_citations"
            referencedColumns: ["evidence_id"]
          },
          {
            foreignKeyName: "reference_security_flags_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      score_factors: {
        Row: {
          axis: string
          contribution: number
          created_at: string
          detail: string
          factor_code: string
          id: string
          input_value: number
          project_score_id: string
        }
        Insert: {
          axis: string
          contribution: number
          created_at?: string
          detail: string
          factor_code: string
          id?: string
          input_value: number
          project_score_id: string
        }
        Update: {
          axis?: string
          contribution?: number
          created_at?: string
          detail?: string
          factor_code?: string
          id?: string
          input_value?: number
          project_score_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "score_factors_project_score_fkey"
            columns: ["project_score_id"]
            isOneToOne: false
            referencedRelation: "project_current_state"
            referencedColumns: ["project_score_id"]
          },
          {
            foreignKeyName: "score_factors_project_score_fkey"
            columns: ["project_score_id"]
            isOneToOne: false
            referencedRelation: "project_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      score_signal_links: {
        Row: {
          created_at: string
          project_score_id: string
          signal_id: string
        }
        Insert: {
          created_at?: string
          project_score_id: string
          signal_id: string
        }
        Update: {
          created_at?: string
          project_score_id?: string
          signal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "score_signal_links_project_score_fkey"
            columns: ["project_score_id"]
            isOneToOne: false
            referencedRelation: "project_current_state"
            referencedColumns: ["project_score_id"]
          },
          {
            foreignKeyName: "score_signal_links_project_score_fkey"
            columns: ["project_score_id"]
            isOneToOne: false
            referencedRelation: "project_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_signal_links_signal_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "project_current_score_evidence_citations"
            referencedColumns: ["signal_id"]
          },
          {
            foreignKeyName: "score_signal_links_signal_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      security_candidate_review_decisions: {
        Row: {
          candidate_id: string
          candidate_version: number
          created_at: string
          decision: string
          id: string
          incident_id: string | null
          indicator_id: string | null
          note: string | null
          reason_code: string
          reviewer_user_id: string
        }
        Insert: {
          candidate_id: string
          candidate_version: number
          created_at?: string
          decision: string
          id?: string
          incident_id?: string | null
          indicator_id?: string | null
          note?: string | null
          reason_code: string
          reviewer_user_id: string
        }
        Update: {
          candidate_id?: string
          candidate_version?: number
          created_at?: string
          decision?: string
          id?: string
          incident_id?: string | null
          indicator_id?: string | null
          note?: string | null
          reason_code?: string
          reviewer_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_candidate_review_decisions_candidate_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "security_indicator_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_candidate_review_decisions_incident_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "public_security_incident_summaries"
            referencedColumns: ["incident_id"]
          },
          {
            foreignKeyName: "security_candidate_review_decisions_incident_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "security_incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_candidate_review_decisions_indicator_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "public_safe_security_indicators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_candidate_review_decisions_indicator_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "security_indicators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_candidate_review_decisions_reviewer_fkey"
            columns: ["reviewer_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      security_events: {
        Row: {
          actor_kind: string
          actor_service_name: string | null
          actor_user_id: string | null
          aggregate_id: string
          aggregate_type: string
          aggregate_version: number
          candidate_id: string | null
          created_at: string
          decision_id: string | null
          event_type: string
          id: string
          incident_id: string | null
          indicator_id: string | null
          indicator_public_safe: boolean | null
          occurred_at: string
          payload: Json
        }
        Insert: {
          actor_kind: string
          actor_service_name?: string | null
          actor_user_id?: string | null
          aggregate_id: string
          aggregate_type: string
          aggregate_version: number
          candidate_id?: string | null
          created_at?: string
          decision_id?: string | null
          event_type: string
          id?: string
          incident_id?: string | null
          indicator_id?: string | null
          indicator_public_safe?: boolean | null
          occurred_at?: string
          payload: Json
        }
        Update: {
          actor_kind?: string
          actor_service_name?: string | null
          actor_user_id?: string | null
          aggregate_id?: string
          aggregate_type?: string
          aggregate_version?: number
          candidate_id?: string | null
          created_at?: string
          decision_id?: string | null
          event_type?: string
          id?: string
          incident_id?: string | null
          indicator_id?: string | null
          indicator_public_safe?: boolean | null
          occurred_at?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "security_events_actor_user_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_events_candidate_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "security_indicator_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_events_incident_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "public_security_incident_summaries"
            referencedColumns: ["incident_id"]
          },
          {
            foreignKeyName: "security_events_incident_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "security_incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_events_indicator_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "public_safe_security_indicators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_events_indicator_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "security_indicators"
            referencedColumns: ["id"]
          },
        ]
      }
      security_incident_decisions: {
        Row: {
          action: string
          created_at: string
          evidence_id: string
          id: string
          incident_id: string
          incident_version: number
          note: string | null
          public_summary: string
          reason_code: string
          resulting_posture: string | null
          resulting_severity: string
          reviewer_user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          evidence_id: string
          id?: string
          incident_id: string
          incident_version: number
          note?: string | null
          public_summary: string
          reason_code: string
          resulting_posture?: string | null
          resulting_severity: string
          reviewer_user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          evidence_id?: string
          id?: string
          incident_id?: string
          incident_version?: number
          note?: string | null
          public_summary?: string
          reason_code?: string
          resulting_posture?: string | null
          resulting_severity?: string
          reviewer_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_incident_decisions_evidence_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_incident_decisions_evidence_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "project_current_score_evidence_citations"
            referencedColumns: ["evidence_id"]
          },
          {
            foreignKeyName: "security_incident_decisions_incident_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "public_security_incident_summaries"
            referencedColumns: ["incident_id"]
          },
          {
            foreignKeyName: "security_incident_decisions_incident_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "security_incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_incident_decisions_reviewer_fkey"
            columns: ["reviewer_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      security_incident_indicator_links: {
        Row: {
          created_at: string
          incident_id: string
          indicator_id: string
          linked_by_decision_id: string
        }
        Insert: {
          created_at?: string
          incident_id: string
          indicator_id: string
          linked_by_decision_id: string
        }
        Update: {
          created_at?: string
          incident_id?: string
          indicator_id?: string
          linked_by_decision_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_incident_indicator_links_decision_fkey"
            columns: ["linked_by_decision_id"]
            isOneToOne: false
            referencedRelation: "security_incident_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_incident_indicator_links_incident_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "public_security_incident_summaries"
            referencedColumns: ["incident_id"]
          },
          {
            foreignKeyName: "security_incident_indicator_links_incident_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "security_incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_incident_indicator_links_indicator_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "public_safe_security_indicators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_incident_indicator_links_indicator_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "security_indicators"
            referencedColumns: ["id"]
          },
        ]
      }
      security_incidents: {
        Row: {
          category: string
          created_at: string
          id: string
          opened_at: string
          project_id: string | null
          source_id: string | null
          target_type: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          opened_at?: string
          project_id?: string | null
          source_id?: string | null
          target_type: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          opened_at?: string
          project_id?: string | null
          source_id?: string | null
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_incidents_project_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "opportunity_list"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "security_incidents_project_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_current_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "security_incidents_project_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_incidents_project_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "security_incidents_project_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["target_id"]
          },
          {
            foreignKeyName: "security_incidents_project_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_project_security_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "security_incidents_source_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "project_current_score_evidence_citations"
            referencedColumns: ["source_id"]
          },
          {
            foreignKeyName: "security_incidents_source_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      security_indicator_candidates: {
        Row: {
          created_at: string
          extraction_candidate_id: string | null
          id: string
          manual_evidence_id: string | null
          origin: string
          payload: Json
          project_id: string
          source_id: string
          submitted_by_user_id: string | null
        }
        Insert: {
          created_at?: string
          extraction_candidate_id?: string | null
          id?: string
          manual_evidence_id?: string | null
          origin: string
          payload: Json
          project_id: string
          source_id: string
          submitted_by_user_id?: string | null
        }
        Update: {
          created_at?: string
          extraction_candidate_id?: string | null
          id?: string
          manual_evidence_id?: string | null
          origin?: string
          payload?: Json
          project_id?: string
          source_id?: string
          submitted_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "security_indicator_candidates_extraction_candidate_fkey"
            columns: ["extraction_candidate_id"]
            isOneToOne: true
            referencedRelation: "extraction_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_indicator_candidates_manual_evidence_fkey"
            columns: ["manual_evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_indicator_candidates_manual_evidence_fkey"
            columns: ["manual_evidence_id"]
            isOneToOne: false
            referencedRelation: "project_current_score_evidence_citations"
            referencedColumns: ["evidence_id"]
          },
          {
            foreignKeyName: "security_indicator_candidates_project_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "opportunity_list"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "security_indicator_candidates_project_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_current_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "security_indicator_candidates_project_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_indicator_candidates_project_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "security_indicator_candidates_project_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["target_id"]
          },
          {
            foreignKeyName: "security_indicator_candidates_project_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_project_security_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "security_indicator_candidates_source_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "project_current_score_evidence_citations"
            referencedColumns: ["source_id"]
          },
          {
            foreignKeyName: "security_indicator_candidates_source_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_indicator_candidates_submitted_by_user_fkey"
            columns: ["submitted_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      security_indicator_evidence_links: {
        Row: {
          created_at: string
          evidence_id: string
          indicator_id: string
        }
        Insert: {
          created_at?: string
          evidence_id: string
          indicator_id: string
        }
        Update: {
          created_at?: string
          evidence_id?: string
          indicator_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_indicator_evidence_links_evidence_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_indicator_evidence_links_evidence_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "project_current_score_evidence_citations"
            referencedColumns: ["evidence_id"]
          },
          {
            foreignKeyName: "security_indicator_evidence_links_indicator_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "public_safe_security_indicators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_indicator_evidence_links_indicator_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "security_indicators"
            referencedColumns: ["id"]
          },
        ]
      }
      security_indicators: {
        Row: {
          created_at: string
          id: string
          indicator_type: string
          normalized_value_sha256: string
          value_text: string
        }
        Insert: {
          created_at?: string
          id?: string
          indicator_type: string
          normalized_value_sha256: string
          value_text: string
        }
        Update: {
          created_at?: string
          id?: string
          indicator_type?: string
          normalized_value_sha256?: string
          value_text?: string
        }
        Relationships: []
      }
      security_review_commands: {
        Row: {
          aggregate_id: string
          aggregate_type: string
          created_at: string
          decision_id: string | null
          expected_candidate_version: number | null
          expected_incident_version: number | null
          expected_indicator_version: number | null
          id: string
          idempotency_key: string
          incident_id: string | null
          indicator_id: string | null
          input_hash: string
          operation: string
          result_payload: Json
          resulting_candidate_version: number | null
          resulting_incident_version: number | null
          resulting_indicator_version: number | null
          reviewer_user_id: string
        }
        Insert: {
          aggregate_id: string
          aggregate_type: string
          created_at?: string
          decision_id?: string | null
          expected_candidate_version?: number | null
          expected_incident_version?: number | null
          expected_indicator_version?: number | null
          id?: string
          idempotency_key: string
          incident_id?: string | null
          indicator_id?: string | null
          input_hash: string
          operation: string
          result_payload: Json
          resulting_candidate_version?: number | null
          resulting_incident_version?: number | null
          resulting_indicator_version?: number | null
          reviewer_user_id: string
        }
        Update: {
          aggregate_id?: string
          aggregate_type?: string
          created_at?: string
          decision_id?: string | null
          expected_candidate_version?: number | null
          expected_incident_version?: number | null
          expected_indicator_version?: number | null
          id?: string
          idempotency_key?: string
          incident_id?: string | null
          indicator_id?: string | null
          input_hash?: string
          operation?: string
          result_payload?: Json
          resulting_candidate_version?: number | null
          resulting_incident_version?: number | null
          resulting_indicator_version?: number | null
          reviewer_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_review_commands_incident_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "public_security_incident_summaries"
            referencedColumns: ["incident_id"]
          },
          {
            foreignKeyName: "security_review_commands_incident_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "security_incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_review_commands_indicator_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "public_safe_security_indicators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_review_commands_indicator_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "security_indicators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_review_commands_reviewer_fkey"
            columns: ["reviewer_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      signal_evidence_links: {
        Row: {
          created_at: string
          evidence_id: string
          signal_id: string
        }
        Insert: {
          created_at?: string
          evidence_id: string
          signal_id: string
        }
        Update: {
          created_at?: string
          evidence_id?: string
          signal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signal_evidence_links_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signal_evidence_links_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "project_current_score_evidence_citations"
            referencedColumns: ["evidence_id"]
          },
          {
            foreignKeyName: "signal_evidence_links_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "project_current_score_evidence_citations"
            referencedColumns: ["signal_id"]
          },
          {
            foreignKeyName: "signal_evidence_links_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
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
            foreignKeyName: "signals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "signals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["target_id"]
          },
          {
            foreignKeyName: "signals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_project_security_state"
            referencedColumns: ["project_id"]
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
      tutorial_candidates: {
        Row: {
          confidence: number
          content_hash: string
          created_at: string
          id: string
          kind: string
          model_run_id: string | null
          payload: Json
          project_id: string
          source_signal_ids: string[]
          status: string
          version: number
        }
        Insert: {
          confidence: number
          content_hash: string
          created_at?: string
          id?: string
          kind: string
          model_run_id?: string | null
          payload: Json
          project_id: string
          source_signal_ids?: string[]
          status?: string
          version?: number
        }
        Update: {
          confidence?: number
          content_hash?: string
          created_at?: string
          id?: string
          kind?: string
          model_run_id?: string | null
          payload?: Json
          project_id?: string
          source_signal_ids?: string[]
          status?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tutorial_candidates_model_run_id_fkey"
            columns: ["model_run_id"]
            isOneToOne: false
            referencedRelation: "ai_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tutorial_candidates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "opportunity_list"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "tutorial_candidates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_current_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "tutorial_candidates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tutorial_candidates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "tutorial_candidates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["target_id"]
          },
          {
            foreignKeyName: "tutorial_candidates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_project_security_state"
            referencedColumns: ["project_id"]
          },
        ]
      }
      tutorial_review_commands: {
        Row: {
          actor_user_id: string
          aggregate_id: string
          created_at: string
          expected_version: number | null
          id: string
          idempotency_key: string
          input_hash: string
          operation: string
          result_payload: Json
          resulting_version: number | null
        }
        Insert: {
          actor_user_id: string
          aggregate_id: string
          created_at?: string
          expected_version?: number | null
          id?: string
          idempotency_key: string
          input_hash: string
          operation: string
          result_payload: Json
          resulting_version?: number | null
        }
        Update: {
          actor_user_id?: string
          aggregate_id?: string
          created_at?: string
          expected_version?: number | null
          id?: string
          idempotency_key?: string
          input_hash?: string
          operation?: string
          result_payload?: Json
          resulting_version?: number | null
        }
        Relationships: []
      }
      tutorial_review_decisions: {
        Row: {
          actor_user_id: string
          aggregate_version: number
          candidate_id: string | null
          created_at: string
          decision: string
          id: string
          note: string | null
          reason_code: string | null
          tutorial_id: string | null
        }
        Insert: {
          actor_user_id: string
          aggregate_version: number
          candidate_id?: string | null
          created_at?: string
          decision: string
          id?: string
          note?: string | null
          reason_code?: string | null
          tutorial_id?: string | null
        }
        Update: {
          actor_user_id?: string
          aggregate_version?: number
          candidate_id?: string | null
          created_at?: string
          decision?: string
          id?: string
          note?: string | null
          reason_code?: string | null
          tutorial_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tutorial_review_decisions_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "tutorial_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tutorial_review_decisions_tutorial_id_fkey"
            columns: ["tutorial_id"]
            isOneToOne: false
            referencedRelation: "public_project_tutorials"
            referencedColumns: ["tutorial_id"]
          },
          {
            foreignKeyName: "tutorial_review_decisions_tutorial_id_fkey"
            columns: ["tutorial_id"]
            isOneToOne: false
            referencedRelation: "public_tutorial_detail"
            referencedColumns: ["tutorial_id"]
          },
          {
            foreignKeyName: "tutorial_review_decisions_tutorial_id_fkey"
            columns: ["tutorial_id"]
            isOneToOne: false
            referencedRelation: "tutorials"
            referencedColumns: ["id"]
          },
        ]
      }
      tutorial_status_events: {
        Row: {
          created_at: string
          from_status: string
          id: string
          to_status: string
          trigger: string
          tutorial_id: string
        }
        Insert: {
          created_at?: string
          from_status: string
          id?: string
          to_status: string
          trigger: string
          tutorial_id: string
        }
        Update: {
          created_at?: string
          from_status?: string
          id?: string
          to_status?: string
          trigger?: string
          tutorial_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tutorial_status_events_tutorial_id_fkey"
            columns: ["tutorial_id"]
            isOneToOne: false
            referencedRelation: "public_project_tutorials"
            referencedColumns: ["tutorial_id"]
          },
          {
            foreignKeyName: "tutorial_status_events_tutorial_id_fkey"
            columns: ["tutorial_id"]
            isOneToOne: false
            referencedRelation: "public_tutorial_detail"
            referencedColumns: ["tutorial_id"]
          },
          {
            foreignKeyName: "tutorial_status_events_tutorial_id_fkey"
            columns: ["tutorial_id"]
            isOneToOne: false
            referencedRelation: "tutorials"
            referencedColumns: ["id"]
          },
        ]
      }
      tutorial_step_links: {
        Row: {
          id: string
          reference_id: string
          step_ordinal: number
          tutorial_id: string
          version_id: string
        }
        Insert: {
          id?: string
          reference_id: string
          step_ordinal: number
          tutorial_id: string
          version_id: string
        }
        Update: {
          id?: string
          reference_id?: string
          step_ordinal?: number
          tutorial_id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tutorial_step_links_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "project_reference_current_state"
            referencedColumns: ["reference_id"]
          },
          {
            foreignKeyName: "tutorial_step_links_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "project_references"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tutorial_step_links_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "public_project_references"
            referencedColumns: ["reference_id"]
          },
          {
            foreignKeyName: "tutorial_step_links_tutorial_id_fkey"
            columns: ["tutorial_id"]
            isOneToOne: false
            referencedRelation: "public_project_tutorials"
            referencedColumns: ["tutorial_id"]
          },
          {
            foreignKeyName: "tutorial_step_links_tutorial_id_fkey"
            columns: ["tutorial_id"]
            isOneToOne: false
            referencedRelation: "public_tutorial_detail"
            referencedColumns: ["tutorial_id"]
          },
          {
            foreignKeyName: "tutorial_step_links_tutorial_id_fkey"
            columns: ["tutorial_id"]
            isOneToOne: false
            referencedRelation: "tutorials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tutorial_step_links_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "tutorial_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      tutorial_versions: {
        Row: {
          content_hash: string
          created_at: string
          created_by: string
          id: string
          source_signal_ids: string[]
          steps: Json
          tutorial_id: string
          version: number
        }
        Insert: {
          content_hash: string
          created_at?: string
          created_by: string
          id?: string
          source_signal_ids?: string[]
          steps: Json
          tutorial_id: string
          version: number
        }
        Update: {
          content_hash?: string
          created_at?: string
          created_by?: string
          id?: string
          source_signal_ids?: string[]
          steps?: Json
          tutorial_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tutorial_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tutorial_versions_tutorial_id_fkey"
            columns: ["tutorial_id"]
            isOneToOne: false
            referencedRelation: "public_project_tutorials"
            referencedColumns: ["tutorial_id"]
          },
          {
            foreignKeyName: "tutorial_versions_tutorial_id_fkey"
            columns: ["tutorial_id"]
            isOneToOne: false
            referencedRelation: "public_tutorial_detail"
            referencedColumns: ["tutorial_id"]
          },
          {
            foreignKeyName: "tutorial_versions_tutorial_id_fkey"
            columns: ["tutorial_id"]
            isOneToOne: false
            referencedRelation: "tutorials"
            referencedColumns: ["id"]
          },
        ]
      }
      tutorials: {
        Row: {
          created_at: string
          id: string
          kind: string
          last_verified_at: string | null
          project_id: string
          status: string
          summary: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          last_verified_at?: string | null
          project_id: string
          status?: string
          summary: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          last_verified_at?: string | null
          project_id?: string
          status?: string
          summary?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tutorials_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "opportunity_list"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "tutorials_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_current_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "tutorials_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tutorials_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "tutorials_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["target_id"]
          },
          {
            foreignKeyName: "tutorials_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_project_security_state"
            referencedColumns: ["project_id"]
          },
        ]
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
            foreignKeyName: "user_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "user_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["target_id"]
          },
          {
            foreignKeyName: "user_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_project_security_state"
            referencedColumns: ["project_id"]
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
            foreignKeyName: "user_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "user_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["target_id"]
          },
          {
            foreignKeyName: "user_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_project_security_state"
            referencedColumns: ["project_id"]
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
      user_wallet_address_events: {
        Row: {
          actor_user_id: string
          address: string
          chain: string
          event_type: string
          id: number
          label: string | null
          occurred_at: string
          user_id: string
          visibility: string | null
          wallet_address_id: string
          wallet_address_version: number
        }
        Insert: {
          actor_user_id: string
          address: string
          chain: string
          event_type: string
          id?: never
          label?: string | null
          occurred_at?: string
          user_id: string
          visibility?: string | null
          wallet_address_id: string
          wallet_address_version: number
        }
        Update: {
          actor_user_id?: string
          address?: string
          chain?: string
          event_type?: string
          id?: never
          label?: string | null
          occurred_at?: string
          user_id?: string
          visibility?: string | null
          wallet_address_id?: string
          wallet_address_version?: number
        }
        Relationships: []
      }
      user_wallet_addresses: {
        Row: {
          address: string
          chain: string
          created_at: string
          id: string
          label: string | null
          updated_at: string
          user_id: string
          version: number
          visibility: string
        }
        Insert: {
          address: string
          chain?: string
          created_at?: string
          id?: string
          label?: string | null
          updated_at?: string
          user_id: string
          version?: number
          visibility?: string
        }
        Update: {
          address?: string
          chain?: string
          created_at?: string
          id?: string
          label?: string | null
          updated_at?: string
          user_id?: string
          version?: number
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_wallet_addresses_user_id_fkey"
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
            foreignKeyName: "watchlist_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "watchlist_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["target_id"]
          },
          {
            foreignKeyName: "watchlist_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_project_security_state"
            referencedColumns: ["project_id"]
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
          security_posture: string | null
          slug: string | null
          summary: string | null
        }
        Relationships: []
      }
      project_current_score_evidence_citations: {
        Row: {
          citation_text: string | null
          evidence_id: string | null
          evidence_source_field: string | null
          evidence_verified_at: string | null
          project_id: string | null
          project_score_id: string | null
          signal_id: string | null
          signal_published_at: string | null
          signal_title: string | null
          signal_verification:
            | Database["public"]["Enums"]["signal_verification"]
            | null
          source_id: string | null
          source_is_official: boolean | null
          source_name: string | null
          source_relation_verified_at: string | null
          source_type: Database["public"]["Enums"]["source_type"] | null
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
          {
            foreignKeyName: "project_scores_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_scores_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["target_id"]
          },
          {
            foreignKeyName: "project_scores_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_project_security_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "score_signal_links_project_score_fkey"
            columns: ["project_score_id"]
            isOneToOne: false
            referencedRelation: "project_current_state"
            referencedColumns: ["project_score_id"]
          },
          {
            foreignKeyName: "score_signal_links_project_score_fkey"
            columns: ["project_score_id"]
            isOneToOne: false
            referencedRelation: "project_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      project_current_score_factors: {
        Row: {
          axis: string | null
          contribution: number | null
          detail: string | null
          factor_code: string | null
          input_value: number | null
          project_id: string | null
          project_score_id: string | null
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
          {
            foreignKeyName: "project_scores_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_scores_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["target_id"]
          },
          {
            foreignKeyName: "project_scores_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_project_security_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "score_factors_project_score_fkey"
            columns: ["project_score_id"]
            isOneToOne: false
            referencedRelation: "project_current_state"
            referencedColumns: ["project_score_id"]
          },
          {
            foreignKeyName: "score_factors_project_score_fkey"
            columns: ["project_score_id"]
            isOneToOne: false
            referencedRelation: "project_scores"
            referencedColumns: ["id"]
          },
        ]
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
          project_score_id: string | null
          project_updated_at: string | null
          project_version: number | null
          recommendation: Database["public"]["Enums"]["recommendation"] | null
          risk_score: number | null
          score_calculated_at: string | null
          score_confidence: number | null
          score_explanation: string | null
          score_input_version: string | null
          score_model_version: string | null
          security_posture: string | null
          slug: string | null
          summary: string | null
        }
        Relationships: []
      }
      project_reference_current_state: {
        Row: {
          active_indicator_id: string | null
          created_at: string | null
          current_state: string | null
          kind: string | null
          label: string | null
          last_verified_at: string | null
          normalized_domain: string | null
          normalized_url: string | null
          project_id: string | null
          reference_id: string | null
          version: number | null
        }
        Insert: {
          active_indicator_id?: never
          created_at?: string | null
          current_state?: never
          kind?: string | null
          label?: string | null
          last_verified_at?: never
          normalized_domain?: string | null
          normalized_url?: string | null
          project_id?: string | null
          reference_id?: string | null
          version?: number | null
        }
        Update: {
          active_indicator_id?: never
          created_at?: string | null
          current_state?: never
          kind?: string | null
          label?: string | null
          last_verified_at?: never
          normalized_domain?: string | null
          normalized_url?: string | null
          project_id?: string | null
          reference_id?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "project_references_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "opportunity_list"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_references_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_current_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_references_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_references_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_references_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["target_id"]
          },
          {
            foreignKeyName: "project_references_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_project_security_state"
            referencedColumns: ["project_id"]
          },
        ]
      }
      public_blocked_projects: {
        Row: {
          category: string | null
          first_observed_at: string | null
          indicators: Json | null
          last_verified_at: string | null
          posture: string | null
          project_id: string | null
          project_name: string | null
          project_slug: string | null
          public_summary: string | null
          restricted_at: string | null
          severity: string | null
          target_id: string | null
          target_type: string | null
          version: number | null
        }
        Relationships: []
      }
      public_identity_wallet_addresses: {
        Row: {
          address: string | null
          chain: string | null
          label: string | null
          user_id: string | null
          wallet_address_id: string | null
        }
        Insert: {
          address?: string | null
          chain?: string | null
          label?: string | null
          user_id?: string | null
          wallet_address_id?: string | null
        }
        Update: {
          address?: string | null
          chain?: string | null
          label?: string | null
          user_id?: string | null
          wallet_address_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_wallet_addresses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      public_project_domain_authorities: {
        Row: {
          authority_id: string | null
          domain: string | null
          granted_at: string | null
          project_id: string | null
        }
        Insert: {
          authority_id?: string | null
          domain?: string | null
          granted_at?: never
          project_id?: string | null
        }
        Update: {
          authority_id?: string | null
          domain?: string | null
          granted_at?: never
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_domain_authorities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "opportunity_list"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_domain_authorities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_current_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_domain_authorities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_domain_authorities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_domain_authorities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["target_id"]
          },
          {
            foreignKeyName: "project_domain_authorities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_project_security_state"
            referencedColumns: ["project_id"]
          },
        ]
      }
      public_project_references: {
        Row: {
          kind: string | null
          label: string | null
          last_verified_at: string | null
          project_id: string | null
          reference_id: string | null
          url: string | null
        }
        Insert: {
          kind?: string | null
          label?: string | null
          last_verified_at?: never
          project_id?: string | null
          reference_id?: string | null
          url?: string | null
        }
        Update: {
          kind?: string | null
          label?: string | null
          last_verified_at?: never
          project_id?: string | null
          reference_id?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_references_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "opportunity_list"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_references_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_current_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_references_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_references_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_references_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["target_id"]
          },
          {
            foreignKeyName: "project_references_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_project_security_state"
            referencedColumns: ["project_id"]
          },
        ]
      }
      public_project_security_state: {
        Row: {
          active_incidents: Json | null
          posture: string | null
          project_id: string | null
          version: number | null
        }
        Relationships: []
      }
      public_project_tutorials: {
        Row: {
          kind: string | null
          last_verified_at: string | null
          project_id: string | null
          published_at: string | null
          step_count: number | null
          summary: string | null
          title: string | null
          tutorial_id: string | null
          version: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tutorials_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "opportunity_list"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "tutorials_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_current_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "tutorials_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tutorials_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "tutorials_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["target_id"]
          },
          {
            foreignKeyName: "tutorials_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_project_security_state"
            referencedColumns: ["project_id"]
          },
        ]
      }
      public_safe_security_indicators: {
        Row: {
          id: string | null
          type: string | null
          value: string | null
        }
        Insert: {
          id?: string | null
          type?: string | null
          value?: string | null
        }
        Update: {
          id?: string | null
          type?: string | null
          value?: string | null
        }
        Relationships: []
      }
      public_security_incident_summaries: {
        Row: {
          category: string | null
          first_observed_at: string | null
          incident_id: string | null
          indicators: Json | null
          last_verified_at: string | null
          public_summary: string | null
          severity: string | null
          state: string | null
          target_id: string | null
          target_type: string | null
          version: number | null
        }
        Relationships: []
      }
      public_tutorial_detail: {
        Row: {
          kind: string | null
          last_verified_at: string | null
          link_label: string | null
          link_last_verified_at: string | null
          link_reference_id: string | null
          link_renderable: boolean | null
          link_url: string | null
          ordinal: number | null
          project_id: string | null
          published_at: string | null
          step_body: string | null
          step_title: string | null
          summary: string | null
          title: string | null
          tutorial_id: string | null
          version: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tutorials_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "opportunity_list"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "tutorials_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_current_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "tutorials_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tutorials_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "tutorials_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_blocked_projects"
            referencedColumns: ["target_id"]
          },
          {
            foreignKeyName: "tutorials_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "public_project_security_state"
            referencedColumns: ["project_id"]
          },
        ]
      }
    }
    Functions: {
      actor_has_active_reference_role: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      actor_has_active_security_role: {
        Args: { p_user_id: string }
        Returns: boolean
      }
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
      block_tutorials_for_project: {
        Args: { p_project_id: string }
        Returns: undefined
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
      current_project_score_is_public: {
        Args: { p_project_score_id: string }
        Returns: boolean
      }
      current_score_citation_path_is_public: {
        Args: {
          p_evidence_id: string
          p_project_score_id: string
          p_signal_id: string
        }
        Returns: boolean
      }
      current_security_target_posture: {
        Args: { p_target_id: string; p_target_type: string }
        Returns: string
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
      domain_authority_current_state_v1: {
        Args: { p_authority_id: string }
        Returns: string
      }
      domain_authority_granted_at_v1: {
        Args: { p_authority_id: string }
        Returns: string
      }
      domain_authority_state_for_reference: {
        Args: { p_reference_id: string }
        Returns: string
      }
      evidence_quote_sha256_v1: {
        Args: { input_text: string }
        Returns: string
      }
      execute_extraction_candidate_review: {
        Args: {
          p_command_payload: Json
          p_idempotency_key: string
          p_input_hash: string
          p_now: string
          p_reviewer_user_id: string
        }
        Returns: {
          candidate_id: string
          candidate_version: number
          command_id: string
          decision_id: string
          evidence_id: string
          outcome: string
          replayed: boolean
          signal_id: string
        }[]
      }
      execute_failed_ai_run_review: {
        Args: {
          p_ai_run_id: string
          p_command_payload: Json
          p_idempotency_key: string
          p_now: string
        }
        Returns: {
          commandId: string
          decisionId: string
          replayed: boolean
          reviewState: string
          reviewVersion: number
          runId: string
          version: number
        }[]
      }
      execute_security_candidate_review: {
        Args: {
          p_candidate_id: string
          p_command_payload: Json
          p_idempotency_key: string
        }
        Returns: {
          candidateId: string
          candidateVersion: number
          commandId: string
          decisionId: string
          incidentId: string
          indicatorId: string
          replayed: boolean
          state: string
          version: number
        }[]
      }
      execute_security_incident_command: {
        Args: {
          p_command_payload: Json
          p_idempotency_key: string
          p_incident_id: string
        }
        Returns: {
          commandId: string
          decisionId: string
          incidentId: string
          incidentVersion: number
          posture: string
          replayed: boolean
          state: string
          version: number
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
      get_domain_authority_review_detail: {
        Args: { p_authority_id: string }
        Returns: {
          authorityId: string
          authorityVersion: number
          decisions: Json
          domain: string
          projectId: string
          state: string
          updatedAt: string
          version: number
        }[]
      }
      get_failed_ai_run: {
        Args: { p_ai_run_id: string }
        Returns: {
          decisions: Json
          input: Json
          run: Json
          version: number
        }[]
      }
      get_my_identity_profile: {
        Args: never
        Returns: {
          avatarUrl: string
          displayName: string
          timezone: string
          updatedAt: string
          userId: string
          version: number
        }[]
      }
      get_public_identity_profile: {
        Args: { p_user_id: string }
        Returns: {
          avatarUrl: string
          displayName: string
          userId: string
        }[]
      }
      get_reference_review_detail: {
        Args: { p_reference_id: string }
        Returns: {
          activeIndicatorId: string
          decisions: Json
          domainAuthority: Json
          kind: string
          label: string
          lastVerifiedAt: string
          projectId: string
          referenceId: string
          referenceVersion: number
          state: string
          updatedAt: string
          url: string
          version: number
        }[]
      }
      get_security_candidate: {
        Args: { p_candidate_id: string }
        Returns: {
          candidateId: string
          createdAt: string
          evidenceId: string
          indicator: Json
          note: string
          origin: string
          state: string
          stateVersion: number
          submittedByUserId: string
          summary: string
          target: Json
          targetContext: Json
          version: number
        }[]
      }
      get_security_incident: {
        Args: { p_incident_id: string }
        Returns: {
          decisions: Json
          incident: Json
          indicatorIds: string[]
          version: number
        }[]
      }
      get_tutorial_review_candidate: {
        Args: { p_candidate_id: string }
        Returns: {
          candidateId: string
          confidence: number
          createdAt: string
          kind: string
          payload: Json
          projectId: string
          sourceSignalIds: string[]
          status: string
          summary: string
          title: string
        }[]
      }
      get_tutorial_review_detail: {
        Args: { p_tutorial_id: string }
        Returns: {
          decisions: Json
          kind: string
          lastVerifiedAt: string
          projectId: string
          status: string
          statusEvents: Json
          stepLinks: Json
          steps: Json
          summary: string
          title: string
          tutorialId: string
          updatedAt: string
          version: number
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
      list_domain_authority_review_items: {
        Args: {
          p_cursor_id: string
          p_cursor_updated_at: string
          p_limit: number
          p_project_id: string
          p_state: string
        }
        Returns: {
          authorityId: string
          authorityVersion: number
          domain: string
          projectId: string
          state: string
          updatedAt: string
          version: number
        }[]
      }
      list_failed_ai_runs: {
        Args: {
          p_cursor_created_at: string
          p_cursor_id: string
          p_limit: number
          p_review_state: string
          p_status: string
        }
        Returns: {
          createdAt: string
          inputKind: string
          latestDecisionAt: string
          modelId: string
          pipelineVersion: string
          project: Json
          promptVersion: string
          reviewState: string
          reviewVersion: number
          runId: string
          safeFailureCode: string
          schemaVersion: string
          source: Json
          stage: string
          status: string
          version: number
        }[]
      }
      list_historical_extraction_candidates: {
        Args: { p_after_candidate_id: string; p_limit: number }
        Returns: {
          candidate_id: string
          candidate_version: number
        }[]
      }
      list_my_wallet_addresses: {
        Args: never
        Returns: {
          address: string
          chain: string
          createdAt: string
          label: string
          updatedAt: string
          version: number
          visibility: string
          walletAddressId: string
        }[]
      }
      list_public_identity_wallet_addresses: {
        Args: { p_user_id: string }
        Returns: {
          address: string
          chain: string
          label: string
          walletAddressId: string
        }[]
      }
      list_public_score_evidence_citations: {
        Args: { p_project_id: string; p_project_score_id: string }
        Returns: {
          citation_text: string | null
          evidence_id: string | null
          evidence_source_field: string | null
          evidence_verified_at: string | null
          project_id: string | null
          project_score_id: string | null
          signal_id: string | null
          signal_published_at: string | null
          signal_title: string | null
          signal_verification:
            | Database["public"]["Enums"]["signal_verification"]
            | null
          source_id: string | null
          source_is_official: boolean | null
          source_name: string | null
          source_relation_verified_at: string | null
          source_type: Database["public"]["Enums"]["source_type"] | null
        }[]
        SetofOptions: {
          from: "*"
          to: "project_current_score_evidence_citations"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_public_score_factors: {
        Args: { p_project_id: string; p_project_score_id: string }
        Returns: {
          axis: string | null
          contribution: number | null
          detail: string | null
          factor_code: string | null
          input_value: number | null
          project_id: string | null
          project_score_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "project_current_score_factors"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_reference_review_items: {
        Args: {
          p_cursor_id: string
          p_cursor_updated_at: string
          p_limit: number
          p_project_id: string
          p_state: string
        }
        Returns: {
          activeIndicatorId: string
          kind: string
          label: string
          lastVerifiedAt: string
          projectId: string
          referenceId: string
          referenceVersion: number
          state: string
          updatedAt: string
          url: string
          version: number
        }[]
      }
      list_security_candidates: {
        Args: {
          p_cursor_created_at: string
          p_cursor_id: string
          p_limit: number
          p_origin: string
          p_state: string
          p_target_type: string
        }
        Returns: {
          candidateId: string
          createdAt: string
          origin: string
          reviewedAt: string
          state: string
          stateVersion: number
          summary: string
          target: Json
          version: number
        }[]
      }
      list_security_incidents: {
        Args: {
          p_cursor_created_at: string
          p_cursor_id: string
          p_limit: number
          p_state: string
          p_target_type: string
        }
        Returns: {
          category: string
          currentPosture: string
          currentSeverity: string
          incidentId: string
          incidentVersion: number
          lastDecisionAt: string
          openedAt: string
          publicSummary: string
          state: string
          target: Json
          version: number
        }[]
      }
      list_tutorial_review_candidates: {
        Args: {
          p_cursor_created?: string
          p_cursor_id?: string
          p_limit?: number
          p_status?: string
        }
        Returns: {
          candidateId: string
          createdAt: string
          kind: string
          projectId: string
          status: string
          title: string
        }[]
      }
      list_tutorial_review_items: {
        Args: {
          p_cursor_id?: string
          p_cursor_updated?: string
          p_limit?: number
          p_status?: string
        }
        Returns: {
          kind: string
          projectId: string
          status: string
          title: string
          tutorialId: string
          updatedAt: string
          version: number
        }[]
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
      match_references_for_indicator: {
        Args: { p_indicator_type: string; p_value: string }
        Returns: {
          reference_id: string
        }[]
      }
      normalize_evidence_text_v1: {
        Args: { input_text: string }
        Returns: string
      }
      normalize_reference_domain_v1: {
        Args: { p_value: string }
        Returns: string
      }
      normalize_reference_url_v1: { Args: { p_value: string }; Returns: string }
      normalize_security_indicator_value_v1: {
        Args: { p_value: string }
        Returns: string
      }
      open_security_incident: {
        Args: { p_command_payload: Json; p_idempotency_key: string }
        Returns: {
          commandId: string
          decisionId: string
          incidentId: string
          incidentVersion: number
          posture: string
          replayed: boolean
          state: string
          version: number
        }[]
      }
      promote_extraction_candidate: {
        Args: { p_actor: string; p_candidate_id: string }
        Returns: string
      }
      queue_tutorials_for_review: {
        Args: { p_trigger: string; p_tutorial_ids: string[] }
        Returns: undefined
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
      reconcile_extraction_candidate_evidence: {
        Args: {
          p_candidate_id: string
          p_expected_candidate_version: number
          p_idempotency_key: string
          p_now: string
          p_reviewer_user_id: string
        }
        Returns: {
          candidate_id: string
          candidate_version: number
          command_id: string
          decision_id: string
          evidence_id: string
          outcome: string
          replayed: boolean
          signal_id: string
        }[]
      }
      reference_current_state_v1: {
        Args: { p_reference_id: string }
        Returns: string
      }
      reference_evidence_is_usable: {
        Args: { p_evidence_id: string }
        Returns: boolean
      }
      reference_is_publicly_renderable_v1: {
        Args: { p_reference_id: string }
        Returns: boolean
      }
      reference_last_verified_at_v1: {
        Args: { p_reference_id: string }
        Returns: string
      }
      reference_url_host_v1: {
        Args: { p_normalized_url: string }
        Returns: string
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
      route_security_extraction_candidate: {
        Args: { p_extraction_candidate_id: string }
        Returns: string
      }
      score_has_complete_evidence: {
        Args: { p_project_score_id: string }
        Returns: boolean
      }
      security_command_input_hash_v1: {
        Args: { p_payload: Json }
        Returns: string
      }
      security_current_candidate_state: {
        Args: { p_candidate_id: string }
        Returns: {
          decision_id: string
          reviewed_at: string
          state: string
          state_version: number
        }[]
      }
      security_current_incident_decision: {
        Args: { p_incident_id: string }
        Returns: {
          action: string
          created_at: string
          decision_id: string
          evidence_id: string
          incident_version: number
          public_summary: string
          resulting_posture: string
          resulting_severity: string
        }[]
      }
      security_evidence_matches_target: {
        Args: {
          p_evidence_id: string
          p_target_id: string
          p_target_type: string
        }
        Returns: boolean
      }
      security_indicator_currently_public_safe: {
        Args: { p_indicator_id: string }
        Returns: boolean
      }
      security_indicator_is_grounded: {
        Args: {
          p_evidence_id: string
          p_indicator_type: string
          p_target_id: string
          p_target_type: string
          p_value_text: string
        }
        Returns: boolean
      }
      security_indicator_value_sha256_v1: {
        Args: { p_value: string }
        Returns: string
      }
      security_json_has_exact_keys: {
        Args: { p_keys: string[]; p_payload: Json }
        Returns: boolean
      }
      security_json_positive_bigint_is_valid: {
        Args: { p_key: string; p_payload: Json }
        Returns: boolean
      }
      security_json_uuid_is_valid: {
        Args: { p_key: string; p_payload: Json }
        Returns: boolean
      }
      security_target_lock_key_v1: {
        Args: { p_target_id: string; p_target_type: string }
        Returns: number
      }
      set_security_indicator_disclosure: {
        Args: {
          p_command_payload: Json
          p_idempotency_key: string
          p_indicator_id: string
        }
        Returns: {
          commandId: string
          decision: string
          indicatorId: string
          indicatorVersion: number
          publicSafe: boolean
          replayed: boolean
          version: number
        }[]
      }
      signal_has_valid_evidence: {
        Args: { p_signal_id: string }
        Returns: boolean
      }
      submit_accept_tutorial_candidate: {
        Args: { p_command_payload: Json; p_idempotency_key: string }
        Returns: {
          candidateId: string
          commandId: string
          replayed: boolean
          tutorialId: string
          tutorialVersion: number
          version: number
        }[]
      }
      submit_add_wallet_address: { Args: { p_payload: Json }; Returns: Json }
      submit_decide_domain_authority: {
        Args: {
          p_authority_id: string
          p_command_payload: Json
          p_idempotency_key: string
        }
        Returns: {
          authorityId: string
          authorityVersion: number
          commandId: string
          replayed: boolean
          state: string
          version: number
        }[]
      }
      submit_decide_reference: {
        Args: {
          p_command_payload: Json
          p_idempotency_key: string
          p_reference_id: string
        }
        Returns: {
          commandId: string
          referenceId: string
          referenceVersion: number
          replayed: boolean
          state: string
          version: number
        }[]
      }
      submit_manual_security_candidate: {
        Args: { p_command_payload: Json; p_idempotency_key: string }
        Returns: {
          candidateId: string
          candidateVersion: number
          commandId: string
          replayed: boolean
          state: string
          version: number
        }[]
      }
      submit_publish_tutorial_version: {
        Args: { p_command_payload: Json; p_idempotency_key: string }
        Returns: {
          commandId: string
          replayed: boolean
          tutorialId: string
          tutorialVersion: number
          version: number
        }[]
      }
      submit_register_domain_authority: {
        Args: { p_command_payload: Json; p_idempotency_key: string }
        Returns: {
          authorityId: string
          authorityVersion: number
          commandId: string
          replayed: boolean
          state: string
          version: number
        }[]
      }
      submit_register_reference: {
        Args: { p_command_payload: Json; p_idempotency_key: string }
        Returns: {
          commandId: string
          referenceId: string
          referenceVersion: number
          replayed: boolean
          state: string
          version: number
        }[]
      }
      submit_reject_tutorial_candidate: {
        Args: { p_command_payload: Json; p_idempotency_key: string }
        Returns: {
          candidateId: string
          commandId: string
          replayed: boolean
          version: number
        }[]
      }
      submit_remove_wallet_address: { Args: { p_payload: Json }; Returns: Json }
      submit_retire_tutorial: {
        Args: { p_command_payload: Json; p_idempotency_key: string }
        Returns: {
          commandId: string
          replayed: boolean
          tutorialId: string
          version: number
        }[]
      }
      submit_set_wallet_address_visibility: {
        Args: { p_payload: Json }
        Returns: Json
      }
      submit_update_profile: { Args: { p_payload: Json }; Returns: Json }
      tutorial_is_publicly_visible_v1: {
        Args: { p_tutorial_id: string }
        Returns: boolean
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
  graphql_public: {
    Enums: {},
  },
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

