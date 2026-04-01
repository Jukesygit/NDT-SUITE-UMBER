/**
 * Admin Service Layer - Barrel Module
 * Re-exports types and composes the AdminService singleton from focused modules.
 */

// Re-export all types
export type {
  AdminDashboardStats,
  ActivityItem,
  OrganizationStats,
  CreateUserData,
  UpdateUserData,
  AccountRequest,
  PermissionRequest,
  ConfigMetadata,
  ServiceResult,
  SystemAnnouncement,
  UpdateAnnouncementData,
} from './admin-types';

import type { Organization, Profile } from '../types/database.types.js';
import type {
  AdminDashboardStats,
  OrganizationStats,
  CreateUserData,
  UpdateUserData,
  AccountRequest,
  PermissionRequest,
  ConfigMetadata,
  ServiceResult,
  SystemAnnouncement,
  UpdateAnnouncementData,
} from './admin-types';

import * as orgs from './admin-orgs';
import * as users from './admin-users';
import * as config from './admin-config';

// ============================================================================
// Admin Service Class (delegates to focused modules)
// ============================================================================

class AdminService {
  // Stats
  getDashboardStats(): Promise<AdminDashboardStats> {
    return orgs.getDashboardStats();
  }

  // Organizations
  getOrganizations(): Promise<Organization[]> {
    return orgs.getOrganizations();
  }
  getOrganizationsWithStats(): Promise<OrganizationStats[]> {
    return orgs.getOrganizationsWithStats();
  }
  createOrganization(name: string): Promise<ServiceResult<Organization>> {
    return orgs.createOrganization(name);
  }
  updateOrganization(id: string, data: { name: string }): Promise<ServiceResult<Organization>> {
    return orgs.updateOrganization(id, data);
  }
  deleteOrganization(id: string): Promise<ServiceResult> {
    return orgs.deleteOrganization(id);
  }

  // Users
  getUsers(): Promise<Profile[]> {
    return users.getUsers();
  }
  getUser(id: string): Promise<Profile | null> {
    return users.getUser(id);
  }
  createUser(data: CreateUserData): Promise<ServiceResult> {
    return users.createUser(data);
  }
  updateUser(id: string, data: UpdateUserData): Promise<ServiceResult<Profile>> {
    return users.updateUser(id, data);
  }
  deleteUser(id: string): Promise<ServiceResult> {
    return users.deleteUser(id);
  }

  // Account Requests
  getAccountRequests(): Promise<AccountRequest[]> {
    return users.getAccountRequests();
  }
  approveAccountRequest(id: string): Promise<ServiceResult> {
    return users.approveAccountRequest(id);
  }
  rejectAccountRequest(id: string, reason?: string): Promise<ServiceResult> {
    return users.rejectAccountRequest(id, reason);
  }

  // Permission Requests
  getPermissionRequests(): Promise<PermissionRequest[]> {
    return users.getPermissionRequests();
  }
  approvePermissionRequest(id: string): Promise<ServiceResult> {
    return users.approvePermissionRequest(id);
  }
  rejectPermissionRequest(id: string, reason?: string): Promise<ServiceResult> {
    return users.rejectPermissionRequest(id, reason);
  }

  // Configuration
  getConfig(): Promise<Record<string, string[]>> {
    return config.getConfig();
  }
  getConfigMetadata(): ConfigMetadata {
    return config.getConfigMetadata();
  }
  addConfigItem(listName: string, item: string): Promise<ServiceResult> {
    return config.addConfigItem(listName, item);
  }
  updateConfigItem(listName: string, oldItem: string, newItem: string): Promise<ServiceResult> {
    return config.updateConfigItem(listName, oldItem, newItem);
  }
  removeConfigItem(listName: string, item: string): Promise<ServiceResult> {
    return config.removeConfigItem(listName, item);
  }
  resetConfigList(listName: string): Promise<ServiceResult> {
    return config.resetConfigList(listName);
  }
  resetAllConfig(): Promise<ServiceResult> {
    return config.resetAllConfig();
  }
  exportConfig(): string {
    return config.exportConfig();
  }
  importConfig(jsonString: string): Promise<ServiceResult> {
    return config.importConfig(jsonString);
  }

  // Announcements
  getActiveAnnouncement(): Promise<SystemAnnouncement | null> {
    return config.getActiveAnnouncement();
  }
  updateAnnouncement(data: UpdateAnnouncementData): Promise<ServiceResult<SystemAnnouncement>> {
    return config.updateAnnouncement(data);
  }
  clearAnnouncement(): Promise<ServiceResult> {
    return config.clearAnnouncement();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const adminService = new AdminService();

// Default export
export default adminService;
