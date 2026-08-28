/**
 * AuthContext - Centralized authentication state management
 *
 * Provides reactive auth state to all components via useAuth hook.
 * Designed to support future route guards (Option 4).
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import authManager from '../auth-manager.js';
import { clearQueryCache, invalidateStaleQueries } from '../lib/query-client';
import { sessionManager } from '../lib/session-manager';
import {
  clearSessionStart,
  ensureSessionStart,
  markSessionStart,
  markSessionEndedByExpiry,
  redirectToExpiredLogin,
} from '../lib/session-timebox';
import { twoFactorService } from '../services/two-factor-service';

// Types matching auth-manager
export interface AuthUser {
  id: string;
  username: string | null;
  email: string | null;
  role: 'super_admin' | 'admin' | 'manager' | 'org_admin' | 'editor' | 'viewer';
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

export type UserRole = 'super_admin' | 'admin' | 'manager' | 'org_admin' | 'editor' | 'viewer';

interface AuthContextType {
  // State
  user: AuthUser | null;
  profile: AuthProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  sessionWasRestored: boolean; // session silently restored from persistence (H3)

  // Role checks
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isManager: boolean;
  isOrgAdmin: boolean;
  isEditor: boolean;
  hasElevatedAccess: boolean; // super_admin, admin, or manager

  // 2FA state
  twoFactorEnabled: boolean;
  twoFactorVerified: boolean;
  twoFactorRequired: boolean;

  // Helper methods
  hasRole: (roles: UserRole | UserRole[]) => boolean;
  hasPermission: (permission: string) => boolean;

  // Actions
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

/**
 * How long after a user-initiated sign-out a SIGNED_OUT event is still assumed
 * to belong to that sign-out. Generous: a logout round-trip is well under a
 * second, and mislabelling a deliberate logout as an expiry is the worse error
 * (it tells the user something untrue about their session).
 */
