/**
 * AuthContext - Centralized authentication state management
 *
 * Provides reactive auth state to all components via useAuth hook.
 * Designed to support future route guards (Option 4).
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import authManager from '../auth-manager.js';
import { clearQueryCache } from '../lib/query-client';

// Types matching auth-manager
export interface AuthUser {
    id: string;
    username: string | null;
    email: string | null;
    role: 'admin' | 'manager' | 'org_admin' | 'editor' | 'viewer';
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
    organizations?: {
        id: string;
        name: string;
    } | null;
}

export type UserRole = 'admin' | 'manager' | 'org_admin' | 'editor' | 'viewer';

interface AuthContextType {
    // State
    user: AuthUser | null;
    profile: AuthProfile | null;
    isLoading: boolean;
    isAuthenticated: boolean;

    // Role checks
    isAdmin: boolean;
    isManager: boolean;
    isOrgAdmin: boolean;
    isEditor: boolean;
    hasElevatedAccess: boolean;  // admin or manager

    // Helper methods
    hasRole: (roles: UserRole | UserRole[]) => boolean;
    hasPermission: (permission: string) => boolean;

    // Actions
    logout: () => Promise<void>;
    refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
    children: ReactNode;
}

/**
 * AuthProvider - Wrap your app with this to provide auth state
 *
 * @example
 * // In App.tsx
 * <AuthProvider>
 *     <App />
 * </AuthProvider>
 */
