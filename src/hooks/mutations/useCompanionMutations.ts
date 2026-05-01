/**
 * React Query mutation hooks for companion app operations.
 */

import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchComposite, refreshIndex, browseDirectory, convertEddify } from '../../services/companion-service';
import { saveScanCompositeBinary } from '../../services/scan-composite-service';
import type { GateSettings } from '../../types/companion';
import type { SaveScanCompositeBinaryParams } from '../../services/scan-composite-service';
import { classifyCompanionError } from '../../utils/companionError';
import { useCompanionNotify } from '../../contexts/CompanionNotificationContext';

// ---------------------------------------------------------------------------
// Shared error-handler factory
// ---------------------------------------------------------------------------

/**
 * Returns a stable onError callback that classifies the thrown error and
 * pushes a notification via useCompanionNotify.
 *
 * @param operation  Human-readable name for the operation (e.g. "create-composite")
 */
function useCompanionErrorHandler(operation: string) {
  const { push } = useCompanionNotify();

  return useCallback(
    (err: unknown) => {
      const classified = classifyCompanionError(err, operation);
      // Info-level errors (e.g. user cancelled) are intentionally silent
      if (classified.severity === 'info') return;

      push({
        title: getOperationTitle(operation),
        message: classified.message,
        severity: classified.severity,
        recovery: classified.recovery,
      });
    },
    [operation, push],
  );
}

/** Maps internal operation keys to user-facing titles. */
function getOperationTitle(operation: string): string {
  const titles: Record<string, string> = {
    'create-composite': 'Composite generation failed',
    'refresh-index': 'Index refresh failed',
    'browse-directory': 'Folder selection failed',
    'convert-eddify': 'Eddify conversion failed',
    'save-composite': 'Save failed',
  };
  return titles[operation] ?? 'Companion error';
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Hook for generating a composite via the companion app.
 */
export function useCompanionComposite() {
  const onError = useCompanionErrorHandler('create-composite');
  return useMutation({
    mutationFn: (params: { port: number; folders: string[]; gateSettings: GateSettings; signal?: AbortSignal }) =>
      fetchComposite(params.port, params.folders, params.gateSettings, params.signal),
    onError,
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
  const onError = useCompanionErrorHandler('refresh-index');

  return useMutation({
    mutationFn: (port: number) => refreshIndex(port),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['companion-folders'] });
    },
    onError,
  });
}

/**
 * Hook for opening the companion's native folder browser and setting the directory.
 * Updates companion-status cache directly instead of invalidating (which would
 * trigger a /status refetch while the companion is busy indexing the new directory).
 */
export function useBrowseDirectory() {
  const qc = useQueryClient();
  const onError = useCompanionErrorHandler('browse-directory');

  return useMutation({
    mutationFn: (port: number) => browseDirectory(port),
    onSuccess: (result) => {
      // Update status cache directly with new directory info from the response.
      // This avoids a /status refetch that would race with companion indexing.
      qc.setQueryData(['companion-status'], (prev: Record<string, unknown> | undefined) => {
        if (!prev) return prev;
        return {
          ...prev,
          directory: result.path ?? prev.directory,
          fileCount: result.fileCount ?? prev.fileCount,
        };
      });
      qc.invalidateQueries({ queryKey: ['companion-folders'] });
      qc.invalidateQueries({ queryKey: ['companion-files'] });
    },
    onError,
  });
}

/**
 * Hook for converting eddify .capture_acq files to .nde format.
 * Only invalidates folder listing — status will update on next regular poll.
 */
export function useConvertEddify() {
  const qc = useQueryClient();
  const onError = useCompanionErrorHandler('convert-eddify');

  return useMutation({
    mutationFn: (params: { port: number; captureDirs: string[]; outputFolder: string }) =>
      convertEddify(params.port, params.captureDirs, params.outputFolder),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['companion-folders'] });
      qc.invalidateQueries({ queryKey: ['companion-files'] });
    },
    onError,
  });
}
