/**
 * Tab Visibility Service
 * Manages tab visibility settings controlled by super admins.
 */

import { supabase } from '../supabase-client.js';

export interface TabVisibilitySetting {
  id: string;
  tab_id: string;
  tab_label: string;
  is_visible: boolean;
  updated_at: string;
  updated_by: string | null;
}

/**
 * Tabs the visibility flag is not allowed to hide, whatever the row says.
 *
 * The flag is authoritative for every OTHER tab and for every role — including
 * super_admin, which used to bypass it entirely. Two tabs cannot participate,
 * because hiding either one destroys the means of unhiding it:
 *
 *  - `admin` — `/admin` is wrapped in `RequireTabVisible tabId="admin"`
 *    (App.tsx:374), and the ONLY tab-visibility toggle in the app is
 *    `TabVisibilityTab`, which is a tab *inside* `AdminPage`. Hiding it evicts
 *    everyone, super_admin included, from the one screen that could restore it.
 *    Recovery would mean raw SQL against production.
 *  - `profile` — the guard's own "you may not be here" redirect target is
 *    `/profile` (RequireTabVisible.tsx), and `/profile` is itself wrapped in
 *    `RequireTabVisible tabId="profile"` (App.tsx:341). Hiding it turns every
 *    blocked navigation into an infinite redirect.
 *
 * These are UI-level system tabs, so the seeded `tab_visibility_settings` rows
 * stay exactly as they are — no migration. `TabVisibilityTab` simply never
 * offers the toggle, and this predicate short-circuits ahead of any lookup, so a
 * stale or hand-edited `is_visible = false` row still cannot lock anyone out.
 */
export const NEVER_HIDDEN_TABS = ['admin', 'profile'] as const;

/** True when `tabId` is a system tab the flag may never hide. */
export function isNeverHiddenTab(tabId: string): boolean {
  return (NEVER_HIDDEN_TABS as readonly string[]).includes(tabId);
}

/**
 * THE single tab-visibility decision, shared by the route guard
 * (`RequireTabVisible`) and the sidebar (`LayoutNew`) so the two agree by
 * construction rather than by two similar-looking conditionals.
 *
 * Deliberately fail-open on absence: settings still loading, an empty table, or
 * a tab with no row at all (`projects` has none) all mean visible. Only an
 * explicit `is_visible = false` hides anything — a failed settings fetch must
 * not black out the app's navigation.
 *
 * Role is NOT an input. The caller applies its own role rules on top, and must
 * apply them AFTER this one: a hidden tab is hidden for everyone.
 */
export function isTabVisible(
  settings: readonly TabVisibilitySetting[] | undefined,
  tabId: string
): boolean {
  if (isNeverHiddenTab(tabId)) return true;

  const entry = settings?.find((setting) => setting.tab_id === tabId);
  return entry ? entry.is_visible : true;
}

/** The access flags a navigation entry carries, independent of how it renders. */
export interface NavTabAccess {
  /** Matched against `tab_visibility_settings.tab_id`. */
  tabId: string;
  adminOnly?: boolean;
  requiresElevatedAccess?: boolean;
  isGroup?: boolean;
}

export interface NavTabViewer {
  settings: readonly TabVisibilitySetting[] | undefined;
  isMaintenanceMode: boolean;
  isAdmin: boolean;
  hasElevatedAccess: boolean;
}

/**
 * Whether a navigation entry should appear in the sidebar.
 *
 * Extracted from LayoutNew so the ORDER of the checks is pinned by a test. The
 * order is the whole point: visibility is resolved BEFORE either role check, so
 * the sidebar can never advertise a route that `RequireTabVisible` will bounce.
 * The previous inline version returned on `adminOnly` / `requiresElevatedAccess`
 * first, which meant the Admin and Personnel entries never consulted the flag at
 * all — nav and guard silently disagreed for exactly those two.
 *
 * Maintenance mode stays outermost: it is an app-wide lockdown to the Tools
 * group, not a statement about any tab's visibility.
 */
export function isNavTabVisible(tab: NavTabAccess, viewer: NavTabViewer): boolean {
  if (viewer.isMaintenanceMode) return tab.isGroup === true;
  if (!isTabVisible(viewer.settings, tab.tabId)) return false;
  if (tab.adminOnly) return viewer.isAdmin;
  if (tab.requiresElevatedAccess) return viewer.hasElevatedAccess;
  return true;
}

/**
 * Fetch all tab visibility settings
 */
export async function getTabVisibilitySettings(): Promise<TabVisibilitySetting[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('tab_visibility_settings')
    .select('*')
    .order('tab_id');

  if (error) {
    console.error('[TabVisibility] Failed to fetch settings:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Update a single tab's visibility
 */
export async function updateTabVisibility(
  tabId: string,
  isVisible: boolean
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  const { error } = await supabase
    .from('tab_visibility_settings')
    .update({ is_visible: isVisible })
    .eq('tab_id', tabId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
