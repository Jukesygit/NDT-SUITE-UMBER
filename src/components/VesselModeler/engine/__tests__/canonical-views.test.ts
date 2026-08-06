// =============================================================================
// canonical-views — canonical pose math + nozzle-normal pose + fit distance
// =============================================================================
// Pins the view-cube / bookmark / palette camera math: canonical directions
// mirror getOverviewViews (cardinals honour cardinalRotation; tdc honours
// orientation), fitDistance stays byte-identical to the report-capture formula
// it was extracted from, and nozzleNormalPose frames the flange along the
// nozzle axis.
// =============================================================================

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

import { DEFAULT_VESSEL_STATE, type NozzleConfig, type VesselState } from '../../types';
import {
  canonicalDirection,
  canonicalPose,
  fitDistance,
  nozzleNormalPose,
  nextBookmarkId,
  poseFromBookmark,
  type CanonicalViewId,
  type ViewBounds,
} from '../canonical-views';

type Orientation = VesselState['orientation'];

function makeVessel(orientation: Orientation, cardinalRotation: number): VesselState {
  return {
    ...DEFAULT_VESSEL_STATE,
    orientation,
    visuals: { ...DEFAULT_VESSEL_STATE.visuals, cardinalRotation },
  };
}

/** Expected unit view directions per viewId. */
const ALL_VIEWS: CanonicalViewId[] = ['iso', 'n', 'e', 's', 'w', 'top', 'bottom', 'tdc'];

const N = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).normalize();

/** Expected directions for the world-fixed views (orientation-independent). */
function worldFixedExpected(rot: number): Record<Exclude<CanonicalViewId, 'tdc'>, THREE.Vector3> {
  const r = THREE.MathUtils.degToRad(rot);
  const north = new THREE.Vector3(Math.sin(r), 0, -Math.cos(r));
  const east = new THREE.Vector3(Math.cos(r), 0, Math.sin(r));
  return {
    n: north.clone(),
    s: north.clone().negate(),
    e: east.clone(),
    w: east.clone().negate(),
    top: new THREE.Vector3(0, 1, 0),
    bottom: new THREE.Vector3(0, -1, 0),
    iso: N(Math.sin(r) + Math.cos(r), 1, -Math.cos(r) + Math.sin(r)),
  };
}

function expectDir(actual: THREE.Vector3, expected: THREE.Vector3) {
  const a = actual.clone().normalize();
  const e = expected.clone().normalize();
  expect(a.x).toBeCloseTo(e.x, 6);
  expect(a.y).toBeCloseTo(e.y, 6);
  expect(a.z).toBeCloseTo(e.z, 6);
}

// ---------------------------------------------------------------------------
// canonicalDirection — full matrix
// ---------------------------------------------------------------------------

describe('canonicalDirection matrix (orientation × cardinalRotation)', () => {
  for (const orientation of ['horizontal', 'vertical'] as const) {
    for (const rot of [0, 90]) {
      const vessel = makeVessel(orientation, rot);
      const fixed = worldFixedExpected(rot);

      for (const view of ALL_VIEWS) {
        it(`${view} @ ${orientation} rot=${rot}`, () => {
          const dir = canonicalDirection(view, vessel);
          if (view === 'tdc') {
            // tdc = radial normal at 90° — orientation-aware, rotation-independent.
            const expected =
              orientation === 'vertical'
                ? new THREE.Vector3(0, 0, 1)
                : new THREE.Vector3(0, 1, 0);
            expectDir(dir, expected);
          } else {
            expectDir(dir, fixed[view]);
          }
        });
      }
    }
  }

  it('world-fixed views are identical across orientations', () => {
    const h = makeVessel('horizontal', 30);
    const v = makeVessel('vertical', 30);
    for (const view of ['n', 'e', 's', 'w', 'top', 'bottom', 'iso'] as const) {
      expectDir(canonicalDirection(view, h), canonicalDirection(view, v));
    }
  });

  it('tdc differs between horizontal (+Y) and vertical (+Z)', () => {
    const h = canonicalDirection('tdc', makeVessel('horizontal', 0));
    const v = canonicalDirection('tdc', makeVessel('vertical', 0));
    expectDir(h, new THREE.Vector3(0, 1, 0));
    expectDir(v, new THREE.Vector3(0, 0, 1));
  });
});

// ---------------------------------------------------------------------------
// canonicalPose — position/target relative to bounds
// ---------------------------------------------------------------------------

