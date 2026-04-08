import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTabVisibility } from '../hooks/queries/useTabVisibility';
import { Spinner } from './LoadingStates';

interface RequireTabVisibleProps {
    tabId: string;
    children: ReactNode;
}

/**
 * Route guard that blocks access to pages whose tab has been hidden
 * by a super_admin via tab_visibility_settings.
 *
 * Super admins always bypass this check.
 * If settings haven't loaded yet or the tab has no entry, access is allowed.
 */
function RequireTabVisible({ tabId, children }: RequireTabVisibleProps) {
    const { isSuperAdmin, isLoading: authLoading } = useAuth();
    const { data: settings, isLoading: settingsLoading } = useTabVisibility();

    if (authLoading || settingsLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center">
                    <Spinner size="lg" />
                    <p className="mt-4 text-gray-400 text-sm">Checking access...</p>
                </div>
            </div>
        );
    }

    // Super admins always have access
    if (isSuperAdmin) return children;

    // If we have settings, check if this tab is hidden
    if (settings && settings.length > 0) {
        const entry = settings.find(s => s.tab_id === tabId);
        if (entry && !entry.is_visible) {
            return <Navigate to="/profile" replace />;
        }
    }

    return children;
}

export default RequireTabVisible;
