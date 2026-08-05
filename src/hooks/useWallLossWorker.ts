import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  VesselState,
  WallLossGroupConfig,
  WallLossDistribution,
  WallLossGroupBin,
  ScanCompositeConfig,
} from '../components/VesselModeler/types';
import type {
  CompositeSlim,
  DomeCompositeSlim,
  FootprintParamsSlim,
  WallLossBodyInput,
  WallLossRequest,
  WallLossResponse,
} from '../workers/wall-loss-compute';
import {
  appendageNozzleFootprintParams,
  mainShellNozzleFootprintParams,
} from '../components/VesselModeler/engine/nozzle-footprint';

const DEBOUNCE_MS = 300;

/** Default appendage head ratio (mirrors appendage-config / body-frame). */
const DEFAULT_APPENDAGE_HEAD_RATIO = 2.0;

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

/** Map a runtime scan composite to the serialisable slim shape for the worker. */
function toSlim(c: ScanCompositeConfig): CompositeSlim {
  return {
    id: c.id,
    orientationConfirmed: c.orientationConfirmed,
    data: c.data,
    xAxis: c.xAxis,
    yAxis: c.yAxis,
    indexStartMm: c.indexStartMm,
    datumAngleDeg: c.datumAngleDeg,
    scanDirection: c.scanDirection,
    indexDirection: c.indexDirection,
  };
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

      // Main-shell scans (bodyId undefined). Appendage scans are grouped per body
      // below — the interim `.filter(!bodyId)` drop is gone (design §9.3).
      const composites: CompositeSlim[] = vesselState.scanComposites
        .filter((c) => !c.bodyId)
        .map(toSlim);

      const domeComposites: DomeCompositeSlim[] = (vesselState.domeScanComposites ?? []).map(
        (d) => ({
          id: d.id,
          orientationConfirmed: d.orientationConfirmed,
          data: d.data,
          xAxis: d.xAxis,
          yAxis: d.yAxis,
        })
      );

      // Main-shell cutouts (design §9.4 / R1): appendage junctions PLUS unmappable
      // nozzle bores. Cells inside a footprint drop out of the MAIN body's
      // distribution. Nozzle params (radial circle / non-radial ellipse) and the
      // head-mounted skip come from the shared engine helper so the worker cutout
      // matches coverage + heatmap exactly.
      const footprints: FootprintParamsSlim[] = [
        ...(vesselState.appendages ?? []).map((a) => ({
          id: a.id,
          mountPos: a.mountPos,
          mountAngle: a.mountAngle,
          diameter: a.diameter,
        })),
        ...mainShellNozzleFootprintParams(vesselState),
      ];

      // One appendage body per appendage config, carrying only its own scans, its
      // own cylinder geometry (design §9.3), and its own nozzle-bore cutouts
      // (design R1). NWT defaults to the shell NWT.
      const bodies: WallLossBodyInput[] = (vesselState.appendages ?? []).map((a) => ({
        bodyId: a.id,
        name: a.name,
        composites: vesselState.scanComposites.filter((c) => c.bodyId === a.id).map(toSlim),
        footprints: appendageNozzleFootprintParams(vesselState, a.id),
        vesselId: a.diameter,
        vesselLength: a.length,
        headRatio: a.headRatio ?? DEFAULT_APPENDAGE_HEAD_RATIO,
        nominalThickness:
          a.nominalThickness ?? vesselState.shellNominalThickness ?? config.nominalThickness,
      }));

      const req: WallLossRequest = {
        id,
        composites,
        domeComposites,
        footprints,
        bodies,
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
    vesselState.nozzles,
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
