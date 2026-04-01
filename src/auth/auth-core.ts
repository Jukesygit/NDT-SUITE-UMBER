/**
 * Auth Core - Core auth state, role checking, user info, and organization management.
 *
 * These functions are bound to the AuthManager instance via `this`.
 */

import supabase from '../supabase-client';
import {
    ROLES,
    PERMISSIONS,
    ROLE_PERMISSIONS,
    type AuthCurrentUser,
    type AuthProfile,
    type AuthOrganization,
    type AuthResult,
} from './auth-types';

// ── State & Role Helpers ────────────────────────────────────────────────────

export function getCurrentUser(this: { currentUser: AuthCurrentUser | null }): AuthCurrentUser | null {
    return this.currentUser;
}

export function getCurrentProfile(this: { currentProfile: AuthProfile | null }): AuthProfile | null {
    return this.currentProfile;
}

export function isLoggedIn(this: { currentUser: AuthCurrentUser | null }): boolean {
    return this.currentUser !== null;
}

export function isAdmin(this: { currentUser: AuthCurrentUser | null }): boolean {
    return this.currentUser?.role === ROLES.ADMIN;
}

export function isManager(this: { currentUser: AuthCurrentUser | null }): boolean {
    return this.currentUser?.role === ROLES.MANAGER;
}

export function isOrgAdmin(this: { currentUser: AuthCurrentUser | null }): boolean {
    return this.currentUser?.role === ROLES.ORG_ADMIN;
}

export function hasElevatedAccess(this: { isAdmin(): boolean; isManager(): boolean }): boolean {
    return this.isAdmin() || this.isManager();
}

export function hasPermission(
    this: { currentUser: AuthCurrentUser | null },
    permission: string,
): boolean {
    if (!this.currentUser) return false;
    const permissions = ROLE_PERMISSIONS[this.currentUser.role] || [];
    return permissions.includes(permission);
}

export function canAccessOrganization(
    this: { currentUser: AuthCurrentUser | null },
    organizationId: string,
): boolean {
    if (!this.currentUser) return false;
    if (this.currentUser.role === ROLES.ADMIN) return true;
    return this.currentUser.organizationId === organizationId;
}

export function getCurrentOrganizationId(
    this: { currentUser: AuthCurrentUser | null },
): string | null {
    return this.currentUser?.organizationId ?? null;
}

export function isUsingSupabase(this: { useSupabase: boolean }): boolean {
    return this.useSupabase;
}

export function generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ── Organization Management ─────────────────────────────────────────────────

export async function createOrganization(
    this: any,
    name: string,
): Promise<AuthResult<AuthOrganization>> {
    if (!this.hasPermission(PERMISSIONS.MANAGE_USERS) || !this.isAdmin()) {
        return { success: false, error: 'Permission denied' };
    }

    if (this.useSupabase) {
        const { data, error } = await supabase
            .from('organizations')
            .insert({ name })
            .select()
            .single();

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true, organization: data };
    } else {
        const org: AuthOrganization = {
            id: generateId(),
            name,
            createdAt: Date.now(),
        };

        this.authData.organizations.push(org);
        await this.saveAuthData();

        return { success: true, organization: org };
    }
}

export async function getOrganizations(this: any): Promise<AuthOrganization[]> {
    if (this.useSupabase) {
        const { data, error } = await supabase
            .from('organizations')
            .select('*')
            .order('name');

        if (error) {
            return [];
        }

        return data || [];
    } else {
        if (!this.currentUser) {
            return this.authData.organizations;
        }

        if (this.isAdmin()) {
            return this.authData.organizations;
        }

        return this.authData.organizations.filter(
            (org: AuthOrganization) => org.id === this.currentUser.organizationId,
        );
    }
}

export async function getOrganization(
    this: any,
    organizationId: string,
): Promise<AuthOrganization | null> {
    if (!organizationId) {
        return null;
    }

    if (this.useSupabase) {
        const { data, error } = await supabase
            .from('organizations')
            .select('*')
            .eq('id', organizationId)
            .single();

        if (error) {
            return null;
        }

        return data;
    } else {
        return this.authData.organizations.find((org: AuthOrganization) => org.id === organizationId) ?? null;
    }
}

export async function updateOrganization(
    this: any,
    organizationId: string,
    updates: Partial<AuthOrganization>,
): Promise<AuthResult> {
    if (!this.isAdmin()) {
        return { success: false, error: 'Permission denied' };
    }

    if (this.useSupabase) {
        const { data, error } = await supabase
            .from('organizations')
            .update(updates)
            .eq('id', organizationId)
            .select()
            .single();

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true, organization: data };
    } else {
        const org = await this.getOrganization(organizationId);
        if (org) {
            Object.assign(org, updates);
            await this.saveAuthData();
            return { success: true, organization: org };
        }

        return { success: false, error: 'Organization not found' };
    }
}

export async function deleteOrganization(
    this: any,
    organizationId: string,
): Promise<AuthResult> {
    if (!this.isAdmin()) {
        return { success: false, error: 'Permission denied' };
    }

    if (this.useSupabase) {
        const org = await this.getOrganization(organizationId);
        if (org?.name === 'SYSTEM') {
            return { success: false, error: 'Cannot delete system organization' };
        }

        const { error } = await supabase
            .from('organizations')
            .delete()
            .eq('id', organizationId);

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true };
    } else {
        const org = await this.getOrganization(organizationId);
        if (org?.name === 'SYSTEM') {
            return { success: false, error: 'Cannot delete system organization' };
        }

        const index = this.authData.organizations.findIndex(
            (o: AuthOrganization) => o.id === organizationId,
        );
        if (index !== -1) {
            this.authData.organizations.splice(index, 1);
            this.authData.users = this.authData.users.filter(
                (u: any) => u.organizationId !== organizationId,
            );
            await this.saveAuthData();
            return { success: true };
        }

        return { success: false, error: 'Organization not found' };
    }
}
