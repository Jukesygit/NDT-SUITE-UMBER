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
