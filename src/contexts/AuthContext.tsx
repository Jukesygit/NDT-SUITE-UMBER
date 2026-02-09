/**
 * AuthContext - Centralized authentication state management
 *
 * Provides reactive auth state to all components via useAuth hook.
 * Designed to support future route guards (Option 4).
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import authManager from '../auth-manager.js';
import { clearQueryCache, invalidateStaleQueries } from '../lib/query-client';
import { sessionManager } from '../lib/session-manager';
import { showToast } from '../utils/toast';

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
                    // Initialize session manager if user is already logged in
                    if (authManager.isLoggedIn()) {
                        sessionManager.initialize();
                    }
                }
            } catch (error) {
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
                // Initialize session manager for proactive refresh
                sessionManager.initialize();
            }
        };
        window.addEventListener('userLoggedIn', handleLogin);

        // Listen for logout events
        const handleLogout = () => {
            if (mounted) {
                // Stop session manager
                sessionManager.stop();
                setUser(null);
                setProfile(null);
                // Clear React Query cache to prevent stale data on next login
                clearQueryCache();
            }
        };
        window.addEventListener('userLoggedOut', handleLogout);

        // Subscribe to session manager events (handles all session refresh coordination)
        const unsubscribeSessionManager = sessionManager.onSessionChange((event) => {
            if (!mounted) return;

            if (event.type === 'refreshed') {
                loadAuthState();
                // Invalidate stale queries (not all - prevents thundering herd)
                invalidateStaleQueries();
            } else if (event.type === 'expired') {
                // Handle graceful logout with toast instead of blocking alert
                handleGracefulLogout();
            }
        });

        // Graceful logout handler with non-blocking notification
        const handleGracefulLogout = async () => {
            // Stop session manager
            sessionManager.stop();
            // Clear state
            await authManager.logout();
            setUser(null);
            setProfile(null);
            clearQueryCache();
            // Show non-blocking notification
            showToast({
                type: 'warning',
                message: 'Your session has expired. Redirecting to login...',
                duration: 3000
            });
            // Redirect after a short delay
            setTimeout(() => {
                window.location.href = '/login';
            }, 2000);
        };

        // Listen for legacy authError events (in case any component still dispatches them)
        // Delegate to session manager for coordinated handling
        const handleAuthErrorLegacy = () => {
            if (!mounted || !isInitializedRef.current) return;
            sessionManager.reportAuthError(new Error('Legacy auth error event'));
        };
        window.addEventListener('authError', handleAuthErrorLegacy);

        return () => {
            mounted = false;
            if (unsubscribe) unsubscribe();
            if (unsubscribeSessionManager) unsubscribeSessionManager();
            window.removeEventListener('userLoggedIn', handleLogin);
            window.removeEventListener('userLoggedOut', handleLogout);
            window.removeEventListener('authError', handleAuthErrorLegacy);
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
        // Stop session manager first
        sessionManager.stop();
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
