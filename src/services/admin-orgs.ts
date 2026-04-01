/**
 * Admin Organization Operations
 */

import authManager from '../auth-manager.js';
import { logActivity } from './activity-log-service';
import type {
  Organization,
  OrganizationStats,
  ServiceResult,
  ActivityItem,
  AdminDashboardStats,
} from './admin-types';
import { getPermissionRequests } from './admin-users';

// ==========================================================================
// STATS
// ==========================================================================

export async function getDashboardStats(): Promise<AdminDashboardStats> {
  try {
    await authManager.ensureInitialized();

    // Get organizations
    const organizations = await authManager.getOrganizations();
    const filteredOrgs = organizations.filter((org: Organization) => org.name !== 'SYSTEM');

    // Get users
    const users = await authManager.getUsers();

    // Get pending requests
    const accountRequests = await authManager.getPendingAccountRequests();
    const permissionRequests = await getPermissionRequests();
    const pendingPermissions = permissionRequests.filter(req => req.status === 'pending');

    const recentActivity: ActivityItem[] = [];

    return {
      totalOrganizations: filteredOrgs.length,
      totalUsers: users.length,
      pendingAccountRequests: accountRequests.length,
      pendingPermissionRequests: pendingPermissions.length,
      recentActivity,
    };
  } catch (error) {
    return {
      totalOrganizations: 0,
      totalUsers: 0,
      pendingAccountRequests: 0,
      pendingPermissionRequests: 0,
      recentActivity: [],
    };
  }
}

// ==========================================================================
// ORGANIZATIONS
// ==========================================================================

export async function getOrganizations(): Promise<Organization[]> {
  const orgs = await authManager.getOrganizations();
  return orgs.filter((org: Organization) => org.name !== 'SYSTEM');
}

export async function getOrganizationsWithStats(): Promise<OrganizationStats[]> {
  const organizations = await getOrganizations();

  return organizations.map((org: Organization) => ({
    organization: org,
    userCount: 0,
  }));
}

export async function createOrganization(name: string): Promise<ServiceResult<Organization>> {
  const result = await authManager.createOrganization(name);

  if (result.success) {
    logActivity({
      actionType: 'organization_created',
      actionCategory: 'admin',
      description: `Created organization: ${name}`,
      entityType: 'organization',
      entityName: name,
    });
  }

  return result;
}

export async function updateOrganization(id: string, data: { name: string }): Promise<ServiceResult<Organization>> {
  const result = await authManager.updateOrganization(id, data);

  if (result.success) {
    logActivity({
      actionType: 'organization_updated',
      actionCategory: 'admin',
      description: `Updated organization: ${data.name}`,
      entityType: 'organization',
      entityId: id,
      entityName: data.name,
    });
  }

  return result;
}

export async function deleteOrganization(id: string): Promise<ServiceResult> {
  const result = await authManager.deleteOrganization(id);

  if (result.success) {
    logActivity({
      actionType: 'organization_deleted',
      actionCategory: 'admin',
      description: `Deleted organization: ${id}`,
      entityType: 'organization',
      entityId: id,
    });
  }

  return result;
}
