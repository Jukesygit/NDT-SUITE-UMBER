import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Spinner } from './LoadingStates';

interface RequireAccessProps {
    requireSuperAdmin?: boolean;
    requireAdmin?: boolean;
    requireElevatedAccess?: boolean;
    children: ReactNode;
}

/**
 * Component-level access control wrapper.
 * Use this to protect individual components/pages while keeping them
 * under the same Layout instance (preventing Layout remount on navigation).
 */
function RequireAccess({ requireSuperAdmin, requireAdmin, requireElevatedAccess, children }: RequireAccessProps) {
    const { isSuperAdmin, isAdmin, hasElevatedAccess, isLoading } = useAuth();

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

    // Check super admin requirement
    if (requireSuperAdmin && !isSuperAdmin) {
        return <Navigate to="/" replace />;
    }

    // Check admin requirement (super_admin passes this too since isAdmin includes super_admin)
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
