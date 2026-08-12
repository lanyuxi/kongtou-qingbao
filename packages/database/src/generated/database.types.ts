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
          opportunity_score: number | null
          primary_chain: string | null
          project_id: string | null
          project_updated_at: string | null
          project_version: number | null
          recommendation: Database["public"]["Enums"]["recommendation"] | null
          risk_score: number | null
          score_calculated_at: string | null
          score_confidence: number | null
          slug: string | null
          summary: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      has_active_role: {
        Args: { requested_role: Database["public"]["Enums"]["app_role"] }
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
      valid_collection_redirect_chain: {
        Args: { candidate: Json }
        Returns: boolean
      }
      valid_https_url: { Args: { candidate_url: string }; Returns: boolean }
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

