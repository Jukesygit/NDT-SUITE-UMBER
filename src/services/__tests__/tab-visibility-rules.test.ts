// =============================================================================
// tab-visibility-service — the pure half: what is hidden, and in what order
// =============================================================================
// The route guard and the sidebar used to decide visibility with two separate
// conditionals, and they disagreed: the sidebar returned on `adminOnly` /
// `requiresElevatedAccess` BEFORE ever consulting the flag, so hiding Personnel
// left the link in the nav while the guard redirected anyone who clicked it.
// Both now route through these functions, so the interesting properties are
// here rather than duplicated across two component tests:
//
//   • `admin` and `profile` can never be hidden — the lockout floor
//   • an explicit is_visible=false hides; anything else fails OPEN
//   • visibility outranks role in the nav, which is the ordering that regressed
//
// `isNavTabVisible` exists as a pure function precisely so that last one is
// pinned by a test instead of by the arrangement of early returns.
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  NEVER_HIDDEN_TABS,
  isNeverHiddenTab,
  isTabVisible,
  isNavTabVisible,
  type TabVisibilitySetting,
} from '../tab-visibility-service';

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

const ALL_HIDDEN = [
  setting('personnel', false),
  setting('documents', false),
  setting('tools', false),
  setting('profile', false),
  setting('admin', false),
];

const viewer = (overrides: Partial<Parameters<typeof isNavTabVisible>[1]> = {}) => ({
  settings: [] as TabVisibilitySetting[],
  isMaintenanceMode: false,
  isAdmin: false,
  hasElevatedAccess: false,
  ...overrides,
});

describe('NEVER_HIDDEN_TABS', () => {
  it('covers the toggle surface and the redirect target, and nothing else', () => {
    // Widening this list weakens the flag; narrowing it re-opens a lockout.
    // Both are decisions, so the exact membership is asserted.
    expect([...NEVER_HIDDEN_TABS]).toEqual(['admin', 'profile']);
  });

  it('recognises its members and only its members', () => {
    expect(isNeverHiddenTab('admin')).toBe(true);
    expect(isNeverHiddenTab('profile')).toBe(true);
    expect(isNeverHiddenTab('documents')).toBe(false);
    expect(isNeverHiddenTab('tools')).toBe(false);
  });
});

describe('isTabVisible', () => {
  it('hides a tab whose row says is_visible=false', () => {
    expect(isTabVisible([setting('documents', false)], 'documents')).toBe(false);
  });

  it('shows a tab whose row says is_visible=true', () => {
    expect(isTabVisible([setting('documents', true)], 'documents')).toBe(true);
  });

  it.each([...NEVER_HIDDEN_TABS])('never hides %s, even with the row switched off', (tabId) => {
    expect(isTabVisible(ALL_HIDDEN, tabId)).toBe(true);
  });

  describe('failing open', () => {
    it('shows a tab that has no row at all', () => {
      // `projects` is seeded nowhere; it must not vanish because of that.
      expect(isTabVisible([setting('documents', false)], 'projects')).toBe(true);
    });

    it('shows everything when settings are undefined or empty', () => {
      expect(isTabVisible(undefined, 'documents')).toBe(true);
      expect(isTabVisible([], 'documents')).toBe(true);
    });
  });
});

describe('isNavTabVisible', () => {
  describe('visibility outranks role', () => {
    it('hides an adminOnly item when its tab is off, even from an admin', () => {
      // The regression: this used to return `isAdmin` before reading the flag.
      const result = isNavTabVisible(
        { tabId: 'reports', adminOnly: true },
        viewer({ settings: [setting('reports', false)], isAdmin: true })
      );

      expect(result).toBe(false);
    });

    it('hides an elevated-access item when its tab is off, even from a manager', () => {
      const result = isNavTabVisible(
        { tabId: 'personnel', requiresElevatedAccess: true },
        viewer({ settings: ALL_HIDDEN, hasElevatedAccess: true })
      );

      expect(result).toBe(false);
    });

    it('agrees with the guard on a plain hidden tab', () => {
      const settings = [setting('documents', false)];

      expect(isNavTabVisible({ tabId: 'documents' }, viewer({ settings }))).toBe(
        isTabVisible(settings, 'documents')
      );
    });
  });

  describe('role still applies to a visible tab', () => {
    it('shows an adminOnly item to an admin', () => {
      expect(isNavTabVisible({ tabId: 'admin', adminOnly: true }, viewer({ isAdmin: true }))).toBe(
        true
      );
    });

    it('hides an adminOnly item from a non-admin', () => {
      expect(isNavTabVisible({ tabId: 'admin', adminOnly: true }, viewer({ isAdmin: false }))).toBe(
        false
      );
    });

    it('hides an elevated-access item from someone without it', () => {
      expect(
        isNavTabVisible(
          { tabId: 'personnel', requiresElevatedAccess: true },
          viewer({ hasElevatedAccess: false })
        )
      ).toBe(false);
    });

    it('shows an unrestricted visible tab to anyone', () => {
      expect(isNavTabVisible({ tabId: 'projects' }, viewer())).toBe(true);
    });
  });

  describe('the system tabs in the nav', () => {
    it('keeps Admin in an admin’s nav even with every row switched off', () => {
      expect(
        isNavTabVisible(
          { tabId: 'admin', adminOnly: true },
          viewer({ settings: ALL_HIDDEN, isAdmin: true })
        )
      ).toBe(true);
    });

    it('keeps Profile in everyone’s nav', () => {
      expect(isNavTabVisible({ tabId: 'profile' }, viewer({ settings: ALL_HIDDEN }))).toBe(true);
    });
  });

  describe('maintenance mode', () => {
    it('leaves only the Tools group, outranking even a visible tab', () => {
      const locked = viewer({ isMaintenanceMode: true, isAdmin: true });

      expect(isNavTabVisible({ tabId: 'tools', isGroup: true }, locked)).toBe(true);
      expect(isNavTabVisible({ tabId: 'admin', adminOnly: true }, locked)).toBe(false);
      expect(isNavTabVisible({ tabId: 'profile' }, locked)).toBe(false);
    });
  });
});
