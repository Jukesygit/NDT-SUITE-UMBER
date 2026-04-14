/**
 * Auth Manager - Main barrel export + AuthManager class.
 * Delegates to: auth-core, auth-supabase, auth-users, auth-accounts.
 *
 * Local/IndexedDB auth fallback has been deprecated (April 2026).
 * Supabase is now the sole authentication provider.
 */
import { isSupabaseConfigured } from '../supabase-client';
import { logActivity } from '../services/activity-log-service.ts';
import {
    ROLES, PERMISSIONS, ROLE_PERMISSIONS,
    type AuthCurrentUser, type AuthProfile,
    type AuthResult, type CreateUserData, type AccountRequestData, type BulkCreateUserData,
} from './auth-types';
import {
    getCurrentUser,
    getCurrentProfile,
    isLoggedIn,
    isSuperAdmin,
    isAdmin,
    isManager,
    isOrgAdmin,
    hasElevatedAccess,
    hasPermission,
    canAccessOrganization,
    getCurrentOrganizationId,
    isUsingSupabase,
    generateId,
    createOrganization,
    getOrganizations,
    getOrganization,
    updateOrganization,
    deleteOrganization,
} from './auth-core';

// ── Supabase flows ─────────────────────────────────────────────────────────
import {
    initializeSupabase,
    loadUserProfile,
    loginSupabase,
    signUpSupabase,
    resetPasswordSupabase,
    verifyResetCodeSupabase,
    getSessionSupabase,
    refreshSessionSupabase,
    onAuthStateChangeSupabase,
    logoutSupabase,
} from './auth-supabase';
import { getSupabase } from '../supabase-client';
import { showPasswordResetForm } from './auth-password-reset-form';

// ── User management ────────────────────────────────────────────────────────
import {
    createUser,
    syncUsers,
    getUsers,
    getUser,
    updateUser,
    deleteUser,
} from './auth-users';

// ── Account requests & bulk creation ───────────────────────────────────────
import {
    requestAccount,
    getPendingAccountRequests,
    approveAccountRequest,
    rejectAccountRequest,
    bulkCreateUsers,
} from './auth-accounts';

class AuthManager {
    currentUser: AuthCurrentUser | null = null;
    currentProfile: AuthProfile | null = null;
    _authSubscription: { unsubscribe: () => void } | null = null;
    useSupabase: boolean;
    initPromise: Promise<void>;

    constructor() {
        this.useSupabase = isSupabaseConfigured();
        this.initPromise = this.initialize();
    }

    // ── Lifecycle ──────────────────────────────────────────────────────────

    private async initialize(): Promise<void> {
        if (!this.useSupabase) {
            console.error('[AuthManager] Supabase is not configured. Authentication requires a valid Supabase connection.');
            return;
        }
        await this.initializeSupabase();
    }

    async ensureInitialized(): Promise<void> {
        await this.initPromise;
    }

    // ── Delegated methods (bound via prototype) ────────────────────────────

    // Core state & roles
    getCurrentUser = getCurrentUser;
    getCurrentProfile = getCurrentProfile;
    isLoggedIn = isLoggedIn;
    isSuperAdmin = isSuperAdmin;
    isAdmin = isAdmin;
    isManager = isManager;
    isOrgAdmin = isOrgAdmin;
    hasElevatedAccess = hasElevatedAccess;
    hasPermission = hasPermission;
    canAccessOrganization = canAccessOrganization;
    getCurrentOrganizationId = getCurrentOrganizationId;
    isUsingSupabase = isUsingSupabase;

    // Organization management
    createOrganization = createOrganization;
    getOrganizations = getOrganizations;
    getOrganization = getOrganization;
    updateOrganization = updateOrganization;
    deleteOrganization = deleteOrganization;

    // Supabase-specific
    initializeSupabase = initializeSupabase;
    loadUserProfile = loadUserProfile;
    showPasswordResetForm = showPasswordResetForm;

