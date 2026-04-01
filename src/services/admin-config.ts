/**
 * Admin Configuration and Announcement Operations
 */

import { supabase } from '../supabase-client';
import authManager from '../auth-manager.js';
import adminConfigManager from '../admin-config';
import type {
  ConfigMetadata,
  ServiceResult,
  SystemAnnouncement,
  UpdateAnnouncementData,
} from './admin-types';

// ==========================================================================
// CONFIGURATION
// ==========================================================================

export async function getConfig(): Promise<Record<string, string[]>> {
  await adminConfigManager.ensureInitialized();
  return adminConfigManager.getAllConfig();
}

export function getConfigMetadata(): ConfigMetadata {
  return adminConfigManager.getListMetadata() as ConfigMetadata;
}

export async function addConfigItem(listName: string, item: string): Promise<ServiceResult> {
  return await adminConfigManager.addItem(listName, item);
}

export async function updateConfigItem(listName: string, oldItem: string, newItem: string): Promise<ServiceResult> {
  return await adminConfigManager.updateItem(listName, oldItem, newItem);
}

export async function removeConfigItem(listName: string, item: string): Promise<ServiceResult> {
  return await adminConfigManager.removeItem(listName, item);
}

export async function resetConfigList(listName: string): Promise<ServiceResult> {
  return await adminConfigManager.resetList(listName);
}

export async function resetAllConfig(): Promise<ServiceResult> {
  return await adminConfigManager.resetAllToDefaults();
}

export function exportConfig(): string {
  return adminConfigManager.exportConfig();
}

export async function importConfig(jsonString: string): Promise<ServiceResult> {
  return await adminConfigManager.importConfig(jsonString);
}

// ==========================================================================
// ANNOUNCEMENTS
// ==========================================================================

export async function getActiveAnnouncement(): Promise<SystemAnnouncement | null> {
  if (!authManager.isUsingSupabase()) {
    return null;
  }

  try {
    const { data, error } = await supabase!
      .from('system_announcements')
      .select(`
        id,
        title,
        message,
        type,
        is_active,
        is_dismissible,
        created_at,
        updated_at,
        created_by,
        updated_by
      `)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return null;
    }

    return data as SystemAnnouncement | null;
  } catch (error) {
    return null;
  }
}

export async function updateAnnouncement(data: UpdateAnnouncementData): Promise<ServiceResult<SystemAnnouncement>> {
  if (!authManager.isUsingSupabase()) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const user = authManager.getCurrentUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    // Check for existing announcement
    const { data: existing } = await supabase!
      .from('system_announcements')
      .select('id')
      .limit(1)
      .maybeSingle();

    let result;

    if (existing) {
      // Update existing announcement
      const { data: updated, error } = await supabase!
        .from('system_announcements')
        .update({
          title: data.title,
          message: data.message,
          type: data.type,
          is_active: data.is_active,
          is_dismissible: data.is_dismissible,
          updated_by: user.id,
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }
      result = updated;
    } else {
      // Create new announcement
      const { data: created, error } = await supabase!
        .from('system_announcements')
        .insert({
          title: data.title,
          message: data.message,
          type: data.type,
          is_active: data.is_active,
          is_dismissible: data.is_dismissible,
          created_by: user.id,
          updated_by: user.id,
        })
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }
      result = created;
    }

    return { success: true, data: result as SystemAnnouncement };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'An unexpected error occurred' };
  }
}

export async function clearAnnouncement(): Promise<ServiceResult> {
  if (!authManager.isUsingSupabase()) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { error } = await supabase!
      .from('system_announcements')
      .update({ is_active: false })
      .eq('is_active', true);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'An unexpected error occurred' };
  }
}
