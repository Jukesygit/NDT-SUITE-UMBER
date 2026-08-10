/**
 * Wall-loss distribution — legacy reference façade.
 *
 * The wall-loss math has a single home: `src/workers/wall-loss-compute.ts`
 * (the pure `compute()` the Web Worker runs). This module is the legacy
 * `(vesselState, config)` entry point kept for the stats unit tests; it
 * projects the vessel state onto a `WallLossRequest`, delegates to that
 * canonical `compute()`, and maps the response back to `WallLossDistribution`.
 *
 * No math lives here — keep it that way so shell/dome/per-body logic is
 * written exactly once (design C3).
 */

import type {
  VesselState,
  WallLossGroupConfig,
  WallLossGroupBin,
  WallLossDistribution,
} from '../types';
import { compute, type CompositeSlim } from '../../../workers/wall-loss-compute';

/**
 * Equal-bin wall-loss distribution over a vessel's confirmed shell scans.
 * Thin wrapper around the canonical worker `compute()` — identical results,
 * one implementation.
 */
export function computeWallLossDistribution(
  vesselState: VesselState,
  config: WallLossGroupConfig
): WallLossDistribution {
  const { binCount, nominalThickness } = config;

  const composites: CompositeSlim[] = vesselState.scanComposites.map((c) => ({
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

  const response = compute({
    id: 0,
    composites,
    vesselId: vesselState.id,
    vesselLength: vesselState.length,
    headRatio: vesselState.headRatio,
    nominalThickness,
    binCount,
    binMode: 'equal',
  });

  const bins: WallLossGroupBin[] = response.bins.map((b) => ({
    minPct: b.minPct,
    maxPct: b.maxPct,
    area: b.area,
    areaPercent: b.areaPercent,
    count: b.count,
  }));

  return {
    bins,
    totalScannedArea: response.totalScannedArea,
    totalDataPoints: response.totalDataPoints,
    nominalThickness,
  };
}
