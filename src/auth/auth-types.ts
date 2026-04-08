/**
 * Auth Manager Internal Types
 *
 * TypeScript interfaces and constants specific to the auth-manager internals.
 * For shared/public auth types, see src/types/auth.types.ts.
 */

import type { UserRole } from '../types/auth.types';

// ── Constants ──────────────────────────────────────────────────────────────────

export const ROLES = {
    SUPER_ADMIN: 'super_admin' as const,
    ADMIN: 'admin' as const,
    MANAGER: 'manager' as const,
    ORG_ADMIN: 'org_admin' as const,
    EDITOR: 'editor' as const,
    VIEWER: 'viewer' as const,
};

export const PERMISSIONS = {
    VIEW: 'view' as const,
    CREATE: 'create' as const,
    EDIT: 'edit' as const,
    DELETE: 'delete' as const,
    EXPORT: 'export' as const,
    MANAGE_USERS: 'manage_users' as const,
};

export const ROLE_PERMISSIONS: Record<string, string[]> = {
    [ROLES.SUPER_ADMIN]: [
        PERMISSIONS.VIEW,
        PERMISSIONS.CREATE,
        PERMISSIONS.EDIT,
        PERMISSIONS.DELETE,
        PERMISSIONS.EXPORT,
        PERMISSIONS.MANAGE_USERS,
    ],
    [ROLES.ADMIN]: [
        PERMISSIONS.VIEW,
        PERMISSIONS.CREATE,
        PERMISSIONS.EDIT,
        PERMISSIONS.DELETE,
        PERMISSIONS.EXPORT,
        PERMISSIONS.MANAGE_USERS,
    ],
    [ROLES.MANAGER]: [
        PERMISSIONS.VIEW,
        PERMISSIONS.CREATE,
        PERMISSIONS.EDIT,
        PERMISSIONS.DELETE,
        PERMISSIONS.EXPORT,
        PERMISSIONS.MANAGE_USERS,
    ],
    [ROLES.ORG_ADMIN]: [
        PERMISSIONS.VIEW,
        PERMISSIONS.CREATE,
        PERMISSIONS.EDIT,
        PERMISSIONS.DELETE,
        PERMISSIONS.EXPORT,
        PERMISSIONS.MANAGE_USERS,
    ],
    [ROLES.EDITOR]: [
        PERMISSIONS.VIEW,
        PERMISSIONS.CREATE,
        PERMISSIONS.EDIT,
        PERMISSIONS.DELETE,
        PERMISSIONS.EXPORT,
    ],
    [ROLES.VIEWER]: [
        PERMISSIONS.VIEW,
        PERMISSIONS.EXPORT,
    ],
};

export const AUTH_STORE_KEY = 'auth_data';

// ── Interfaces ─────────────────────────────────────────────────────────────────

export interface AuthCurrentUser {
    id: string;
    username: string | null;
    email: string | null;
    role: UserRole;
    organizationId: string | null;
    isActive: boolean;
}

export interface AuthProfile {
    id: string;
    username: string | null;
    email: string | null;
    role: string;
    organization_id: string | null;
    is_active: boolean;
    avatar_url: string | null;
    organizations?: AuthOrganization | null;
    [key: string]: unknown;
}

export interface AuthOrganization {
    id: string;
    name: string;
    createdAt?: number;
    created_at?: string;
    [key: string]: unknown;
}

export interface LocalUser {
    id: string;
    username: string;
    password: string;
    email: string;
    role: UserRole;
    organizationId: string;
    createdAt: number;
    isActive: boolean;
    requirePasswordChange?: boolean;
    organization_id?: string;
    [key: string]: unknown;
}

export interface AccountRequestData {
    username: string;
    email: string;
    organizationId: string;
    requestedRole?: string;
    message?: string;
}

export interface LocalAccountRequest {
    id: string;
    username: string;
    email: string;
    requestedRole: string;
    organizationId: string;
    message: string;
    status: string;
    createdAt: number;
    approvedAt?: number;
    approvedBy?: string;
    rejectedAt?: number;
    rejectedBy?: string;
    rejectionReason?: string;
}

export interface AuthData {
    organizations: AuthOrganization[];
    users: LocalUser[];
    accountRequests: LocalAccountRequest[];
}

export interface CreateUserData {
    email: string;
    username: string;
    password: string;
    role?: string;
    organizationId?: string;
    organization_id?: string;
}

export interface BulkCreateUserData {
    email: string;
    username: string;
    role?: string;
    organizationId?: string;
    organization_id?: string;
}

export interface AuthResult<T = unknown> {
    success: boolean;
    error?: string | { message: string };
    user?: T;
    organization?: AuthOrganization;
    request?: LocalAccountRequest;
    data?: unknown;
    message?: string;
    rateLimited?: boolean;
    retryAfter?: number;
    useCodeFlow?: boolean;
    results?: unknown[];
}
