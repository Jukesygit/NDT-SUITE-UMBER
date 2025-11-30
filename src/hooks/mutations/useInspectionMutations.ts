/**
 * useInspectionMutations - React Query mutations for Inspection Page
 * Handles scans, strakes, vessel images, and drawings CRUD operations
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { assetService } from '../../services/asset-service.js';
import { inspectionKeys } from '../queries/useDataHub';

type DrawingType = 'location' | 'ga';

interface Annotation {
    id: string;
    type: 'marker' | 'box';
    x: number;
    y: number;
    width?: number;
    height?: number;
    label: string;
}

// ============================================================================
// Scan Mutations
// ============================================================================

/**
 * Delete a scan
 */
export function useDeleteScan() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ scanId }: { scanId: string; vesselId: string }) =>
            assetService.deleteScan(scanId),
        onSuccess: (_, { vesselId }) => {
            // Invalidate scans list for this vessel
            queryClient.invalidateQueries({ queryKey: inspectionKeys.scans(vesselId) });
        },
    });
}

/**
 * Update a scan (reassign to strake)
 */
export function useUpdateScan() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            scanId,
            updates,
        }: {
            scanId: string;
            vesselId: string;
            updates: { strake_id?: string | null; name?: string };
        }) => assetService.updateScan(scanId, updates),
        onSuccess: (_, { vesselId }) => {
            // Invalidate scans list for this vessel
            queryClient.invalidateQueries({ queryKey: inspectionKeys.scans(vesselId) });
        },
    });
}

// ============================================================================
// Vessel Image Mutations
// ============================================================================

/**
 * Delete a vessel image
 */
export function useDeleteVesselImage() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ imageId }: { imageId: string; vesselId: string }) =>
            assetService.deleteVesselImage(imageId),
        onSuccess: (_, { vesselId }) => {
            // Invalidate images list for this vessel
            queryClient.invalidateQueries({ queryKey: inspectionKeys.images(vesselId) });
        },
    });
}

/**
 * Rename a vessel image
 */
export function useRenameVesselImage() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            imageId,
            newName,
        }: {
            imageId: string;
            vesselId: string;
            newName: string;
        }) => assetService.renameVesselImage(imageId, newName),
        onSuccess: (_, { vesselId }) => {
            // Invalidate images list for this vessel
            queryClient.invalidateQueries({ queryKey: inspectionKeys.images(vesselId) });
        },
    });
}

// ============================================================================
// Strake Mutations
// ============================================================================

interface CreateStrakeData {
    name: string;
    totalArea: number;
    requiredCoverage: number;
}

/**
 * Create a new strake
 */
export function useCreateStrake() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ vesselId, data }: { vesselId: string; data: CreateStrakeData }) =>
            assetService.createStrake(vesselId, data),
        onSuccess: (_, { vesselId }) => {
            // Invalidate strakes list for this vessel
            queryClient.invalidateQueries({ queryKey: inspectionKeys.strakes(vesselId) });
        },
    });
}

/**
 * Update a strake
 */
export function useUpdateStrake() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            strakeId,
            updates,
        }: {
            strakeId: string;
            vesselId: string;
            updates: Partial<{ name: string; total_area: number; required_coverage: number }>;
        }) => assetService.updateStrake(strakeId, updates),
        onSuccess: (_, { vesselId }) => {
            // Invalidate strakes list for this vessel
            queryClient.invalidateQueries({ queryKey: inspectionKeys.strakes(vesselId) });
        },
    });
}

/**
 * Delete a strake
 */
export function useDeleteStrake() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ strakeId }: { strakeId: string; vesselId: string }) =>
            assetService.deleteStrake(strakeId),
        onSuccess: (_, { vesselId }) => {
            // Invalidate strakes list for this vessel
            queryClient.invalidateQueries({ queryKey: inspectionKeys.strakes(vesselId) });
            // Also invalidate scans in case they were assigned to this strake
            queryClient.invalidateQueries({ queryKey: inspectionKeys.scans(vesselId) });
        },
    });
}

// ============================================================================
// Vessel Image Upload Mutations
// ============================================================================

/**
 * Upload vessel images
 */
export function useUploadVesselImages() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ vesselId, files }: { vesselId: string; files: File[] }) =>
            assetService.uploadVesselImages(vesselId, files),
        onSuccess: (_, { vesselId }) => {
            // Invalidate images list for this vessel
            queryClient.invalidateQueries({ queryKey: inspectionKeys.images(vesselId) });
        },
    });
}

// ============================================================================
// Drawing Mutations
// ============================================================================

/**
 * Upload a drawing (location or GA)
 */
export function useUploadDrawing() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            vesselId,
            drawingType,
            file,
        }: {
            vesselId: string;
            drawingType: DrawingType;
            file: File;
        }) => assetService.uploadDrawing(vesselId, drawingType, file),
        onSuccess: (_, { vesselId }) => {
            // Invalidate vessel details to refresh drawings
            queryClient.invalidateQueries({ queryKey: ['vessel-details', vesselId] });
        },
    });
}

/**
 * Update drawing annotations
 */
export function useUpdateDrawingAnnotations() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            vesselId,
            drawingType,
            annotations,
            comment,
        }: {
            vesselId: string;
            drawingType: DrawingType;
            annotations: Annotation[];
            comment: string;
        }) => assetService.updateDrawingAnnotations(vesselId, drawingType, annotations, comment),
        onSuccess: (_, { vesselId }) => {
            // Invalidate vessel details to refresh drawings
            queryClient.invalidateQueries({ queryKey: ['vessel-details', vesselId] });
        },
    });
}

/**
 * Remove a drawing
 */
export function useRemoveDrawing() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            vesselId,
            drawingType,
        }: {
            vesselId: string;
            drawingType: DrawingType;
        }) => assetService.removeDrawing(vesselId, drawingType),
        onSuccess: (_, { vesselId }) => {
            // Invalidate vessel details to refresh drawings
            queryClient.invalidateQueries({ queryKey: ['vessel-details', vesselId] });
        },
    });
}
