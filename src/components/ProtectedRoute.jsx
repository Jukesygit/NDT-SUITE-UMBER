import { Navigate, Outlet } from 'react-router-dom';
import authManager from '../auth-manager.js';

function ProtectedRoute({ isLoggedIn, requireAdmin, children }) {
    // Check if user is logged in
    if (isLoggedIn === false) {
        return <Navigate to="/login" replace />;
    }

    // Check admin requirement
    if (requireAdmin && !authManager.isAdmin()) {
        return <Navigate to="/" replace />;
    }

    // Render children if provided, otherwise render outlet for nested routes
    return children || <Outlet />;
}

export default ProtectedRoute;
