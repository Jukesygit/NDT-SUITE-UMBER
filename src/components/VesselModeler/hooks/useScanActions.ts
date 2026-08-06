import { useCallback, type Dispatch } from 'react';
import type { ScanCompositeConfig, DomeScanConfig } from '../types';
import { clearHeatmapCache } from '../engine/texture-manager';
import { clearDomeHeatmapCache, normalizeDomeScanComposite } from '../engine/dome-scan-geometry';
import { getScanComposite, getScanCompositeData } from '../../../services/scan-composite-service';
import { toConfigStats } from '../engine/composite-stats';
import { historyFor, type UpdateVessel, type VesselAction } from '../engine/vessel-reducer';

/** Guess the NDE source filename from a composite/CSV name.
 *  Strips common suffixes like _extracted, _cscan, .csv and adds *.nde wildcard pattern. */
function guessNdeFilename(name: string): string | undefined {
  if (!name) return undefined;
  // Remove file extension and common suffixes
  const cleaned = name.replace(/\.(csv|txt)$/i, '').replace(/[_-](extracted|cscan|export)$/i, '');
  // Replace underscores with spaces for NDE filename matching
  return cleaned.replace(/_/g, ' ').trim() || undefined;
}

interface UseScanActionsParams {
  updateVessel: UpdateVessel;
  dispatch: Dispatch<VesselAction>;
  /** selection.scanCompositeId — remove clears the selection if it matches. */
  scanCompositeId: string;
  /** selection.domeScanId — remove clears the selection if it matches. */
  domeScanId: string;
  effectiveProjectVesselId: string | null;
  linkCompositeToProject: {
    mutate: (vars: { compositeId: string; projectVesselId: string }) => void;
  };
}

/**
 * Scan-composite and dome-scan entity handlers (import / update / remove /
 * select). Bodies extracted verbatim from VesselModeler.tsx (D1), including the
 * local `guessNdeFilename` helper used only by the flat import path.
 */
