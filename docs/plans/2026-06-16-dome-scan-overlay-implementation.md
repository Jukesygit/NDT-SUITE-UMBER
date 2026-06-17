# Dome End Scan Overlay — Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add dome scan overlays that map C-scan data onto ellipsoidal vessel heads using polar coordinates (φ, θ), parallel to the existing shell scan composite system.

**Architecture:** New `DomeScanConfig` type + `dome-scan-geometry.ts` engine module with shared helpers and mesh factory. Wired into the existing `buildVesselScene()` → `ThreeViewport` → `InteractionManager` pipeline. New `DomeScanSection.tsx` sidebar component follows the `ScanCompositeSection` pattern. Hover tooltip via bounded `interaction-manager.ts` change. Save/load hydration, wall loss note, report defensive row.

**Tech Stack:** React 18 + TypeScript 5.9, Three.js, Vitest, existing VesselModeler engine

**Design Doc:** `docs/plans/2026-06-16-dome-scan-overlay-design.md`

---

## Task 1: Add `DomeScanConfig` Interface and Extend `VesselState`

**Files:**
- Modify: `src/components/VesselModeler/types.ts`

**Step 1: Add the `DomeScanConfig` interface**

Insert after the `ScanCompositeSourceFile` interface (after line ~223) in `types.ts`:

```typescript
// ---------------------------------------------------------------------------
// Dome Scan Config — polar-mapped scan overlay on ellipsoidal heads
// ---------------------------------------------------------------------------

export interface DomeScanConfig {
  id: string;
  name: string;
  cloudId?: string;

  head: 'left' | 'right';
  /** Polar angle from dome apex in degrees (0 = apex, 90 = equator) */
  centerPhi: number;
  /** Azimuthal angle around dome axis in degrees (0° = 3-o'clock, 90° = TDC) */
  centerTheta: number;

  scanDirection: 'cw' | 'ccw';
  indexDirection: 'outward' | 'inward';
  orientationConfirmed: boolean;

  data: (number | null)[][];
  xAxis: number[];
  yAxis: number[];
  stats: { min: number; max: number; mean: number; median: number; stdDev: number };

  colorScale: string;
  rangeMin: number | null;
  rangeMax: number | null;
  opacity: number;

  sourceFiles?: Array<{
    filename: string;
    minX: number; maxX: number;
    minY: number; maxY: number;
  }>;
}
```

**Step 2: Extend `VesselState`**

Add `domeScanComposites: DomeScanConfig[];` after `scanComposites` (line 507):

```typescript
scanComposites: ScanCompositeConfig[];
domeScanComposites: DomeScanConfig[];
```

**Step 3: Add default**

In `DEFAULT_VESSEL_STATE` (line ~907), add after `scanComposites: []`:

```typescript
scanComposites: [],
domeScanComposites: [],
```

**Step 4: Add `ScanOverlaySubId` variant**

In the `ScanOverlaySubId` type (line 47), add `'domeScanComposites'`:

```typescript
type ScanOverlaySubId = 'imageOverlays' | 'scanComposites' | 'domeScanComposites';
```

**Step 5: Add dome hover callback to `VesselCallbacks`**

After `onScanCompositeHover` (line ~966):

```typescript
onDomeScanHover?: (info: DomeScanHoverInfo | null) => void;
```

And add the info interface near `DomeScanConfig`:

```typescript
export interface DomeScanHoverInfo {
  scanId: string;
  thickness: number | null;
  phiDeg: number;
  thetaDeg: number;
  row: number;
  col: number;
  screenX: number;
  screenY: number;
}
```

**Step 6: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (new types are additive, no consumers yet)

**Step 7: Commit**

```bash
git add src/components/VesselModeler/types.ts
git commit -m "feat(vessel-modeler): add DomeScanConfig type and extend VesselState"
```

---

## Task 2: Create `dome-scan-geometry.ts` — Shared Helpers

**Files:**
- Create: `src/components/VesselModeler/engine/dome-scan-geometry.ts`
- Test: `src/components/VesselModeler/engine/__tests__/dome-scan-geometry.test.ts`

**Step 1: Write tests for `domeLocalFromPhiTheta`**

