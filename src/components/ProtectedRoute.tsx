import { type ReactNode, useRef, useState, useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Spinner } from './LoadingStates';

interface ProtectedRouteProps {
    requireAdmin?: boolean;
    requireElevatedAccess?: boolean;
    children?: ReactNode;
}

function ProtectedRoute({ requireAdmin, requireElevatedAccess, children }: ProtectedRouteProps) {
    const location = useLocation();
    const { isAuthenticated, isAdmin, hasElevatedAccess, isLoading } = useAuth();
    const wasAuthenticatedRef = useRef(false);
    const [waitingForReauth, setWaitingForReauth] = useState(false);

    // Track if user was previously authenticated
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | undefined;

        if (isAuthenticated) {
            wasAuthenticatedRef.current = true;
            setWaitingForReauth(false);
        } else if (wasAuthenticatedRef.current && !isLoading) {
            // Auth dropped after being valid - likely a token refresh race.
            // Wait briefly before redirecting to let the refresh complete.
            console.log('[AUTH-DEBUG] ProtectedRoute: auth dropped after being valid, waiting 2s...');
            setWaitingForReauth(true);
            timer = setTimeout(() => {
                setWaitingForReauth(false);
            }, 2000);
        }

        return () => {
            if (timer) clearTimeout(timer);
        };
    }, [isAuthenticated, isLoading]);

    // Show centered spinner while auth state is loading
    if (isLoading || waitingForReauth) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <Spinner size="lg" />
                    <p className="mt-4 text-secondary text-sm">Verifying session...</p>
                </div>
            </div>
        );
    }

    // Check if user is logged in
    if (!isAuthenticated) {
        console.log('[AUTH-DEBUG] ProtectedRoute: REDIRECTING TO LOGIN (grace period expired, still not authenticated)');
        wasAuthenticatedRef.current = false;
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // Check admin requirement (only admin can access)
    if (requireAdmin && !isAdmin) {
        return <Navigate to="/" replace />;
    }

    // Check elevated access requirement (admin or manager can access)
    if (requireElevatedAccess && !hasElevatedAccess) {
        return <Navigate to="/" replace />;
    }

    // Render children if provided, otherwise render outlet for nested routes
    if (children) {
        return children;
    }

    return <Outlet />;
}

export default ProtectedRoute;