export function useScanActions({
  updateVessel,
  dispatch,
  scanCompositeId,
  domeScanId,
  effectiveProjectVesselId,
  linkCompositeToProject,
}: UseScanActionsParams) {
  // --- Scan composite handlers ---
  const handleImportComposite = useCallback(
    async (
      compositeId: string,
      placement: { scanDirection: 'cw' | 'ccw'; indexDirection: 'forward' | 'reverse' }
    ) => {
      try {
        // Use binary-returning function for new companion-generated composites.
        // Falls back to legacy format for older composites.
        let name: string;
        let cloudId: string;
        let data: (number | null)[][];
        let xAxis: number[];
        let yAxis: number[];
        let stats: ScanCompositeConfig['stats'];
        let sourceFiles: ScanCompositeConfig['sourceFiles'];

        try {
          const cd = await getScanCompositeData(compositeId);
          cloudId = compositeId;
          name = `Composite ${compositeId.slice(0, 8)}`;
          // Convert Float32Array → (number | null)[][] for modeller compatibility
          xAxis = Array.from(cd.xAxis);
          yAxis = Array.from(cd.yAxis);
          data = [];
          for (let row = 0; row < cd.height; row++) {
            const rowData: (number | null)[] = [];
            for (let col = 0; col < cd.width; col++) {
              const val = cd.matrix[row * cd.width + col];
              rowData.push(isNaN(val) ? null : val);
            }
            data.push(rowData);
          }
          // Preserve validArea/totalArea (mm²) — the Scan Coverage
          // "Achieved" column is computed from stats.validArea.
          stats = toConfigStats(cd.stats);
          sourceFiles = cd.sourceFiles;
        } catch {
          // Fallback to legacy format
          const composite = await getScanComposite(compositeId);
          cloudId = composite.id;
          name = composite.name;
          data = composite.thickness_data;
          xAxis = composite.x_axis;
          yAxis = composite.y_axis;
          stats = composite.stats || { min: 0, max: 0, mean: 0, median: 0, stdDev: 0 };
          sourceFiles = composite.source_files ?? undefined;
        }

        const newConfig: ScanCompositeConfig = {
          id: `sc_${Date.now()}`,
          name,
          cloudId,
          data,
          xAxis,
          yAxis,
          stats,
          indexStartMm: yAxis[0] ?? 0,
          datumAngleDeg: 0,
          scanDirection: placement.scanDirection,
          indexDirection: placement.indexDirection,
          orientationConfirmed: false,
          colorScale: 'Jet',
          rangeMin: null,
          rangeMax: null,
          opacity: 1,
          sourceNdeFile: guessNdeFilename(name),
          sourceFiles,
        };
        updateVessel(
          (prev) => ({
            ...prev,
            scanComposites: [...prev.scanComposites, newConfig],
            // Auto-populate global coordinate origin from the first loaded scan
            ...(prev.scanComposites.length === 0
              ? {
                  coordinateOrigin: { indexMm: yAxis[0] ?? 0, scanMm: xAxis[0] ?? 0 },
                  originSourceScanId: newConfig.id,
                }
              : {}),
          }),
          { label: 'Import scan composite', at: Date.now() }
        );

        // Link composite to project vessel if in project context
        if (effectiveProjectVesselId) {
          linkCompositeToProject.mutate({
            compositeId: cloudId,
            projectVesselId: effectiveProjectVesselId,
          });
        }
      } catch (err) {
        console.error('Failed to import composite:', err);
      }
    },
    [updateVessel, effectiveProjectVesselId, linkCompositeToProject]
  );

  const handleRemoveScanComposite = useCallback(
    (id: string) => {
      clearHeatmapCache(id);
      updateVessel(
        (prev) => ({
          ...prev,
          scanComposites: prev.scanComposites.filter((sc) => sc.id !== id),
        }),
        { label: 'Delete scan composite', at: Date.now() }
      );
      if (scanCompositeId === id) dispatch({ type: 'SELECT_SCAN_COMPOSITE', id: '' });
    },
    [updateVessel, scanCompositeId, dispatch]
  );

  const handleUpdateScanComposite = useCallback(
    (id: string, updates: Partial<ScanCompositeConfig>) => {
      updateVessel((prev) => {
        const updated = {
          ...prev,
          scanComposites: prev.scanComposites.map((sc) =>
            sc.id === id ? { ...sc, ...updates } : sc
          ),
        };
        // Keep global origin in sync when the source scan's position changes
        if (
          id === prev.originSourceScanId &&
          (updates.indexStartMm !== undefined || updates.datumAngleDeg !== undefined)
        ) {
          const sc = updated.scanComposites.find((c) => c.id === id)!;
          updated.coordinateOrigin = {
            indexMm: sc.indexStartMm,
            scanMm: sc.xAxis[0] ?? 0,
          };
        }
        return updated;
      }, historyFor('scanComposite', id, updates));
    },
    [updateVessel]
  );

  // --- Dome scan handlers ---
  const handleSelectDomeScan = useCallback(
    (id: string) => {
      dispatch({ type: 'SELECT_DOME_SCAN', id });
    },
    [dispatch]
  );

  const handleUpdateDomeScan = useCallback(
    (id: string, updates: Partial<DomeScanConfig>) => {
      updateVessel(
        (prev) => ({
          ...prev,
          domeScanComposites: prev.domeScanComposites.map((ds) =>
            ds.id === id ? { ...ds, ...updates } : ds
          ),
        }),
        historyFor('domeScan', id, updates)
      );
    },
    [updateVessel]
  );

  const handleRemoveDomeScan = useCallback(
    (id: string) => {
      clearDomeHeatmapCache(id);
      updateVessel(
        (prev) => ({
          ...prev,
          domeScanComposites: prev.domeScanComposites.filter((ds) => ds.id !== id),
        }),
        { label: 'Delete dome scan', at: Date.now() }
      );
      if (domeScanId === id) dispatch({ type: 'SELECT_DOME_SCAN', id: '' });
    },
    [updateVessel, domeScanId, dispatch]
  );

  const handleImportDomeComposite = useCallback(
    async (compositeId: string, head: 'left' | 'right', bodyId?: string) => {
      try {
        let name: string;
        let cloudId: string;
        let data: (number | null)[][];
        let xAxis: number[];
        let yAxis: number[];
        let stats: DomeScanConfig['stats'];
        let sourceFiles: DomeScanConfig['sourceFiles'];

        try {
          const cd = await getScanCompositeData(compositeId);
          cloudId = compositeId;
          name = `Dome ${head} ${compositeId.slice(0, 8)}`;
          xAxis = Array.from(cd.xAxis);
          yAxis = Array.from(cd.yAxis);
          data = [];
          for (let row = 0; row < cd.height; row++) {
            const rowData: (number | null)[] = [];
            for (let col = 0; col < cd.width; col++) {
              const val = cd.matrix[row * cd.width + col];
              rowData.push(isNaN(val) ? null : val);
            }
            data.push(rowData);
          }
          // Preserve validArea/totalArea (mm²) so dome achieved coverage works.
          stats = toConfigStats(cd.stats);
          sourceFiles = cd.sourceFiles;
        } catch {
          const composite = await getScanComposite(compositeId);
          cloudId = composite.id;
          name = composite.name;
          data = composite.thickness_data;
          xAxis = composite.x_axis;
          yAxis = composite.y_axis;
          stats = composite.stats || { min: 0, max: 0, mean: 0, median: 0, stdDev: 0 };
          sourceFiles = composite.source_files ?? undefined;
        }

        // Importing onto a dished appendage closure (4C): pass bodyId and let
        // normalizeDomeScanComposite enforce the end⟺bodyId invariant (it forces
        // head='end' when bodyId is set) — never hand-set the pair. Main-vessel
        // imports pass bodyId undefined and keep their left/right head.
        const newConfig: DomeScanConfig = normalizeDomeScanComposite({
          id: `ds_${Date.now()}`,
          name,
          cloudId,
          bodyId,
          head,
          centerPhi: 45,
          centerTheta: 0,
          scanDirection: 'cw',
          indexDirection: 'outward',
          orientationConfirmed: false,
          data,
          xAxis,
          yAxis,
          stats,
          colorScale: 'Jet',
          rangeMin: null,
          rangeMax: null,
          opacity: 1,
          sourceFiles,
        });
        updateVessel(
          (prev) => ({
            ...prev,
            domeScanComposites: [...prev.domeScanComposites, newConfig],
          }),
          { label: 'Import dome scan', at: Date.now() }
        );
        dispatch({ type: 'SELECT_DOME_SCAN', id: newConfig.id });
      } catch (err) {
        console.error('Failed to import dome composite:', err);
      }
    },
    [updateVessel, dispatch]
  );

  return {
    handleImportComposite,
    handleRemoveScanComposite,
    handleUpdateScanComposite,
    handleSelectDomeScan,
    handleUpdateDomeScan,
    handleRemoveDomeScan,
    handleImportDomeComposite,
  };
}
