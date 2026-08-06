// =============================================================================
// texture-manager — scan composites on appendage bodies (P2-T2)
// =============================================================================
// Guards the frame-driven scan-composite plane: an appendage-mounted composite's
// mesh vertices must lie on the appendage cylinder surface (kills the build/drag
// divergence bug class, design §8) and stay clamped to the cylinder axial span,
// while main-shell composites keep landing on the main frame surface.
// =============================================================================

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  DEFAULT_VESSEL_STATE,
  type AppendageConfig,
  type NozzleConfig,
  type ScanCompositeConfig,
  type VesselState,
  type WeldConfig,
} from '../../types';
import {
  buildFootprintExcludeMask,
  createScanCompositePlane,
  footprintFingerprint,
} from '../texture-manager';
import { resolveBodyFrame, type SurfaceFrame } from '../body-frame';
import { buildAllFootprints } from '../junction-footprint';

// createScanCompositePlane offsets vertices this many mm above the surface; the
// frame round-trip re-applies it so vertices land exactly on the offset shell.
const SURFACE_OFFSET_MM = 2;

const appendage: AppendageConfig = {
  id: 'app-1',
  name: 'Sump',
  mountPos: 2400,
  mountAngle: 270,
  diameter: 900,
  length: 1400,
  endClosure: 'dished',
  headRatio: 2,
  flangeJoint: { show: true },
};

function makeState(): VesselState {
  return {
    ...DEFAULT_VESSEL_STATE,
    id: 2400,
    length: 6000,
    orientation: 'horizontal',
    appendages: [appendage],
  };
}