describe('canonicalPose', () => {
  const bounds: ViewBounds = { center: new THREE.Vector3(2, 3, -4), radius: 5 };
  const vessel = makeVessel('horizontal', 0);

  it('targets the bounds centre and sits at fitDistance along the view direction', () => {
    for (const view of ALL_VIEWS) {
      const { position, target } = canonicalPose(view, vessel, bounds);
      // Target is the centre.
      expect(target.x).toBeCloseTo(bounds.center.x, 6);
      expect(target.y).toBeCloseTo(bounds.center.y, 6);
      expect(target.z).toBeCloseTo(bounds.center.z, 6);
      // Distance from centre == fitDistance(radius).
      expect(position.distanceTo(bounds.center)).toBeCloseTo(fitDistance(bounds.radius), 4);
      // Direction matches canonicalDirection.
      expectDir(position.clone().sub(bounds.center), canonicalDirection(view, vessel));
    }
  });
});

// ---------------------------------------------------------------------------
// fitDistance — byte-identity guard vs the extracted report formula
// ---------------------------------------------------------------------------

describe('fitDistance', () => {
  it('reproduces the report-capture inline formula exactly', () => {
    const radius = 1234.5;
    const fovDeg = 45;
    const aspect = 16 / 10;
    const vFov = fovDeg * (Math.PI / 180);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const expected = (radius / Math.sin(Math.min(vFov, hFov) / 2)) * 0.7;
    expect(fitDistance(radius, fovDeg, aspect)).toBe(expected);
  });

  it('scales linearly with radius', () => {
    expect(fitDistance(200)).toBeCloseTo(2 * fitDistance(100), 6);
  });
});

// ---------------------------------------------------------------------------
// nozzleNormalPose — sanity (position along nozzle axis, target at flange)
// ---------------------------------------------------------------------------

describe('nozzleNormalPose', () => {
  function makeNozzle(overrides: Partial<NozzleConfig> = {}): NozzleConfig {
    return {
      id: 'noz-1',
      name: 'N1',
      pos: DEFAULT_VESSEL_STATE.length / 2,
      proj: DEFAULT_VESSEL_STATE.id / 2 + 200,
      angle: 90,
      size: 150,
      orientationMode: 'radial',
      flangeOD: 300,
      ...overrides,
    } as NozzleConfig;
  }

  it('looks down the radial normal at a TDC (90°) nozzle on a horizontal vessel', () => {
    const vessel = makeVessel('horizontal', 0);
    const { position, target } = nozzleNormalPose(makeNozzle(), vessel);
    // Camera → target direction is the radial normal at 90° = +Y.
    const dir = position.clone().sub(target).normalize();
    expect(dir.x).toBeCloseTo(0, 5);
    expect(dir.y).toBeCloseTo(1, 5);
    expect(dir.z).toBeCloseTo(0, 5);
    // Camera stands off from the flange.
    expect(position.distanceTo(target)).toBeGreaterThan(0);
    // Flange sits outboard of the shell surface (radius id/2).
    expect(target.y).toBeGreaterThan((vessel.id / 2) * 0.001 - 1e-6);
  });

  it('looks down +Z for a 90° nozzle on a vertical vessel', () => {
    const vessel = makeVessel('vertical', 0);
    const { position, target } = nozzleNormalPose(makeNozzle({ pos: 1000 }), vessel);
    const dir = position.clone().sub(target).normalize();
    expect(dir.x).toBeCloseTo(0, 5);
    expect(dir.y).toBeCloseTo(0, 5);
    expect(dir.z).toBeCloseTo(1, 5);
  });
});

// ---------------------------------------------------------------------------
// Bookmark id + pose helpers
// ---------------------------------------------------------------------------

describe('bookmark helpers', () => {
  it('mints bm-<n> one past the highest existing suffix', () => {
    expect(nextBookmarkId([])).toBe('bm-1');
    expect(
      nextBookmarkId([
        { id: 'bm-1', name: 'a', position: [0, 0, 0], target: [0, 0, 0] },
        { id: 'bm-3', name: 'b', position: [0, 0, 0], target: [0, 0, 0] },
      ])
    ).toBe('bm-4');
  });

  it('poseFromBookmark round-trips the stored arrays', () => {
    const pose = poseFromBookmark({ id: 'bm-1', name: 'v', position: [1, 2, 3], target: [4, 5, 6] });
    expect(pose.position.toArray()).toEqual([1, 2, 3]);
    expect(pose.target.toArray()).toEqual([4, 5, 6]);
  });
});