    // User management
    createUser = createUser;
    syncUsers = syncUsers;
    getUsers = getUsers;
    getUser = getUser;
    updateUser = updateUser;
    deleteUser = deleteUser;
    requestAccount = requestAccount;
    getPendingAccountRequests = getPendingAccountRequests;
    approveAccountRequest = approveAccountRequest;
    rejectAccountRequest = rejectAccountRequest;
    bulkCreateUsers = bulkCreateUsers;

    // ── Auth flows (composite - route to Supabase or local) ────────────────

    async login(email: string, password: string, _rememberMe: boolean = false): Promise<AuthResult> {
        await this.ensureInitialized();

        if (!this.useSupabase) {
            return { success: false, error: 'Authentication requires a valid Supabase connection.' };
        }

        const { loginRateLimiter } = await import('../config/security.js');

        const rateLimitCheck = loginRateLimiter.isAllowed(email.toLowerCase()) as {
            allowed: boolean; retryAfter: number;
        };
        if (!rateLimitCheck.allowed) {
            const retryMinutes = Math.ceil(rateLimitCheck.retryAfter / 60000);
            return {
                success: false,
                error: `Too many login attempts. Please try again in ${retryMinutes} minutes.`,
                rateLimited: true,
                retryAfter: rateLimitCheck.retryAfter,
            };
        }

        return loginSupabase.call(this, email, password, loginRateLimiter);
    }

    async signUp(email: string, password: string): Promise<AuthResult> {
        await this.ensureInitialized();
        return signUpSupabase.call(this, email, password);
    }

    async logout(): Promise<void> {
        const userId = this.currentUser?.id;
        const username = this.currentUser?.username;

        if (userId) {
            logActivity({
                userId,
                actionType: 'logout',
                actionCategory: 'auth',
                description: `User ${username || 'Unknown'} logged out`,
            });
        }

        this.currentUser = null;
        this.currentProfile = null;

        window.dispatchEvent(new CustomEvent('userLoggedOut'));
        await logoutSupabase();
    }

    async resetPassword(email: string): Promise<AuthResult> {
        return resetPasswordSupabase(this, email);
    }

    async verifyResetCode(email: string, code: string, newPassword: string): Promise<AuthResult> {
        return verifyResetCodeSupabase(this, email, code, newPassword);
    }

    async getSession(timeoutMs: number = 10000): Promise<any> {
        return getSessionSupabase(timeoutMs);
    }

    async refreshSession(timeoutMs: number = 10000): Promise<any> {
        return refreshSessionSupabase(timeoutMs);
    }

    onAuthStateChange(callback: (session: any) => void): () => void {
        return onAuthStateChangeSupabase(callback);
    }

    generateId(): string {
        return generateId();
    }

    // ── 2FA ───────────────────────────────────────────────────────────────

    /**
     * Complete 2FA login - dispatches userLoggedIn event after successful 2FA verification.
     * Called after verifyLogin() or verifyBackupCode() succeeds.
     */
    complete2FALogin(): void {
        window.dispatchEvent(
            new CustomEvent('userLoggedIn', {
                detail: { user: this.currentUser },
            })
        );
    }

    /**
     * Admin reset 2FA for a user - calls admin-reset-2fa Edge Function.
     */
    async adminReset2FA(userId: string): Promise<{ success: boolean; error?: string }> {
        const { data, error } = await getSupabase().functions.invoke('admin-reset-2fa', {
            body: { userId },
        });
        if (error) return { success: false, error: error.message };
        return data;
    }
}

// ── Singleton ──────────────────────────────────────────────────────────────

const authManager = new AuthManager();

// Re-export constants and types for consumers
export { ROLES, PERMISSIONS, ROLE_PERMISSIONS };
export type {
    AuthCurrentUser,
    AuthProfile,
    AuthResult,
    CreateUserData,
    AccountRequestData,
    BulkCreateUserData,
};

export default authManager;
