/**
 * Vessel Model Service
 * CRUD operations for vessel models.
 *
 * Scan placements are NOT stored here. The `vessel_scan_placements` table from
 * the 2026-03-19 design was never created in the live schema
 * (docs/plans/2026-08-27-legacy-table-investigation.md §9), and the three
 * service functions that queried it had no component consumers, so they were
 * deleted 2026-08-27. Placement lives in `vessel_models.config.scanComposites[]`
 * — the flow the companion app actually uses.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
// @ts-ignore - JS module without type declarations
import * as supabaseModule from '../supabase-client';
// @ts-ignore - accessing property from untyped module
const supabase: SupabaseClient | null = supabaseModule.supabase;
const isSupabaseConfigured: () => boolean = supabaseModule.isSupabaseConfigured;

// ============================================================================
// Type Definitions
// ============================================================================

export interface VesselModelRecord {
  id: string;
  name: string;
  organization_id: string;
  created_by: string;
  config: Record<string, unknown>;
  project_vessel_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface VesselModelSummary {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface SaveVesselModelParams {
  name: string;
  organizationId: string;
  userId: string;
  config: Record<string, unknown>;
  projectVesselId?: string;
  modelType?: string;
}

// ============================================================================
// Vessel Model Operations
// ============================================================================

/**
 * Save a new vessel model
 */
export async function saveVesselModel(params: SaveVesselModelParams): Promise<string> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const insertData: Record<string, unknown> = {
    name: params.name,
    organization_id: params.organizationId,
    created_by: params.userId,
    config: params.config,
  };
  if (params.projectVesselId) {
    insertData.project_vessel_id = params.projectVesselId;
  }

  const { data, error } = await supabase!
    .from('vessel_models')
    .insert(insertData)
    .select('id')
    .single();

  if (error) throw error;

  return data.id;
}

/**
 * Update an existing vessel model's config (and optionally its name)
 */
export async function updateVesselModel(
  id: string,
  config: Record<string, unknown>,
  name?: string
): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const updateData: Record<string, unknown> = { config, updated_at: new Date().toISOString() };
  if (name) updateData.name = name;

  const { error } = await supabase!.from('vessel_models').update(updateData).eq('id', id);

  if (error) throw error;
}

/**
 * List all vessel models (summary only), ordered by most recently updated
 */
export async function listVesselModels(): Promise<VesselModelSummary[]> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const { data, error } = await supabase!
    .from('vessel_models')
    .select('id, name, created_at, updated_at')
    .order('updated_at', { ascending: false });

  if (error) throw error;

  return (data as VesselModelSummary[]) || [];
}

/**
 * Get a single vessel model by ID
 */
export async function getVesselModel(id: string): Promise<VesselModelRecord> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const { data, error } = await supabase!
    .from('vessel_models')
    .select('id, name, organization_id, created_by, config, created_at, updated_at')
    .eq('id', id)
    .single();

  if (error) throw error;

  return data as VesselModelRecord;
}

/**
 * Delete a vessel model by ID
 */
export async function deleteVesselModel(id: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const { error } = await supabase!.from('vessel_models').delete().eq('id', id);

  if (error) throw error;
}

/**
 * Find the vessel model linked to a project vessel
 */
export async function getVesselModelByProjectVessel(
  projectVesselId: string
): Promise<VesselModelRecord | null> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const { data, error } = await supabase!
    .from('vessel_models')
    .select(
      'id, name, organization_id, created_by, config, project_vessel_id, created_at, updated_at'
    )
    .eq('project_vessel_id', projectVesselId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as VesselModelRecord | null;
}

/**
 * Link a vessel model to a project vessel
 */
export async function linkVesselModelToProject(
  modelId: string,
  projectVesselId: string
): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const { error } = await supabase!
    .from('vessel_models')
    .update({ project_vessel_id: projectVesselId })
    .eq('id', modelId);

  if (error) throw error;
}