function makeComposite(overrides: Partial<ScanCompositeConfig>): ScanCompositeConfig {
  return {
    id: 'sc-1',
    name: 'Scan',
    data: [
      [10, 10, 10],
      [10, 10, 10],
    ],
    xAxis: [0, 100, 200], // circumferential mm from datum
    yAxis: [200, 700], // index mm along the body axis
    stats: { min: 8, max: 12, mean: 10, median: 10, stdDev: 1 },
    indexStartMm: 200,
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

/** Largest deviation of any mesh vertex from the body frame surface (scene units). */
function maxSurfaceDeviation(mesh: THREE.Mesh, frame: SurfaceFrame): number {
  mesh.updateWorldMatrix(true, false);
  const positions = mesh.geometry.getAttribute('position');
  const vertex = new THREE.Vector3();
  let worst = 0;
  for (let i = 0; i < positions.count; i += 1) {
    vertex.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
    // Invert to body-local (pos, angle), then re-project onto the offset surface.
    const local = frame.toLocal(vertex);
    const onSurface = frame.surfacePoint(local.pos, local.angle, SURFACE_OFFSET_MM);
    worst = Math.max(worst, vertex.distanceTo(onSurface));
  }
  return worst;
}

describe('createScanCompositePlane — appendage body surface', () => {
  it('places every appendage-scan vertex on the appendage frame surface', () => {
    const state = makeState();
    const mesh = createScanCompositePlane(makeComposite({ bodyId: 'app-1' }), state, '');
    expect(mesh).not.toBeNull();
    const frame = resolveBodyFrame(state, 'app-1');
    expect(maxSurfaceDeviation(mesh!, frame)).toBeLessThan(1e-6);
  });

  it('clamps an oversized appendage scan to the cylinder axial span [0, length]', () => {
    const state = makeState();
    // Index 0..2000 mm exceeds the 1400 mm cylinder; coverage must clamp to it.
    const composite = makeComposite({ bodyId: 'app-1', indexStartMm: 0, yAxis: [0, 2000] });
    const mesh = createScanCompositePlane(composite, state, '');
    expect(mesh).not.toBeNull();
    const frame = resolveBodyFrame(state, 'app-1');

    mesh!.updateWorldMatrix(true, false);
    const positions = mesh!.geometry.getAttribute('position');
    const vertex = new THREE.Vector3();
    for (let i = 0; i < positions.count; i += 1) {
      vertex.fromBufferAttribute(positions, i).applyMatrix4(mesh!.matrixWorld);
      const { pos } = frame.toLocal(vertex);
      expect(pos).toBeGreaterThanOrEqual(-1e-6);
      expect(pos).toBeLessThanOrEqual(frame.axialLength + 1e-6);
    }
  });

  it('still places main-shell scan vertices on the main frame surface (legacy path)', () => {
    const state = makeState();
    const mesh = createScanCompositePlane(makeComposite({}), state, ''); // no bodyId → main shell
    expect(mesh).not.toBeNull();
    expect(maxSurfaceDeviation(mesh!, resolveBodyFrame(state))).toBeLessThan(1e-6);
  });
});

// ===========================================================================
// buildFootprintExcludeMask — the shared containsCell predicate over pixels
// (P3-T2, design §9.4). Vessel id 2000 (R 1000); appendage at (2000, 90°,
// dia 800 → r 400). Main-shell composite: datum 0 (+90 TDC), cw, forward,
// indexStartMm 2000, xAxis [0, 800], yAxis [0, 300, 900].
//   (row0,col0) → pos 2000, angle 90  → inside  (mount centre)
//   (row0,col1) → pos 2000, angle ~44 → outside (angular offset)
//   (row2,col0) → pos 2900, angle 90  → outside (axial offset > r)
// ===========================================================================
describe('buildFootprintExcludeMask — main-shell pixel exclusion', () => {
  const maskState: VesselState = {
    ...DEFAULT_VESSEL_STATE,
    id: 2000,
    length: 6000,
    appendages: [
      { id: 'app-1', name: 'Sump', mountPos: 2000, mountAngle: 90, diameter: 800, length: 1000, endClosure: 'flat' },
    ],
  };
  const footprints = buildAllFootprints(maskState);
  const maskComposite = {
    bodyId: undefined as string | undefined,
    xAxis: [0, 800],
    yAxis: [0, 300, 900],
    indexStartMm: 2000,
    datumAngleDeg: 0,
    scanDirection: 'cw' as const,
    indexDirection: 'forward' as const,
  };

  it('marks pixels inside the footprint and clears those outside', () => {
    const mask = buildFootprintExcludeMask(maskComposite, maskState, footprints);
    expect(mask).toBeDefined();
    expect(mask!(0, 0)).toBe(true); // mount centre
    expect(mask!(0, 1)).toBe(false); // rotated ~46° away
    expect(mask!(2, 0)).toBe(false); // 900 mm axially past the mount (> r)
  });

  it('returns undefined for an appendage-mounted composite (its body has no cutout)', () => {
    const mask = buildFootprintExcludeMask({ ...maskComposite, bodyId: 'app-1' }, maskState, footprints);
    expect(mask).toBeUndefined();
  });

  it('returns undefined when the vessel has no footprints (legacy path)', () => {
    expect(buildFootprintExcludeMask(maskComposite, maskState, [])).toBeUndefined();
  });
});

// ===========================================================================
// footprintFingerprint — the guard ThreeViewport's trailing settle-rebuild uses
// to stay a no-op unless a bore/junction actually moved (perf regression fix
// 2026-08-06). A rebuild is warranted iff this string changes; a settled change
// to any non-footprint field (welds, visuals, scan datum, camera) must leave it
// identical so the settle effect does NOT rebuild the whole scene.
// ===========================================================================
describe('footprintFingerprint — settle-rebuild guard', () => {
  const nozzle: NozzleConfig = {
    id: 'noz-1',
    name: 'N1',
    pos: 1500,
    proj: 200,
    angle: 90,
    size: 200,
  };
  const fpState: VesselState = {
    ...DEFAULT_VESSEL_STATE,
    id: 2000,
    length: 6000,
    nozzles: [nozzle],
  };

  it('is empty for a vessel with no shell nozzles and no appendages (legacy no-suffix)', () => {
    expect(footprintFingerprint({ ...DEFAULT_VESSEL_STATE, nozzles: [], appendages: [] })).toBe('');
  });

  it('is deterministic for identical footprint inputs', () => {
    expect(footprintFingerprint(fpState)).toBe(footprintFingerprint({ ...fpState }));
    expect(footprintFingerprint(fpState)).not.toBe('');
  });

  it('is UNCHANGED by a sub-quantum nozzle move (<1 mm / <0.5°) → settle no-op', () => {
    const nudged: VesselState = {
      ...fpState,
      nozzles: [{ ...nozzle, pos: nozzle.pos + 0.4, angle: nozzle.angle + 0.2 }],
    };
    expect(footprintFingerprint(nudged)).toBe(footprintFingerprint(fpState));
  });

  it('CHANGES when a nozzle moves past the quantum → settle rebuilds', () => {
    const moved: VesselState = { ...fpState, nozzles: [{ ...nozzle, pos: nozzle.pos + 2 }] };
    expect(footprintFingerprint(moved)).not.toBe(footprintFingerprint(fpState));
  });

  it('is UNCHANGED by a non-footprint edit (adding a weld) → settle no-op (regression guard)', () => {
    const weld: WeldConfig = { name: 'W1', type: 'circumferential', pos: 3000, color: '#fff' };
    const withWeld: VesselState = { ...fpState, welds: [...fpState.welds, weld] };
    expect(footprintFingerprint(withWeld)).toBe(footprintFingerprint(fpState));
  });

  it('ignores boot-mounted nozzles for the main-shell fingerprint', () => {
    const bootNozzle: NozzleConfig = { ...nozzle, id: 'noz-2', bodyId: 'app-1' };
    const withBootNozzle: VesselState = { ...fpState, nozzles: [nozzle, bootNozzle] };
    expect(footprintFingerprint(withBootNozzle)).toBe(footprintFingerprint(fpState));
  });

  it('CHANGES when an appendage junction moves past the quantum', () => {
    const base: VesselState = {
      ...DEFAULT_VESSEL_STATE,
      id: 2000,
      length: 6000,
      appendages: [
        { id: 'app-1', name: 'Boot 1', mountPos: 2000, mountAngle: 90, diameter: 800, length: 1000, endClosure: 'flat' },
      ],
    };
    const moved: VesselState = {
      ...base,
      appendages: [{ ...base.appendages[0], mountAngle: 120 }],
    };
    expect(footprintFingerprint(moved)).not.toBe(footprintFingerprint(base));
    expect(footprintFingerprint(base)).not.toBe('');
  });
});
