/**
 * Database Type Definitions for NDT Suite
 * Auto-generated type definitions for Supabase tables
 */

/**
 * Profile table row type
 * Represents a user profile in the system
 */
export interface Profile {
  // Core Identity Fields (Required)
  id: string;                    // UUID - References auth.users(id)
  username: string;              // Unique username
  email: string;                 // User email
  role: 'admin' | 'org_admin' | 'editor' | 'viewer';  // User role

  // Organization & Status
  organization_id: string | null;  // UUID - References organizations(id)
  is_active: boolean;              // Account active status

  // Personal Details (All Optional)
  mobile_number: string | null;
  email_address: string | null;
  home_address: string | null;
  nearest_uk_train_station: string | null;
  next_of_kin: string | null;
  next_of_kin_emergency_contact_number: string | null;
  date_of_birth: string | null;   // Date string in ISO format (YYYY-MM-DD)
  avatar_url: string | null;

  // System Fields (Auto-managed)
  created_at: string;              // ISO timestamp
  updated_at: string;              // ISO timestamp
}

/**
 * Profile insert type
 * Used when creating a new profile
 */
export interface ProfileInsert {
  // Required fields
  id: string;                      // Must match auth.users id
  username: string;
  email: string;
  role: 'admin' | 'org_admin' | 'editor' | 'viewer';

  // Optional fields
  organization_id?: string | null;
  is_active?: boolean;
  mobile_number?: string | null;
  email_address?: string | null;
  home_address?: string | null;
  nearest_uk_train_station?: string | null;
  next_of_kin?: string | null;
  next_of_kin_emergency_contact_number?: string | null;
  date_of_birth?: string | null;
  avatar_url?: string | null;

  // System fields (optional on insert, will use defaults)
  created_at?: string;
  updated_at?: string;
}

/**
 * Profile update type
 * Used when updating an existing profile
 * All fields except id are optional
 */
export interface ProfileUpdate {
  username?: string;
  email?: string;
  role?: 'admin' | 'org_admin' | 'editor' | 'viewer';
  organization_id?: string | null;
  is_active?: boolean;
  mobile_number?: string | null;
  email_address?: string | null;
  home_address?: string | null;
  nearest_uk_train_station?: string | null;
  next_of_kin?: string | null;
  next_of_kin_emergency_contact_number?: string | null;
  date_of_birth?: string | null;
  avatar_url?: string | null;
  updated_at?: string;
}

/**
 * Organization table row type
 */
export interface Organization {
  id: string;           // UUID
  name: string;
  created_at: string;
  updated_at: string;
}

/**
 * Competency Category row type
 */
export interface CompetencyCategory {
  id: string;           // UUID
  name: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Competency Definition row type
 */
export interface CompetencyDefinition {
  id: string;           // UUID
  category_id: string | null;  // UUID - References competency_categories(id)
  name: string;
  description: string | null;
  field_type: 'text' | 'date' | 'expiry_date' | 'boolean' | 'file' | 'number';
  requires_document: boolean;
  requires_approval: boolean;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Employee Competency row type
 */
export interface EmployeeCompetency {
  id: string;                    // UUID
  user_id: string;               // UUID - References auth.users(id)
  competency_id: string;         // UUID - References competency_definitions(id)
  value: string | null;          // The actual value (string, date, number, etc.)
  expiry_date: string | null;    // ISO timestamp
  document_url: string | null;   // URL to uploaded certificate/document
  document_name: string | null;
  status: 'active' | 'expired' | 'pending_approval' | 'rejected';
  verified_by: string | null;    // UUID - References auth.users(id)
  verified_at: string | null;    // ISO timestamp
  notes: string | null;
  created_at: string;            // ISO timestamp
  updated_at: string;            // ISO timestamp
  issuing_body: string | null;   // Name of certification issuing organization
  certification_id: string | null;  // Certification ID number
  witness_checked: boolean;      // Matrix competency witness inspection completed
  witnessed_by: string | null;   // UUID - References auth.users(id) of witness
  witnessed_at: string | null;   // ISO timestamp of witness check
  witness_notes: string | null;  // Optional notes from witness check
}

/**
 * Employee Competency insert type
 */
export interface EmployeeCompetencyInsert {
  user_id: string;
  competency_id: string;
  value?: string | null;
  expiry_date?: string | null;
  document_url?: string | null;
  document_name?: string | null;
  status?: 'active' | 'expired' | 'pending_approval' | 'rejected';
  verified_by?: string | null;
  verified_at?: string | null;
  notes?: string | null;
  issuing_body?: string | null;
  certification_id?: string | null;
  witness_checked?: boolean;
  witnessed_by?: string | null;
  witnessed_at?: string | null;
  witness_notes?: string | null;
}

/**
 * Database type helper
 * Use this to get type-safe database operations
 */
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
      };
      organizations: {
        Row: Organization;
        Insert: Omit<Organization, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Organization, 'id' | 'created_at' | 'updated_at'>>;
      };
      competency_categories: {
        Row: CompetencyCategory;
        Insert: Omit<CompetencyCategory, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<CompetencyCategory, 'id' | 'created_at' | 'updated_at'>>;
      };
      competency_definitions: {
        Row: CompetencyDefinition;
        Insert: Omit<CompetencyDefinition, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<CompetencyDefinition, 'id' | 'created_at' | 'updated_at'>>;
      };
      employee_competencies: {
        Row: EmployeeCompetency;
        Insert: EmployeeCompetencyInsert;
        Update: Partial<EmployeeCompetencyInsert>;
      };
    };
  };
}

