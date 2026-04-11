/**
 * Vessel Model Service
 * CRUD operations for vessel models and scan placements
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

export interface ScanPlacementRecord {
    id: string;
    vessel_model_id: string;
    scan_composite_id: string;
    index_start_mm: number;
    scan_direction: 'cw' | 'ccw';
    index_direction: 'forward' | 'reverse';
    created_at: string;
}

export interface SaveVesselModelParams {
    name: string;
    organizationId: string;
    userId: string;
    config: Record<string, unknown>;
    projectVesselId?: string;
}

export interface SaveScanPlacementParams {
    vesselModelId: string;
    scanCompositeId: string;
    indexStartMm: number;
    scanDirection: 'cw' | 'ccw';
    indexDirection: 'forward' | 'reverse';
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
 * Update an existing vessel model's config
 */
export async function updateVesselModel(
    id: string,
    config: Record<string, unknown>
): Promise<void> {
    if (!isSupabaseConfigured()) {
        throw new Error('Supabase not configured');
    }

    const { error } = await supabase!
        .from('vessel_models')
        .update({ config, updated_at: new Date().toISOString() })
        .eq('id', id);

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

    const { error } = await supabase!
        .from('vessel_models')
        .delete()
        .eq('id', id);

    if (error) throw error;
}

/**
 * Find the vessel model linked to a project vessel
 */
export async function getVesselModelByProjectVessel(projectVesselId: string): Promise<VesselModelRecord | null> {
    if (!isSupabaseConfigured()) {
        throw new Error('Supabase not configured');
    }

    const { data, error } = await supabase!
        .from('vessel_models')
        .select('id, name, organization_id, created_by, config, project_vessel_id, created_at, updated_at')
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
export async function linkVesselModelToProject(modelId: string, projectVesselId: string): Promise<void> {
    if (!isSupabaseConfigured()) {
        throw new Error('Supabase not configured');
    }

    const { error } = await supabase!
        .from('vessel_models')
        .update({ project_vessel_id: projectVesselId })
        .eq('id', modelId);

    if (error) throw error;
}

// ============================================================================
// Scan Placement Operations
// ============================================================================

/**
 * Save a new scan placement
 */
export async function saveScanPlacement(params: SaveScanPlacementParams): Promise<string> {
    if (!isSupabaseConfigured()) {
        throw new Error('Supabase not configured');
    }

    const { data, error } = await supabase!
        .from('vessel_scan_placements')
        .insert({
            vessel_model_id: params.vesselModelId,
            scan_composite_id: params.scanCompositeId,
            index_start_mm: params.indexStartMm,
            scan_direction: params.scanDirection,
            index_direction: params.indexDirection,
        })
        .select('id')
        .single();

    if (error) throw error;

    return data.id;
}

/**
 * Get all scan placements for a vessel model
 */
export async function getVesselScanPlacements(
    vesselModelId: string
): Promise<ScanPlacementRecord[]> {
    if (!isSupabaseConfigured()) {
        throw new Error('Supabase not configured');
    }

    const { data, error } = await supabase!
        .from('vessel_scan_placements')
        .select('id, vessel_model_id, scan_composite_id, index_start_mm, scan_direction, index_direction, created_at')
        .eq('vessel_model_id', vesselModelId);

    if (error) throw error;

    return (data as ScanPlacementRecord[]) || [];
}

/**
 * Delete a scan placement by ID
 */
export async function deleteScanPlacement(id: string): Promise<void> {
    if (!isSupabaseConfigured()) {
        throw new Error('Supabase not configured');
    }

    const { error } = await supabase!
        .from('vessel_scan_placements')
        .delete()
        .eq('id', id);

    if (error) throw error;
}
