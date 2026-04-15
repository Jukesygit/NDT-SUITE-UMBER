/**
 * Scan composite mutation hooks - Save and Delete
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
    saveScanComposite,
    deleteScanComposite,
    linkCompositeToProjectVessel,
} from '../../services/scan-composite-service';
import type { SaveScanCompositeParams } from '../../services/scan-composite-service';

/**
 * Hook for saving a new scan composite
 */
export function useSaveScanComposite() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (params: SaveScanCompositeParams) => saveScanComposite(params),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['scanComposites'] });
        },
    });
}

/**
 * Hook for linking a scan composite to a project vessel
 */
export function useLinkScanCompositeToProject() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ compositeId, projectVesselId, sectionType }: { compositeId: string; projectVesselId: string; sectionType?: string }) =>
            linkCompositeToProjectVessel(compositeId, projectVesselId, sectionType),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['scanComposites'] });
            queryClient.invalidateQueries({ queryKey: ['projectScanComposites'] });
        },
    });
}

/**
 * Hook for deleting a scan composite
 */
export function useDeleteScanComposite() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => deleteScanComposite(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['scanComposites'] });
            queryClient.invalidateQueries({ queryKey: ['projectScanComposites'] });
        },
    });
}