Create `src/components/VesselModeler/engine/__tests__/dome-scan-geometry.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { domeLocalFromPhiTheta, domePhiThetaFromPoint, PHI_EPSILON } from '../dome-scan-geometry';
import * as THREE from 'three';

const R = 1500; // typical vessel radius mm
const D = 750;  // 2:1 ellipsoidal head depth (R/headRatio)

describe('domeLocalFromPhiTheta', () => {
  it('returns valid result at apex (phi ≈ 0) with no NaN', () => {
    const result = domeLocalFromPhiTheta(0, 0, R, D);
    expect(result.axialMm).toBeCloseTo(D, 0);
    expect(result.rLocalMm).toBeCloseTo(0, -1); // near zero
    expect(Number.isNaN(result.normal.x)).toBe(false);
    expect(Number.isNaN(result.normal.y)).toBe(false);
    expect(Number.isNaN(result.normal.z)).toBe(false);
  });

  it('returns four distinct positions near apex forming a ring', () => {
    const positions = [0, 90, 180, 270].map(theta =>
      domeLocalFromPhiTheta(PHI_EPSILON, theta, R, D),
    );
    // All should have ~same rLocalMm (tiny ring)
    const rValues = positions.map(p => p.rLocalMm);
    expect(rValues[0]).toBeCloseTo(rValues[1], 2);
    // But distinct thetaRad values
    const thetas = new Set(positions.map(p => p.thetaRad.toFixed(4)));
    expect(thetas.size).toBe(4);
  });

  it('returns equator values at phi = 90', () => {
    const result = domeLocalFromPhiTheta(90, 0, R, D);
    expect(result.axialMm).toBeCloseTo(0, 0); // at tangent line
    expect(result.rLocalMm).toBeCloseTo(R, 0); // full radius
  });

  it('returns mid-dome values at phi = 45', () => {
    const result = domeLocalFromPhiTheta(45, 90, R, D);
    const cos45 = Math.cos(Math.PI / 4);
    const sin45 = Math.sin(Math.PI / 4);
    expect(result.axialMm).toBeCloseTo(D * cos45, 1);
    expect(result.rLocalMm).toBeCloseTo(R * sin45, 1);
  });

  it('normal at apex points along head axis', () => {
    const result = domeLocalFromPhiTheta(PHI_EPSILON, 0, R, D);
    // Normal x component (axial) should dominate
    expect(Math.abs(result.normal.x)).toBeGreaterThan(0.9);
  });

  it('normal at equator points radially outward', () => {
    const result = domeLocalFromPhiTheta(89.9, 0, R, D);
    // Normal x component (axial) should be small
    expect(Math.abs(result.normal.x)).toBeLessThan(0.15);
  });
});

describe('domePhiThetaFromPoint — round-trip consistency', () => {
  const SCALE = 0.001;
  const TAN_TAN = 8000; // mm

  it.each([
    { phi: 0.1, theta: 0, head: 'right' as const, sign: 1 as const },
    { phi: 45, theta: 90, head: 'right' as const, sign: 1 as const },
    { phi: 45, theta: 270, head: 'left' as const, sign: -1 as const },
    { phi: 89, theta: 180, head: 'left' as const, sign: -1 as const },
  ])('round-trips (φ=$phi, θ=$theta, $head head)', ({ phi, theta, sign }) => {
    // Forward: dome coords → local mm
    const local = domeLocalFromPhiTheta(phi, theta, R, D);

    // Build world-space point (horizontal vessel)
    const tangentLineMm = sign === 1 ? TAN_TAN : 0;
    const axialPosMm = tangentLineMm + sign * local.axialMm;
    const axialGlobal = (axialPosMm - TAN_TAN / 2) * SCALE;
    const rScaled = local.rLocalMm * SCALE;
    const point = new THREE.Vector3(
      axialGlobal,
      rScaled * Math.sin(local.thetaRad),
      rScaled * Math.cos(local.thetaRad),
    );

    // Inverse: world point → dome coords
    const tangentLineWorld = (tangentLineMm - TAN_TAN / 2) * SCALE;
    const result = domePhiThetaFromPoint(point, R, D, tangentLineWorld, sign, false);

    expect(result).not.toBeNull();
    expect(result!.phiDeg).toBeCloseTo(phi, 1);
    // Normalize theta comparison to [0, 360)
    const expectedTheta = ((theta % 360) + 360) % 360;
    const resultTheta = ((result!.thetaDeg % 360) + 360) % 360;
    expect(resultTheta).toBeCloseTo(expectedTheta, 1);
  });

  it('returns null for point on shell side', () => {
    const point = new THREE.Vector3(0, R * SCALE, 0); // mid-vessel
    const tangentLineWorld = (TAN_TAN - TAN_TAN / 2) * SCALE;
    const result = domePhiThetaFromPoint(point, R, D, tangentLineWorld, 1, false);
    expect(result).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/VesselModeler/engine/__tests__/dome-scan-geometry.test.ts`
Expected: FAIL — module not found

**Step 3: Implement shared helpers**

Create `src/components/VesselModeler/engine/dome-scan-geometry.ts`:

