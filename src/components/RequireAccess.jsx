import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Spinner } from './LoadingStates';

/**
 * Component-level access control wrapper.
 * Use this to protect individual components/pages while keeping them
 * under the same Layout instance (preventing Layout remount on navigation).
 *
 * @param {Object} props
 * @param {boolean} props.requireAdmin - Only allow admin users
 * @param {boolean} props.requireElevatedAccess - Allow admin or manager users
 * @param {React.ReactNode} props.children - The protected content
 */
function RequireAccess({ requireAdmin, requireElevatedAccess, children }) {
    const { isAdmin, hasElevatedAccess, isLoading } = useAuth();

    // Show spinner while auth is loading (instead of blank screen)
    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center">
                    <Spinner size="lg" />
                    <p className="mt-4 text-gray-400 text-sm">Checking permissions...</p>
                </div>
            </div>
        );
    }

    // Check admin requirement
    if (requireAdmin && !isAdmin) {
        return <Navigate to="/" replace />;
    }

    // Check elevated access requirement (admin or manager)
    if (requireElevatedAccess && !hasElevatedAccess) {
        return <Navigate to="/" replace />;
    }

    return children;
}

export default RequireAccess;
