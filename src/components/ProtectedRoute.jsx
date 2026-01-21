import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Spinner } from './LoadingStates';

function ProtectedRoute({ requireAdmin, requireElevatedAccess, children }) {
    const location = useLocation();
    const { isAuthenticated, isAdmin, hasElevatedAccess, isLoading } = useAuth();

    // Show centered spinner while auth state is loading
    if (isLoading) {
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