```typescript
import * as THREE from 'three';
import { degToRad, radToDeg } from 'three/src/math/MathUtils.js';
import { SCALE } from './materials';

export const PHI_EPSILON = 0.01;

export interface DomeLocalResult {
  axialMm: number;
  rLocalMm: number;
  thetaRad: number;
  normal: THREE.Vector3;
}

export function domeLocalFromPhiTheta(
  phiDeg: number,
  thetaDeg: number,
  radius: number,
  headDepth: number,
): DomeLocalResult {
  const phi = degToRad(Math.max(PHI_EPSILON, Math.min(90, phiDeg)));
  const theta = degToRad(thetaDeg);

  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);

  const axialMm = headDepth * cosPhi;
  const rLocalMm = radius * sinPhi;

  const nAxial = cosPhi / headDepth;
  const nRadSin = (sinPhi * Math.sin(theta)) / radius;
  const nRadCos = (sinPhi * Math.cos(theta)) / radius;
  const normal = new THREE.Vector3(nAxial, nRadSin, nRadCos).normalize();

  return { axialMm, rLocalMm, thetaRad: theta, normal };
}

export function domePhiThetaFromPoint(
  point: THREE.Vector3,
  radius: number,
  headDepth: number,
  tangentLineWorld: number,
  headSign: 1 | -1,
  isVertical: boolean,
): { phiDeg: number; thetaDeg: number } | null {
  let axialWorld: number, radY: number, radZ: number;
  if (isVertical) {
    axialWorld = point.y;
    radY = point.x;
    radZ = point.z;
  } else {
    axialWorld = point.x;
    radY = point.y;
    radZ = point.z;
  }

  const axialFromTL = (headSign * (axialWorld - tangentLineWorld)) / SCALE;
  if (axialFromTL < 0) return null;

  const rLocalWorld = Math.sqrt(radY * radY + radZ * radZ);
  const rLocalMm = rLocalWorld / SCALE;

  const phiRad = Math.atan2(rLocalMm / radius, axialFromTL / headDepth);
  const phiDeg = radToDeg(phiRad);
  if (phiDeg < 0 || phiDeg > 90) return null;

  const thetaRad = Math.atan2(radY, radZ);
  const thetaDeg = radToDeg(thetaRad);

  return { phiDeg, thetaDeg: ((thetaDeg % 360) + 360) % 360 };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/VesselModeler/engine/__tests__/dome-scan-geometry.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/components/VesselModeler/engine/dome-scan-geometry.ts src/components/VesselModeler/engine/__tests__/dome-scan-geometry.test.ts
git commit -m "feat(vessel-modeler): add dome scan shared geometry helpers with tests"
```

---

## Task 3: Add `createDomeScanPlane()` Mesh Factory

**Files:**
- Modify: `src/components/VesselModeler/engine/dome-scan-geometry.ts`
- Test: `src/components/VesselModeler/engine/__tests__/dome-scan-geometry.test.ts`

**Step 1: Write tests for `createDomeScanPlane`**

Append to the test file:

```typescript
import { createDomeScanPlane } from '../dome-scan-geometry';
import type { DomeScanConfig, VesselState } from '../../types';

function makeDomeScanConfig(overrides: Partial<DomeScanConfig> = {}): DomeScanConfig {
  const rows = 10;
  const cols = 10;
  return {
    id: 'ds_test',
    name: 'Test Dome Scan',
    head: 'right',
    centerPhi: 45,
    centerTheta: 0,
    scanDirection: 'cw',
    indexDirection: 'outward',
    orientationConfirmed: true,
    data: Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => 10 + Math.random() * 5),
    ),
    xAxis: Array.from({ length: cols }, (_, i) => i * 10),
    yAxis: Array.from({ length: rows }, (_, i) => i * 10),
    stats: { min: 10, max: 15, mean: 12.5, median: 12.5, stdDev: 1 },
    colorScale: 'Jet',
    rangeMin: null,
    rangeMax: null,
    opacity: 1,
    ...overrides,
  };
}

function makeVesselState(): Partial<VesselState> {
  return {
    id: 3000,    // diameter mm
    length: 8000,  // tan-tan mm
    headRatio: 2.0,
    orientation: 'horizontal',
    vesselShape: 'vessel',
  };
}

describe('createDomeScanPlane', () => {
  it('returns a mesh for a valid dome scan config', () => {
    const mesh = createDomeScanPlane(
      makeDomeScanConfig(),
      makeVesselState() as VesselState,
      '',
    );
    expect(mesh).not.toBeNull();
    expect(mesh).toBeInstanceOf(THREE.Mesh);
  });

  it('returns null for empty data', () => {
    const mesh = createDomeScanPlane(
      makeDomeScanConfig({ data: [] }),
      makeVesselState() as VesselState,
      '',
    );
    expect(mesh).toBeNull();
  });

  it('near-apex scan (centerPhi=5) has no NaN vertices', () => {
    const mesh = createDomeScanPlane(
      makeDomeScanConfig({ centerPhi: 5 }),
      makeVesselState() as VesselState,
      '',
    );
    expect(mesh).not.toBeNull();
    const positions = mesh!.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      expect(Number.isNaN(positions.getX(i))).toBe(false);
      expect(Number.isNaN(positions.getY(i))).toBe(false);
      expect(Number.isNaN(positions.getZ(i))).toBe(false);
    }
  });

  it('UV corners are correct for default directions', () => {
    const mesh = createDomeScanPlane(
      makeDomeScanConfig({ scanDirection: 'cw', indexDirection: 'outward' }),
      makeVesselState() as VesselState,
      '',
    );
    expect(mesh).not.toBeNull();
    const uv = mesh!.geometry.getAttribute('uv');
    // First vertex (ix=0, iy=0) — CW: scanMapped = 1-u = 1-0 = 1; outward: indexMapped = 1-v = 1-0 = 1
    expect(uv.getX(0)).toBeCloseTo(1, 1);
    expect(uv.getY(0)).toBeCloseTo(1, 1);
  });

  it('swapping scanDirection flips U component', () => {
    const meshCW = createDomeScanPlane(
      makeDomeScanConfig({ scanDirection: 'cw' }),
      makeVesselState() as VesselState,
      '',
    );
    const meshCCW = createDomeScanPlane(
      makeDomeScanConfig({ scanDirection: 'ccw' }),
      makeVesselState() as VesselState,
      '',
    );
    const uvCW = meshCW!.geometry.getAttribute('uv');
    const uvCCW = meshCCW!.geometry.getAttribute('uv');
    // First vertex U should be flipped
    expect(uvCW.getX(0) + uvCCW.getX(0)).toBeCloseTo(1, 1);
  });

  it('swapping indexDirection flips V component', () => {
    const meshOut = createDomeScanPlane(
      makeDomeScanConfig({ indexDirection: 'outward' }),
      makeVesselState() as VesselState,
      '',
    );
    const meshIn = createDomeScanPlane(
      makeDomeScanConfig({ indexDirection: 'inward' }),
      makeVesselState() as VesselState,
      '',
    );
    const uvOut = meshOut!.geometry.getAttribute('uv');
    const uvIn = meshIn!.geometry.getAttribute('uv');
    expect(uvOut.getY(0) + uvIn.getY(0)).toBeCloseTo(1, 1);
  });

  it('sets userData with type domeScan', () => {
    const config = makeDomeScanConfig();
    const mesh = createDomeScanPlane(config, makeVesselState() as VesselState, '');
    expect(mesh!.userData.type).toBe('domeScan');
    expect(mesh!.userData.id).toBe('ds_test');
    expect(mesh!.userData.data).toBe(config.data);
  });

  it('shows selection border when selected', () => {
    const mesh = createDomeScanPlane(
      makeDomeScanConfig(),
      makeVesselState() as VesselState,
      'ds_test',
    );
    const border = mesh!.children.find(
      c => (c as THREE.Mesh).userData?.role === 'domeScan-border',
    );
    expect(border).toBeDefined();
    expect(border!.visible).toBe(true);
  });

  it('hides selection border when not selected', () => {
    const mesh = createDomeScanPlane(
      makeDomeScanConfig(),
      makeVesselState() as VesselState,
      'other_id',
    );
    const border = mesh!.children.find(
      c => (c as THREE.Mesh).userData?.role === 'domeScan-border',
    );
    expect(border).toBeDefined();
    expect(border!.visible).toBe(false);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/VesselModeler/engine/__tests__/dome-scan-geometry.test.ts`
