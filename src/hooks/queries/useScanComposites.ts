/**
 * React Query hooks for scan composite data fetching
 */

import { useQuery } from '@tanstack/react-query';
import {
    listScanComposites,
    getScanComposite,
} from '../../services/scan-composite-service';

// Re-export types so consumers import from hooks, not services
export type {
    ScanCompositeRecord,
    ScanCompositeSummary,
    SaveScanCompositeParams,
} from '../../services/scan-composite-service';

/**
 * Hook for fetching the list of scan composites (lightweight, no thickness data)
 */
export function useScanCompositeList() {
    return useQuery({
        queryKey: ['scanComposites'],
        queryFn: () => listScanComposites(),
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}

/**
 * Hook for fetching a single scan composite with full data
 */
export function useScanComposite(id: string | undefined) {
    return useQuery({
        queryKey: ['scanComposites', id],
        queryFn: () => getScanComposite(id!),
        enabled: !!id,
        staleTime: 10 * 60 * 1000, // 10 minutes
    });
}
