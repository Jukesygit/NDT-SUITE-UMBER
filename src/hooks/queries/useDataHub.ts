/**
 * useDataHub - React Query hooks for Data Hub
 * Handles fetching organizations, assets, and vessels
 */

import { useQuery } from '@tanstack/react-query';
import { assetService } from '../../services/asset-service.js';
import { adminService } from '../../services/admin-service';
import type { Organization } from '../../types/database.types';

// ============================================================================
// Query Keys
// ============================================================================

export const dataHubKeys = {
    all: ['dataHub'] as const,
    organizations: () => [...dataHubKeys.all, 'organizations'] as const,
    assets: (orgId: string) => [...dataHubKeys.all, 'assets', orgId] as const,
    vessels: (assetId: string) => [...dataHubKeys.all, 'vessels', assetId] as const,
    vessel: (vesselId: string) => [...dataHubKeys.all, 'vessel', vesselId] as const,
};

// ============================================================================
// Types
// ============================================================================

export interface AssetWithCounts {
    id: string;
    name: string;
    organization_id: string;
    created_by: string | null;
    created_at: string;
    updated_at: string;
    vesselCount: number;
}

export interface Vessel {
    id: string;
    name: string;
    asset_id: string;
    model_3d_url: string | null;
    created_at: string;
    updated_at: string;
}

export interface VesselWithCounts extends Vessel {
    scanCount: number;
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Fetch organizations for Data Hub tabs
 * Excludes SYSTEM org
 */
export function useDataHubOrganizations() {
    return useQuery({
        queryKey: dataHubKeys.organizations(),
        queryFn: async (): Promise<Organization[]> => {
            const orgs = await adminService.getOrganizations();
            // Filter out SYSTEM org
            return orgs.filter(org => org.name !== 'SYSTEM');
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}

/**
 * Fetch assets for a specific organization
 * Includes vessel counts for each asset
 */
export function useAssetsByOrg(organizationId: string | null) {
    return useQuery({
        queryKey: dataHubKeys.assets(organizationId || ''),
        queryFn: async (): Promise<AssetWithCounts[]> => {
            if (!organizationId) return [];
            return await assetService.getAssetsByOrg(organizationId);
        },
        enabled: !!organizationId,
        staleTime: 2 * 60 * 1000, // 2 minutes
    });
}

/**
 * Fetch vessels for a specific asset
 * Includes scan counts for each vessel
 */
export function useVesselsByAsset(assetId: string | null) {
    return useQuery({
        queryKey: dataHubKeys.vessels(assetId || ''),
        queryFn: async (): Promise<VesselWithCounts[]> => {
            if (!assetId) return [];

            const vessels = await assetService.getVessels(assetId);

            // Get scan counts for each vessel
            const vesselsWithCounts = await Promise.all(
                vessels.map(async (vessel: Vessel) => {
                    const scans = await assetService.getScans(vessel.id);
                    return {
                        ...vessel,
                        scanCount: scans?.length || 0
                    };
                })
            );

            return vesselsWithCounts;
        },
        enabled: !!assetId,
        staleTime: 2 * 60 * 1000, // 2 minutes
    });
}

/**
 * Fetch single vessel details
 */
export function useVesselDetails(vesselId: string | null) {
    return useQuery({
        queryKey: dataHubKeys.vessel(vesselId || ''),
        queryFn: async () => {
            if (!vesselId) return null;
            return await assetService.getVessel(vesselId);
        },
        enabled: !!vesselId,
        staleTime: 2 * 60 * 1000,
    });
}

// ============================================================================
// Inspection Page Hooks
// ============================================================================

export const inspectionKeys = {
    all: ['inspection'] as const,
    scans: (vesselId: string) => [...inspectionKeys.all, 'scans', vesselId] as const,
    strakes: (vesselId: string) => [...inspectionKeys.all, 'strakes', vesselId] as const,
    images: (vesselId: string) => [...inspectionKeys.all, 'images', vesselId] as const,
};

export interface Scan {
    id: string;
    name: string;
    vessel_id: string;
    tool_type: 'pec' | 'cscan' | '3dview';
    thumbnail: string | null;
    strake_id?: string | null;
    created_at: string;
    updated_at: string;
}

export interface Strake {
    id: string;
    name: string;
    vessel_id: string;
    total_area: number;
    required_coverage: number;
    created_at: string;
    updated_at: string;
}

export interface VesselImage {
    id: string;
    name: string;
    image_url: string;
    vessel_id: string;
    created_at: string;
}

/**
 * Fetch scans for a vessel
 */
export function useVesselScans(vesselId: string | null) {
    return useQuery({
        queryKey: inspectionKeys.scans(vesselId || ''),
        queryFn: async (): Promise<Scan[]> => {
            if (!vesselId) return [];
            return await assetService.getScans(vesselId);
        },
        enabled: !!vesselId,
        staleTime: 1 * 60 * 1000, // 1 minute - scans change more frequently
    });
}

/**
 * Fetch strakes for a vessel
 */
export function useVesselStrakes(vesselId: string | null) {
    return useQuery({
        queryKey: inspectionKeys.strakes(vesselId || ''),
        queryFn: async (): Promise<Strake[]> => {
            if (!vesselId) return [];
            return await assetService.getStrakes(vesselId);
        },
        enabled: !!vesselId,
        staleTime: 2 * 60 * 1000, // 2 minutes
    });
}

/**
 * Fetch images for a vessel
 */
export function useVesselImages(vesselId: string | null) {
    return useQuery({
        queryKey: inspectionKeys.images(vesselId || ''),
        queryFn: async (): Promise<VesselImage[]> => {
            if (!vesselId) return [];
            return await assetService.getVesselImages(vesselId);
        },
        enabled: !!vesselId,
        staleTime: 2 * 60 * 1000, // 2 minutes
    });
}
