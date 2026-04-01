/**
 * Auth Users - User management and account requests.
 *
 * Handles CRUD operations for users, account request workflow,
 * user sync, and bulk user creation.
 */

import supabase from '../supabase-client.js';
import bcrypt from 'bcryptjs';
import {
    ROLES,
    PERMISSIONS,
    type AuthResult,
    type CreateUserData,
} from './auth-types';
import { generateId } from './auth-core';

// ── User CRUD ──────────────────────────────────────────────────────────────

export async function createUser(
    this: any,
    userData: CreateUserData,
): Promise<AuthResult> {
    const canManageUsers = this.hasPermission(PERMISSIONS.MANAGE_USERS);

    if (!canManageUsers) {
        return { success: false, error: 'Permission denied' };
    }

    if (this.currentUser.role === ROLES.ORG_ADMIN &&
        userData.organizationId !== this.currentUser.organizationId) {
        return { success: false, error: 'Can only create users in your organization' };
    }

    if ((userData.role === ROLES.ADMIN || userData.role === ROLES.ORG_ADMIN) &&
        !this.isAdmin()) {
        return { success: false, error: 'Insufficient permissions to create admin users' };
    }

    if (this.useSupabase) {
        const orgId = userData.organizationId ? String(userData.organizationId) : null;

        const { data, error } = await supabase.functions.invoke('create-user', {
            body: {
                email: userData.email,
                username: userData.username,
                password: userData.password,
                role: userData.role || 'viewer',
                organization_id: orgId,
            },
        });

        if (error) {
            const errorMessage = (error as any).context?.error || error.message;
            return { success: false, error: errorMessage };
        }

        if (data?.error) {
            return { success: false, error: data.error };
        }

        if (!data?.user) {
            return { success: false, error: 'User creation failed - no user returned' };
        }

        return { success: true, user: data.user };
    } else {
        if (this.authData.users.find((u: any) => u.username === userData.username)) {
            return { success: false, error: 'Username already exists' };
        }

        const hashedPassword = bcrypt.hashSync(userData.password, 10);

        const user = {
            id: generateId(),
            username: userData.username,
            password: hashedPassword,
            email: userData.email,
            role: userData.role,
            organizationId: userData.organizationId,
            createdAt: Date.now(),
            isActive: true,
        };

        this.authData.users.push(user);
        await this.saveAuthData();

        return { success: true, user };
    }
}

export async function syncUsers(this: any): Promise<AuthResult> {
    if (!this.useSupabase) {
        return { success: true, message: 'Sync not needed in local mode' };
    }

    try {
        const { data, error } = await supabase.functions.invoke('sync-users');

        if (error) {
            return { success: false, error: error.message };
        }

        if (data?.error) {
            return { success: false, error: data.error };
        }

        return { success: true, ...data };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

export async function getUsers(this: any): Promise<any[]> {
    if (this.useSupabase) {
        await this.syncUsers();

        let query = supabase
            .from('profiles')
            .select('*, organizations(*)');

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
            return this.authData.users;
        }

        if (this.currentUser?.role === ROLES.ORG_ADMIN) {
            return this.authData.users.filter(
                (u: any) => u.organizationId === this.currentUser.organizationId,
            );
        }

        return [];
    }
}

export async function getUser(this: any, userId: string): Promise<any> {
    if (this.useSupabase) {
        const { data, error } = await supabase
            .from('profiles')
            .select('*, organizations(*)')
            .eq('id', userId)
            .single();

        if (error) {
            return null;
        }

        return data;
    } else {
        return this.authData.users.find((u: any) => u.id === userId) ?? null;
    }
}

export async function updateUser(
    this: any,
    userId: string,
    updates: Record<string, any>,
): Promise<AuthResult> {
    const user = await this.getUser(userId);
    if (!user) {
        return { success: false, error: 'User not found' };
    }

    if (!this.isAdmin() && this.currentUser?.role !== ROLES.ORG_ADMIN) {
        return { success: false, error: 'Permission denied' };
    }

    if (this.currentUser?.role === ROLES.ORG_ADMIN &&
        user.organization_id !== this.currentUser.organizationId) {
        return { success: false, error: 'Can only update users in your organization' };
    }

    if (this.useSupabase) {
        const { data: updatedRows, error: updateError } = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', userId)
            .select();

        if (updateError) {
            return { success: false, error: updateError.message };
        }

        if (!updatedRows || updatedRows.length === 0) {
            return {
                success: false,
                error: 'Unable to update user. You may not have permission to modify this user.',
            };
        }

        const data = updatedRows[0];

        if (updates.role && data.role !== updates.role) {
            return {
                success: false,
                error: 'Unable to update user role. Database policy may have blocked this change.',
            };
        }

        if (userId === this.currentUser?.id) {
            await this.loadUserProfile(userId);
        }

        return { success: true, user: data };
    } else {
        Object.assign(user, updates);
        await this.saveAuthData();

        if (userId === this.currentUser?.id) {
            this.currentUser = user;
            sessionStorage.setItem('currentUser', JSON.stringify(user));
        }

        return { success: true, user };
    }
}

export async function deleteUser(this: any, userId: string): Promise<AuthResult> {
    const user = await this.getUser(userId);
    if (!user) {
        return { success: false, error: 'User not found' };
    }

    if (userId === this.currentUser?.id) {
        return { success: false, error: 'Cannot delete yourself' };
    }

    if (!this.hasPermission(PERMISSIONS.MANAGE_USERS)) {
        return { success: false, error: 'Permission denied' };
    }

    if (this.currentUser?.role === ROLES.ORG_ADMIN &&
        user.organization_id !== this.currentUser.organizationId) {
        return { success: false, error: 'Can only delete users in your organization' };
    }

    if (this.useSupabase) {
        const { data, error } = await supabase.functions.invoke('delete-user', {
            body: { userId },
        });

        if (error) {
            return { success: false, error: error.message };
        }

        if (data?.error) {
            return { success: false, error: data.error };
        }

        return { success: true };
    } else {
        const index = this.authData.users.findIndex((u: any) => u.id === userId);
        if (index !== -1) {
            this.authData.users.splice(index, 1);
            await this.saveAuthData();
            return { success: true };
        }

        return { success: false, error: 'User not found' };
    }
}

