// Admin Dashboard Type Definitions

// ============================================================================
// Organization Types
// ============================================================================

export interface Organization {
  id: string;
  name: string;
  created_at: string;
  updated_at?: string;
  createdAt?: string; // Legacy field
  updatedAt?: string; // Legacy field
}

export interface OrganizationStats extends Organization {
  userCount?: number;
  organizationId: string;
  organizationName: string;
}

// ============================================================================
// User Types
// ============================================================================

export type UserRole = 'admin' | 'manager' | 'org_admin' | 'editor' | 'viewer';

export interface AdminUser {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  organization_id: string;
  organizationId?: string; // Legacy field
  organizations?: {
    name: string;
  };
  is_active: boolean;
  isActive?: boolean; // Legacy field
  created_at: string;
}

export interface CreateUserData {
  username: string;
  email: string;
  password: string;
  organization_id: string;
  organizationId?: string; // Legacy field
  role: UserRole;
}

// ============================================================================
// Request Types
// ============================================================================

export type RequestStatus = 'pending' | 'approved' | 'rejected';

export interface AccountRequest {
  id: string;
  username: string;
  email: string;
  organization_id: string;
  organizationId?: string; // Legacy field
  requested_role: UserRole;
  requestedRole?: UserRole; // Legacy field
  message?: string;
  status: RequestStatus;
  created_at: string;
  createdAt?: string; // Legacy field
  organizations?: {
    name: string;
  };
}

export interface PermissionRequest {
  id: string;
  user_id: string;
  user_current_role: UserRole;
  requested_role: UserRole;
  requestedRole?: UserRole; // Legacy field
  message?: string;
  status: RequestStatus;
  created_at: string;
  createdAt?: string; // Legacy field
  profiles?: {
    username: string;
    email: string;
    organizations?: {
      name: string;
    };
  };
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface AdminConfig {
  procedureNumbers: string[];
  equipmentModels: string[];
  probes: string[];
  calibrationBlocks: string[];
  couplants: string[];
  scannerFrames: string[];
  coatingTypes: string[];
  materials: string[];
  acceptanceCriteria: string[];
  clients: string[];
  locations: string[];
}

export type ConfigListName = keyof AdminConfig;

export interface ConfigListMetadata {
  label: string;
  icon: string;
}

export type ConfigMetadata = Record<ConfigListName, ConfigListMetadata>;

// ============================================================================
// Dashboard Stats Types
// ============================================================================

export interface AdminDashboardStats {
  organizationCount: number;
  userCount: number;
  pendingRequestCount: number;
  organizations: OrganizationStats[];
  recentUsers: AdminUser[];
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ============================================================================
// Form Data Types
// ============================================================================

export interface CreateOrganizationData {
  name: string;
}

export interface UpdateOrganizationData {
  name?: string;
}

export interface UpdateUserData {
  role?: UserRole;
  is_active?: boolean;
}

// ============================================================================
// View State Types
// ============================================================================

export type AdminView =
  | 'overview'
  | 'organizations'
  | 'users'
  | 'requests'
  | 'configuration';

export interface AdminViewState {
  currentView: AdminView;
  searchQuery?: string;
  filterRole?: UserRole;
  filterOrganization?: string;
}
