/**
 * Personnel Management Type Definitions
 * NDT Suite - Aligned with Database Schema
 */

// ============================================================================
// Base Types
// ============================================================================

export type UserRole = 'admin' | 'org_admin' | 'editor' | 'viewer';

export type CompetencyStatus =
  | 'active'
  | 'expired'
  | 'pending_approval'
  | 'rejected';

export type CompetencyFieldType =
  | 'text'
  | 'date'
  | 'expiry_date'
  | 'boolean'
  | 'file'
  | 'number';

// ============================================================================
// Organization Types
// ============================================================================

export interface Organization {
  id: string;
  name: string;
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// Profile/Personnel Types
// ============================================================================

export interface Profile {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  organization_id?: string;
  organizations?: Organization;
  created_at?: string;
  updated_at?: string;
}

export interface PersonnelWithCompetencies extends Profile {
  competencies: EmployeeCompetency[];
}

// ============================================================================
// Competency Category Types
// ============================================================================

export interface CompetencyCategory {
  id: string;
  name: string;
  description?: string;
  display_order?: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// Competency Definition Types
// ============================================================================

export interface CompetencyDefinition {
  id: string;
  category_id: string;
  name: string;
  description?: string;
  field_type: CompetencyFieldType;
  requires_document: boolean;
  requires_approval: boolean;
  display_order?: number;
  is_active: boolean;
  category?: CompetencyCategory;
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// Employee Competency Types
// ============================================================================

export interface EmployeeCompetency {
  id: string;
  user_id: string;
  competency_id: string;
  value?: string;
  expiry_date?: string;
  document_url?: string;
  document_name?: string;
  status: CompetencyStatus;
  verified_by?: string;
  verified_at?: string;
  notes?: string;

  // Certification-specific fields
  issuing_body?: string;
  certification_id?: string;

  // Witness check fields (for NDT certifications)
  witness_checked?: boolean;
  witnessed_by?: string;
  witnessed_at?: string;
  witness_notes?: string;

  created_at?: string;
  updated_at?: string;

  // Related data (from joins)
  competency?: CompetencyDefinition;
  user?: Profile;
}

// ============================================================================
// Competency History Types
// ============================================================================

export type CompetencyHistoryAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'approved'
  | 'rejected'
  | 'expired';

export interface CompetencyHistory {
  id: string;
  employee_competency_id: string;
  user_id: string;
  competency_id: string;
  action: CompetencyHistoryAction;
  old_value?: string;
  new_value?: string;
  old_expiry_date?: string;
  new_expiry_date?: string;
  changed_by: string;
  change_reason?: string;
  created_at: string;
}

// ============================================================================
// Statistics & Dashboard Types
// ============================================================================

export interface CompetencyStats {
  total: number;
  active: number;
  expiring: number;
  expired: number;
  pending: number;
}

export interface PersonnelStats extends CompetencyStats {
  totalPersonnel: number;
}

// ============================================================================
// Matrix View Types
// ============================================================================

export interface CompetencyMatrixPerson {
  id: string;
  username: string;
  email: string;
  organization_id?: string;
  role: UserRole;
  competencies: EmployeeCompetency[];
}

export interface CompetencyMatrix {
  personnel: CompetencyMatrixPerson[];
  competencies: CompetencyDefinition[];
}

// ============================================================================
// Filter & Search Types
// ============================================================================

export interface PersonnelFilters {
  searchTerm?: string;
  organization?: string;
  role?: UserRole | 'all';
  competencies?: string[]; // Array of competency IDs
}

export interface PersonnelSorting {
  column: 'name' | 'org' | 'role' | 'total' | 'active' | 'expiring' | 'expired';
  direction: 'asc' | 'desc';
}

// ============================================================================
// View State Types
// ============================================================================

export type PersonnelView = 'directory' | 'matrix' | 'expiring' | 'pending';

export interface PersonnelPageState {
  view: PersonnelView;
  personnel: PersonnelWithCompetencies[];
  loading: boolean;
  filters: PersonnelFilters;
  sorting: PersonnelSorting;
  selectedPerson: PersonnelWithCompetencies | null;
  organizations: Organization[];
  competencyDefinitions: CompetencyDefinition[];
  expiringCompetencies: EmployeeCompetency[];
  pendingApprovals: EmployeeCompetency[];
  competencyMatrix: CompetencyMatrix | null;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface UpsertCompetencyRequest {
  userId: string;
  competencyId: string;
  value?: string;
  expiryDate?: string;
  documentUrl?: string;
  documentName?: string;
  issuingBody?: string;
  certificationId?: string;
  notes?: string;
  witnessChecked?: boolean;
  witnessedBy?: string;
  witnessedAt?: string;
  witnessNotes?: string;
}

export interface VerifyCompetencyRequest {
  competencyId: string;
  approved: boolean;
  reason?: string;
}

export interface UpdateCompetencyDatesRequest {
  userId: string;
  competencyId: string;
  issuedDate?: string;
  expiryDate?: string;
}

export interface BulkUpdateCompetencyStatus {
  competencyIds: string[];
  status: CompetencyStatus;
  reason?: string;
}

// ============================================================================
// Import/Export Types
// ============================================================================

export interface CSVExportRow {
  Name: string;
  Email: string;
  Organization: string;
  Role: string;
  [key: string]: string; // Dynamic competency columns
}

export interface ImportResult {
  success: boolean;
  imported: number;
  failed: number;
  errors: ImportError[];
}

export interface ImportError {
  row: number;
  field: string;
  message: string;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Helper type to make specific properties optional
 */
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Helper type for form data (removes timestamps and IDs)
 */
export type PersonnelFormData = Optional<Profile, 'id' | 'created_at' | 'updated_at'>;

export type CompetencyFormData = Optional<
  EmployeeCompetency,
  'id' | 'created_at' | 'updated_at' | 'status'
>;
