/**
 * Scan Composite Service
 * CRUD operations for scan composites stored in Supabase
 */

import type { SupabaseClient } from '@supabase/supabase-js';
// @ts-ignore - JS module without type declarations
import * as supabaseModule from '../supabase-client.js';
// @ts-ignore - accessing property from untyped module
const supabase: SupabaseClient | null = supabaseModule.supabase;
// @ts-ignore - accessing property from untyped module
const isSupabaseConfigured: () => boolean = supabaseModule.isSupabaseConfigured;

// ============================================================================
// Type Definitions
// ============================================================================

export interface ScanCompositeRecord {
    id: string;
    name: string;
    organization_id: string;
    created_by: string;
    thickness_data: (number | null)[][];
    x_axis: number[];
    y_axis: number[];
    stats: {
        min: number;
        max: number;
        mean: number;
        median: number;
        stdDev: number;
        validPoints: number;
        totalPoints: number;
        totalArea: number;
        validArea: number;
        ndPercent: number;
        ndCount: number;
        ndArea: number;
    } | null;
    width: number;
    height: number;
    source_files: {
        filename: string;
        minX: number;
        maxX: number;
        minY: number;
        maxY: number;
    }[] | null;
    created_at: string;
}

export interface ScanCompositeSummary {
    id: string;
    name: string;
    width: number;
    height: number;
    stats: ScanCompositeRecord['stats'];
    x_axis: number[];
    y_axis: number[];
    source_files: ScanCompositeRecord['source_files'];
    created_at: string;
    created_by: string;
}

export interface SaveScanCompositeParams {
    name: string;
    organizationId: string;
    userId: string;
    thicknessData: (number | null)[][];
    xAxis: number[];
    yAxis: number[];
    stats: ScanCompositeRecord['stats'];
    width: number;
    height: number;
    sourceFiles: ScanCompositeRecord['source_files'];
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Save a new scan composite to the database
 * @returns The id of the newly created record
 */
export async function saveScanComposite(params: SaveScanCompositeParams): Promise<string> {
    if (!isSupabaseConfigured()) {
        throw new Error('Supabase not configured');
    }

    const { data, error } = await supabase!
        .from('scan_composites')
        .insert({
            name: params.name,
            organization_id: params.organizationId,
            created_by: params.userId,
            thickness_data: params.thicknessData,
            x_axis: params.xAxis,
            y_axis: params.yAxis,
            stats: params.stats,
            width: params.width,
            height: params.height,
            source_files: params.sourceFiles,
        })
        .select('id')
        .single();

    if (error) throw error;

    return data.id;
}

/**
 * List all scan composites without thickness_data (lightweight)
 * Ordered by created_at descending (newest first)
 */
export async function listScanComposites(): Promise<ScanCompositeSummary[]> {
    if (!isSupabaseConfigured()) {
        throw new Error('Supabase not configured');
    }

    const { data, error } = await supabase!
        .from('scan_composites')
        .select('id, name, width, height, stats, x_axis, y_axis, source_files, created_at, created_by')
        .order('created_at', { ascending: false });

    if (error) throw error;

    return (data as ScanCompositeSummary[]) || [];
}

/**
 * Fetch a single scan composite with full data including thickness_data
 */
export async function getScanComposite(id: string): Promise<ScanCompositeRecord> {
    if (!isSupabaseConfigured()) {
        throw new Error('Supabase not configured');
    }

    const { data, error } = await supabase!
        .from('scan_composites')
        .select('id, name, organization_id, created_by, thickness_data, x_axis, y_axis, stats, width, height, source_files, created_at')
        .eq('id', id)
        .single();

    if (error) throw error;

    return data as ScanCompositeRecord;
}

/**
 * Delete a scan composite by id
 */
export async function deleteScanComposite(id: string): Promise<void> {
    if (!isSupabaseConfigured()) {
        throw new Error('Supabase not configured');
    }

    const { error } = await supabase!
        .from('scan_composites')
        .delete()
        .eq('id', id);

    if (error) throw error;
}

// ============================================================================
// Export default object for backwards compatibility
// ============================================================================

export default {
    saveScanComposite,
    listScanComposites,
    getScanComposite,
    deleteScanComposite,
};
