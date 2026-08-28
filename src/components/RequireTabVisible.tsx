import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useTabVisibility } from '../hooks/queries/useTabVisibility';
import { isTabVisible } from '../services/tab-visibility-service';
import { Spinner } from './LoadingStates';

interface RequireTabVisibleProps {
  tabId: string;
  children: ReactNode;
}

/**
 * Route guard for pages whose tab has been hidden via tab_visibility_settings.
 *
 * The flag is AUTHORITATIVE FOR EVERY ROLE. Super admins used to bypass it
 * outright, which meant a tab switched off in the admin panel stayed reachable
 * for the very people who switched it off — the owner believed /documents was
 * off while it still rendered for super_admin. A disabled tab is now disabled,
 * full stop; re-enabling one is an admin-panel action, not a role privilege.
 *
 * Removing that bypass is only safe because `admin` and `profile` are excluded
 * from hiding at the source (`NEVER_HIDDEN_TABS` in tab-visibility-service):
 * `admin` hosts the only toggle surface, and `profile` is this component's own
 * redirect target. `isTabVisible` short-circuits on both, which is what makes
 * the `/profile` redirect below provably terminating rather than a redirect
 * loop waiting for someone to hide the wrong tab.
 *
 * `isTabVisible` is shared with the sidebar in LayoutNew, so nav and guard
 * cannot disagree about what is hidden. It fails open while settings load or
 * when a tab has no row, so a failed fetch never blacks out navigation.
 */
function RequireTabVisible({ tabId, children }: RequireTabVisibleProps) {
  const { isLoading: settingsLoading, data: settings } = useTabVisibility();

  if (settingsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Spinner size="lg" />
          <p className="mt-4 text-gray-400 text-sm">Checking access...</p>
        </div>
      </div>
    );
  }

  if (!isTabVisible(settings, tabId)) {
    return <Navigate to="/profile" replace />;
  }

  return children;
}

export default RequireTabVisible;
