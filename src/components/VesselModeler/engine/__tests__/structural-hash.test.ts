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

// ---------------------------------------------------------------------------
// C13 — per-entity `visible` is COSMETIC on the wholesale-hashed collections
// (nozzles / liftingLugs / saddles / welds / rulers / coverageRects). It is
// stripped via `.map(x => ({ ...x, visible: undefined }))`, so:
//   (a) a legacy (visible-less) state hashes BYTE-IDENTICALLY — the wrapper is a
//       no-op through JSON.stringify (no OLD-impl golden needed; the equivalence
//       is constructed inline against the raw arrays);
//   (b) toggling `visible` on any of these types must NOT change the hash.
// ---------------------------------------------------------------------------

describe('structuralHash — per-entity visible is cosmetic (C13)', () => {
  const populated: VesselState = {
    ...DEFAULT_VESSEL_STATE,
    nozzles: [{ id: 'noz-1', name: 'N1', pos: 100, proj: 200, angle: 90, size: 100 }],
    liftingLugs: [{ name: 'L1', pos: 200, angle: 90, style: 'padEye', swl: '5t' }],
    saddles: [{ pos: 300 }],
    welds: [{ name: 'W1', type: 'circumferential', pos: 400, color: '#888888' }],
    rulers: [
      {
        id: 1,
        name: 'R1',
        startPos: 0,
        startAngle: 90,
        endPos: 100,
        endAngle: 90,
        color: '#ffaa00',
        showLabel: true,
      },
    ],
    coverageRects: [
      {
        id: 1,
        name: 'C1',
        pos: 500,
        angle: 90,
        width: 100,
        height: 100,
        color: '#00cc66',
        lineWidth: 2,
        filled: true,
        fillOpacity: 0.2,
      },
    ],
  };
  const baseHash = structuralHash(populated);

  it('byte-identity: the mapped projection is a no-op on a visible-less state', () => {
    // The ONLY change to these collections is `.map(x => ({ ...x, visible:
    // undefined }))`. On a visible-less item that map is identity through
    // JSON.stringify (undefined values are omitted, spread preserves key order),
    // so the serialized array — and therefore the hash — is unchanged.
    expect(JSON.stringify(populated.nozzles)).toBe(
      JSON.stringify(populated.nozzles.map((n) => ({ ...n, visible: undefined })))
    );
    expect(JSON.stringify(populated.liftingLugs)).toBe(
      JSON.stringify(populated.liftingLugs.map((l) => ({ ...l, visible: undefined })))
    );
    expect(JSON.stringify(populated.saddles)).toBe(
      JSON.stringify(populated.saddles.map((s) => ({ ...s, visible: undefined })))
    );
    expect(JSON.stringify(populated.welds)).toBe(
      JSON.stringify(populated.welds.map((w) => ({ ...w, visible: undefined })))
    );
    expect(JSON.stringify(populated.rulers)).toBe(
      JSON.stringify(populated.rulers.map((r) => ({ ...r, visible: undefined })))
    );
    expect(JSON.stringify(populated.coverageRects)).toBe(
      JSON.stringify(populated.coverageRects.map((c) => ({ ...c, visible: undefined })))
    );
  });

  it('is unchanged when visible toggles on a nozzle', () => {
    expect(structuralHash({ ...populated, nozzles: [{ ...populated.nozzles[0], visible: false }] })).toBe(baseHash);
    expect(structuralHash({ ...populated, nozzles: [{ ...populated.nozzles[0], visible: true }] })).toBe(baseHash);
  });
  it('is unchanged when visible toggles on a lifting lug', () => {
    expect(
      structuralHash({ ...populated, liftingLugs: [{ ...populated.liftingLugs[0], visible: false }] })
    ).toBe(baseHash);
  });
  it('is unchanged when visible toggles on a saddle', () => {
    expect(structuralHash({ ...populated, saddles: [{ ...populated.saddles[0], visible: false }] })).toBe(
      baseHash
    );
  });
  it('is unchanged when visible toggles on a weld', () => {
    expect(structuralHash({ ...populated, welds: [{ ...populated.welds[0], visible: false }] })).toBe(
      baseHash
    );
  });
  it('is unchanged when visible toggles on a ruler', () => {
    expect(structuralHash({ ...populated, rulers: [{ ...populated.rulers[0], visible: false }] })).toBe(
      baseHash
    );
  });
  it('is unchanged when visible toggles on a coverage rect', () => {
    expect(
      structuralHash({ ...populated, coverageRects: [{ ...populated.coverageRects[0], visible: false }] })
    ).toBe(baseHash);
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
