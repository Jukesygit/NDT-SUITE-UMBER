import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  VesselState,
  WallLossGroupConfig,
  WallLossDistribution,
  WallLossGroupBin,
} from '../components/VesselModeler/types';
import type { WallLossResponse } from '../workers/wall-loss-compute';
import { buildWallLossRequest, canComputeWallLoss } from '../workers/wall-loss-request';

const DEBOUNCE_MS = 300;

/**
 * One body's wall-loss distribution for the WallLossStatsSection selector. Same
 * shape as {@link WallLossDistribution} minus nominalThickness (shared across
 * bodies). `name === undefined` (with bodyId undefined) is the main shell.
 */
export interface WallLossBodyDistribution {
  bodyId?: string;
  name?: string;
  bins: WallLossGroupBin[];
  totalScannedArea: number;
  totalDataPoints: number;
  spuriousArea: number;
  spuriousCount: number;
  spuriousAreaPercent: number;
}

/**
 * Wall-loss result: the combined (cutout-adjusted, all-bodies) distribution the
 * panel shows by default, plus the per-body breakdown behind the body selector
 * (design §16). `bodies` is main-shell first, then each appendage.
 */
export interface WallLossResult {
  combined: WallLossDistribution;
  bodies: WallLossBodyDistribution[];
}

export function useWallLossWorker(
  vesselState: VesselState,
  config: WallLossGroupConfig | undefined
): WallLossResult | null {
  const workerRef = useRef<Worker | null>(null);
  const idRef = useRef(0);
  const latestIdRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [result, setResult] = useState<WallLossResult | null>(null);

  const getWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker(new URL('../workers/wall-loss.worker.ts', import.meta.url), {
        type: 'module',
      });
      workerRef.current.onmessage = (e: MessageEvent<WallLossResponse>) => {
        const resp = e.data;
        if (resp.id !== latestIdRef.current) return;
        setResult({
          combined: {
            bins: resp.bins,
            totalScannedArea: resp.totalScannedArea,
            totalDataPoints: resp.totalDataPoints,
            nominalThickness: resp.nominalThickness,
            spuriousArea: resp.spuriousArea,
            spuriousCount: resp.spuriousCount,
            spuriousAreaPercent: resp.spuriousAreaPercent,
          },
          bodies: resp.bodies.map((b) => ({
            bodyId: b.bodyId,
            name: b.name,
            bins: b.bins,
            totalScannedArea: b.totalScannedArea,
            totalDataPoints: b.totalDataPoints,
            spuriousArea: b.spuriousArea,
            spuriousCount: b.spuriousCount,
            spuriousAreaPercent: b.spuriousAreaPercent,
          })),
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

  // The gate and the request both come from `workers/wall-loss-request`, which is
  // also what the client-share builder calls: the panel and a published bundle
  // can never be asking `compute` two different questions.
  const canCompute = canComputeWallLoss(vesselState, config);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!config || !canCompute) {
      setResult(null);
      return;
    }

    debounceRef.current = setTimeout(() => {
      const id = ++idRef.current;
      latestIdRef.current = id;
      getWorker().postMessage(buildWallLossRequest(vesselState, config, id));
    }, DEBOUNCE_MS);
    // Deps are the individual state fields the request reads, NOT `vesselState`
    // itself — a whole-object dep would restart the 300ms debounce on every
    // unrelated edit and the distribution would never settle. `canCompute`
    // stands where `hasScans` did and folds in the two config legs of the gate,
    // both of which are still listed in their own right because they are also
    // request inputs.
  }, [
    config?.enabled,
    config?.nominalThickness,
    config?.binCount,
    config?.binMode,
    config?.customBoundaries,
    vesselState.scanComposites,
    vesselState.domeScanComposites,
    vesselState.appendages,
    vesselState.nozzles,
    vesselState.id,
    vesselState.length,
    vesselState.headRatio,
    vesselState.corrosionAllowance,
    vesselState.shellNominalThickness,
    vesselState.domeNominalThickness,
    canCompute,
    getWorker,
  ]);

  return result;
}