/**
 * Helper type for Supabase client with proper typing
 */
export type TypedSupabaseClient = any; // Replace with actual Supabase client type

/**
 * User role type guard
 */
export function isValidRole(role: string): role is Profile['role'] {
  return ['admin', 'org_admin', 'editor', 'viewer'].includes(role);
}

/**
 * Competency Comment row type
 */
export interface CompetencyComment {
  id: string;                           // UUID
  employee_competency_id: string;       // UUID - References employee_competencies(id)
  comment_text: string;
  comment_type: 'general' | 'expiry_update' | 'renewal_in_progress' | 'renewal_completed' | 'unable_to_renew' | 'escalation';
  is_pinned: boolean;
  created_by: string | null;            // UUID - References auth.users(id)
  created_at: string;                   // ISO timestamp
  updated_at: string;                   // ISO timestamp
  mentioned_users: string[] | null;     // Array of user UUIDs
  attachments: any[] | null;            // JSON array of attachment metadata
}

/**
 * Competency Comment insert type
 */
export interface CompetencyCommentInsert {
  employee_competency_id: string;
  comment_text: string;
  comment_type?: 'general' | 'expiry_update' | 'renewal_in_progress' | 'renewal_completed' | 'unable_to_renew' | 'escalation';
  is_pinned?: boolean;
  created_by?: string | null;
  mentioned_users?: string[] | null;
  attachments?: any[] | null;
}

/**
 * Competency Comment update type
 */
export interface CompetencyCommentUpdate {
  comment_text?: string;
  comment_type?: 'general' | 'expiry_update' | 'renewal_in_progress' | 'renewal_completed' | 'unable_to_renew' | 'escalation';
  is_pinned?: boolean;
  mentioned_users?: string[] | null;
  attachments?: any[] | null;
}

/**
 * Extended EmployeeCompetency with comment info
 */
export interface EmployeeCompetencyWithComments extends EmployeeCompetency {
  comments?: CompetencyComment[];
  comment_count?: number;
  latest_comment?: string | null;
  has_pinned_comments?: boolean;
}

/**
 * Expiring competency with comment info (from RPC function)
 */
export interface ExpiringCompetencyWithComments {
  user_id: string;
  username: string;
  email: string;
  competency_id: string;
  competency_name: string;
  expiry_date: string;
  days_until_expiry: number;
  comment_count: number;
  latest_comment: string | null;
  latest_comment_type: string | null;
  has_renewal_in_progress: boolean;
}

/**
 * Competency status type guard
 */
export function isValidCompetencyStatus(status: string): status is EmployeeCompetency['status'] {
  return ['active', 'expired', 'pending_approval', 'rejected'].includes(status);
}

/**
 * Field type type guard
 */
export function isValidFieldType(type: string): type is CompetencyDefinition['field_type'] {
  return ['text', 'date', 'expiry_date', 'boolean', 'file', 'number'].includes(type);
}

/**
 * Comment type type guard
 */
export function isValidCommentType(type: string): type is CompetencyComment['comment_type'] {
  return ['general', 'expiry_update', 'renewal_in_progress', 'renewal_completed', 'unable_to_renew', 'escalation'].includes(type);
}
