// =============================================================================
// wall-loss-request — the ONE request two callers build
// =============================================================================
// `useWallLossWorker` built this inline until 2026-08-25; the client-share
// builder now needs the identical request, and the extraction is the only thing
// stopping a published distribution from drifting away from the one the
// inspector approved on screen. So these tests pin the request SHAPE the worker
// path consumed before the move — composites split by body, main-shell cutouts
// carrying appendage junctions AND nozzle bores, and the per-body nominal-wall
// fallback chain — plus the gate that decides there is anything to ask at all.
// =============================================================================

import { describe, it, expect } from 'vitest';

import {
  DEFAULT_VESSEL_STATE,
  type AppendageConfig,
  type NozzleConfig,
  type ScanCompositeConfig,
  type VesselState,
  type WallLossGroupConfig,
} from '../../components/VesselModeler/types';
import { buildWallLossRequest, canComputeWallLoss } from '../wall-loss-request';

const CONFIG: WallLossGroupConfig = {
  enabled: true,
  nominalThickness: 12,
  binCount: 5,
};

const APPENDAGE: AppendageConfig = {
  id: 'app-1',
  name: 'Boot 1',
  mountPos: 3000,
  mountAngle: 270,
  diameter: 600,
  length: 900,
  endClosure: 'dished',
  headRatio: 2,
};

function makeComposite(overrides: Partial<ScanCompositeConfig> = {}): ScanCompositeConfig {
  return {
    id: 'sc-main',
    name: 'Shell scan',
    data: [
      [10, 10],
      [10, 10],
    ],
    xAxis: [0, 100],
    yAxis: [0, 100],
    stats: { min: 10, max: 10, mean: 10, median: 10, stdDev: 0, validArea: 1_000_000 },
    indexStartMm: 1000,
    datumAngleDeg: 0,
    scanDirection: 'cw',
    indexDirection: 'forward',
    orientationConfirmed: true,
    colorScale: 'Jet',
    rangeMin: null,
    rangeMax: null,
    opacity: 1,
    ...overrides,
  };
}

function makeNozzle(overrides: Partial<NozzleConfig> = {}): NozzleConfig {
  return {
    id: 'noz-1',
    name: 'N1',
    pos: 2000,
    proj: 300,
    angle: 90,
    size: 100,
    ...overrides,
  };
}

/** Main shell + one boot, each with its own confirmed scan and its own nozzle. */
function makeState(overrides: Partial<VesselState> = {}): VesselState {
  return {
    ...DEFAULT_VESSEL_STATE,
    appendages: [APPENDAGE],
    nozzles: [makeNozzle(), makeNozzle({ id: 'noz-2', name: 'N2', bodyId: 'app-1', pos: 400 })],
    scanComposites: [
      makeComposite(),
      makeComposite({ id: 'sc-boot', name: 'Boot scan', bodyId: 'app-1' }),
    ],
    ...overrides,
  };
}

describe('buildWallLossRequest — composites are split by body', () => {
  it('sends only main-shell scans in the flat composite list', () => {
    const req = buildWallLossRequest(makeState(), CONFIG);
    expect(req.composites.map((c) => c.id)).toEqual(['sc-main']);
  });

  it('sends each appendage its own scans, and only its own', () => {
    const req = buildWallLossRequest(makeState(), CONFIG);
    expect(req.bodies?.map((b) => b.bodyId)).toEqual(['app-1']);
    expect(req.bodies?.[0].composites.map((c) => c.id)).toEqual(['sc-boot']);
  });

  it('slims a composite to the fields the worker samples with', () => {
    const [composite] = buildWallLossRequest(makeState(), CONFIG).composites;
    // The grid rides by reference — the worker is handed the readings, not a
    // copy, and nothing here may mutate the app's own arrays.
    expect(composite).toEqual({
      id: 'sc-main',
      orientationConfirmed: true,
      data: [
        [10, 10],
        [10, 10],
      ],
      xAxis: [0, 100],
      yAxis: [0, 100],
      indexStartMm: 1000,
      datumAngleDeg: 0,
      scanDirection: 'cw',
      indexDirection: 'forward',
    });
  });

  it('carries dome scans in their own polar-space shape', () => {
    const state = makeState({
      domeScanComposites: [
        {
          id: 'ds-1',
          name: 'Dome scan',
          head: 'left',
          centerPhi: 30,
          centerTheta: 90,
          scanDirection: 'cw',
          indexDirection: 'outward',
          orientationConfirmed: true,
          data: [[9]],
          xAxis: [0],
          yAxis: [0],
          stats: { min: 9, max: 9, mean: 9, median: 9, stdDev: 0, validArea: 1 },
          colorScale: 'Jet',
          rangeMin: null,
          rangeMax: null,
          opacity: 1,
        },
      ],
    });
    expect(buildWallLossRequest(state, CONFIG).domeComposites).toEqual([
      { id: 'ds-1', orientationConfirmed: true, data: [[9]], xAxis: [0], yAxis: [0] },
    ]);
  });
});

