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
  isVisible: boolean,
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
