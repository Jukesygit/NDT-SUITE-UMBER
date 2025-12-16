/**
 * Admin Service Layer
 * Wraps existing managers for the admin dashboard with unified TypeScript interface
 */

import { supabase } from '../supabase-client.js';
import authManager from '../auth-manager.js';
import dataManager from '../data-manager.js';
import sharingManager from '../sharing-manager.js';
import adminConfig from '../admin-config.js';
import type { Organization, Profile } from '../types/database.types.js';
import type { UserRole } from '../types/auth.types.js';

// ============================================================================
// Type Definitions
// ============================================================================

export interface AdminDashboardStats {
  totalOrganizations: number;
  totalUsers: number;
  totalAssets: number;
  totalVessels: number;
  totalScans: number;
  pendingAccountRequests: number;
  pendingPermissionRequests: number;
  activeShares: number;
  recentActivity: ActivityItem[];
}

export interface ActivityItem {
  id: string;
  type: 'user_created' | 'organization_created' | 'asset_created' | 'share_created' | 'request_approved';
  description: string;
  timestamp: Date;
  userId?: string;
  organizationId?: string;
}

export interface OrganizationStats {
  organization: Organization;
  userCount: number;
  assetCount: number;
  vesselCount: number;
  scanCount: number;
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

export interface Share {
  id: string;
  owner_organization_id: string;
  shared_with_organization_id: string;
  asset_id: string;
  vessel_id?: string;
  scan_id?: string;
  share_type: 'asset' | 'vessel' | 'scan';
  permission: 'view' | 'edit';
  created_at: string;
  shared_by?: string;
}

export interface AccessRequest {
  id: string;
  user_id: string;
  user_organization_id: string;
  owner_organization_id: string;
  asset_id: string;
  vessel_id?: string;
  scan_id?: string;
  requested_permission: 'view' | 'edit';
  message?: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
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

// ============================================================================
// Admin Service Class
// ============================================================================

class AdminService {
  // ==========================================================================
  // STATS
  // ==========================================================================

  /**
   * Get comprehensive dashboard statistics
   */
  async getDashboardStats(): Promise<AdminDashboardStats> {
    try {
      await authManager.ensureInitialized();
      await dataManager.ensureInitialized();

      // Get organizations
      const organizations = await authManager.getOrganizations();
      const filteredOrgs = organizations.filter((org: Organization) => org.name !== 'SYSTEM');

      // Get users
      const users = await authManager.getUsers();

      // Get data stats
      const dataStats = dataManager.getStats();

      // Get pending requests
      const accountRequests = await authManager.getPendingAccountRequests();
      const permissionRequests = await this.getPermissionRequests();
      const pendingPermissions = permissionRequests.filter(req => req.status === 'pending');

      // Get shares
      const shares = await sharingManager.getAllShares();

      // Build recent activity (placeholder - can be enhanced later)
      const recentActivity: ActivityItem[] = [];

      return {
        totalOrganizations: filteredOrgs.length,
        totalUsers: users.length,
        totalAssets: dataStats.totalAssets,
        totalVessels: dataStats.totalVessels,
        totalScans: dataStats.totalScans,
        pendingAccountRequests: accountRequests.length,
        pendingPermissionRequests: pendingPermissions.length,
        activeShares: shares.length,
        recentActivity,
      };
    } catch (error) {
      console.error('Error getting dashboard stats:', error);
      return {
        totalOrganizations: 0,
        totalUsers: 0,
        totalAssets: 0,
        totalVessels: 0,
        totalScans: 0,
        pendingAccountRequests: 0,
        pendingPermissionRequests: 0,
        activeShares: 0,
        recentActivity: [],
      };
    }
  }

  // ==========================================================================
  // ORGANIZATIONS
  // ==========================================================================

  /**
   * Get all organizations (excluding SYSTEM)
   */
  async getOrganizations(): Promise<Organization[]> {
    const orgs = await authManager.getOrganizations();
    return orgs.filter((org: Organization) => org.name !== 'SYSTEM');
  }