describe('buildWallLossRequest — cutouts', () => {
  it('gives the main shell its appendage junctions AND its own nozzle bores', () => {
    const req = buildWallLossRequest(makeState(), CONFIG);
    expect(req.footprints?.map((f) => f.id)).toEqual(['app-1', 'noz-1']);
  });

  it('describes the junction from the appendage mount, not re-derived geometry', () => {
    const [junction] = buildWallLossRequest(makeState(), CONFIG).footprints ?? [];
    expect(junction).toEqual({
      id: 'app-1',
      mountPos: APPENDAGE.mountPos,
      mountAngle: APPENDAGE.mountAngle,
      diameter: APPENDAGE.diameter,
    });
  });

  it('gives a boot only the nozzles mounted on it', () => {
    const req = buildWallLossRequest(makeState(), CONFIG);
    expect(req.bodies?.[0].footprints?.map((f) => f.id)).toEqual(['noz-2']);
  });

  it('skips a head-mounted nozzle, whose spherical-cap math is out of scope', () => {
    // `pos` past the tan-tan length puts the nozzle on a head.
    const state = makeState({ nozzles: [makeNozzle({ pos: DEFAULT_VESSEL_STATE.length + 200 })] });
    expect(buildWallLossRequest(state, CONFIG).footprints?.map((f) => f.id)).toEqual(['app-1']);
  });
});

// =============================================================================
// Nominal wall per body
// =============================================================================
// A boot may be a different wall to the shell it hangs off, and the wall-loss
// percentage is meaningless against the wrong nominal — so the fallback chain
// is: the boot's own NWT, else the shell's, else the group config's.
// =============================================================================

describe('buildWallLossRequest — per-body nominal wall', () => {
  const bodyNwt = (state: VesselState) =>
    buildWallLossRequest(state, CONFIG).bodies?.[0].nominalThickness;

  it('prefers the appendage’s own nominal thickness', () => {
    const state = makeState({
      appendages: [{ ...APPENDAGE, nominalThickness: 6 }],
      shellNominalThickness: 14,
    });
    expect(bodyNwt(state)).toBe(6);
  });

  it('falls back to the shell nominal thickness', () => {
    expect(bodyNwt(makeState({ shellNominalThickness: 14 }))).toBe(14);
  });

  it('falls back to the group config last', () => {
    expect(bodyNwt(makeState())).toBe(CONFIG.nominalThickness);
  });

  it('defaults a missing appendage head ratio rather than sending undefined', () => {
    const state = makeState({ appendages: [{ ...APPENDAGE, headRatio: undefined }] });
    expect(buildWallLossRequest(state, CONFIG).bodies?.[0].headRatio).toBe(2);
  });
});

describe('buildWallLossRequest — vessel and config passthrough', () => {
  it('carries the vessel geometry and every bin setting', () => {
    const state = makeState({
      corrosionAllowance: 3,
      shellNominalThickness: 14,
      domeNominalThickness: 13,
    });
    const req = buildWallLossRequest(
      state,
      { ...CONFIG, binMode: 'custom', customBoundaries: [0, 3, 6, 9, 12, 15] },
      7
    );

    expect(req).toMatchObject({
      id: 7,
      vesselId: state.id,
      vesselLength: state.length,
      headRatio: state.headRatio,
      nominalThickness: 12,
      binCount: 5,
      binMode: 'custom',
      customBoundaries: [0, 3, 6, 9, 12, 15],
      corrosionAllowance: 3,
      shellNominalThickness: 14,
      domeNominalThickness: 13,
    });
  });

  it('defaults the bin mode to equal and the id to 0', () => {
    const req = buildWallLossRequest(makeState(), CONFIG);
    expect(req.binMode).toBe('equal');
    // A synchronous caller has no late response to discard, so it needs no token.
    expect(req.id).toBe(0);
  });
});

// =============================================================================
// The gate
// =============================================================================
// Both callers ask this BEFORE building a request: the panel renders nothing and
// the bundle omits the section entirely, and they must agree on when.
// =============================================================================

describe('canComputeWallLoss', () => {
  const withScans = makeState();

  it('is true with an enabled config, a confirmed scan and a positive nominal', () => {
    expect(canComputeWallLoss(withScans, CONFIG)).toBe(true);
  });

  it('is false without a config at all', () => {
    expect(canComputeWallLoss(withScans, undefined)).toBe(false);
  });

  it('is false when the config is disabled', () => {
    expect(canComputeWallLoss(withScans, { ...CONFIG, enabled: false })).toBe(false);
  });

  it('is false when the nominal thickness is zero', () => {
    expect(canComputeWallLoss(withScans, { ...CONFIG, nominalThickness: 0 })).toBe(false);
  });

  it('is false with no scans at all', () => {
    expect(canComputeWallLoss(makeState({ scanComposites: [] }), CONFIG)).toBe(false);
  });

  it('is false when every scan is unconfirmed — an unoriented scan is not data', () => {
    const unconfirmed = makeState({
      scanComposites: [makeComposite({ orientationConfirmed: false })],
    });
    expect(canComputeWallLoss(unconfirmed, CONFIG)).toBe(false);
  });

  it('is true on a confirmed dome scan alone', () => {
    const domeOnly = makeState({
      scanComposites: [],
      domeScanComposites: [
        {
          id: 'ds-1',
          name: 'Dome scan',
          head: 'left',
          centerPhi: 30,
          centerTheta: 90,
          scanDirection: 'cw',
          indexDirection: 'outward',
          orientationConfirmed: true,
          data: [[9]],
          xAxis: [0],
          yAxis: [0],
          stats: { min: 9, max: 9, mean: 9, median: 9, stdDev: 0, validArea: 1 },
          colorScale: 'Jet',
          rangeMin: null,
          rangeMax: null,
          opacity: 1,
        },
      ],
    });
    expect(canComputeWallLoss(domeOnly, CONFIG)).toBe(true);
  });
});
