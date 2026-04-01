/**
 * Auth Accounts - Account requests and bulk user creation.
 *
 * Handles the account request workflow (submit, approve, reject)
 * and bulk user creation via Supabase edge functions.
 *
 * Local/IndexedDB fallback has been deprecated (April 2026).
 */

import supabase from '../supabase-client';
import {
    ROLES,
    type AuthResult,
    type AccountRequestData,
    type BulkCreateUserData,
} from './auth-types';

// Supabase is guaranteed initialized when auth services are called
const sb = supabase!;

// ── Account Requests ───────────────────────────────────────────────────────

export async function requestAccount(
    this: any,
    requestData: AccountRequestData,
): Promise<AuthResult> {
    try {
        const { data, error } = await sb.functions.invoke('submit-account-request', {
            body: {
                username: requestData.username,
                email: requestData.email,
                organization_id: requestData.organizationId,
                requested_role: requestData.requestedRole || ROLES.VIEWER,
                message: requestData.message || '',
            },
        });

        if (error) {
            return { success: false, error: error.message };
        }

        if (data?.error) {
            return { success: false, error: data.error };
        }

        return { success: true, request: data?.request };
    } catch (err: any) {
        return { success: false, error: err.message || 'Failed to submit request' };
    }
}

export async function getPendingAccountRequests(this: any): Promise<any[]> {
    if (!this.isAdmin() && this.currentUser?.role !== ROLES.ORG_ADMIN) {
        return [];
    }

    let query = sb
        .from('account_requests')
        .select('*, organizations(*)')
        .eq('status', 'pending');

    if (this.currentUser?.role === ROLES.ORG_ADMIN) {
        query = query.eq('organization_id', this.currentUser.organizationId);
    }

    const { data, error } = await query;

    if (error) {
        return [];
    }

    return data || [];
}

export async function approveAccountRequest(
    this: any,
    requestId: string,
): Promise<AuthResult> {
    try {
        const { data, error } = await sb.functions.invoke('approve-account-request', {
            body: {
                request_id: requestId,
                approved_by_user_id: this.currentUser.id,
            },
        });

        if (error) {
            return { success: false, error: error.message || JSON.stringify(error) };
        }

        if (data?.error) {
            const errorMsg = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
            const details = data.details ? ` Details: ${JSON.stringify(data.details)}` : '';
            return { success: false, error: errorMsg + details };
        }

        return {
            success: true,
            message: data?.message || 'Account created successfully. User will receive an email to set their password.',
        };
    } catch (err: any) {
        return { success: false, error: err.message || 'Failed to approve request' };
    }
}

export async function rejectAccountRequest(
    this: any,
    requestId: string,
    reason: string,
): Promise<AuthResult> {
    const { error } = await sb
        .from('account_requests')
        .update({
            status: 'rejected',
            rejected_by: this.currentUser.id,
            rejected_at: new Date().toISOString(),
            rejection_reason: reason,
        })
        .eq('id', requestId);

    if (error) {
        return { success: false, error: error.message };
    }

    return { success: true };
}

// ── Bulk User Creation ─────────────────────────────────────────────────────

export async function bulkCreateUsers(
    this: any,
    users: BulkCreateUserData[],
    sendPasswordReset: boolean = true,
): Promise<AuthResult> {
    if (!this.isAdmin()) {
        return { success: false, error: 'Only admins can bulk create users' };
    }

    if (!Array.isArray(users) || users.length === 0) {
        return { success: false, error: 'Users array is required' };
    }

    try {
        const { data, error } = await sb.functions.invoke('bulk-create-users', {
            body: {
                users: users.map((u: BulkCreateUserData) => ({
                    email: u.email,
                    username: u.username,
                    role: u.role || 'viewer',
                    organization_id: u.organizationId || u.organization_id || null,
                })),
                send_password_reset: sendPasswordReset,
            },
        });

        if (error) {
            return { success: false, error: error.message };
        }

        if (data?.error) {
            return { success: false, error: data.error };
        }

        return {
            success: true,
            message: data?.message,
            results: data?.results || [],
        };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}