Expected: FAIL — `createDomeScanPlane` not found

**Step 3: Implement `createDomeScanPlane`**

Append to `dome-scan-geometry.ts`. The function follows the same pattern as `createScanCompositePlane()` in `texture-manager.ts`:

```typescript
import { createHeatmapTexture } from './heatmap-texture';
import type { DomeScanConfig, VesselState } from '../types';

const heatmapCache = new Map<string, THREE.CanvasTexture>();

export function createDomeScanPlane(
  config: DomeScanConfig,
  vesselState: VesselState,
  selectedId: string,
): THREE.Mesh | null {
  if (!config.data.length || config.xAxis.length < 2 || config.yAxis.length < 2) return null;

  const RADIUS = vesselState.id / 2;
  const HEAD_DEPTH = RADIUS / (vesselState.headRatio || 2);
  const TAN_TAN = vesselState.length;
  const isVertical = vesselState.orientation === 'vertical';

  // --- Heatmap texture (cached) ---
  const cacheKey = `${config.id}_${config.colorScale}_${config.rangeMin}_${config.rangeMax}_${config.opacity}`;
  let texture = heatmapCache.get(cacheKey);
  if (!texture) {
    if (heatmapCache.size > 10) {
      const oldest = heatmapCache.keys().next().value;
      if (oldest) heatmapCache.delete(oldest);
    }
    const result = createHeatmapTexture(config.data, config.stats, {
      colorScale: config.colorScale,
      rangeMin: config.rangeMin,
      rangeMax: config.rangeMax,
      opacity: config.opacity,
      reverseScale: true,
    });
    texture = result.texture;
    heatmapCache.set(cacheKey, texture);
  }

  // --- Angular span calculations ---
  const centerPhiRad = degToRad(Math.max(PHI_EPSILON, config.centerPhi));
  const centerThetaRad = degToRad(config.centerTheta);

  const sinCenterPhi = Math.sin(centerPhiRad);
  const localCircumference = 2 * Math.PI * RADIUS * sinCenterPhi;
  const scanRangeMm = Math.abs(config.xAxis[config.xAxis.length - 1] - config.xAxis[0]);
  const rawAngularSpan = (scanRangeMm / Math.max(localCircumference, 1)) * 2 * Math.PI;
  const angularSpan = Math.min(rawAngularSpan, 2 * Math.PI);

  const effectiveRadius = Math.sqrt(RADIUS * HEAD_DEPTH);
  const indexRangeMm = Math.abs(config.yAxis[config.yAxis.length - 1] - config.yAxis[0]);
  const phiSpan = indexRangeMm / effectiveRadius;

  // --- Segment counts ---
  const segmentsX = Math.max(16, Math.round(64 * angularSpan / Math.PI));
  const segmentsY = Math.max(16, Math.round(64 * phiSpan / Math.PI));

  // --- Build geometry ---
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const surfaceOffset = 2;
  const TAN_TAN_HALF = TAN_TAN / 2;

  const headSign = config.head === 'right' ? 1 : -1;
  const tangentLineMm = config.head === 'right' ? TAN_TAN : 0;

  for (let iy = 0; iy <= segmentsY; iy++) {
    const v = iy / segmentsY;
    const phiOffset = (v - 0.5) * phiSpan;
    const currentPhiRad = centerPhiRad + phiOffset;
    const clampedPhiDeg = Math.max(PHI_EPSILON, Math.min(90, radToDeg(currentPhiRad)));

    for (let ix = 0; ix <= segmentsX; ix++) {
      const u = ix / segmentsX;
      const thetaOffset = (u - 0.5) * angularSpan;
      const currentThetaDeg = radToDeg(centerThetaRad + thetaOffset);

      const local = domeLocalFromPhiTheta(clampedPhiDeg, currentThetaDeg, RADIUS, HEAD_DEPTH);

      const rScaled = (local.rLocalMm + surfaceOffset) * SCALE;
      const axialPosMm = tangentLineMm + headSign * local.axialMm;
      const axialGlobal = (axialPosMm - TAN_TAN_HALF) * SCALE;

      let x: number, y: number, z: number;
      if (isVertical) {
        x = rScaled * Math.cos(local.thetaRad);
        y = axialGlobal;
        z = rScaled * Math.sin(local.thetaRad);
      } else {
        x = axialGlobal;
        y = rScaled * Math.sin(local.thetaRad);
        z = rScaled * Math.cos(local.thetaRad);
      }
      vertices.push(x, y, z);

      const scanMapped = config.scanDirection === 'ccw' ? u : 1 - u;
      const indexMapped = config.indexDirection === 'inward' ? v : 1 - v;
      uvs.push(scanMapped, indexMapped);
    }
  }

  // Index buffer — standard quad triangulation
  const stride = segmentsX + 1;
  for (let iy = 0; iy < segmentsY; iy++) {
    for (let ix = 0; ix < segmentsX; ix++) {
      const a = iy * stride + ix;
      const b = a + 1;
      const c = a + stride + 1;
      const d = a + stride;
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 2;
  mesh.userData = {
    type: 'domeScan',
    id: config.id,
    data: config.data,
    xAxis: config.xAxis,
    yAxis: config.yAxis,
    stats: config.stats,
    width: config.xAxis.length,
    height: config.yAxis.length,
    scanDirection: config.scanDirection,
    indexDirection: config.indexDirection,
    head: config.head,
    centerPhi: config.centerPhi,
    centerTheta: config.centerTheta,
  };

  // --- Selection border ---
  const borderScale = 1.08;
  const borderGeometry = geometry.clone();
  const borderPositions = borderGeometry.getAttribute('position');
  const mainPositions = geometry.getAttribute('position');
  for (let i = 0; i < borderPositions.count; i++) {
    borderPositions.setXYZ(
      i,
      mainPositions.getX(i) * borderScale,
      mainPositions.getY(i) * borderScale,
      mainPositions.getZ(i) * borderScale,
    );
  }
  const borderMaterial = new THREE.MeshBasicMaterial({
    color: 0x00bfff,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const borderMesh = new THREE.Mesh(borderGeometry, borderMaterial);
  borderMesh.renderOrder = 1;
  borderMesh.visible = config.id === selectedId;
  borderMesh.userData = { role: 'domeScan-border' };
  mesh.add(borderMesh);

  return mesh;
}

export function clearDomeHeatmapCache(): void {
  heatmapCache.clear();
}
```

