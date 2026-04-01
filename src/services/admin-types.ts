/**
 * Admin Service Type Definitions
 */

import type { Organization, Profile } from '../types/database.types.js';
import type { UserRole } from '../types/auth.types.js';

export type { Organization, Profile, UserRole };

export interface AdminDashboardStats {
  totalOrganizations: number;
  totalUsers: number;
  pendingAccountRequests: number;
  pendingPermissionRequests: number;
  recentActivity: ActivityItem[];
}

export interface ActivityItem {
  id: string;
  type: 'user_created' | 'organization_created' | 'request_approved';
  description: string;
  timestamp: Date;
  userId?: string;
  organizationId?: string;
}

export interface OrganizationStats {
  organization: Organization;
  userCount: number;
}

export interface CreateUserData {
  username: string;
  email: string;
  password: string;
  role: UserRole;
  organizationId?: string;
}

export interface UpdateUserData {
  username?: string;
  email?: string;
  role?: UserRole;
  organizationId?: string;
  isActive?: boolean;
}

export interface AccountRequest {
  id: string;
  username: string;
  email: string;
  organization_id: string;
  requested_role: string;
  message?: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  organizations?: {
    id: string;
    name: string;
  };
}

export interface PermissionRequest {
  id: string;
  user_id: string;
  current_role: string;
  requested_role: string;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  profiles?: {
    id: string;
    username: string;
    email: string;
  };
}

export interface ConfigMetadata {
  procedureNumbers: { label: string; icon: string };
  equipmentModels: { label: string; icon: string };
  probes: { label: string; icon: string };
  calibrationBlocks: { label: string; icon: string };
  couplants: { label: string; icon: string };
  scannerFrames: { label: string; icon: string };
  coatingTypes: { label: string; icon: string };
  materials: { label: string; icon: string };
  acceptanceCriteria: { label: string; icon: string };
  clients: { label: string; icon: string };
  locations: { label: string; icon: string };
}

export interface ServiceResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface SystemAnnouncement {
  id: string;
  title: string | null;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  is_active: boolean;
  is_dismissible: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface UpdateAnnouncementData {
  title?: string | null;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  is_active: boolean;
  is_dismissible: boolean;
}
