import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function ProtectedRoute({ requireAdmin, requireElevatedAccess, children }) {
    const location = useLocation();
    const { isAuthenticated, isAdmin, hasElevatedAccess, isLoading } = useAuth();

    // Show nothing while loading (AuthProvider will handle the loading state)
    if (isLoading) {
        return null;
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
