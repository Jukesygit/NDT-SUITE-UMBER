/**
 * Route Guard Components - Protect routes based on authentication and roles
 *
 * These are ready to use for Option 4 (Route Guards).
 * Simply wrap routes with these components to enforce access control.
 *
 * @example
 * // Require any authenticated user
 * <Route element={<RequireAuth />}>
 *     <Route path="/profile" element={<ProfilePage />} />
 * </Route>
 *
 * @example
 * // Require specific roles
 * <Route element={<RequireRole roles={['admin', 'org_admin']} />}>
 *     <Route path="/admin" element={<AdminPage />} />
 * </Route>
 */

import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth, UserRole } from '../../contexts/AuthContext';
import { PageSpinner } from '../ui';

interface RequireAuthProps {
    /** Where to redirect if not authenticated (default: /login) */
    redirectTo?: string;
    /** Custom loading component */
    loadingComponent?: React.ReactNode;
}

/**
 * RequireAuth - Ensures user is authenticated
 *
 * Wrap routes that require any authenticated user.
 * Redirects to login if not authenticated.
 */
export function RequireAuth({
    redirectTo = '/login',
    loadingComponent,
}: RequireAuthProps) {
    const { isAuthenticated, isLoading } = useAuth();
    const location = useLocation();

    if (isLoading) {
        return loadingComponent ? <>{loadingComponent}</> : <PageSpinner message="Checking authentication..." />;
    }

    if (!isAuthenticated) {
        // Save the attempted location for redirect after login
        return <Navigate to={redirectTo} state={{ from: location }} replace />;
    }

    return <Outlet />;
}

interface RequireRoleProps {
    /** Required role(s) - user must have at least one */
    roles: UserRole | UserRole[];
    /** Where to redirect if not authorized (default: /) */
    redirectTo?: string;
    /** Custom component to show when not authorized (instead of redirect) */
    fallback?: React.ReactNode;
    /** Custom loading component */
    loadingComponent?: React.ReactNode;
}

/**
 * RequireRole - Ensures user has required role(s)
 *
 * Wrap routes that require specific roles.
 * Shows fallback or redirects if user doesn't have required role.
 */
export function RequireRole({
    roles,
    redirectTo = '/',
    fallback,
    loadingComponent,
}: RequireRoleProps) {
    const { isAuthenticated, isLoading, hasRole } = useAuth();
    const location = useLocation();

    if (isLoading) {
        return loadingComponent ? <>{loadingComponent}</> : <PageSpinner message="Checking permissions..." />;
    }

    // First check if authenticated
    if (!isAuthenticated) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // Then check if has required role
    if (!hasRole(roles)) {
        if (fallback) {
            return <>{fallback}</>;
        }
        return <Navigate to={redirectTo} replace />;
    }

    return <Outlet />;
}

/**
 * AccessDenied - Default component for unauthorized access
 */
export function AccessDenied() {
    return (
        <div className="flex items-center justify-center min-h-[400px]">
            <div className="glass-card text-center p-8 max-w-md">
                <div className="text-6xl mb-4">
                    <svg className="w-16 h-16 mx-auto text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <h2 className="text-xl font-semibold text-white mb-2">Access Denied</h2>
                <p className="text-white/60 mb-6">
                    You don't have permission to access this page.
                    Please contact an administrator if you believe this is an error.
                </p>
                <a
                    href="/"
                    className="inline-block px-6 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white font-medium transition-colors"
                >
                    Return to Home
                </a>
            </div>
        </div>
    );
}

export default RequireAuth;
