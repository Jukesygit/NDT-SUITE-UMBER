/**
 * Auth Manager - Main barrel export + AuthManager class.
 * Delegates to: auth-core, auth-supabase, auth-local, auth-users, auth-accounts.
 */
import { isSupabaseConfigured } from '../supabase-client.js';
import { logActivity } from '../services/activity-log-service.ts';
import {
    ROLES, PERMISSIONS, ROLE_PERMISSIONS,
    type AuthCurrentUser, type AuthProfile, type AuthData,
    type AuthResult, type CreateUserData, type AccountRequestData, type BulkCreateUserData,
} from './auth-types';
import {
    getCurrentUser,
    getCurrentProfile,
    isLoggedIn,
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
import { showPasswordResetForm } from './auth-password-reset-form';

// ── Local / IndexedDB flows ────────────────────────────────────────────────
import {
    initializeLocal,
    loginLocal,
    logoutLocal,
    getSessionLocal,
    onAuthStateChangeLocal,
    loadAuthData,
    saveAuthData,
} from './auth-local';

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
    authData: AuthData;
    initPromise: Promise<void>;

    constructor() {
        this.useSupabase = isSupabaseConfigured();
        this.authData = {
            organizations: [],
            users: [],
            accountRequests: [],
        };
        this.initPromise = this.initialize();
    }

    // ── Lifecycle ──────────────────────────────────────────────────────────

    private async initialize(): Promise<void> {
        try {
            if (this.useSupabase) {
                await this.initializeSupabase();
            } else {
                await this.initializeLocal();
            }
        } catch (_error) {
            if (this.useSupabase) {
                this.useSupabase = false;
                await this.initializeLocal();
            }
        }
    }

    async ensureInitialized(): Promise<void> {
        await this.initPromise;
    }

    // ── Delegated methods (bound via prototype) ────────────────────────────

    // Core state & roles
    getCurrentUser = getCurrentUser;
    getCurrentProfile = getCurrentProfile;
    isLoggedIn = isLoggedIn;
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

    // Local-specific
    initializeLocal = initializeLocal;

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

        if (this.useSupabase) {
            return loginSupabase.call(this, email, password, loginRateLimiter);
        } else {
            return loginLocal.call(this, email, password);
        }
    }

    async signUp(email: string, password: string): Promise<AuthResult> {
        await this.ensureInitialized();

        if (this.useSupabase) {
            return signUpSupabase.call(this, email, password);
        } else {
            return {
                success: false,
                error: { message: 'Self-registration is not available in local mode. Please contact your administrator.' },
            };
        }
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

        if (this.useSupabase) {
            await logoutSupabase();
        } else {
            logoutLocal();
        }
    }

    async resetPassword(email: string): Promise<AuthResult> {
        if (this.useSupabase) {
            return resetPasswordSupabase(this, email);
        } else {
            return {
                success: false,
                error: { message: 'Password reset is not available in local mode. Please contact your administrator.' },
            };
        }
    }

    async verifyResetCode(email: string, code: string, newPassword: string): Promise<AuthResult> {
        if (!this.useSupabase) {
            return {
                success: false,
                error: { message: 'Password reset is not available in local mode.' },
            };
        }

        return verifyResetCodeSupabase(this, email, code, newPassword);
    }

    async getSession(timeoutMs: number = 10000): Promise<any> {
        if (this.useSupabase) {
            return getSessionSupabase(timeoutMs);
        } else {
            return getSessionLocal(this.currentUser);
        }
    }

    async refreshSession(timeoutMs: number = 10000): Promise<any> {
        if (!this.useSupabase) {
            return this.currentUser ? { user: this.currentUser } : null;
        }
        return refreshSessionSupabase(timeoutMs);
    }

    onAuthStateChange(callback: (session: any) => void): () => void {
        if (this.useSupabase) {
            return onAuthStateChangeSupabase(callback);
        } else {
            return onAuthStateChangeLocal(this.currentUser, callback);
        }
    }

    // ── Storage helpers (used by delegated local methods) ──────────────────

    async loadAuthData(): Promise<AuthData | null> {
        return loadAuthData();
    }

    async saveAuthData(): Promise<boolean> {
        return saveAuthData(this.authData);
    }

    generateId(): string {
        return generateId();
    }
}

// ── Singleton ──────────────────────────────────────────────────────────────

const authManager = new AuthManager();

// Re-export constants and types for consumers
export { ROLES, PERMISSIONS, ROLE_PERMISSIONS };
export type {
    AuthCurrentUser,
    AuthProfile,
    AuthData,
    AuthResult,
    CreateUserData,
    AccountRequestData,
    BulkCreateUserData,
};

export default authManager;