  /**
   * Get organizations with statistics
   */
  async getOrganizationsWithStats(): Promise<OrganizationStats[]> {
    const organizations = await this.getOrganizations();
    const allOrgStats = await dataManager.getAllOrganizationStats();

    return organizations.map((org: Organization) => {
      const stats = allOrgStats.find((s: { organizationId: string; organizationName: string; totalAssets: number; totalVessels: number; totalScans: number }) => s.organizationId === org.id);
      return {
        organization: org,
        userCount: 0, // TODO: Get user count per org
        assetCount: stats?.totalAssets || 0,
        vesselCount: stats?.totalVessels || 0,
        scanCount: stats?.totalScans || 0,
      };
    });
  }

  /**
   * Create a new organization
   */
  async createOrganization(name: string): Promise<ServiceResult<Organization>> {
    return await authManager.createOrganization(name);
  }

  /**
   * Update an organization
   */
  async updateOrganization(id: string, data: { name: string }): Promise<ServiceResult<Organization>> {
    return await authManager.updateOrganization(id, data);
  }

  /**
   * Delete an organization
   */
  async deleteOrganization(id: string): Promise<ServiceResult> {
    return await authManager.deleteOrganization(id);
  }

  // ==========================================================================
  // USERS
  // ==========================================================================

  /**
   * Get all users
   */
  async getUsers(): Promise<Profile[]> {
    return await authManager.getUsers();
  }

  /**
   * Get a specific user by ID
   */
  async getUser(id: string): Promise<Profile | null> {
    return await authManager.getUser(id);
  }

  /**
   * Create a new user
   */
  async createUser(data: CreateUserData): Promise<ServiceResult> {
    // Map CreateUserData to authManager format
    const userData = {
      username: data.username,
      email: data.email,
      password: data.password,
      role: data.role,
      organizationId: data.organizationId,
    };

    return await authManager.createUser(userData);
  }

  /**
   * Update a user
   */
  async updateUser(id: string, data: UpdateUserData): Promise<ServiceResult<Profile>> {
    // Map UpdateUserData to authManager format
    const updates: any = {};

    if (data.username !== undefined) updates.username = data.username;
    if (data.email !== undefined) updates.email = data.email;
    if (data.role !== undefined) updates.role = data.role;
    if (data.organizationId !== undefined) updates.organization_id = data.organizationId;
    if (data.isActive !== undefined) updates.is_active = data.isActive;

    return await authManager.updateUser(id, updates);
  }

  /**
   * Delete a user
   */
  async deleteUser(id: string): Promise<ServiceResult> {
    return await authManager.deleteUser(id);
  }

  // ==========================================================================
  // ACCOUNT REQUESTS
  // ==========================================================================

  /**
   * Get all pending account requests
   */
  async getAccountRequests(): Promise<AccountRequest[]> {
    return await authManager.getPendingAccountRequests();
  }

  /**
   * Approve an account request
   */
  async approveAccountRequest(id: string): Promise<ServiceResult> {
    return await authManager.approveAccountRequest(id);
  }

  /**
   * Reject an account request
   */
  async rejectAccountRequest(id: string, reason?: string): Promise<ServiceResult> {
    return await authManager.rejectAccountRequest(id, reason || '');
  }

  // ==========================================================================
  // PERMISSION REQUESTS
  // ==========================================================================

  /**
   * Get all permission requests
   */
  async getPermissionRequests(): Promise<PermissionRequest[]> {
    if (!authManager.isUsingSupabase()) {
      return [];
    }

    try {
      // First, get permission requests without join (FK may not exist)
      const { data: requests, error: reqError } = await supabase!
        .from('permission_requests')
        .select(`
          id,
          user_id,
          requested_role,
          user_current_role,
          message,
          status,
          approved_by,
          rejected_by,
          rejection_reason,
          created_at,
          approved_at,
          rejected_at
        `)
        .order('created_at', { ascending: false });

      if (reqError) {
        console.error('Error fetching permission requests:', reqError);
        return [];
      }

      if (!requests || requests.length === 0) {
        return [];
      }

      // Get unique user IDs from requests
      const userIds = [...new Set(requests.map((r: { user_id: string }) => r.user_id))];

      // Fetch profiles for those users
      const { data: profiles } = await supabase!
        .from('profiles')
        .select('id, username, email')
        .in('id', userIds);

      // Map profiles to requests
      const profileMap = new Map(profiles?.map((p: { id: string; username: string; email: string }) => [p.id, p]) || []);

      return requests.map((req: { user_id: string; [key: string]: any }) => ({
        ...req,
        profiles: profileMap.get(req.user_id) || undefined,
      }));
    } catch (error) {
      console.error('Error fetching permission requests:', error);
      return [];
    }
  }

