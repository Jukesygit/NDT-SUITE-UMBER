/**
 * Scan Composite Service
 * CRUD operations for scan composites stored in Supabase
 * Thickness data is stored as binary Float32Array in Supabase Storage (scan-data bucket)
 * Metadata (stats, axes, dimensions) is stored in the scan_composites table
 */

import type { SupabaseClient } from '@supabase/supabase-js';
// @ts-ignore - JS module without type declarations
import * as supabaseModule from '../supabase-client';
// @ts-ignore - accessing property from untyped module
const supabase: SupabaseClient | null = supabaseModule.supabase;
// @ts-ignore - accessing property from untyped module
const isSupabaseConfigured: () => boolean = supabaseModule.isSupabaseConfigured;

const STORAGE_BUCKET = 'scan-data';
const NAN_SENTINEL = 3.4028234663852886e+38; // Float32 max - used as null sentinel

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
// Binary Encoding/Decoding for thickness data
// ============================================================================

/**
 * Encode a 2D thickness matrix as a Float32Array binary buffer.
 * Null values are replaced with NaN sentinel.
 */
function encodeThicknessData(data: (number | null)[][], width: number, height: number): ArrayBuffer {
    const buffer = new Float32Array(width * height);
    for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
            const val = data[row]?.[col];
            buffer[row * width + col] = val === null || val === undefined ? NAN_SENTINEL : val;
        }
    }
    return buffer.buffer;
}

/**
 * Decode a Float32Array binary buffer back to a 2D thickness matrix.
 * NaN sentinel values are converted back to null.
 */
function decodeThicknessData(buffer: ArrayBuffer, width: number, height: number): (number | null)[][] {
    const float32 = new Float32Array(buffer);
    const result: (number | null)[][] = [];
    for (let row = 0; row < height; row++) {
        const rowData: (number | null)[] = [];
        for (let col = 0; col < width; col++) {
            const val = float32[row * width + col];
            rowData.push(val >= NAN_SENTINEL || isNaN(val) ? null : val);
        }
        result.push(rowData);
    }
    return result;
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Save a new scan composite.
 * 1. Upload thickness data as binary to Storage
 * 2. Insert metadata row in scan_composites table
 * @returns The id of the newly created record
 */
export async function saveScanComposite(params: SaveScanCompositeParams): Promise<string> {
    if (!isSupabaseConfigured()) {
        throw new Error('Supabase not configured');
    }

    // 1. Insert metadata row first to get the ID
    const { data: row, error: insertError } = await supabase!
        .from('scan_composites')
        .insert({
            name: params.name,
            organization_id: params.organizationId,
            created_by: params.userId,
            thickness_data: null, // Will store storage path after upload
            x_axis: params.xAxis,
            y_axis: params.yAxis,
            stats: params.stats,
            width: params.width,
            height: params.height,
            source_files: params.sourceFiles,
        })
        .select('id')
        .single();

    if (insertError) throw insertError;

    const compositeId = row.id;
    const storagePath = `${params.organizationId}/${compositeId}.bin`;

    // 2. Encode and upload thickness data as binary
    const binaryData = encodeThicknessData(params.thicknessData, params.width, params.height);

    const { error: uploadError } = await supabase!.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, binaryData, {
            contentType: 'application/octet-stream',
            upsert: true,
        });

    if (uploadError) {
        // Clean up the DB row if upload fails
        await supabase!.from('scan_composites').delete().eq('id', compositeId);
        throw uploadError;
    }

    // 3. Update the row with the storage path
    const { error: updateError } = await supabase!
        .from('scan_composites')
        .update({ thickness_data: storagePath })
        .eq('id', compositeId);

    if (updateError) throw updateError;

    return compositeId;
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
 * Fetch a single scan composite with full data.
 * Downloads thickness data binary from Storage and decodes it.
 */
export async function getScanComposite(id: string): Promise<ScanCompositeRecord> {
    if (!isSupabaseConfigured()) {
        throw new Error('Supabase not configured');
    }

    // 1. Fetch metadata
    const { data: row, error } = await supabase!
        .from('scan_composites')
        .select('id, name, organization_id, created_by, thickness_data, x_axis, y_axis, stats, width, height, source_files, created_at')
        .eq('id', id)
        .single();

    if (error) throw error;

    const record = row as ScanCompositeRecord & { thickness_data: string };

    // 2. Download binary thickness data from Storage
    const storagePath = record.thickness_data as unknown as string;
    const { data: blob, error: downloadError } = await supabase!.storage
        .from(STORAGE_BUCKET)
        .download(storagePath);

    if (downloadError) throw downloadError;

    // 3. Decode binary back to 2D array
    const buffer = await blob.arrayBuffer();
    const thicknessData = decodeThicknessData(buffer, record.width, record.height);

    return {
        ...record,
        thickness_data: thicknessData,
    } as ScanCompositeRecord;
}

/**
 * Delete a scan composite and its associated storage file
 */
export async function deleteScanComposite(id: string): Promise<void> {
    if (!isSupabaseConfigured()) {
        throw new Error('Supabase not configured');
    }

    // 1. Get the storage path before deleting the row
    const { data: row } = await supabase!
        .from('scan_composites')
        .select('thickness_data')
        .eq('id', id)
        .single();

    // 2. Delete the DB row
    const { error } = await supabase!
        .from('scan_composites')
        .delete()
        .eq('id', id);

    if (error) throw error;

    // 3. Delete the storage file (best effort)
    if (row?.thickness_data) {
        await supabase!.storage
            .from(STORAGE_BUCKET)
            .remove([row.thickness_data as string]);
    }
}

export default {
    saveScanComposite,
    listScanComposites,
    getScanComposite,
    deleteScanComposite,
};
