// =============================================================================
// RequireTabVisible — the tab visibility flag, now authoritative for every role
// =============================================================================
// The flag used to be advisory for super admins: `if (isSuperAdmin) return
// children` sat above the lookup, so a tab switched off in the admin panel went
// on rendering for the very people who switched it off. The owner believed
// /documents was off; it was off for everyone except super_admin.
//
// Removing that bypass is only safe with a floor under it, so both halves are
// pinned here:
//
//   • a toggleable tab with is_visible=false blocks EVERY role, super_admin
//     included — the behaviour the change exists to deliver
//   • `admin` and `profile` are never hidden, whatever the row says, because
//     `admin` hosts the only toggle surface and `profile` is this guard's own
//     redirect target — hiding either is a lockout with no in-app way back
//
// The redirect target is asserted rather than assumed: it is only provably
// terminating because `profile` is in NEVER_HIDDEN_TABS.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import RequireTabVisible from '../RequireTabVisible';
import type { TabVisibilitySetting } from '../../services/tab-visibility-service';

const mockUseTabVisibility = vi.fn();
vi.mock('../../hooks/queries/useTabVisibility', () => ({
  useTabVisibility: () => mockUseTabVisibility(),
}));

vi.mock('../LoadingStates', () => ({
  Spinner: ({ size }: { size?: string }) => (
    <div data-testid="spinner" data-size={size}>
      Loading...
    </div>
  ),
}));

function setting(tab_id: string, is_visible: boolean): TabVisibilitySetting {
  return {
    id: `id-${tab_id}`,
    tab_id,
    tab_label: tab_id,
    is_visible,
    updated_at: '2026-08-27T00:00:00.000Z',
    updated_by: null,
  };
}

/** Settings with every seeded tab off — the worst case the guard must survive. */
const ALL_TABS_HIDDEN = [
  setting('personnel', false),
  setting('documents', false),
  setting('tools', false),
  setting('profile', false),
  setting('admin', false),
];

function renderGuard(tabId: string) {
  return render(
    <MemoryRouter initialEntries={['/page']}>
      <Routes>
        <Route
          path="/page"
          element={
            <RequireTabVisible tabId={tabId}>
              <div>Tab Content</div>
            </RequireTabVisible>
          }
        />
        <Route path="/profile" element={<div>Profile Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function givenSettings(data: TabVisibilitySetting[] | undefined, isLoading = false) {
  mockUseTabVisibility.mockReturnValue({ data, isLoading });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RequireTabVisible', () => {
  describe('a tab that is switched off', () => {
    it('blocks a viewer', () => {
      givenSettings([setting('documents', false)]);

      renderGuard('documents');

      expect(screen.queryByText('Tab Content')).not.toBeInTheDocument();
      expect(screen.getByText('Profile Page')).toBeInTheDocument();
    });

    it('blocks a super admin too — the flag is not advisory any more', () => {
      // No role is supplied to the guard at all now; this is the regression the
      // whole change is about, so it is asserted from the settings alone.
      givenSettings([setting('documents', false)]);

      renderGuard('documents');

      expect(screen.queryByText('Tab Content')).not.toBeInTheDocument();
    });

    it('redirects to /profile, which is reachable because profile is never hidden', () => {
      givenSettings(ALL_TABS_HIDDEN);

      renderGuard('documents');

      // Terminating redirect: /profile renders rather than bouncing again.
      expect(screen.getByText('Profile Page')).toBeInTheDocument();
    });
  });

  describe('a tab that is switched on', () => {
    it('renders its page', () => {
      givenSettings([setting('documents', true)]);

      renderGuard('documents');

      expect(screen.getByText('Tab Content')).toBeInTheDocument();
    });
  });

  describe('the system tabs', () => {
    it.each(['admin', 'profile'])(
      'renders %s even with is_visible=false — hiding it would be a lockout',
      (tabId) => {
        givenSettings(ALL_TABS_HIDDEN);

        renderGuard(tabId);

        expect(screen.getByText('Tab Content')).toBeInTheDocument();
      }
    );

    it('renders admin for a viewer as well — role gating is RequireAccess’s job', () => {
      // RequireTabVisible answers "is this tab switched on", never "may you".
      // /admin is wrapped in RequireAccess requireAdmin upstream of this guard.
      givenSettings(ALL_TABS_HIDDEN);

      renderGuard('admin');

      expect(screen.getByText('Tab Content')).toBeInTheDocument();
    });
  });

  describe('when the flag cannot be resolved', () => {
    it('waits while the settings load', () => {
      givenSettings(undefined, true);

      renderGuard('documents');

      expect(screen.getByTestId('spinner')).toBeInTheDocument();
      expect(screen.queryByText('Tab Content')).not.toBeInTheDocument();
      expect(screen.queryByText('Profile Page')).not.toBeInTheDocument();
    });

    it('fails open when the fetch returned nothing', () => {
      // A failed settings read must not black out the app.
      givenSettings(undefined);

      renderGuard('documents');

      expect(screen.getByText('Tab Content')).toBeInTheDocument();
    });

    it('fails open for a tab that has no row', () => {
      givenSettings([setting('documents', false)]);

      renderGuard('projects');

      expect(screen.getByText('Tab Content')).toBeInTheDocument();
    });
  });
});
