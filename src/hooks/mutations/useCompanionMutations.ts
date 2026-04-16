/**
 * React Query mutation hooks for companion app operations.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchComposite, refreshIndex } from '../../services/companion-service';
import { saveScanCompositeBinary } from '../../services/scan-composite-service';
import type { GateSettings } from '../../types/companion';
import type { SaveScanCompositeBinaryParams } from '../../services/scan-composite-service';

/**
 * Hook for generating a composite via the companion app.
 */
export function useCompanionComposite() {
  return useMutation({
    mutationFn: (params: { port: number; folders: string[]; gateSettings: GateSettings; signal?: AbortSignal }) =>
      fetchComposite(params.port, params.folders, params.gateSettings, params.signal),
  });
}

/**
 * Hook for saving a companion-generated composite to Supabase.
 * Invalidates both scan composite query keys on success.
 */
export function useSaveScanCompositeBinary() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (params: SaveScanCompositeBinaryParams) => saveScanCompositeBinary(params),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scanComposites'] });
      qc.invalidateQueries({ queryKey: ['projectScanComposites'] });
    },
  });
}

/**
 * Hook for refreshing the companion's file index.
 * Invalidates the folder listing on success.
 */
export function useRefreshCompanionIndex() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (port: number) => refreshIndex(port),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['companion-folders'] });
    },
  });
}
