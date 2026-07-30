import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  VesselState,
  WallLossGroupConfig,
  WallLossDistribution,
} from '../components/VesselModeler/types';
import type {
  CompositeSlim,
  DomeCompositeSlim,
  FootprintParamsSlim,
  WallLossRequest,
  WallLossResponse,
} from '../workers/wall-loss-compute';

const DEBOUNCE_MS = 300;

export function useWallLossWorker(
  vesselState: VesselState,
  config: WallLossGroupConfig | undefined
): WallLossDistribution | null {
  const workerRef = useRef<Worker | null>(null);
  const idRef = useRef(0);
  const latestIdRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [result, setResult] = useState<WallLossDistribution | null>(null);

  const getWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker(new URL('../workers/wall-loss.worker.ts', import.meta.url), {
        type: 'module',
      });
      workerRef.current.onmessage = (e: MessageEvent<WallLossResponse>) => {
        const resp = e.data;
        if (resp.id !== latestIdRef.current) return;
        setResult({
          bins: resp.bins,
          totalScannedArea: resp.totalScannedArea,
          totalDataPoints: resp.totalDataPoints,
          nominalThickness: resp.nominalThickness,
          spuriousArea: resp.spuriousArea,
          spuriousCount: resp.spuriousCount,
          spuriousAreaPercent: resp.spuriousAreaPercent,
        });
      };
    }
    return workerRef.current;
  }, []);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const hasShellScans = vesselState.scanComposites.some((c) => c.orientationConfirmed);
  const hasDomeScans = (vesselState.domeScanComposites ?? []).some((d) => d.orientationConfirmed);
  const hasScans = hasShellScans || hasDomeScans;

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!config?.enabled || !hasScans || (config.nominalThickness ?? 0) <= 0) {
      setResult(null);
      return;
    }

    debounceRef.current = setTimeout(() => {
      const id = ++idRef.current;
      latestIdRef.current = id;

      // Phase 3: appendage-body scans get per-body stats; excluded here so numbers stay correct in the interim (design §9).
      const composites: CompositeSlim[] = vesselState.scanComposites
        .filter((c) => !c.bodyId)
        .map((c) => ({
          id: c.id,
          orientationConfirmed: c.orientationConfirmed,
          data: c.data,
          xAxis: c.xAxis,
          yAxis: c.yAxis,
          indexStartMm: c.indexStartMm,
          datumAngleDeg: c.datumAngleDeg,
          scanDirection: c.scanDirection,
          indexDirection: c.indexDirection,
        }));

      const domeComposites: DomeCompositeSlim[] = (vesselState.domeScanComposites ?? []).map(
        (d) => ({
          id: d.id,
          orientationConfirmed: d.orientationConfirmed,
          data: d.data,
          xAxis: d.xAxis,
          yAxis: d.yAxis,
        })
      );

      // Appendage junction footprints (design §9.4): main-shell cells inside a
      // footprint are the shell cutout and drop out of the distribution. The
      // predicate is rebuilt worker-side from these serialisable params.
      const footprints: FootprintParamsSlim[] = (vesselState.appendages ?? []).map((a) => ({
        id: a.id,
        mountPos: a.mountPos,
        mountAngle: a.mountAngle,
        diameter: a.diameter,
      }));

      const req: WallLossRequest = {
        id,
        composites,
        domeComposites,
        footprints,
        vesselId: vesselState.id,
        vesselLength: vesselState.length,
        headRatio: vesselState.headRatio,
        nominalThickness: config.nominalThickness,
        binCount: config.binCount,
        binMode: config.binMode ?? 'equal',
        customBoundaries: config.customBoundaries,
        corrosionAllowance: vesselState.corrosionAllowance,
        shellNominalThickness: vesselState.shellNominalThickness,
        domeNominalThickness: vesselState.domeNominalThickness,
      };

      getWorker().postMessage(req);
    }, DEBOUNCE_MS);
  }, [
    config?.enabled,
    config?.nominalThickness,
    config?.binCount,
    config?.binMode,
    config?.customBoundaries,
    vesselState.scanComposites,
    vesselState.domeScanComposites,
    vesselState.appendages,
    vesselState.id,
    vesselState.length,
    vesselState.headRatio,
    vesselState.corrosionAllowance,
    vesselState.shellNominalThickness,
    vesselState.domeNominalThickness,
    hasScans,
    getWorker,
  ]);

  return result;
}
