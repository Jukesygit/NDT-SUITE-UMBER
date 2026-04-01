/**
 * Admin User, Account Request, and Permission Request Operations
 */

import { supabase } from '../supabase-client.js';
import authManager from '../auth-manager.js';
import { logActivity } from './activity-log-service';
import type {
  Profile,
  CreateUserData,
  UpdateUserData,
  AccountRequest,
  PermissionRequest,
  ServiceResult,
} from './admin-types';

// ==========================================================================
// USERS
// ==========================================================================

export async function getUsers(): Promise<Profile[]> {
  return await authManager.getUsers();
}

export async function getUser(id: string): Promise<Profile | null> {
  return await authManager.getUser(id);
}

export async function createUser(data: CreateUserData): Promise<ServiceResult> {
  const userData = {
    username: data.username,
    email: data.email,
    password: data.password,
    role: data.role,
    organizationId: data.organizationId,
  };

  const result = await authManager.createUser(userData);

  if (result.success) {
    logActivity({
      actionType: 'user_created',
      actionCategory: 'admin',
      description: `Created user: ${data.username}`,
      entityType: 'user',
      entityName: data.username,
      details: { email: data.email, role: data.role },
    });
  }

  return result;
}

export async function updateUser(id: string, data: UpdateUserData): Promise<ServiceResult<Profile>> {
  const updates: Record<string, string | boolean | undefined> = {};

  if (data.username !== undefined) updates.username = data.username;
  if (data.email !== undefined) updates.email = data.email;
  if (data.role !== undefined) updates.role = data.role;
  if (data.organizationId !== undefined) updates.organization_id = data.organizationId;
  if (data.isActive !== undefined) updates.is_active = data.isActive;

  const result = await authManager.updateUser(id, updates);

  if (result.success) {
    logActivity({
      actionType: 'user_updated',
      actionCategory: 'admin',
      description: `Updated user: ${data.username || id}`,
      entityType: 'user',
      entityId: id,
      entityName: data.username,
      details: { updatedFields: Object.keys(data) },
    });
  }

  return result;
}

export async function deleteUser(id: string): Promise<ServiceResult> {
  const result = await authManager.deleteUser(id);

  if (result.success) {
    logActivity({
      actionType: 'user_deleted',
      actionCategory: 'admin',
      description: `Deleted user: ${id}`,
      entityType: 'user',
      entityId: id,
    });
  }

  return result;
}

// ==========================================================================
// ACCOUNT REQUESTS
// ==========================================================================

export async function getAccountRequests(): Promise<AccountRequest[]> {
  return await authManager.getPendingAccountRequests();
}

export async function approveAccountRequest(id: string): Promise<ServiceResult> {
  const result = await authManager.approveAccountRequest(id);

  if (result.success) {
    logActivity({
      actionType: 'account_approved',
      actionCategory: 'admin',
      description: `Approved account request`,
      entityType: 'account_request',
      entityId: id,
    });
  }

  return result;
}

export async function rejectAccountRequest(id: string, reason?: string): Promise<ServiceResult> {
  const result = await authManager.rejectAccountRequest(id, reason || '');

  if (result.success) {
    logActivity({
      actionType: 'account_rejected',
      actionCategory: 'admin',
      description: `Rejected account request${reason ? `: ${reason}` : ''}`,
      entityType: 'account_request',
      entityId: id,
      details: { reason },
    });
  }

  return result;
}

// ==========================================================================
// PERMISSION REQUESTS
// ==========================================================================

export async function getPermissionRequests(): Promise<PermissionRequest[]> {
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

    return requests.map((req: { user_id: string; [key: string]: unknown }) => ({
      ...req,
      profiles: profileMap.get(req.user_id) || undefined,
    }));
  } catch (error) {
    return [];
  }
}

export async function approvePermissionRequest(id: string): Promise<ServiceResult> {
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

    logActivity({
      actionType: 'permission_approved',
      actionCategory: 'admin',
      description: `Approved permission request`,
      entityType: 'permission_request',
      entityId: id,
    });

    return { success: true, data };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'An unexpected error occurred' };
  }
}

export async function rejectPermissionRequest(id: string, reason?: string): Promise<ServiceResult> {
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

    logActivity({
      actionType: 'permission_rejected',
      actionCategory: 'admin',
      description: `Rejected permission request${reason ? `: ${reason}` : ''}`,
      entityType: 'permission_request',
      entityId: id,
      details: { reason },
    });

    return { success: true, data };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'An unexpected error occurred' };
  }
}
