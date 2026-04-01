/**
 * Auth Accounts - Account requests and bulk user creation.
 *
 * Handles the account request workflow (submit, approve, reject)
 * and bulk user creation via edge functions.
 */

import supabase from '../supabase-client.js';
import {
    ROLES,
    type AuthResult,
    type AccountRequestData,
    type LocalAccountRequest,
    type BulkCreateUserData,
} from './auth-types';
import { generateId } from './auth-core';

// ── Account Requests ───────────────────────────────────────────────────────

export async function requestAccount(
    this: any,
    requestData: AccountRequestData,
): Promise<AuthResult> {
    if (this.useSupabase) {
        try {
            const { data, error } = await supabase.functions.invoke('submit-account-request', {
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
    } else {
        const request: LocalAccountRequest = {
            id: generateId(),
            username: requestData.username,
            email: requestData.email,
            requestedRole: requestData.requestedRole || ROLES.VIEWER,
            organizationId: requestData.organizationId,
            message: requestData.message || '',
            status: 'pending',
            createdAt: Date.now(),
        };

        this.authData.accountRequests.push(request);
        await this.saveAuthData();

        return { success: true, request };
    }
}

export async function getPendingAccountRequests(this: any): Promise<any[]> {
    if (!this.isAdmin() && this.currentUser?.role !== ROLES.ORG_ADMIN) {
        return [];
    }

    if (this.useSupabase) {
        let query = supabase
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
    } else {
        if (this.isAdmin()) {
            return this.authData.accountRequests.filter((r: any) => r.status === 'pending');
        }

        return this.authData.accountRequests.filter(
            (r: any) => r.status === 'pending' && r.organizationId === this.currentUser.organizationId,
        );
    }
}

export async function approveAccountRequest(
    this: any,
    requestId: string,
): Promise<AuthResult> {
    if (this.useSupabase) {
        try {
            const { data, error } = await supabase.functions.invoke('approve-account-request', {
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
    } else {
        const request = this.authData.accountRequests.find((r: any) => r.id === requestId);
        if (!request) {
            return { success: false, error: 'Request not found' };
        }

        const tempPassword = 'ChangeMe123!';
        const result = await this.createUser({
            username: request.username,
            email: request.email,
            password: tempPassword,
            role: request.requestedRole,
            organizationId: request.organizationId,
        });

        if (result.success) {
            request.status = 'approved';
            request.approvedAt = Date.now();
            request.approvedBy = this.currentUser.id;
            await this.saveAuthData();
        }

        return result;
    }
}

export async function rejectAccountRequest(
    this: any,
    requestId: string,
    reason: string,
): Promise<AuthResult> {
    if (this.useSupabase) {
        const { error } = await supabase
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
    } else {
        const request = this.authData.accountRequests.find((r: any) => r.id === requestId);
        if (!request) {
            return { success: false, error: 'Request not found' };
        }

        request.status = 'rejected';
        request.rejectedAt = Date.now();
        request.rejectedBy = this.currentUser.id;
        request.rejectionReason = reason;
        await this.saveAuthData();

        return { success: true };
    }
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

    if (!this.useSupabase) {
        return { success: false, error: 'Bulk user creation only available in Supabase mode' };
    }

    if (!Array.isArray(users) || users.length === 0) {
        return { success: false, error: 'Users array is required' };
    }

    try {
        const { data, error } = await supabase.functions.invoke('bulk-create-users', {
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
