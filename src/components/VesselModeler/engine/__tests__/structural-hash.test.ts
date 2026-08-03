// =============================================================================
// structuralHash — appendage structural-field coverage (design §7 / C6)
// =============================================================================
// Guards the rebuild-trigger allowlist: STRUCTURAL appendage edits (geometry)
// must change the hash so the scene rebuilds; COSMETIC edits (name, visible,
// locked, nominalThickness) must NOT, or they cause rebuild storms.
//
// Imported from the pure `structural-hash` module, NOT from ThreeViewport, so
// the test never drags renderer/WebGL setup into jsdom.
// =============================================================================

import { describe, it, expect } from 'vitest';

import {
  DEFAULT_VESSEL_STATE,
  type AnnotationShapeConfig,
  type AppendageConfig,
  type DomeScanConfig,
  type ScanCompositeConfig,
  type VesselState,
} from '../../types';
import { structuralHash } from '../structural-hash';
import { createAppendage } from '../appendage-config';

function stateWith(appendage: AppendageConfig): VesselState {
  return { ...DEFAULT_VESSEL_STATE, appendages: [appendage] };
}

const base = createAppendage([]); // 'app-1' with design defaults
const baseHash = structuralHash(stateWith(base));

// ---------------------------------------------------------------------------
// Structural edits MUST change the hash
// ---------------------------------------------------------------------------

describe('structuralHash changes on a structural appendage edit', () => {
  it('changes when diameter changes', () => {
    expect(structuralHash(stateWith({ ...base, diameter: base.diameter + 100 }))).not.toBe(
      baseHash
    );
  });

  it('changes when mountPos changes', () => {
    expect(structuralHash(stateWith({ ...base, mountPos: base.mountPos + 250 }))).not.toBe(
      baseHash
    );
  });

  it('changes when mountAngle / length / endClosure / headRatio change', () => {
    expect(structuralHash(stateWith({ ...base, mountAngle: 90 }))).not.toBe(baseHash);
    expect(structuralHash(stateWith({ ...base, length: base.length + 300 }))).not.toBe(baseHash);
    expect(structuralHash(stateWith({ ...base, endClosure: 'flat' }))).not.toBe(baseHash);
    expect(structuralHash(stateWith({ ...base, headRatio: 3.0 }))).not.toBe(baseHash);
  });

  it('changes when the flange-joint visibility toggles', () => {
    const shown = structuralHash(stateWith({ ...base, flangeJoint: { show: true } }));
    const hidden = structuralHash(stateWith({ ...base, flangeJoint: { show: false } }));
    expect(shown).not.toBe(hidden);
  });
});

// ---------------------------------------------------------------------------
// Cosmetic edits must NOT change the hash
// ---------------------------------------------------------------------------

describe('structuralHash is stable across a cosmetic appendage edit', () => {
  it('is unchanged when name changes', () => {
    expect(structuralHash(stateWith({ ...base, name: 'Renamed Sump' }))).toBe(baseHash);
  });

  it('is unchanged when nominalThickness changes', () => {
    const a = structuralHash(stateWith({ ...base, nominalThickness: 10 }));
    const b = structuralHash(stateWith({ ...base, nominalThickness: 22 }));
    expect(a).toBe(b);
  });

  it('is unchanged when visible or locked toggle', () => {
    expect(structuralHash(stateWith({ ...base, visible: false }))).toBe(baseHash);
    expect(structuralHash(stateWith({ ...base, locked: true }))).toBe(baseHash);
  });
});

// ---------------------------------------------------------------------------
// Regression: a default vessel with no appendages is stable and unaffected by
// cosmetic (non-allowlisted) edits.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Dome scan bodyId is a structural (rebuild-triggering) field
// ---------------------------------------------------------------------------

describe('structuralHash — dome scan bodyId', () => {
  function dome(bodyId?: string): DomeScanConfig {
    return {
      id: 'd1',
      name: 'd1',
      bodyId,
      head: bodyId ? 'end' : 'right',
      centerPhi: 30,
      centerTheta: 0,
      scanDirection: 'cw',
      indexDirection: 'outward',
      orientationConfirmed: true,
      data: [[1]],
      xAxis: [0, 1],
      yAxis: [0, 1],
      stats: { min: 0, max: 0, mean: 0, median: 0, stdDev: 0 },
      colorScale: 'Jet',
      rangeMin: null,
      rangeMax: null,
      opacity: 1,
    };
  }

  it('changes when a dome scan moves from the main head to an appendage closure', () => {
    const onMain: VesselState = {
      ...DEFAULT_VESSEL_STATE,
      appendages: [base],
      domeScanComposites: [dome(undefined)],
    };
    const onBody: VesselState = {
      ...DEFAULT_VESSEL_STATE,
      appendages: [base],
      domeScanComposites: [dome(base.id)],
    };
    expect(structuralHash(onMain)).not.toBe(structuralHash(onBody));
  });
});

// ---------------------------------------------------------------------------
// Scan / dome composite heatmap visual params are COSMETIC (T2-B / review §4.4).
// opacity / colorScale / rangeMin / rangeMax only repaint the baked texture, so
// they must NOT change the hash (they are swapped in place by ThreeViewport).
// Structural placement fields (pos, datum, grid, direction) MUST still change it.
// ---------------------------------------------------------------------------