  /**
   * Approve a permission request
   */
  async approvePermissionRequest(id: string): Promise<ServiceResult> {
    if (!authManager.isUsingSupabase()) {
      return { success: false, error: 'Supabase not configured' };
    }

    try {
      const { data, error } = await supabase!.rpc('approve_permission_request', {
        request_id: id,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Reject a permission request
   */
  async rejectPermissionRequest(id: string, reason?: string): Promise<ServiceResult> {
    if (!authManager.isUsingSupabase()) {
      return { success: false, error: 'Supabase not configured' };
    }

    try {
      const { data, error } = await supabase!.rpc('reject_permission_request', {
        request_id: id,
        rejection_reason: reason || 'Request denied',
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // ==========================================================================
  // ASSETS
  // ==========================================================================

  /**
   * Get all assets across organizations
   */
  async getAssets() {
    return dataManager.getAssets();
  }

  /**
   * Create an asset for a specific organization (admin only)
   * Inserts directly into Supabase for immediate availability in Data Hub
   */
  async createAssetForOrg(orgId: string, name: string): Promise<ServiceResult> {
    if (!authManager.isUsingSupabase()) {
      return { success: false, error: 'Supabase not configured' };
    }

    try {
      const user = authManager.getCurrentUser();
      if (!user) {
        return { success: false, error: 'User not authenticated' };
      }

      // Generate ID matching existing pattern
      const id = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Insert directly into Supabase for immediate availability
      const { data: asset, error } = await supabase!
        .from('assets')
        .insert({
          id,
          name,
          organization_id: orgId,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: asset };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Transfer an asset to another organization
   */
  async transferAsset(assetId: string, targetOrgId: string): Promise<ServiceResult> {
    try {
      await dataManager.transferAsset(assetId, targetOrgId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Bulk transfer assets to another organization
   */
  async bulkTransferAssets(assetIds: string[], targetOrgId: string): Promise<ServiceResult> {
    try {
      const result = await dataManager.bulkTransferAssets(assetIds, targetOrgId);
      return {
        success: true,
        data: result,
        message: `Transferred ${result.success.length} assets. Failed: ${result.failed.length}`,
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // ==========================================================================
  // SHARING
  // ==========================================================================

  /**
   * Get all shares
   */
  async getShares(): Promise<Share[]> {
    return await sharingManager.getAllShares();
  }

  /**
   * Get all access requests
   */
  async getAccessRequests(): Promise<AccessRequest[]> {
    return await sharingManager.getPendingAccessRequests();
  }

  /**
   * Create a new share
   */
  async createShare(data: {
    assetId: string;
    vesselId?: string | null;
    scanId?: string | null;
    sharedWithOrganizationId: string;
    permission: 'view' | 'edit';
  }): Promise<ServiceResult<Share>> {
    return await (sharingManager as any).shareAsset({
      assetId: data.assetId,
      vesselId: data.vesselId ?? null,
      scanId: data.scanId ?? null,
      sharedWithOrganizationId: data.sharedWithOrganizationId,
      permission: data.permission,
    }) as ServiceResult<Share>;
  }

  /**
   * Update share permissions
   */
  async updateShare(id: string, permission: 'view' | 'edit'): Promise<ServiceResult<Share>> {
    return await sharingManager.updateSharePermission(id, permission) as ServiceResult<Share>;
  }

  /**
   * Delete a share
   */
  async deleteShare(id: string): Promise<ServiceResult> {
    return await sharingManager.removeShare(id) as ServiceResult;
  }

  /**
   * Approve an access request
   */
  async approveAccessRequest(id: string): Promise<ServiceResult> {
    return await sharingManager.approveAccessRequest(id) as ServiceResult;
  }

  /**
   * Reject an access request
   */
  async rejectAccessRequest(id: string, reason?: string): Promise<ServiceResult> {
    return await sharingManager.rejectAccessRequest(id, reason || '') as ServiceResult;
  }

  // ==========================================================================
  // CONFIGURATION
  // ==========================================================================

  /**
   * Get all configuration lists
   */
  async getConfig(): Promise<Record<string, string[]>> {
    await adminConfig.ensureInitialized();
    return adminConfig.getAllConfig();
  }

  /**
   * Get configuration metadata
   */
  getConfigMetadata(): ConfigMetadata {
    return adminConfig.getListMetadata() as ConfigMetadata;
  }

  /**
   * Add an item to a configuration list
   */
  async addConfigItem(listName: string, item: string): Promise<ServiceResult> {
    return await adminConfig.addItem(listName, item);
  }

  /**
   * Update an item in a configuration list
   */
  async updateConfigItem(listName: string, oldItem: string, newItem: string): Promise<ServiceResult> {
    return await adminConfig.updateItem(listName, oldItem, newItem);
  }

  /**
   * Remove an item from a configuration list
   */
  async removeConfigItem(listName: string, item: string): Promise<ServiceResult> {
    return await adminConfig.removeItem(listName, item);
  }

  /**
   * Reset a configuration list to defaults
   */
  async resetConfigList(listName: string): Promise<ServiceResult> {
    return await adminConfig.resetList(listName);
  }

  /**
   * Reset all configuration lists to defaults
   */
  async resetAllConfig(): Promise<ServiceResult> {
    return await adminConfig.resetAllToDefaults();
  }

  /**
   * Export configuration as JSON string
   */
  exportConfig(): string {
    return adminConfig.exportConfig();
  }

  /**
   * Import configuration from JSON string
   */
  async importConfig(jsonString: string): Promise<ServiceResult> {
    return await adminConfig.importConfig(jsonString);
  }

  // ==========================================================================
  // ANNOUNCEMENTS
  // ==========================================================================

  /**
   * Get the active system announcement
   */
  async getActiveAnnouncement(): Promise<SystemAnnouncement | null> {
    if (!authManager.isUsingSupabase()) {
      return null;
    }

    try {
      const { data, error } = await supabase!
        .from('system_announcements')
        .select(`
          id,
          title,
          message,
          type,
          is_active,
          is_dismissible,
          created_at,
          updated_at,
          created_by,
          updated_by
        `)
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error fetching announcement:', error);
        return null;
      }

      return data as SystemAnnouncement | null;
    } catch (error) {
      console.error('Error fetching announcement:', error);
      return null;
    }
  }

  /**
   * Update or create the system announcement (admin only)
   */
  async updateAnnouncement(data: UpdateAnnouncementData): Promise<ServiceResult<SystemAnnouncement>> {
    if (!authManager.isUsingSupabase()) {
      return { success: false, error: 'Supabase not configured' };
    }

    try {
      const user = authManager.getCurrentUser();
      if (!user) {
        return { success: false, error: 'User not authenticated' };
      }

      // Check for existing announcement
      const { data: existing } = await supabase!
        .from('system_announcements')
        .select('id')
        .limit(1)
        .maybeSingle();

      let result;

      if (existing) {
        // Update existing announcement
        const { data: updated, error } = await supabase!
          .from('system_announcements')
          .update({
            title: data.title,
            message: data.message,
            type: data.type,
            is_active: data.is_active,
            is_dismissible: data.is_dismissible,
            updated_by: user.id,
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) {
          return { success: false, error: error.message };
        }
        result = updated;
      } else {
        // Create new announcement
        const { data: created, error } = await supabase!
          .from('system_announcements')
          .insert({
            title: data.title,
            message: data.message,
            type: data.type,
            is_active: data.is_active,
            is_dismissible: data.is_dismissible,
            created_by: user.id,
            updated_by: user.id,
          })
          .select()
          .single();

        if (error) {
          return { success: false, error: error.message };
        }
        result = created;
      }

      return { success: true, data: result as SystemAnnouncement };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Clear the system announcement (set inactive)
   */
  async clearAnnouncement(): Promise<ServiceResult> {
    if (!authManager.isUsingSupabase()) {
      return { success: false, error: 'Supabase not configured' };
    }

    try {
      const { error } = await supabase!
        .from('system_announcements')
        .update({ is_active: false })
        .eq('is_active', true);

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const adminService = new AdminService();

// Default export
export default adminService;
