/**
 * React Query mutation hooks for companion app operations.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchComposite, refreshIndex, browseDirectory, convertEddify } from '../../services/companion-service';
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

/**
 * Hook for opening the companion's native folder browser and setting the directory.
 */
export function useBrowseDirectory() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (port: number) => browseDirectory(port),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['companion-status'] });
      qc.invalidateQueries({ queryKey: ['companion-folders'] });
    },
  });
}

/**
 * Hook for converting eddify .capture_acq files to .nde format.
 */
export function useConvertEddify() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (params: { port: number; captureDirs: string[]; outputFolder: string }) =>
      convertEddify(params.port, params.captureDirs, params.outputFolder),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['companion-folders'] });
      qc.invalidateQueries({ queryKey: ['companion-status'] });
    },
  });
}