**Step 4: Run tests**

Run: `npx vitest run src/components/VesselModeler/engine/__tests__/dome-scan-geometry.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/components/VesselModeler/engine/dome-scan-geometry.ts src/components/VesselModeler/engine/__tests__/dome-scan-geometry.test.ts
git commit -m "feat(vessel-modeler): add createDomeScanPlane mesh factory with tests"
```

---

## Task 4: Wire into `buildVesselScene()` and `ThreeViewport`

**Files:**
- Modify: `src/components/VesselModeler/engine/vessel-geometry.ts`
- Modify: `src/components/VesselModeler/ThreeViewport.tsx`

**Step 1: Extend `BuildSceneResult`**

In `vessel-geometry.ts`, add `domeScanMeshes` to the interface (after `scanCompositeMeshes` at line ~32):

```typescript
export interface BuildSceneResult {
  vesselGroup: THREE.Group;
  nozzleMeshes: THREE.Object3D[];
  lugMeshes: THREE.Object3D[];
  saddleMeshes: THREE.Object3D[];
  textureMeshes: THREE.Mesh[];
  scanCompositeMeshes: THREE.Mesh[];
  domeScanMeshes: THREE.Mesh[];
  gizmoMeshes: THREE.Object3D[];
}
```

**Step 2: Add `selectedDomeScanId` parameter to `buildVesselScene`**

