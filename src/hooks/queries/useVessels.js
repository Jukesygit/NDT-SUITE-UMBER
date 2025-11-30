// React Query hooks for Vessels - Data Hub
import { useQuery } from '@tanstack/react-query';
import { assetService } from '../../services/asset-service.js';

/**
 * Query keys for vessels - enables proper cache invalidation
 */
export const vesselKeys = {
    all: ['vessels'],
    lists: () => [...vesselKeys.all, 'list'],
    list: (assetId) => [...vesselKeys.lists(), { assetId }],
    details: () => [...vesselKeys.all, 'detail'],
    detail: (id) => [...vesselKeys.details(), id],
    images: (vesselId) => [...vesselKeys.all, 'images', vesselId],
    strakes: (vesselId) => [...vesselKeys.all, 'strakes', vesselId],
};

/**
 * Fetch vessels for a specific asset
 * Only fetched when user clicks on an asset (lazy loading)
 */
export function useVessels(assetId) {
    return useQuery({
        queryKey: vesselKeys.list(assetId),
        queryFn: () => assetService.getVessels(assetId),
        enabled: !!assetId, // Only fetch when assetId is provided
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}

/**
 * Fetch a single vessel by ID
 */
export function useVessel(vesselId) {
    return useQuery({
        queryKey: vesselKeys.detail(vesselId),
        queryFn: () => assetService.getVessel(vesselId),
        enabled: !!vesselId,
    });
}

/**
 * Fetch images for a vessel
 * Only fetched when viewing vessel detail
 */
export function useVesselImages(vesselId) {
    return useQuery({
        queryKey: vesselKeys.images(vesselId),
        queryFn: () => assetService.getVesselImages(vesselId),
        enabled: !!vesselId,
        staleTime: 5 * 60 * 1000,
    });
}

/**
 * Fetch strakes for a vessel
 * Only fetched when viewing vessel detail
 */
export function useStrakes(vesselId) {
    return useQuery({
        queryKey: vesselKeys.strakes(vesselId),
        queryFn: () => assetService.getStrakes(vesselId),
        enabled: !!vesselId,
        staleTime: 5 * 60 * 1000,
    });
}
