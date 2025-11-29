// Admin Dashboard Type Definitions
// Types for the admin dashboard migration from legacy tools to modern React components

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
  assetCount?: number;
  scanCount?: number;
  organizationId: string;
  organizationName: string;
  totalAssets: number;
  totalVessels: number;
  totalScans: number;
}

// ============================================================================
// User Types
// ============================================================================

export type UserRole = 'admin' | 'org_admin' | 'editor' | 'viewer';

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
// Asset Types
// ============================================================================

export interface Vessel {
  id: string;
  name: string;
  scans?: Scan[];
}

export interface Scan {
  id: string;
  name: string;
}

export interface AdminAsset {
  id: string;
  name: string;
  organization_id: string;
  organizationId?: string; // Legacy field
  vessels?: Vessel[];
  created_at: string;
  createdAt?: string; // Legacy field
}

// ============================================================================
// Share Types
// ============================================================================

export type ShareType = 'asset' | 'vessel' | 'scan';
export type SharePermission = 'view' | 'edit';

export interface AssetShare {
  id: string;
  asset_id: string;
  vessel_id?: string | null;
  scan_id?: string | null;
  share_type: ShareType;
  owner_organization_id: string;
  shared_with_organization_id: string;
  permission: SharePermission;
  created_at: string;
  owner_org?: {
    name: string;
  };
  shared_with_org?: {
    name: string;
  };
}

export interface AccessRequest {
  request_id: string;
  user_id: string;
  username: string;
  user_email: string;
  user_org_name: string;
  asset_id: string;
  vessel_id?: string | null;
  scan_id?: string | null;
  requested_permission: SharePermission;
  message?: string;
  created_at: string;
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
  assetCount: number;
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

export interface ShareAssetData {
  assetId: string;
  vesselId?: string | null;
  scanId?: string | null;
  sharedWithOrganizationId: string;
  permission: SharePermission;
}

export interface TransferAssetData {
  assetId: string;
  targetOrganizationId: string;
}

export interface BulkTransferData {
  assetIds: string[];
  targetOrganizationId: string;
}

// ============================================================================
// View State Types
// ============================================================================

export type AdminView =
  | 'overview'
  | 'organizations'
  | 'users'
  | 'assets'
  | 'requests'
  | 'sharing'
  | 'configuration';

export interface AdminViewState {
  currentView: AdminView;
  searchQuery?: string;
  filterRole?: UserRole;
  filterOrganization?: string;
  selectedAssets?: string[];
}