const DELIBERATE_SIGNOUT_WINDOW_MS = 30 * 1000;

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
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFactorVerified, setTwoFactorVerified] = useState(false);
  const [sessionWasRestored, setSessionWasRestored] = useState(false);
  const isInitializedRef = useRef(false); // Track if auth has fully initialized (ref for event handlers)
  const prevUserIdRef = useRef<string | null>(null); // Last known authenticated id — detect identity swaps (H2)
  // Epoch ms of the last USER-INITIATED sign-out. Supabase fires SIGNED_OUT for
  // both a deliberate logout and a server-side session end, and the difference
  // decides whether the user gets a "your session expired" message or a silent
  // login form. Second guard only — `prevUserIdRef` is already nulled by the
  // logout handler, which normally runs first — but ordering between the
  // `userLoggedOut` event and the (500ms-delayed) SIGNED_OUT verification is not
  // something this component controls, so the intent is recorded explicitly.
  const deliberateSignOutAtRef = useRef(0);

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
          setSessionWasRestored(authManager.sessionWasRestored);
          prevUserIdRef.current = authManager.getCurrentUser()?.id ?? null;
          setIsLoading(false);
          isInitializedRef.current = true;
          // Initialize session manager if user is already logged in
          if (authManager.isLoggedIn()) {
            sessionManager.initialize();
            // Restored session: adopt the recorded start, or record now if this
            // is the first boot that tracks it (conservative — see helper).
            ensureSessionStart();
            // Check 2FA status on init (handles page refresh)
            try {
              const status = await twoFactorService.getStatus();
              if (mounted) {
                setTwoFactorEnabled(status.isEnabled);
                setTwoFactorVerified(status.currentLevel === 'aal2');
              }
            } catch {
              // 2FA check failed — treat as not enabled
            }
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

    // Subscribe to auth state changes (via custom events only, not a duplicate Supabase listener).
    // auth-manager already has its own Supabase onAuthStateChange listener that updates
    // currentUser/currentProfile. We listen for the events it dispatches instead.
    const handleAuthChange = () => {
      if (mounted) {
        const u = authManager.getCurrentUser();
        const nextId = u?.id ?? null;
        // If the authenticated identity CHANGED under us (swap, not just
        // login/logout), purge the React Query cache so no cross-user data
        // survives the transition (H2).
        if (prevUserIdRef.current && nextId && prevUserIdRef.current !== nextId) {
          clearQueryCache();
          markSessionStart(); // different person, different session clock
        }
        // The session ended while the user was working and they did not ask for
        // it: the server time-boxed them out, or the refresh token stopped being
        // accepted. auth-supabase.ts has already re-checked getSession() before
        // nulling the user, so this is not a spurious rotation blip — it is the
        // authoritative expiry signal. (Refresh FAILURES are deliberately not
        // treated as expiry; see the sessionManager 'error' branch below.)
        const wasForcedSignOut =
          isInitializedRef.current &&
          prevUserIdRef.current !== null &&
          nextId === null &&
          Date.now() - deliberateSignOutAtRef.current > DELIBERATE_SIGNOUT_WINDOW_MS;

        prevUserIdRef.current = nextId;
        loadAuthState();

        if (wasForcedSignOut) {
          sessionManager.stop();
          clearSessionStart();
          clearQueryCache();
          markSessionEndedByExpiry();
          redirectToExpiredLogin();
        }
      }
    };
    window.addEventListener('authStateChanged', handleAuthChange);

    // Listen for login events (dispatched AFTER profile is loaded in auth-manager)
    const handleLogin = async () => {
      if (mounted) {
        loadAuthState();
        setSessionWasRestored(false); // explicit sign-in — not a restored session (H3)
        prevUserIdRef.current = authManager.getCurrentUser()?.id ?? null;
        // Fresh sign-in — restart the time-box clock from now.
        markSessionStart();
        // Initialize session manager for proactive refresh
        sessionManager.initialize();
        // Check 2FA status
        try {
          const status = await twoFactorService.getStatus();
          if (mounted) {
            setTwoFactorEnabled(status.isEnabled);
            setTwoFactorVerified(status.currentLevel === 'aal2');
          }
        } catch {
          // 2FA check failed — treat as not enabled
        }
      }
    };
    window.addEventListener('userLoggedIn', handleLogin);

    // Listen for logout events
    const handleLogout = () => {
      // Recorded even when unmounted: the flag's whole job is to tell the
      // SIGNED_OUT that follows apart from an expiry.
      deliberateSignOutAtRef.current = Date.now();
      clearSessionStart();
      if (mounted) {
        // Stop session manager
        sessionManager.stop();
        setUser(null);
        setProfile(null);
        setTwoFactorEnabled(false);
        setTwoFactorVerified(false);
        setSessionWasRestored(false);
        prevUserIdRef.current = null;
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
      } else if (event.type === 'error') {
        // Refresh failed but this does NOT mean the session is expired.
        // Common cause: Supabase's auto-refresh consumed the token first.
        // True session expiry is handled by the SIGNED_OUT event in
        // auth-supabase.ts, which arrives here as an `authStateChanged` with a
        // null user (see handleAuthChange's forced-sign-out branch). Do NOT
        // redirect from here — a transient network blip would evict working
        // users.
      }
    });

    // Listen for legacy authError events (in case any component still dispatches them)
    // Delegate to session manager for coordinated handling
    const handleAuthErrorLegacy = () => {
      if (!mounted || !isInitializedRef.current) return;
      sessionManager.reportAuthError(new Error('Legacy auth error event'));
    };
    window.addEventListener('authError', handleAuthErrorLegacy);

    return () => {
      mounted = false;
      window.removeEventListener('authStateChanged', handleAuthChange);
      if (unsubscribeSessionManager) unsubscribeSessionManager();
      window.removeEventListener('userLoggedIn', handleLogin);
      window.removeEventListener('userLoggedOut', handleLogout);
      window.removeEventListener('authError', handleAuthErrorLegacy);
    };
  }, [loadAuthState]);

  // Computed values — user is not "authenticated" until 2FA is satisfied
  const isAuthenticated = !!user && !(twoFactorEnabled && !twoFactorVerified);
  const isSuperAdmin = user?.role === 'super_admin';
  const isAdmin = user?.role === 'admin' || isSuperAdmin;
  const isManager = user?.role === 'manager';
  const isOrgAdmin = user?.role === 'org_admin';
  const isEditor = user?.role === 'editor' || isAdmin || isManager || isOrgAdmin;
  const hasElevatedAccess = isAdmin || isManager;
  const twoFactorRequired = twoFactorEnabled && !twoFactorVerified;

  // Check if user has one of the specified roles
  const hasRole = useCallback(
    (roles: UserRole | UserRole[]): boolean => {
      if (!user?.role) return false;
      const roleArray = Array.isArray(roles) ? roles : [roles];
      return roleArray.includes(user.role as UserRole);
    },
    [user?.role]
  );

  // Check if user has a specific permission
  const hasPermission = useCallback((permission: string): boolean => {
    return authManager.hasPermission(permission);
  }, []);

  // Logout action
  const logout = useCallback(async () => {
    // Mark intent BEFORE anything can fire SIGNED_OUT, so the resulting
    // auth-state change is never mistaken for a server-side expiry.
    deliberateSignOutAtRef.current = Date.now();
    clearSessionStart();
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
      // intentionally empty - auth refresh failure is handled by finally block
    } finally {
      setIsLoading(false);
    }
  }, [loadAuthState]);

  const value: AuthContextType = {
    user,
    profile,
    isLoading,
    isAuthenticated,
    sessionWasRestored,
    isSuperAdmin,
    isAdmin,
    isManager,
    isOrgAdmin,
    isEditor,
    hasElevatedAccess,
    twoFactorEnabled,
    twoFactorVerified,
    twoFactorRequired,
    hasRole,
    hasPermission,
    logout,
    refreshAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
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
    throw new Error(
      'useAuth must be used within an AuthProvider. Wrap your app with <AuthProvider>.'
    );
  }
  return context;
}

export default AuthContext;