After the `selectedScanCompositeId` parameter (line ~347), add:

```typescript
selectedDomeScanId: string = '',
```

**Step 3: Build dome scan meshes in `buildVesselScene`**

After the scan composite mesh loop (after line ~691), add:

```typescript
// --- Dome scan composites ---
const domeScanMeshes: THREE.Mesh[] = [];
if (state.vesselShape !== 'pipe') {
  for (const ds of (state.domeScanComposites ?? [])) {
    if (!ds.orientationConfirmed) continue;
    const mesh = createDomeScanPlane(ds, state, selectedDomeScanId);
    if (mesh) {
      vesselGroup.add(mesh);
      domeScanMeshes.push(mesh);
    }
  }
}
```

Import `createDomeScanPlane` from `./dome-scan-geometry` at the top of the file.

**Step 4: Return `domeScanMeshes` in the result**

At the return statement (line ~712), add `domeScanMeshes`:

```typescript
return { vesselGroup, nozzleMeshes, lugMeshes, saddleMeshes, textureMeshes, scanCompositeMeshes, domeScanMeshes, gizmoMeshes };
```

**Step 5: Wire in ThreeViewport**

In `ThreeViewport.tsx`:

1. Add `selectedDomeScanId` prop (extract from the selection state in VesselModeler, or pass via `vesselState`).

2. In the `rebuildScene()` call to `buildVesselScene()` (line ~334-348), pass the new `selectedDomeScanId` parameter.

3. After assigning `scanCompositeMeshes` to the interaction manager (line ~911), add:
```typescript
interactionRef.current.domeScanMeshes = result.domeScanMeshes;
```

4. In `structuralHash()` (line ~35-51), add dome scans:
```typescript
domeScanComposites: (s.domeScanComposites ?? []).map(ds => ({
  id: ds.id, hasData: ds.data.length > 0, head: ds.head,
  centerPhi: ds.centerPhi, centerTheta: ds.centerTheta,
  scanDirection: ds.scanDirection, indexDirection: ds.indexDirection,
  orientationConfirmed: ds.orientationConfirmed,
  colorScale: ds.colorScale, rangeMin: ds.rangeMin, rangeMax: ds.rangeMax, opacity: ds.opacity,
})),
```

5. In the Tier 2 selection highlight path (around lines 1041-1049 where scan borders are toggled), add dome scan border toggling:
```typescript
// Dome scan borders
buildResultRef.current.domeScanMeshes.forEach(m => {
  const border = m.children.find(c => (c as THREE.Mesh).userData?.role === 'domeScan-border');
  if (border) border.visible = m.userData.id === selectedDomeScanId;
});
```

**Step 6: Run typecheck + build**

Run: `npx tsc --noEmit && npx vite build`
Expected: PASS

**Step 7: Commit**

```bash
git add src/components/VesselModeler/engine/vessel-geometry.ts src/components/VesselModeler/ThreeViewport.tsx
git commit -m "feat(vessel-modeler): wire dome scan meshes into scene build and viewport"
```

---

## Task 5: Add Hover Tooltip for Dome Scans

**Files:**
- Modify: `src/components/VesselModeler/engine/interaction-manager.ts`
- Modify: `src/components/VesselModeler/VesselModeler.tsx`

**Step 1: Add `domeScanMeshes` property to InteractionManager**

Near `scanCompositeMeshes` (line ~114), add:

```typescript
domeScanMeshes: THREE.Mesh[] = [];
```

**Step 2: Add `onDomeScanHover` callback**

In the callbacks interface (near line ~54), add:

```typescript
onDomeScanHover: (info: { scanId: string; thickness: number | null; phiDeg: number; thetaDeg: number; row: number; col: number; screenX: number; screenY: number } | null) => void;
```

**Step 3: Add dome scan raycast in `onPointerMove`**

After the existing scan composite hover block (after line ~533), add:

```typescript
// Dome scan hover
if (this.domeScanMeshes.length > 0) {
  const domeHits = this.raycaster.intersectObjects(this.domeScanMeshes, false);
  if (domeHits.length > 0) {
    const hit = domeHits[0];
    const uv = hit.uv;
    const ud = hit.object.userData;
    if (uv && ud.type === 'domeScan' && ud.data) {
      const col = Math.min(Math.floor(uv.x * ud.width), ud.width - 1);
      const row = Math.min(Math.floor((1 - uv.y) * ud.height), ud.height - 1);
      const thickness = ud.data[row]?.[col] ?? null;
      this.callbacks.onDomeScanHover({
        scanId: ud.id,
        thickness,
        phiDeg: ud.centerPhi,
        thetaDeg: ud.centerTheta,
        row, col,
        screenX: event.clientX,
        screenY: event.clientY,
      });
      return; // skip scan composite hover if dome scan is on top
    }
  } else if (this.scanCompositeMeshes.length === 0) {
    // Clear dome hover only if no shell scan hover can clear it
    this.callbacks.onDomeScanHover(null);
  }
}
```

