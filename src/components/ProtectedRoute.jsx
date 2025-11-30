import { Navigate, Outlet, useLocation } from 'react-router-dom';
import authManager from '../auth-manager.js';
import { useEffect } from 'react';

function ProtectedRoute({ isLoggedIn, requireAdmin, requireElevatedAccess, children }) {
    const location = useLocation();

    // Add a check to ensure we're in a Router context
    useEffect(() => {
        // This will only run if we're inside a Router
    }, [location]);

    // Check if user is logged in
    if (isLoggedIn === false) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // Check admin requirement (only admin can access)
    if (requireAdmin && !authManager.isAdmin()) {
        return <Navigate to="/" replace />;
    }

    // Check elevated access requirement (admin or manager can access)
    if (requireElevatedAccess && !authManager.hasElevatedAccess()) {
        return <Navigate to="/" replace />;
    }

    // Render children if provided, otherwise render outlet for nested routes
    if (children) {
        return children;
    }

    return <Outlet />;
}

export default ProtectedRoute;
