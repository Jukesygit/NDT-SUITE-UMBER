/**
 * React Query hooks for vessel model data fetching
 */

import { useQuery } from '@tanstack/react-query';
import {
    listVesselModels,
    getVesselModel,
    getVesselModelByProjectVessel,
    getVesselScanPlacements,
} from '../../services/vessel-model-service';

// Re-export types so consumers import from hooks, not services
export type {
    VesselModelRecord,
    VesselModelSummary,
    ScanPlacementRecord,
    SaveVesselModelParams,
    SaveScanPlacementParams,
} from '../../services/vessel-model-service';

/**
 * Hook for fetching the list of vessel models (summary only)
 */
export function useVesselModelList() {
    return useQuery({
        queryKey: ['vesselModels'],
        queryFn: () => listVesselModels(),
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}

/**
 * Hook for fetching a single vessel model with full config
 */
export function useVesselModel(id: string | undefined) {
    return useQuery({
        queryKey: ['vesselModels', id],
        queryFn: () => getVesselModel(id!),
        enabled: !!id,
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}

/**
 * Hook for fetching a vessel model linked to a specific project vessel
 */
export function useVesselModelByProjectVessel(projectVesselId: string | null) {
    return useQuery({
        queryKey: ['vesselModels', 'byProjectVessel', projectVesselId],
        queryFn: () => getVesselModelByProjectVessel(projectVesselId!),
        enabled: !!projectVesselId,
        staleTime: 5 * 60 * 1000,
    });
}

/**
 * Hook for fetching scan placements for a vessel model
 */
export function useVesselScanPlacements(vesselModelId: string | undefined) {
    return useQuery({
        queryKey: ['vesselModels', vesselModelId, 'placements'],
        queryFn: () => getVesselScanPlacements(vesselModelId!),
        enabled: !!vesselModelId,
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}