**Step 4: Wire callback in ThreeViewport**

In the `InteractionManager` constructor callback object (line ~178-221), add:

```typescript
onDomeScanHover: (info) => callbacksRef.current.onDomeScanHover?.(info),
```

**Step 5: Handle dome hover in VesselModeler**

In `VesselModeler.tsx`, add a `handleDomeScanHover` callback and wire it into the callbacks object. The hover data structure can reuse the existing tooltip UI with dome-specific labels. Add dome hover info to `UIState.hoverData` (or a parallel field). Display:

```
Thickness: 12.4 mm
φ: 34.2° from apex
θ: 127.5° (position around dome)
```

**Step 6: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 7: Commit**

```bash
git add src/components/VesselModeler/engine/interaction-manager.ts src/components/VesselModeler/ThreeViewport.tsx src/components/VesselModeler/VesselModeler.tsx
git commit -m "feat(vessel-modeler): add dome scan hover tooltip with φ/θ coordinates"
```

---

## Task 6: Create `DomeScanSection.tsx` Sidebar Component

**Files:**
- Create: `src/components/VesselModeler/sidebar/DomeScanSection.tsx`
- Modify: `src/components/VesselModeler/SidebarPanel.tsx`
- Modify: `src/components/VesselModeler/VesselModeler.tsx`

**Step 1: Create `DomeScanSection.tsx`**

Follow the `ScanCompositeSection.tsx` pattern (335 lines). The dome section is simpler — no cloud import modal, no gizmo, just sidebar-entered placement controls:

```typescript
import { useState } from 'react';
import type { DomeScanConfig, VesselState } from '../types';

export interface DomeScanSectionProps {
  vesselState: VesselState;
  selectedDomeScanId: string;
  onSelectDomeScan: (id: string) => void;
  onAddDomeScan: (config: DomeScanConfig) => void;
  onUpdateDomeScan: (id: string, updates: Partial<DomeScanConfig>) => void;
  onRemoveDomeScan: (id: string) => void;
  isOpen?: boolean;
  onToggle?: () => void;
}
```

Controls per dome scan (when selected):
- **Head:** Left / Right toggle
- **Center φ:** slider 0–90° + numeric input
- **Center θ:** slider 0–360° + numeric input
- **Scan direction:** CW / CCW toggle
- **Index direction:** Outward / Inward toggle
- **Colorscale** dropdown (Jet, Viridis, Hot, Blues)
- **Opacity** slider (0–1)
- **Range min/max** inputs (null = Auto)
- **Remove** button

The "Add Dome Scan" button triggers the companion file picker (same as shell scans via `window.__companion_pick_file`). On file load, creates a `DomeScanConfig` with defaults: `centerPhi: 45, centerTheta: 90, head: 'left', scanDirection: 'cw', indexDirection: 'outward', orientationConfirmed: true`.

**Step 2: Wire into SidebarPanel**

In `SidebarPanel.tsx`:

1. Import `DomeScanSection` from `./sidebar/DomeScanSection`
2. Add props: `selectedDomeScanId`, `onSelectDomeScan`, `onAddDomeScan`, `onUpdateDomeScan`, `onRemoveDomeScan`
3. Inside the "Scan Overlay" accordion section (after `ScanCompositeSection`), add:

```tsx
{vesselState.vesselShape !== 'pipe' && (
  <DomeScanSection
    vesselState={vesselState}
    selectedDomeScanId={selectedDomeScanId}
    onSelectDomeScan={onSelectDomeScan}
    onAddDomeScan={onAddDomeScan}
    onUpdateDomeScan={onUpdateDomeScan}
    onRemoveDomeScan={onRemoveDomeScan}
    isOpen={activeScanOverlaySub === 'domeScanComposites'}
    onToggle={() => setActiveScanOverlaySub(
      activeScanOverlaySub === 'domeScanComposites' ? null : 'domeScanComposites'
    )}
  />
)}
```

**Step 3: Add dome scan state management in VesselModeler**

In `VesselModeler.tsx`:

1. Add `selectedDomeScanId` to `SelectionState` (alongside `scanCompositeId`)
2. Add reducer actions: `SELECT_DOME_SCAN`
3. Add handlers:
   - `handleAddDomeScan`: append to `vesselState.domeScanComposites`
   - `handleUpdateDomeScan`: update by id in `vesselState.domeScanComposites`
   - `handleRemoveDomeScan`: filter out by id, clear heatmap cache
4. Wire callbacks to `SidebarPanel` and `ThreeViewport`