describe('structuralHash — scan composite visual params are cosmetic', () => {
  function scan(overrides: Partial<ScanCompositeConfig> = {}): ScanCompositeConfig {
    return {
      id: 'sc1',
      name: 'sc1',
      data: [[10, 11]],
      xAxis: [0, 5],
      yAxis: [0, 5],
      stats: { min: 0, max: 0, mean: 0, median: 0, stdDev: 0 },
      indexStartMm: 100,
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
  const state = (sc: ScanCompositeConfig): VesselState => ({
    ...DEFAULT_VESSEL_STATE,
    scanComposites: [sc],
  });
  const scanBase = structuralHash(state(scan()));

  it('is unchanged when opacity changes', () => {
    expect(structuralHash(state(scan({ opacity: 0.3 })))).toBe(scanBase);
  });
  it('is unchanged when colorScale changes', () => {
    expect(structuralHash(state(scan({ colorScale: 'Viridis' })))).toBe(scanBase);
  });
  it('is unchanged when rangeMin / rangeMax change', () => {
    expect(structuralHash(state(scan({ rangeMin: 2 })))).toBe(scanBase);
    expect(structuralHash(state(scan({ rangeMax: 20 })))).toBe(scanBase);
  });

  it('changes when the longitudinal position (indexStartMm) changes', () => {
    expect(structuralHash(state(scan({ indexStartMm: 250 })))).not.toBe(scanBase);
  });
  it('changes when the datum angle changes', () => {
    expect(structuralHash(state(scan({ datumAngleDeg: 45 })))).not.toBe(scanBase);
  });
  it('changes when the scan direction changes', () => {
    expect(structuralHash(state(scan({ scanDirection: 'ccw' })))).not.toBe(scanBase);
  });
  it('changes when the data grid presence changes', () => {
    expect(structuralHash(state(scan({ data: [] })))).not.toBe(scanBase);
  });
});

describe('structuralHash — dome scan visual params are cosmetic', () => {
  function dome(overrides: Partial<DomeScanConfig> = {}): DomeScanConfig {
    return {
      id: 'd1',
      name: 'd1',
      head: 'right',
      centerPhi: 30,
      centerTheta: 0,
      scanDirection: 'cw',
      indexDirection: 'outward',
      orientationConfirmed: true,
      data: [[1]],
      xAxis: [0, 1],
      yAxis: [0, 1],
      stats: { min: 0, max: 0, mean: 0, median: 0, stdDev: 0 },
      colorScale: 'Jet',
      rangeMin: null,
      rangeMax: null,
      opacity: 1,
      ...overrides,
    };
  }
  const state = (ds: DomeScanConfig): VesselState => ({
    ...DEFAULT_VESSEL_STATE,
    domeScanComposites: [ds],
  });
  const domeBase = structuralHash(state(dome()));

  it('is unchanged when opacity / colorScale / range change', () => {
    expect(structuralHash(state(dome({ opacity: 0.4 })))).toBe(domeBase);
    expect(structuralHash(state(dome({ colorScale: 'Hot' })))).toBe(domeBase);
    expect(structuralHash(state(dome({ rangeMin: 1, rangeMax: 9 })))).toBe(domeBase);
  });

  it('changes when centerPhi changes', () => {
    expect(structuralHash(state(dome({ centerPhi: 60 })))).not.toBe(domeBase);
  });
  it('changes when the head changes', () => {
    expect(structuralHash(state(dome({ head: 'left' })))).not.toBe(domeBase);
  });
});

// ---------------------------------------------------------------------------
// Annotation bodyId is hash-covered. Annotations are hashed WHOLESALE (the
// structuralHash spreads `...a`), so bodyId is included automatically — this
// regression locks that a future refactor to a field-list keeps bodyId in it
// (moving an annotation between bodies re-parameterises its geometry).
// ---------------------------------------------------------------------------

describe('structuralHash — annotation bodyId', () => {
  function ann(bodyId?: string): AnnotationShapeConfig {
    return {
      id: 1,
      name: 'A1',
      type: 'scan',
      pos: 100,
      angle: 90,
      width: 200,
      height: 150,
      color: '#ff3333',
      lineWidth: 2,
      showLabel: false,
      bodyId,
    };
  }

  it('changes when an annotation moves from the main shell to an appendage body', () => {
    const onMain: VesselState = {
      ...DEFAULT_VESSEL_STATE,
      appendages: [base],
      annotations: [ann(undefined)],
    };
    const onBody: VesselState = {
      ...DEFAULT_VESSEL_STATE,
      appendages: [base],
      annotations: [ann(base.id)],
    };
    expect(structuralHash(onMain)).not.toBe(structuralHash(onBody));
  });
});

describe('structuralHash regression — no appendages', () => {
  it('is deterministic for the default vessel', () => {
    expect(structuralHash(DEFAULT_VESSEL_STATE)).toBe(structuralHash(DEFAULT_VESSEL_STATE));
  });

  it('is unaffected by a cosmetic visuals change but changes on a structural edit', () => {
    const cosmetic: VesselState = {
      ...DEFAULT_VESSEL_STATE,
      visuals: { ...DEFAULT_VESSEL_STATE.visuals, shellOpacity: 0.5 },
    };
    expect(structuralHash(cosmetic)).toBe(structuralHash(DEFAULT_VESSEL_STATE));

    const structural: VesselState = { ...DEFAULT_VESSEL_STATE, id: DEFAULT_VESSEL_STATE.id + 50 };
    expect(structuralHash(structural)).not.toBe(structuralHash(DEFAULT_VESSEL_STATE));
  });
});
