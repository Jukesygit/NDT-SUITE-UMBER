/**
 * Auth Core - Core auth state, role checking, user info, and organization management.
 *
 * These functions are bound to the AuthManager instance via `this`.
 *
 * Local/IndexedDB auth fallback has been deprecated (April 2026).
 * All organization management now goes through Supabase.
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

// Supabase is guaranteed initialized when auth services are called
const sb = supabase!;

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

export function isSuperAdmin(this: { currentUser: AuthCurrentUser | null }): boolean {
    return this.currentUser?.role === ROLES.SUPER_ADMIN;
}

export function isAdmin(this: { currentUser: AuthCurrentUser | null }): boolean {
    return this.currentUser?.role === ROLES.ADMIN || this.currentUser?.role === ROLES.SUPER_ADMIN;
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
    if (this.currentUser.role === ROLES.SUPER_ADMIN || this.currentUser.role === ROLES.ADMIN) return true;
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

    const { data, error } = await sb
        .from('organizations')
        .insert({ name })
        .select()
        .single();

    if (error) {
        return { success: false, error: error.message };
    }

    return { success: true, organization: data };
}

export async function getOrganizations(this: any): Promise<AuthOrganization[]> {
    const { data, error } = await sb
        .from('organizations')
        .select('*')
        .order('name');

    if (error) {
        return [];
    }

    return data || [];
}

export async function getOrganization(
    this: any,
    organizationId: string,
): Promise<AuthOrganization | null> {
    if (!organizationId) {
        return null;
    }

    const { data, error } = await sb
        .from('organizations')
        .select('*')
        .eq('id', organizationId)
        .single();

    if (error) {
        return null;
    }

    return data;
}

export async function updateOrganization(
    this: any,
    organizationId: string,
    updates: Partial<AuthOrganization>,
): Promise<AuthResult> {
    if (!this.isAdmin()) {
        return { success: false, error: 'Permission denied' };
    }

    const { data, error } = await sb
        .from('organizations')
        .update(updates)
        .eq('id', organizationId)
        .select()
        .single();

    if (error) {
        return { success: false, error: error.message };
    }

    return { success: true, organization: data };
}

export async function deleteOrganization(
    this: any,
    organizationId: string,
): Promise<AuthResult> {
    if (!this.isAdmin()) {
        return { success: false, error: 'Permission denied' };
    }

    const org = await this.getOrganization(organizationId);
    if (org?.name === 'SYSTEM') {
        return { success: false, error: 'Cannot delete system organization' };
    }

    const { error } = await sb
        .from('organizations')
        .delete()
        .eq('id', organizationId);

    if (error) {
        return { success: false, error: error.message };
    }

    return { success: true };
}