export function AuthProvider({ children }: AuthProviderProps) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [profile, setProfile] = useState<AuthProfile | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const isInitializedRef = useRef(false); // Track if auth has fully initialized (ref for event handlers)

    // Load auth state from authManager
    const loadAuthState = useCallback(() => {
        const currentUser = authManager.getCurrentUser();
        const currentProfile = authManager.getCurrentProfile();
        setUser(currentUser);
        setProfile(currentProfile);
    }, []);

    // Initialize and subscribe to auth changes
    useEffect(() => {
        let mounted = true;

        const initAuth = async () => {
            try {
                // Wait for authManager to initialize
                if (authManager.initPromise) {
                    await authManager.initPromise;
                }

                if (mounted) {
                    loadAuthState();
                    setIsLoading(false);
                    isInitializedRef.current = true;
                    console.log('AuthContext: Initialization complete');
                }
            } catch (error) {
                console.error('AuthContext: Failed to initialize auth:', error);
                if (mounted) {
                    setIsLoading(false);
                    isInitializedRef.current = true; // Still mark as initialized to unblock
                }
            }
        };

        initAuth();

        // Subscribe to auth state changes
        const unsubscribe = authManager.onAuthStateChange(() => {
            if (mounted) {
                loadAuthState();
            }
        });

        // Listen for login events (dispatched AFTER profile is loaded in auth-manager)
        const handleLogin = () => {
            if (mounted) {
                loadAuthState();
            }
        };
        window.addEventListener('userLoggedIn', handleLogin);

        // Listen for logout events
        const handleLogout = () => {
            if (mounted) {
                setUser(null);
                setProfile(null);
                // Clear React Query cache to prevent stale data on next login
                clearQueryCache();
            }
        };
        window.addEventListener('userLoggedOut', handleLogout);

        // Track if we're currently handling an auth error to prevent duplicate handling
        let isHandlingError = false;

        // Listen for auth errors (dispatched by query-client on 401/403)
        const handleAuthError = async () => {
            if (!mounted) return;

            // Prevent duplicate error handling
            if (isHandlingError) {
                console.log('AuthContext: Already handling auth error, skipping');
                return;
            }

            // Skip auth error handling during initialization - let init complete first
            if (!isInitializedRef.current) {
                console.log('AuthContext: Skipping auth error during initialization');
                return;
            }

            isHandlingError = true;
            console.warn('AuthContext: Auth error detected, attempting to refresh session...');

            try {
                // First, try to refresh the session token (not just check if it exists)
                const refreshedSession = await authManager.refreshSession();

                if (refreshedSession) {
                    // Session was successfully refreshed
                    console.log('AuthContext: Session refreshed successfully');
                    loadAuthState();
                    // Invalidate queries to refetch with new token
                    const { invalidateAllQueries } = await import('../lib/query-client');
                    invalidateAllQueries();
                    isHandlingError = false;
                    return;
                }

                // Refresh failed, try to get current session
                const session = await authManager.getSession();

                if (!session) {
                    // Session is invalid, log the user out
                    console.warn('AuthContext: Session expired, logging out');
                    await authManager.logout();
                    setUser(null);
                    setProfile(null);
                    clearQueryCache();
                    // Show user-friendly notification
                    alert('Your session has expired. Please log in again.');
                    // Redirect to login
                    window.location.href = '/login';
                } else {
                    // Session is still valid, just reload auth state
                    console.log('AuthContext: Session still valid, reloading state');
                    loadAuthState();
                }
            } catch (err) {
                console.error('AuthContext: Failed to refresh session:', err);
                // Force logout on error
                await authManager.logout();
                setUser(null);
                setProfile(null);
                clearQueryCache();
                alert('Your session has expired. Please log in again.');
                window.location.href = '/login';
            } finally {
                // Reset after a delay to allow for potential rapid errors
                setTimeout(() => {
                    isHandlingError = false;
                }, 2000);
            }
        };
        window.addEventListener('authError', handleAuthError);

        // Periodic session validation (every 4 minutes - before typical 5 min token expiry)
        // This catches cases where the session expired but no API call triggered the error
        const sessionCheckInterval = setInterval(async () => {
            if (!mounted) return;

            // Skip if auth hasn't initialized yet
            if (!isInitializedRef.current) return;

            const currentUser = authManager.getCurrentUser();
            if (!currentUser) return; // Not logged in, skip check

            try {
                // First try to proactively refresh the session to prevent expiration
                const refreshedSession = await authManager.refreshSession();

                if (refreshedSession) {
                    console.log('AuthContext: Session proactively refreshed');
                    return;
                }

                // If refresh failed, check if session exists
                const session = await authManager.getSession();

                if (!session) {
                    console.warn('AuthContext: Session check failed, session may have expired');
                    handleAuthError();
                }
            } catch (err) {
                console.warn('AuthContext: Session check error:', err);
            }
        }, 4 * 60 * 1000); // Check every 4 minutes (before typical token expiry)

        return () => {
            mounted = false;
            if (unsubscribe) unsubscribe();
            window.removeEventListener('userLoggedIn', handleLogin);
            window.removeEventListener('userLoggedOut', handleLogout);
            window.removeEventListener('authError', handleAuthError);
            clearInterval(sessionCheckInterval);
        };
    }, [loadAuthState]);

    // Computed values
    const isAuthenticated = !!user;
    const isAdmin = user?.role === 'admin';
    const isManager = user?.role === 'manager';
    const isOrgAdmin = user?.role === 'org_admin';
    const isEditor = user?.role === 'editor' || isAdmin || isManager || isOrgAdmin;
    const hasElevatedAccess = isAdmin || isManager;

    // Check if user has one of the specified roles
    const hasRole = useCallback((roles: UserRole | UserRole[]): boolean => {
        if (!user?.role) return false;
        const roleArray = Array.isArray(roles) ? roles : [roles];
        return roleArray.includes(user.role as UserRole);
    }, [user?.role]);

    // Check if user has a specific permission
    const hasPermission = useCallback((permission: string): boolean => {
        return authManager.hasPermission(permission);
    }, []);

    // Logout action
    const logout = useCallback(async () => {
        await authManager.logout();
        setUser(null);
        setProfile(null);
        // Clear React Query cache to prevent stale data on next login
        clearQueryCache();
    }, []);

    // Refresh auth state - checks current session and reloads state
    const refreshAuth = useCallback(async () => {
        setIsLoading(true);
        try {
            // Check if session is still valid via authManager
            const session = await authManager.getSession();

            if (!session) {
                console.warn('AuthContext: Session refresh failed - no valid session');
                // Session is invalid, trigger logout
                await authManager.logout();
                setUser(null);
                setProfile(null);
                clearQueryCache();
                return;
            }

            // Session is valid, reload auth state
            loadAuthState();
        } catch (err) {
            console.error('AuthContext: Failed to refresh auth:', err);
        } finally {
            setIsLoading(false);
        }
    }, [loadAuthState]);

    const value: AuthContextType = {
        user,
        profile,
        isLoading,
        isAuthenticated,
        isAdmin,
        isManager,
        isOrgAdmin,
        isEditor,
        hasElevatedAccess,
        hasRole,
        hasPermission,
        logout,
        refreshAuth,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

/**
 * useAuth - Hook to access auth state from any component
 *
 * @example
 * function MyComponent() {
 *     const { user, isAdmin, isLoading } = useAuth();
 *
 *     if (isLoading) return <Spinner />;
 *     if (!isAdmin) return <AccessDenied />;
 *
 *     return <AdminContent user={user} />;
 * }
 */
export function useAuth(): AuthContextType {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider. Wrap your app with <AuthProvider>.');
    }
    return context;
}

export default AuthContext;
