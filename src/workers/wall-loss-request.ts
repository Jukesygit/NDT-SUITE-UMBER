// ---------------------------------------------------------------------------
// Wall-loss request — THE single source for the shape `compute` is asked for.
//
// Two callers build this request and they must never disagree: the modeler's
// `useWallLossWorker` (which posts it to the Web Worker and renders the answer
// in the stats panel) and the client-share bundle builder (which runs `compute`
// synchronously at publish time and ships the numbers). The extraction IS the
// anti-drift mechanism — a published distribution that differed from the one the
// inspector approved on screen would be a wrong report, not a cosmetic bug, and
// the only way to guarantee they agree is for there to be ONE builder.
//
// Pure by construction: no React, no three.js, no supabase, no DOM. It reaches
// `engine/nozzle-footprint` for the bore cutouts, which is itself pure (type
// imports plus the constant pipe-size lookup), so this module is importable from
// a hook, a worker bundle, a builder or a test with equal safety.
// ---------------------------------------------------------------------------

import type {
  ScanCompositeConfig,
  VesselState,
  WallLossGroupConfig,
} from '../components/VesselModeler/types';
import type {
  CompositeSlim,
  DomeCompositeSlim,
  FootprintParamsSlim,
  WallLossBodyInput,
  WallLossRequest,
} from './wall-loss-compute';
import {
  appendageNozzleFootprintParams,
  mainShellNozzleFootprintParams,
} from '../components/VesselModeler/engine/nozzle-footprint';

/** Default appendage head ratio (mirrors appendage-config / body-frame). */
const DEFAULT_APPENDAGE_HEAD_RATIO = 2.0;

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

/**
 * Whether a distribution can be computed at all: a config that is on, at least
 * one orientation-confirmed scan of either kind, and a positive nominal wall.
 *
 * Both callers gate on this BEFORE building a request. Without a confirmed scan
 * there is nothing to bin, and `compute` would answer with an empty template
 * that the modeler renders as nothing and the bundle must omit entirely — so the
 * gate, not the empty answer, is what the two sides agree on.
 */
export function canComputeWallLoss(
  state: VesselState,
  config: WallLossGroupConfig | undefined
): boolean {
  if (!config?.enabled) return false;
  const hasShellScans = state.scanComposites.some((c) => c.orientationConfirmed);
  const hasDomeScans = (state.domeScanComposites ?? []).some((d) => d.orientationConfirmed);
  if (!hasShellScans && !hasDomeScans) return false;
  return (config.nominalThickness ?? 0) > 0;
}

/**
 * Build the request for one vessel state.
 *
 * `id` is the worker's request-correlation token — the hook increments it so a
 * late response from a superseded run can be discarded. A synchronous caller has
 * nothing to correlate, hence the default.
 */
export function buildWallLossRequest(
  state: VesselState,
  config: WallLossGroupConfig,
  id = 0
): WallLossRequest {
  // Main-shell scans (bodyId undefined). Appendage scans are grouped per body
  // below — the interim `.filter(!bodyId)` drop is gone (design §9.3).
  const composites: CompositeSlim[] = state.scanComposites.filter((c) => !c.bodyId).map(toSlim);

  const domeComposites: DomeCompositeSlim[] = (state.domeScanComposites ?? []).map((d) => ({
    id: d.id,
    orientationConfirmed: d.orientationConfirmed,
    data: d.data,
    xAxis: d.xAxis,
    yAxis: d.yAxis,
  }));

  // Main-shell cutouts (design §9.4 / R1): appendage junctions PLUS unmappable
  // nozzle bores. Cells inside a footprint drop out of the MAIN body's
  // distribution. Nozzle params (radial circle / non-radial ellipse) and the
  // head-mounted skip come from the shared engine helper so the worker cutout
  // matches coverage + heatmap exactly.
  const footprints: FootprintParamsSlim[] = [
    ...(state.appendages ?? []).map((a) => ({
      id: a.id,
      mountPos: a.mountPos,
      mountAngle: a.mountAngle,
      diameter: a.diameter,
    })),
    ...mainShellNozzleFootprintParams(state),
  ];

  // One appendage body per appendage config, carrying only its own scans, its
  // own cylinder geometry (design §9.3), and its own nozzle-bore cutouts
  // (design R1). NWT defaults to the shell NWT.
  const bodies: WallLossBodyInput[] = (state.appendages ?? []).map((a) => ({
    bodyId: a.id,
    name: a.name,
    composites: state.scanComposites.filter((c) => c.bodyId === a.id).map(toSlim),
    footprints: appendageNozzleFootprintParams(state, a.id),
    vesselId: a.diameter,
    vesselLength: a.length,
    headRatio: a.headRatio ?? DEFAULT_APPENDAGE_HEAD_RATIO,
    nominalThickness: a.nominalThickness ?? state.shellNominalThickness ?? config.nominalThickness,
  }));

  return {
    id,
    composites,
    domeComposites,
    footprints,
    bodies,
    vesselId: state.id,
    vesselLength: state.length,
    headRatio: state.headRatio,
    nominalThickness: config.nominalThickness,
    binCount: config.binCount,
    binMode: config.binMode ?? 'equal',
    customBoundaries: config.customBoundaries,
    corrosionAllowance: state.corrosionAllowance,
    shellNominalThickness: state.shellNominalThickness,
    domeNominalThickness: state.domeNominalThickness,
  };
}