**Step 4: Run typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/components/VesselModeler/sidebar/DomeScanSection.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/VesselModeler/sidebar/DomeScanSection.tsx src/components/VesselModeler/SidebarPanel.tsx src/components/VesselModeler/VesselModeler.tsx
git commit -m "feat(vessel-modeler): add dome scan sidebar section with placement controls"
```

---

## Task 7: Save/Load Hydration

**Files:**
- Modify: `src/components/VesselModeler/VesselModeler.tsx` (load path)
- Modify: `src/services/vessel-model-service.ts` (if save strips data like shell scans)

**Step 1: Add hydration guard on load**

In `VesselModeler.tsx`, wherever vessel state is loaded/deserialized (the hydration path around lines 632-656), add:

```typescript
// Hydrate dome scans — default to [] for older saves
loadedState.domeScanComposites = loadedState.domeScanComposites ?? [];
```

This should go next to the existing scan composite hydration logic.

**Step 2: Ensure save path includes dome scans**

In the save path (lines ~1562-1581), verify that `domeScanComposites` is included in the serialized state. Since `VesselState` is serialized as a JSON blob, it should be automatic — but add a test:

```typescript
// In the save serializer, ensure dome scans are included minus data (like shell scans)
domeScanComposites: (vessel.domeScanComposites ?? []).map(ds => ({
  ...ds,
  data: [], // data re-fetched from cloud on load (Phase 2)
})),
```

For Phase 1 (no cloud sync), dome scans with local data should be saved WITH data since there's no cloud re-fetch. Confirm behavior matches shell scan pattern.

**Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/VesselModeler/VesselModeler.tsx src/services/vessel-model-service.ts
git commit -m "feat(vessel-modeler): add dome scan save/load hydration"
```

---

## Task 8: Wall Loss Panel Note

**Files:**
- Modify: `src/components/VesselModeler/WallLossPanel.tsx`

**Step 1: Add dome scan note**

After the total row (line 112), before the closing `</div>`:

```tsx
{(vesselState.domeScanComposites ?? []).length > 0 && (
  <div className="vm-wallloss-note" style={{ fontSize: '0.7rem', opacity: 0.7, padding: '4px 8px', fontStyle: 'italic' }}>
    Note: Dome scan data is not included in wall loss distribution (shell scans only).
  </div>
)}
```

**Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/VesselModeler/WallLossPanel.tsx
git commit -m "feat(vessel-modeler): add wall loss panel note for excluded dome scans"
```

---

## Task 9: Report Scan Log Defensive Row

**Files:**
- Modify: `src/components/VesselModeler/engine/report-generator.ts`

**Step 1: Add dome scan count row**

In `buildScanLogTable()` (after line ~614, before the footnote paragraph), add:

```typescript
const domeScanCount = (vessel.domeScanComposites ?? []).filter(ds => ds.orientationConfirmed).length;
if (domeScanCount > 0) {
  children.push(new Paragraph({
    children: [textRun(`Dome scans: ${domeScanCount} (see viewport images)`, { size: FONT_SIZE_SMALL, italics: true })],
    spacing: { before: 80 },
  }));
}
```

**Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/VesselModeler/engine/report-generator.ts
git commit -m "feat(vessel-modeler): add dome scan count row in report scan log"
```

---

## Task 10: Integration Test and Build Verification

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

**Step 2: Run full build**

Run: `npm run build`
Expected: PASS with no TypeScript or build errors

**Step 3: Run lint**

Run: `npm run lint`
Expected: No new warnings/errors

**Step 4: Manual verification**

Start dev server with `npm run dev`, navigate to Vessel Modeler:
- Create a vessel (default 3000mm ID, 8000mm length, 2:1 head)
- Verify "Dome Scans" sub-section appears in Scan Overlay accordion
- Verify it's hidden when vessel shape is 'pipe'
- If test data available: add a dome scan, adjust φ/θ sliders, verify heatmap renders on the correct dome head
- Verify save/load round-trip preserves dome scan config
- Verify wall loss panel shows note when dome scans exist
- Hover over dome scan mesh and verify tooltip shows φ/θ coordinates

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat(vessel-modeler): dome end scan overlay system — Phase 1 complete"
```

---

## File Summary

| File | Action | Task |
|------|--------|------|
| `src/components/VesselModeler/types.ts` | Modify | 1 |
| `src/components/VesselModeler/engine/dome-scan-geometry.ts` | Create | 2, 3 |
| `src/components/VesselModeler/engine/__tests__/dome-scan-geometry.test.ts` | Create | 2, 3 |
| `src/components/VesselModeler/engine/vessel-geometry.ts` | Modify | 4 |
| `src/components/VesselModeler/ThreeViewport.tsx` | Modify | 4, 5 |
| `src/components/VesselModeler/engine/interaction-manager.ts` | Modify | 5 |
| `src/components/VesselModeler/VesselModeler.tsx` | Modify | 5, 6, 7 |
| `src/components/VesselModeler/sidebar/DomeScanSection.tsx` | Create | 6 |
| `src/components/VesselModeler/SidebarPanel.tsx` | Modify | 6 |
| `src/components/VesselModeler/WallLossPanel.tsx` | Modify | 8 |
| `src/components/VesselModeler/engine/report-generator.ts` | Modify | 9 |
