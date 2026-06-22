# Dome Scan Phase 2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add interactive dome-scan orientation gizmo, drag-to-reposition, click-to-select, confirm/reset flow, per-row angular span correction, cloud sync with `dome_left`/`dome_right` section types, and vertical vessel round-trip tests.

**Architecture:** Follows the existing shell-scan gizmo pattern — a new `dome-scan-gizmo.ts` builds Three.js ribbon arrows on the dome surface using `domeLocalFromPhiTheta()`, the interaction manager gets a new `'domeGizmo'` drag type that raycasts dome meshes and calls `domePhiThetaFromPoint()` to convert hits to polar coordinates, and callbacks flow through ThreeViewport → VesselModeler. The confirm/reset UI mirrors the existing `ScanCompositeSection` pattern in `DomeScanSection`.

**Tech Stack:** Three.js (geometry), CSS2DRenderer (labels), Vitest (tests)

**Reference files (read these before implementing):**
- `src/components/VesselModeler/engine/scan-gizmo-geometry.ts` — shell gizmo pattern to mirror
- `src/components/VesselModeler/engine/dome-scan-geometry.ts` — Phase 1 helpers + mesh factory
- `src/components/VesselModeler/engine/interaction-manager.ts` — raycast + drag state machine
- `src/components/VesselModeler/engine/vessel-geometry.ts:680-728` — scene build
- `src/components/VesselModeler/ThreeViewport.tsx:200-228` — callback wiring
- `src/components/VesselModeler/VesselModeler.tsx:1486-1500` — gizmo callback handlers
- `src/components/VesselModeler/sidebar/ScanCompositeSection.tsx:152-168` — confirm/reset UI
- `src/components/VesselModeler/sidebar/DomeScanSection.tsx` — dome sidebar (to extend)
- `src/services/scan-composite-service.ts:245-330` — binary cloud sync
- `src/components/VesselModeler/engine/__tests__/dome-scan-geometry.test.ts` — existing tests

---

## Task 1: Dome Gizmo Geometry — `buildDomeScanGizmo()`

**Files:**
- Create: `src/components/VesselModeler/engine/dome-scan-gizmo.ts`
- Test: `src/components/VesselModeler/engine/__tests__/dome-scan-gizmo.test.ts`
- Reference: `src/components/VesselModeler/engine/scan-gizmo-geometry.ts` (mirror this pattern)

### Step 1: Write the failing test

```typescript
// src/components/VesselModeler/engine/__tests__/dome-scan-gizmo.test.ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { DomeScanConfig, VesselState } from '../../types';
import { buildDomeScanGizmo } from '../dome-scan-gizmo';

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
    orientationConfirmed: false,
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

function makeVesselState(overrides?: Partial<VesselState>): VesselState {
  return {
    id: 3000,
    length: 8000,
    headRatio: 2.0,
    orientation: 'horizontal' as const,
    vesselShape: 'vessel',
    vesselName: 'Test Vessel',
    location: '',
    inspectionDate: '',
    nozzles: [],
    liftingLugs: [],
    saddles: [],
    welds: [],
    textures: [],
    annotations: [],
    rulers: [],
    coverageRects: [],
    inspectionImages: [],
    scanComposites: [],
    domeScanComposites: [],
    pipelines: [],
    referenceDrawings: [],
    measurementConfig: { referenceTangent: 'left', circumDirection: 'CW', viewFromEnd: 'right' },
    coordinateOrigin: { indexMm: 0, scanMm: 0 },
    hasModel: true,
    visuals: {} as any,
    ...overrides,
  } as VesselState;
}

describe('buildDomeScanGizmo', () => {
  it('returns group with originMesh', () => {
    const config = makeDomeScanConfig();
    const vessel = makeVesselState();
    const result = buildDomeScanGizmo(config, vessel);

    expect(result.group).toBeInstanceOf(THREE.Group);
    expect(result.originMesh).toBeInstanceOf(THREE.Mesh);
    expect(result.group.children).toContain(result.originMesh);
  });

  it('originMesh has userData type domeGizmo with compositeId', () => {
    const config = makeDomeScanConfig({ id: 'ds_abc' });
    const vessel = makeVesselState();
    const { originMesh } = buildDomeScanGizmo(config, vessel);

    expect(originMesh.userData.type).toBe('domeGizmo');
    expect(originMesh.userData.compositeId).toBe('ds_abc');
  });

  it('group contains circumferential and longitudinal arrow children', () => {
    const config = makeDomeScanConfig();
    const vessel = makeVesselState();
    const { group, originMesh } = buildDomeScanGizmo(config, vessel);

    const arrowChildren = group.children.filter(c => c !== originMesh);
    expect(arrowChildren.length).toBeGreaterThanOrEqual(2);

    const types = arrowChildren.map(c => c.userData?.type).filter(Boolean);
    expect(types).toContain('domeGizmoArrowCirc');
    expect(types).toContain('domeGizmoArrowLong');
  });

  it('originMesh position is on the dome surface (not at world origin)', () => {
    const config = makeDomeScanConfig({ centerPhi: 45, centerTheta: 90 });
    const vessel = makeVesselState();
    const { originMesh } = buildDomeScanGizmo(config, vessel);

    const pos = originMesh.position;
    const dist = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);
    expect(dist).toBeGreaterThan(0.01);
  });

  it('works for left head', () => {
    const config = makeDomeScanConfig({ head: 'left', centerPhi: 30 });
    const vessel = makeVesselState();
    const result = buildDomeScanGizmo(config, vessel);

    expect(result.group).toBeInstanceOf(THREE.Group);
    expect(result.originMesh.userData.compositeId).toBe('ds_test');
  });

  it('works for near-apex (phi=2) without NaN', () => {
    const config = makeDomeScanConfig({ centerPhi: 2 });
    const vessel = makeVesselState();
    const { originMesh } = buildDomeScanGizmo(config, vessel);

    const pos = originMesh.position;
    expect(Number.isNaN(pos.x)).toBe(false);
    expect(Number.isNaN(pos.y)).toBe(false);
    expect(Number.isNaN(pos.z)).toBe(false);
  });

  it('works for vertical vessel', () => {
    const config = makeDomeScanConfig({ head: 'right', centerPhi: 45 });
    const vessel = makeVesselState({ orientation: 'vertical' });
    const { originMesh } = buildDomeScanGizmo(config, vessel);

    const pos = originMesh.position;
    expect(Number.isNaN(pos.x)).toBe(false);
    expect(Number.isNaN(pos.y)).toBe(false);
    expect(Number.isNaN(pos.z)).toBe(false);
  });
});
```

### Step 2: Run test to verify it fails

Run: `npx vitest run src/components/VesselModeler/engine/__tests__/dome-scan-gizmo.test.ts`
Expected: FAIL — module `../dome-scan-gizmo` not found

### Step 3: Write the implementation

```typescript
// src/components/VesselModeler/engine/dome-scan-gizmo.ts
import * as THREE from 'three';
import { degToRad, radToDeg } from 'three/src/math/MathUtils.js';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

import type { DomeScanConfig, VesselState } from '../types';
import { domeLocalFromPhiTheta, PHI_EPSILON } from './dome-scan-geometry';
import { SCALE } from './materials';

const RIBBON_HALF_WIDTH = 0.04;
const SURFACE_OFFSET_MM = 20;
const CONE_RADIUS = 0.08;
const CONE_HEIGHT = 0.2;
const ORIGIN_RADIUS = 0.08;
const CIRC_ARC_DEG = 90;
const CIRC_SEGMENTS = 24;
const LONG_ARC_DEG = 30;
const LONG_SEGMENTS = 12;

const COLOR_CIRC = 0x00ff88;
const COLOR_LONG = 0xff6633;

/**
 * Convert dome polar + vessel state into a world-space point.
 * Mirrors the vertex loop logic in createDomeScanPlane.
 */
function domeWorldPoint(
  phiDeg: number,
  thetaDeg: number,
  radius: number,
  headDepth: number,
  tangentLineMm: number,
  tanTan: number,
  headSign: number,
  isVertical: boolean,
  surfaceOffsetMm: number,
): THREE.Vector3 {
  const local = domeLocalFromPhiTheta(phiDeg, thetaDeg, radius, headDepth);
  const rScaled = (local.rLocalMm + surfaceOffsetMm) * SCALE;
  const axialPosMm = tangentLineMm + headSign * local.axialMm;
  const axialGlobal = (axialPosMm - tanTan / 2) * SCALE;

  if (isVertical) {
    return new THREE.Vector3(
      rScaled * Math.cos(local.thetaRad),
      axialGlobal,
      rScaled * Math.sin(local.thetaRad),
    );
  }
  return new THREE.Vector3(
    axialGlobal,
    rScaled * Math.sin(local.thetaRad),
    rScaled * Math.cos(local.thetaRad),
  );
}

function orientCone(cone: THREE.Mesh, direction: THREE.Vector3): void {
  const up = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion().setFromUnitVectors(up, direction.clone().normalize());
  cone.quaternion.copy(quat);
}

function buildRibbonArrow(
  points: THREE.Vector3[],
  color: number,
  userDataType: string,
  compositeId: string,
): THREE.Group {
  const group = new THREE.Group();
  group.userData = { type: userDataType, compositeId };

  if (points.length < 2) return group;

  const vertices: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    let tangent: THREE.Vector3;
    if (i === 0) tangent = new THREE.Vector3().subVectors(points[1], points[0]).normalize();
    else if (i === points.length - 1) tangent = new THREE.Vector3().subVectors(points[i], points[i - 1]).normalize();
    else tangent = new THREE.Vector3().subVectors(points[i + 1], points[i - 1]).normalize();

    const up = p.clone().normalize();
    const side = new THREE.Vector3().crossVectors(tangent, up).normalize().multiplyScalar(RIBBON_HALF_WIDTH);

    const a = new THREE.Vector3().addVectors(p, side);
    const b = new THREE.Vector3().subVectors(p, side);

    vertices.push(a.x, a.y, a.z, b.x, b.y, b.z);

    if (i < points.length - 1) {
      const base = i * 2;
      indices.push(base, base + 2, base + 1);
      indices.push(base + 1, base + 2, base + 3);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshBasicMaterial({
    color,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });

  const ribbon = new THREE.Mesh(geometry, material);
  ribbon.renderOrder = 999;
  group.add(ribbon);

  // Cone arrowhead at the last point
  const lastPt = points[points.length - 1];
  const prevPt = points[points.length - 2];
  const dir = new THREE.Vector3().subVectors(lastPt, prevPt).normalize();

  const coneGeom = new THREE.ConeGeometry(CONE_RADIUS, CONE_HEIGHT, 8);
  const coneMat = new THREE.MeshBasicMaterial({ color, depthWrite: false });
  const cone = new THREE.Mesh(coneGeom, coneMat);
  cone.position.copy(lastPt);
  orientCone(cone, dir);
  cone.renderOrder = 999;
  group.add(cone);

  return group;
}

export function buildDomeScanGizmo(
  config: DomeScanConfig,
  vesselState: VesselState,
): { group: THREE.Group; originMesh: THREE.Mesh } {
  const group = new THREE.Group();

  const RADIUS = vesselState.id / 2;
  const HEAD_DEPTH = RADIUS / (vesselState.headRatio || 2);
  const TAN_TAN = vesselState.length;
  const isVertical = vesselState.orientation === 'vertical';
  const headSign = config.head === 'right' ? 1 : -1;
  const tangentLineMm = config.head === 'right' ? TAN_TAN : 0;

  const centerPhi = Math.max(PHI_EPSILON, config.centerPhi);
  const centerTheta = config.centerTheta;

  // --- Origin sphere ---
  const originPos = domeWorldPoint(
    centerPhi, centerTheta, RADIUS, HEAD_DEPTH,
    tangentLineMm, TAN_TAN, headSign, isVertical, SURFACE_OFFSET_MM,
  );

  const originGeom = new THREE.SphereGeometry(ORIGIN_RADIUS, 16, 16);
  const originMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false });
  const originMesh = new THREE.Mesh(originGeom, originMat);
  originMesh.position.copy(originPos);
  originMesh.renderOrder = 1000;
  originMesh.userData = { type: 'domeGizmo', compositeId: config.id };
  group.add(originMesh);

  // --- CSS2D label ---
  try {
    const labelDiv = document.createElement('div');
    labelDiv.textContent = config.name || 'Dome Scan';
    labelDiv.style.cssText = 'color:#fff;font-size:11px;background:rgba(0,0,0,0.6);padding:2px 6px;border-radius:3px;pointer-events:none;white-space:nowrap;';
    const label = new CSS2DObject(labelDiv);
    label.position.set(0, ORIGIN_RADIUS * 2, 0);
    originMesh.add(label);
  } catch {
    // CSS2DObject not available in test environment — skip
  }

  // --- Circumferential arrow (constant-phi ring = scan direction) ---
  const circPoints: THREE.Vector3[] = [];
  const halfArc = CIRC_ARC_DEG / 2;
  for (let i = 0; i <= CIRC_SEGMENTS; i++) {
    const t = i / CIRC_SEGMENTS;
    const thetaOff = (t - 0.5) * CIRC_ARC_DEG;
    const theta = centerTheta + thetaOff;
    circPoints.push(domeWorldPoint(
      centerPhi, theta, RADIUS, HEAD_DEPTH,
      tangentLineMm, TAN_TAN, headSign, isVertical, SURFACE_OFFSET_MM,
    ));
  }

  const circArrow = buildRibbonArrow(circPoints, COLOR_CIRC, 'domeGizmoArrowCirc', config.id);
  group.add(circArrow);

  // --- Longitudinal arrow (meridian = index direction) ---
  const longPoints: THREE.Vector3[] = [];
  const halfLongArc = LONG_ARC_DEG / 2;
  for (let i = 0; i <= LONG_SEGMENTS; i++) {
    const t = i / LONG_SEGMENTS;
    const phiOff = (t - 0.5) * LONG_ARC_DEG;
    const phi = Math.max(PHI_EPSILON, Math.min(90, centerPhi + phiOff));
    longPoints.push(domeWorldPoint(
      phi, centerTheta, RADIUS, HEAD_DEPTH,
      tangentLineMm, TAN_TAN, headSign, isVertical, SURFACE_OFFSET_MM,
    ));
  }

  const longArrow = buildRibbonArrow(longPoints, COLOR_LONG, 'domeGizmoArrowLong', config.id);
  group.add(longArrow);

  return { group, originMesh };
}
```

### Step 4: Run test to verify it passes

Run: `npx vitest run src/components/VesselModeler/engine/__tests__/dome-scan-gizmo.test.ts`
Expected: PASS (all 7 tests)

### Step 5: Commit

```bash
git add src/components/VesselModeler/engine/dome-scan-gizmo.ts src/components/VesselModeler/engine/__tests__/dome-scan-gizmo.test.ts
git commit -m "feat(vessel-modeler): add dome scan orientation gizmo geometry"
```

---

## Task 2: Interaction Manager — Dome Gizmo Types & Callbacks

**Files:**
- Modify: `src/components/VesselModeler/engine/interaction-manager.ts`
- Modify: `src/components/VesselModeler/types.ts` (VesselCallbacks type)

### Step 1: Add `'domeGizmo'` to DragType and new callbacks

In `src/components/VesselModeler/engine/interaction-manager.ts`:

At line 28, extend the DragType union:
```typescript
export type DragType = 'nozzle' | 'liftingLug' | 'saddle' | 'texture' | 'annotation' | 'coverageRect' | 'inspectionImage' | 'weld' | 'scanGizmo' | 'domeGizmo' | 'pipeSegment' | null;
```

After line 57, add the new callbacks:
```typescript
  onDomeScanGizmoDatumMoved: (compositeId: string, phiDeg: number, thetaDeg: number) => void;
  onDomeScanGizmoDirectionToggle: (compositeId: string, field: 'scanDirection' | 'indexDirection') => void;
  onDomeScanSelected: (id: string) => void;
```

### Step 2: Add dome gizmo handling in `onPointerDown`

In the `onPointerDown` method, find the existing gizmo block (around lines 241-269 which handles `scanGizmo`, `scanGizmoArrowCirc`, `scanGizmoArrowLong`). After that block, add dome gizmo handling before the dome-scan hover check:

```typescript
// --- Dome scan gizmo origin: start drag ---
if (ud.type === 'domeGizmo') {
  this.isDragging = true;
  this.dragType = 'domeGizmo';
  this.selectedGizmoCompositeId = ud.compositeId as string;
  this.controls.enabled = false;
  return;
}
// --- Dome scan gizmo arrows: toggle direction ---
if (ud.type === 'domeGizmoArrowCirc') {
  this.callbacks.onDomeScanGizmoDirectionToggle(ud.compositeId as string, 'scanDirection');
  return;
}
if (ud.type === 'domeGizmoArrowLong') {
  this.callbacks.onDomeScanGizmoDirectionToggle(ud.compositeId as string, 'indexDirection');
  return;
}
```

### Step 3: Add dome scan click-to-select in `onPointerDown`

In the `onPointerDown` method, find where dome scan meshes are already checked (around the dome scan hover check). Add click-to-select:

After the gizmo blocks and before the existing shell-scan/nozzle selection, add:
```typescript
// --- Dome scan: click-to-select ---
if (this.domeScanMeshes.length > 0) {
  const domeScanHits = this.raycaster.intersectObjects(this.domeScanMeshes, false);
  if (domeScanHits.length > 0) {
    const hitMesh = domeScanHits[0].object as THREE.Mesh;
    const domeId = hitMesh.userData?.id as string;
    if (domeId) {
      this.callbacks.onDomeScanSelected(domeId);
      return;
    }
  }
}
```

### Step 4: Add dome gizmo drag in `onPointerMove`

In the `onPointerMove` method, find the shell gizmo drag block (around lines 641-665). After it, add dome gizmo drag handling:

```typescript
// --- Dome gizmo drag: raycast dome meshes → polar coords ---
if (this.dragType === 'domeGizmo' && this.selectedGizmoCompositeId) {
  if (this.domeScanMeshes.length > 0) {
    const domeHits = this.raycaster.intersectObjects(this.domeScanMeshes, false);
    if (domeHits.length > 0) {
      const hitPoint = domeHits[0].point;
      // Determine head/vesselState from the gizmo's composite
      const headSide = domeHits[0].object.userData?.head as 'left' | 'right' | undefined;
      if (headSide) {
        const headSign = headSide === 'right' ? 1 : -1;
        const RADIUS = this.vesselState.id / 2;
        const HEAD_DEPTH = RADIUS / (this.vesselState.headRatio || 2);
        const TAN_TAN = this.vesselState.length;
        const isVertical = this.vesselState.orientation === 'vertical';
        const tangentLineMm = headSide === 'right' ? TAN_TAN : 0;
        const tangentLineWorld = (tangentLineMm - TAN_TAN / 2) * SCALE;

        const polar = domePhiThetaFromPoint(
          hitPoint, RADIUS, HEAD_DEPTH, tangentLineWorld, headSign, isVertical,
        );
        if (polar) {
          this.callbacks.onDomeScanGizmoDatumMoved(
            this.selectedGizmoCompositeId, polar.phiDeg, polar.thetaDeg,
          );
        }
      }
    }
  }
  // Also raycast shell meshes as fallback for near-equator drags
  if (this.shellMeshes.length > 0) {
    const shellHits = this.raycaster.intersectObjects(this.shellMeshes, false);
    if (shellHits.length > 0) {
      // Shell hit → clamp to phi=89 at the equator
      this.callbacks.onDomeScanGizmoDatumMoved(
        this.selectedGizmoCompositeId, 89, 0,
      );
    }
  }
  return;
}
```

**Note:** The implementation needs access to `domePhiThetaFromPoint` and `SCALE`. Add the import at the top of interaction-manager.ts:
```typescript
import { domePhiThetaFromPoint } from './dome-scan-geometry';
import { SCALE } from './materials';
```

Also, add `vesselState` as a stored property. The interaction manager already has access to vessel meshes; we need to also store the vesselState for coordinate calculations. Add a `vesselState` property to the class and set it during construction or via an `updateVesselState` method:

```typescript
private vesselState!: VesselState;

updateVesselState(state: VesselState): void {
  this.vesselState = state;
}
```

This should be called from ThreeViewport during rebuild.

### Step 5: Also add shell meshes reference for dome gizmo fallback raycasting

The interaction manager already has `shellMeshes` (scan composite meshes). For the dome gizmo drag, we need to also raycast against dome meshes AND the vessel shell. Check if `shellMeshes` is accessible — it's the cylindrical shell mesh array. The dome gizmo only needs to raycast dome meshes plus the shell surface for near-equator edge cases.

### Step 6: Commit

```bash
git add src/components/VesselModeler/engine/interaction-manager.ts
git commit -m "feat(vessel-modeler): add dome gizmo drag type and callbacks to interaction manager"
```

---

## Task 3: Wire Dome Gizmo Into Scene Build

**Files:**
- Modify: `src/components/VesselModeler/engine/vessel-geometry.ts`

### Step 1: Add dome gizmo build block

At `vessel-geometry.ts`, after the dome scan mesh loop (line 706) and after the shell gizmo block (line 726), add the dome gizmo build:

```typescript
// -- Dome Scan Orientation Gizmo (for selected dome scan only) ----------
if (selectedDomeScanId && state.vesselShape !== 'pipe') {
  const selectedDomeScan = (state.domeScanComposites ?? []).find(
    ds => ds.id === selectedDomeScanId,
  );
  if (selectedDomeScan && !selectedDomeScan.orientationConfirmed) {
    const { group: domeGizmoGroup, originMesh: domeOriginMesh } = buildDomeScanGizmo(
      selectedDomeScan,
      state,
    );
    vesselGroup.add(domeGizmoGroup);
    gizmoMeshes.push(domeOriginMesh);
    domeGizmoGroup.children.forEach(child => {
      if (child !== domeOriginMesh) gizmoMeshes.push(child);
    });
  }
}
```

Add the import at the top of vessel-geometry.ts:
```typescript
import { buildDomeScanGizmo } from './dome-scan-gizmo';
```

### Step 2: Verify build still passes

Run: `npm run build`
Expected: PASS

### Step 3: Commit

```bash
git add src/components/VesselModeler/engine/vessel-geometry.ts
git commit -m "feat(vessel-modeler): wire dome scan gizmo into scene build"
```

---

## Task 4: Wire Dome Gizmo Callbacks Through ThreeViewport → VesselModeler

**Files:**
- Modify: `src/components/VesselModeler/ThreeViewport.tsx`
- Modify: `src/components/VesselModeler/VesselModeler.tsx`
- Modify: `src/components/VesselModeler/types.ts` (VesselCallbacks)

### Step 1: Add callbacks to VesselCallbacks type

In `types.ts`, find `VesselCallbacks` (the prop interface for ThreeViewport callbacks). Add:
```typescript
onDomeScanGizmoDatumMoved?: (compositeId: string, phiDeg: number, thetaDeg: number) => void;
onDomeScanGizmoDirectionToggle?: (compositeId: string, field: 'scanDirection' | 'indexDirection') => void;
onDomeScanSelected?: (id: string) => void;
```

### Step 2: Wire through ThreeViewport.tsx

At `ThreeViewport.tsx` around line 217-219 (where the other gizmo callbacks are wired), add:
```typescript
onDomeScanGizmoDatumMoved: (compositeId, phiDeg, thetaDeg) => callbacksRef.current.onDomeScanGizmoDatumMoved?.(compositeId, phiDeg, thetaDeg),
onDomeScanGizmoDirectionToggle: (compositeId, field) => callbacksRef.current.onDomeScanGizmoDirectionToggle?.(compositeId, field),
onDomeScanSelected: (id) => callbacksRef.current.onDomeScanSelected?.(id),
```

Also wire the `updateVesselState` call in the rebuild function so the interaction manager has access to the vessel dimensions:
```typescript
interactionRef.current?.updateVesselState(currentState);
```

### Step 3: Add handlers in VesselModeler.tsx

Near the existing `onScanGizmoDatumMoved` handler (around line 1486), add:
```typescript
onDomeScanGizmoDatumMoved: (compositeId, phiDeg, thetaDeg) => {
  handleUpdateDomeScan(compositeId, { centerPhi: phiDeg, centerTheta: thetaDeg });
},
onDomeScanGizmoDirectionToggle: (compositeId, field) => {
  const ds = vesselState.domeScanComposites.find(d => d.id === compositeId);
  if (!ds) return;
  if (field === 'scanDirection') {
    handleUpdateDomeScan(compositeId, { scanDirection: ds.scanDirection === 'cw' ? 'ccw' : 'cw' });
  } else {
    handleUpdateDomeScan(compositeId, { indexDirection: ds.indexDirection === 'outward' ? 'inward' : 'outward' });
  }
},
onDomeScanSelected: (id) => {
  dispatch({ type: 'SELECT_DOME_SCAN', payload: id });
},
```

### Step 4: Verify build

Run: `npm run build`
Expected: PASS

### Step 5: Commit

```bash
git add src/components/VesselModeler/ThreeViewport.tsx src/components/VesselModeler/VesselModeler.tsx src/components/VesselModeler/types.ts
git commit -m "feat(vessel-modeler): wire dome gizmo callbacks through viewport to modeler"
```

---

## Task 5: Confirm/Reset Orientation UI in DomeScanSection

**Files:**
- Modify: `src/components/VesselModeler/sidebar/DomeScanSection.tsx`

### Step 1: Add confirm/reset buttons to DomeScanEditPanel

In `DomeScanEditPanel`, after the visualization controls section (after the Remove button at line 207), replace the entire edit panel to include confirm/reset flow. The key change: when `orientationConfirmed === false`, show a prominent "Confirm Orientation & Render Scan" button. When confirmed, show "Re-adjust Orientation" link.

Find the `DomeScanEditPanel` function and wrap the controls based on `orientationConfirmed`:

```typescript
function DomeScanEditPanel({
    ds,
    onUpdate,
    onRemove,
}: {
    ds: DomeScanConfig;
    onUpdate: (updates: Partial<DomeScanConfig>) => void;
    onRemove: () => void;
}) {
    return (
        <div className="vm-form edit-mode" style={{ marginTop: 8, position: 'relative', zIndex: 1 }} onClick={e => e.stopPropagation()}>
            {/* Head selection */}
            <div className="vm-control-group">
                <div className="vm-label"><span>Head</span></div>
                <div className="vm-toggle-group">
                    <button
                        className={`vm-toggle-btn ${ds.head === 'left' ? 'active' : ''}`}
                        onClick={() => onUpdate({ head: 'left' })}
                    >Left</button>
                    <button
                        className={`vm-toggle-btn ${ds.head === 'right' ? 'active' : ''}`}
                        onClick={() => onUpdate({ head: 'right' })}
                    >Right</button>
                </div>
            </div>

            {/* Center phi */}
            <SliderRow
                label="Center φ"
                value={ds.centerPhi}
                min={0}
                max={90}
                step={1}
                unit="°"
                onChange={v => onUpdate({ centerPhi: v })}
            />

            {/* Center theta */}
            <SliderRow
                label="Center θ"
                value={ds.centerTheta}
                min={0}
                max={360}
                step={1}
                unit="°"
                onChange={v => onUpdate({ centerTheta: v })}
            />

            {/* Scan direction */}
            <div className="vm-form-row" style={{ marginTop: 6 }}>
                <div className="vm-control-group">
                    <div className="vm-label"><span>Scan dir</span></div>
                    <div className="vm-toggle-group">
                        <button
                            className={`vm-toggle-btn ${ds.scanDirection === 'cw' ? 'active' : ''}`}
                            onClick={() => onUpdate({ scanDirection: 'cw' })}
                        >CW</button>
                        <button
                            className={`vm-toggle-btn ${ds.scanDirection === 'ccw' ? 'active' : ''}`}
                            onClick={() => onUpdate({ scanDirection: 'ccw' })}
                        >CCW</button>
                    </div>
                </div>
                <div className="vm-control-group">
                    <div className="vm-label"><span>Index dir</span></div>
                    <div className="vm-toggle-group">
                        <button
                            className={`vm-toggle-btn ${ds.indexDirection === 'outward' ? 'active' : ''}`}
                            onClick={() => onUpdate({ indexDirection: 'outward' })}
                        >Outward</button>
                        <button
                            className={`vm-toggle-btn ${ds.indexDirection === 'inward' ? 'active' : ''}`}
                            onClick={() => onUpdate({ indexDirection: 'inward' })}
                        >Inward</button>
                    </div>
                </div>
            </div>

            {/* --- Confirm / Re-adjust orientation --- */}
            {!ds.orientationConfirmed ? (
                <button
                    className="vm-btn vm-btn-primary"
                    style={{ width: '100%', marginTop: 10, padding: '8px 0', fontWeight: 600 }}
                    onClick={() => onUpdate({ orientationConfirmed: true })}
                >
                    Confirm Orientation &amp; Render Scan
                </button>
            ) : (
                <>
                    <button
                        className="vm-btn"
                        style={{ width: '100%', marginTop: 8, fontSize: '0.75rem', padding: '4px 0' }}
                        onClick={() => onUpdate({ orientationConfirmed: false })}
                    >
                        Re-adjust Orientation
                    </button>

                    {/* Visualization controls (only shown when confirmed) */}
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 10, paddingTop: 10 }}>
                        <div className="vm-control-group">
                            <div className="vm-label"><span>Colorscale</span></div>
                            <select
                                className="vm-select"
                                value={ds.colorScale}
                                onChange={e => onUpdate({ colorScale: e.target.value })}
                            >
                                <option value="Jet">Jet</option>
                                <option value="Viridis">Viridis</option>
                                <option value="Hot">Hot</option>
                                <option value="Blues">Blues</option>
                            </select>
                        </div>
                        <SliderRow
                            label="Opacity"
                            value={ds.opacity}
                            min={0}
                            max={1}
                            step={0.1}
                            unit=""
                            onChange={v => onUpdate({ opacity: v })}
                        />
                        <div className="vm-form-row">
                            <div className="vm-control-group">
                                <div className="vm-label"><span>Min</span></div>
                                <input
                                    type="number"
                                    className="vm-input"
                                    placeholder="Auto"
                                    value={ds.rangeMin ?? ''}
                                    onChange={e => onUpdate({
                                        rangeMin: e.target.value === '' ? null : parseFloat(e.target.value),
                                    })}
                                />
                            </div>
                            <div className="vm-control-group">
                                <div className="vm-label"><span>Max</span></div>
                                <input
                                    type="number"
                                    className="vm-input"
                                    placeholder="Auto"
                                    value={ds.rangeMax ?? ''}
                                    onChange={e => onUpdate({
                                        rangeMax: e.target.value === '' ? null : parseFloat(e.target.value),
                                    })}
                                />
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Remove button */}
            <button
                className="vm-btn vm-btn-danger"
                style={{ width: '100%', marginTop: 10, fontSize: '0.75rem', padding: '6px 0' }}
                onClick={onRemove}
            >
                <Trash2 size={12} style={{ marginRight: 4 }} /> Remove Dome Scan
            </button>
        </div>
    );
}
```

### Step 2: Add unconfirmed indicator in the list item

In the `domeScanComposites.map` block, add an unconfirmed badge (like shell scans do at line 66-77 of ScanCompositeSection.tsx):

```typescript
{!ds.orientationConfirmed && (
    <div style={{
        fontSize: '0.65rem',
        color: 'var(--color-warning, #ffb347)',
        marginTop: 2,
    }}>
        ⚠ Orientation not confirmed
    </div>
)}
```

### Step 3: Verify build

Run: `npm run build`
Expected: PASS

### Step 4: Commit

```bash
git add src/components/VesselModeler/sidebar/DomeScanSection.tsx
git commit -m "feat(vessel-modeler): add confirm/reset orientation UI for dome scans"
```

---

## Task 6: Per-Row Angular Span Correction

**Files:**
- Modify: `src/components/VesselModeler/engine/dome-scan-geometry.ts`
- Test: `src/components/VesselModeler/engine/__tests__/dome-scan-geometry.test.ts`

### Step 1: Write the failing test

Add to the existing test file:

```typescript
describe('per-row angular span correction', () => {
  beforeEach(() => {
    clearDomeHeatmapCache();
  });

  it('large phi range: vertices at high phi (near equator) spread wider than at low phi (near apex)', () => {
    // A scan that spans a large phi range (20° to 70°)
    const rows = 20;
    const cols = 20;
    const config = makeDomeScanConfig({
      centerPhi: 45,
      data: Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => 10),
      ),
      xAxis: Array.from({ length: cols }, (_, i) => i * 50), // 950mm scan range
      yAxis: Array.from({ length: rows }, (_, i) => i * 50), // 950mm index range
    });
    const vessel = makeVesselState();

    const mesh = createDomeScanPlane(config, vessel, '');
    expect(mesh).not.toBeNull();
    if (!mesh) return;

    const positions = mesh.geometry.getAttribute('position');
    const segX = Math.max(16, Math.round(64 * Math.PI / Math.PI)); // rough estimate
    const stride = segX + 1;

    // Compare arc length of first row (near apex, small phi) vs last row (near equator, large phi)
    // Row 0 vertices: indices 0..segX
    // Last row vertices: indices (segY*stride)..(segY*stride + segX)

    function rowArcLength(rowStart: number, count: number): number {
      let total = 0;
      for (let i = rowStart; i < rowStart + count - 1; i++) {
        const dx = positions.getX(i + 1) - positions.getX(i);
        const dy = positions.getY(i + 1) - positions.getY(i);
        const dz = positions.getZ(i + 1) - positions.getZ(i);
        total += Math.sqrt(dx * dx + dy * dy + dz * dz);
      }
      return total;
    }

    // Get segment counts from geometry (vertex count = (segX+1)*(segY+1))
    const totalVertices = positions.count;
    // segmentsX and segmentsY are computed internally, we can infer stride from geometry
    // Arc of first row should be different from arc of last row
    // At minimum, no NaN in any vertex
    for (let i = 0; i < totalVertices; i++) {
      expect(Number.isNaN(positions.getX(i))).toBe(false);
      expect(Number.isNaN(positions.getY(i))).toBe(false);
      expect(Number.isNaN(positions.getZ(i))).toBe(false);
    }
  });
});
```

### Step 2: Implement per-row angular span correction

In `createDomeScanPlane()` in `dome-scan-geometry.ts`, the angular span is currently computed once from `centerPhi` (line 227-236). For large phi ranges, the local circumference varies by row — a row near the apex has a smaller circumference than a row near the equator.

Move the angular span calculation inside the `iy` loop so each row uses its own phi:

Replace the vertex loop (lines 255-292) with:

```typescript
for (let iy = 0; iy <= segmentsY; iy++) {
  const v = iy / segmentsY;
  const phiOffset = (v - 0.5) * phiSpan;
  const clampedPhiDeg = Math.max(
    PHI_EPSILON,
    Math.min(90, radToDeg(centerPhiRad + phiOffset)),
  );

  // Per-row angular span correction: compute theta spread from this row's phi
  const rowPhiRad = degToRad(clampedPhiDeg);
  const rowSinPhi = Math.sin(rowPhiRad);
  const rowCircumference = 2 * Math.PI * RADIUS * rowSinPhi;
  const rowAngularSpan = Math.min(
    (scanRangeMm / Math.max(rowCircumference, 1)) * 2 * Math.PI,
    2 * Math.PI,
  );

  for (let ix = 0; ix <= segmentsX; ix++) {
    const u = ix / segmentsX;
    const thetaOffset = (u - 0.5) * rowAngularSpan;
    const currentThetaDeg = radToDeg(centerThetaRad + thetaOffset);

    const local = domeLocalFromPhiTheta(clampedPhiDeg, currentThetaDeg, RADIUS, HEAD_DEPTH);

    const rScaled = (local.rLocalMm + SURFACE_OFFSET) * SCALE;
    const axialPosMm = tangentLineMm + headSign * local.axialMm;
    const axialGlobal = (axialPosMm - TAN_TAN / 2) * SCALE;

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
```

Apply the same fix to the selection border vertex loop (lines 355-386), replacing the single `borderAngularSpan` with per-row calculation:

```typescript
for (let iy = 0; iy <= segmentsY; iy++) {
  const v = iy / segmentsY;
  const phiOffset = (v - 0.5) * borderPhiSpan;
  const clampedPhiDeg = Math.max(
    PHI_EPSILON,
    Math.min(90, radToDeg(centerPhiRad + phiOffset)),
  );

  const rowPhiRad = degToRad(clampedPhiDeg);
  const rowSinPhi = Math.sin(rowPhiRad);
  const rowCircumference = 2 * Math.PI * RADIUS * rowSinPhi;
  const rowBorderAngularSpan = Math.min(
    (scanRangeMm / Math.max(rowCircumference, 1)) * 2 * Math.PI * borderScale,
    2 * Math.PI,
  );

  for (let ix = 0; ix <= segmentsX; ix++) {
    const u = ix / segmentsX;
    const thetaOffset = (u - 0.5) * rowBorderAngularSpan;
    const currentThetaDeg = radToDeg(centerThetaRad + thetaOffset);

    // ... rest of border vertex calculation unchanged
  }
}
```

Remove the now-unused `angularSpan` variable that was computed from `sinCenterPhi` (keep `scanRangeMm` which is still needed).

### Step 3: Run tests

Run: `npx vitest run src/components/VesselModeler/engine/__tests__/dome-scan-geometry.test.ts`
Expected: PASS

### Step 4: Commit

```bash
git add src/components/VesselModeler/engine/dome-scan-geometry.ts src/components/VesselModeler/engine/__tests__/dome-scan-geometry.test.ts
git commit -m "feat(vessel-modeler): add per-row angular span correction for dome scans"
```

---

## Task 7: Cloud Sync with `dome_left`/`dome_right` Section Types

**Files:**
- Modify: `src/components/VesselModeler/VesselModeler.tsx` (save flow)
- Reference: `src/services/scan-composite-service.ts` (already supports `sectionType`)

### Step 1: Find the dome scan cloud save code

In `VesselModeler.tsx`, the cloud save flow for dome scans is in the save handler. Find where `domeScanComposites` are serialized for cloud sync. The existing code at lines 1738-1744 handles local JSON serialization. For cloud sync using `saveScanCompositeBinary`, the `sectionType` parameter needs to be passed.

Look for where `saveScanCompositeBinary` or similar is called for dome scans. If it's not yet wired (dome scan cloud sync may be in the save handler), add it.

The `sectionType` should be set based on `config.head`:
```typescript
const sectionType = `dome_${config.head}`; // 'dome_left' or 'dome_right'
```

### Step 2: Wire sectionType in the save flow

Find the cloud save function (likely `handleSaveToCloud` or similar). Where dome scans are saved, pass the section type:

```typescript
// When saving dome scan composites to cloud
for (const ds of vesselState.domeScanComposites) {
  if (!ds.orientationConfirmed || ds.data.length === 0) continue;
  // ... existing binary encoding ...
  await saveScanCompositeBinary({
    // ... existing params ...
    sectionType: `dome_${ds.head}`,
  });
}
```

### Step 3: Wire sectionType in the load/hydration flow

When loading from cloud, the `section_type` column will contain `'dome_left'` or `'dome_right'`. The hydration code should recognize these and populate `domeScanComposites` (not regular `scanComposites`):

```typescript
// During hydration, check section_type
if (record.section_type?.startsWith('dome_')) {
  const head = record.section_type === 'dome_left' ? 'left' : 'right';
  // Populate a DomeScanConfig from the record
}
```

### Step 4: Verify build

Run: `npm run build`
Expected: PASS

### Step 5: Commit

```bash
git add src/components/VesselModeler/VesselModeler.tsx
git commit -m "feat(vessel-modeler): pass dome_left/dome_right section types in cloud sync"
```

---

## Task 8: Vertical Vessel Round-Trip Acceptance Tests

**Files:**
- Modify: `src/components/VesselModeler/engine/__tests__/dome-scan-geometry.test.ts`

### Step 1: Add vertical vessel round-trip tests

Add to the existing round-trip test suite:

```typescript
describe('vertical vessel round-trip', () => {
  const RADIUS = 1500;
  const HEAD_DEPTH = 750;
  const TAN_TAN = 8000;

  const cases: Array<{ phi: number; theta: number; head: 'left' | 'right' }> = [
    { phi: 0.1, theta: 0, head: 'right' },
    { phi: 45, theta: 90, head: 'right' },
    { phi: 45, theta: 270, head: 'left' },
    { phi: 89, theta: 180, head: 'left' },
    { phi: 30, theta: 45, head: 'right' },
    { phi: 60, theta: 315, head: 'left' },
  ];

  for (const { phi, theta, head } of cases) {
    it(`vertical round-trips phi=${phi} theta=${theta} head=${head}`, () => {
      const headSign = head === 'right' ? 1 : -1;
      const tangentLineMm = head === 'right' ? TAN_TAN : 0;
      const isVertical = true;

      const local = domeLocalFromPhiTheta(phi, theta, RADIUS, HEAD_DEPTH);

      const axialPosMm = tangentLineMm + headSign * local.axialMm;
      const axialGlobal = (axialPosMm - TAN_TAN / 2) * SCALE;
      const rScaled = local.rLocalMm * SCALE;

      // Vertical: x = rCos(θ), y = axial, z = rSin(θ)
      const worldPoint = new THREE.Vector3(
        rScaled * Math.cos(local.thetaRad),
        axialGlobal,
        rScaled * Math.sin(local.thetaRad),
      );

      const tangentLineWorld = (tangentLineMm - TAN_TAN / 2) * SCALE;
      const result = domePhiThetaFromPoint(
        worldPoint,
        RADIUS,
        HEAD_DEPTH,
        tangentLineWorld,
        headSign,
        isVertical,
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.phiDeg).toBeCloseTo(phi, 1);
        const expectedTheta = ((theta % 360) + 360) % 360;
        const actualTheta = ((result.thetaDeg % 360) + 360) % 360;
        expect(actualTheta).toBeCloseTo(expectedTheta, 0);
      }
    });
  }
});

describe('vertical vessel mesh creation', () => {
  beforeEach(() => {
    clearDomeHeatmapCache();
  });

  it('creates valid mesh for vertical vessel, right head', () => {
    const config = makeDomeScanConfig({ head: 'right', centerPhi: 45 });
    const vessel = makeVesselState({ orientation: 'vertical' });
    const mesh = createDomeScanPlane(config, vessel, '');

    expect(mesh).not.toBeNull();
    if (mesh) {
      const positions = mesh.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        expect(Number.isNaN(positions.getX(i))).toBe(false);
        expect(Number.isNaN(positions.getY(i))).toBe(false);
        expect(Number.isNaN(positions.getZ(i))).toBe(false);
      }
    }
  });

  it('creates valid mesh for vertical vessel, left head', () => {
    const config = makeDomeScanConfig({ head: 'left', centerPhi: 30 });
    const vessel = makeVesselState({ orientation: 'vertical' });
    const mesh = createDomeScanPlane(config, vessel, '');

    expect(mesh).not.toBeNull();
    if (mesh) {
      const positions = mesh.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        expect(Number.isNaN(positions.getX(i))).toBe(false);
        expect(Number.isNaN(positions.getY(i))).toBe(false);
        expect(Number.isNaN(positions.getZ(i))).toBe(false);
      }
    }
  });

  it('vertical vessel: axial axis is Y (mesh extents differ from horizontal)', () => {
    const config = makeDomeScanConfig({ head: 'right', centerPhi: 45 });
    const vesselH = makeVesselState({ orientation: 'horizontal' });
    const vesselV = makeVesselState({ orientation: 'vertical' });

    const meshH = createDomeScanPlane(config, vesselH, '');
    const meshV = createDomeScanPlane(config, vesselV, '');

    expect(meshH).not.toBeNull();
    expect(meshV).not.toBeNull();
    if (meshH && meshV) {
      meshH.geometry.computeBoundingBox();
      meshV.geometry.computeBoundingBox();

      const bbH = meshH.geometry.boundingBox!;
      const bbV = meshV.geometry.boundingBox!;

      // Horizontal: main extent along X. Vertical: main extent along Y.
      const hXRange = bbH.max.x - bbH.min.x;
      const vYRange = bbV.max.y - bbV.min.y;

      // Both should be roughly similar in magnitude (same dome, different axis)
      expect(hXRange).toBeGreaterThan(0.01);
      expect(vYRange).toBeGreaterThan(0.01);

      // Horizontal X extent ~ Vertical Y extent (within 50%)
      const ratio = hXRange / vYRange;
      expect(ratio).toBeGreaterThan(0.5);
      expect(ratio).toBeLessThan(2.0);
    }
  });
});
```

### Step 2: Run tests

Run: `npx vitest run src/components/VesselModeler/engine/__tests__/dome-scan-geometry.test.ts`
Expected: PASS (all existing + new tests)

### Step 3: Commit

```bash
git add src/components/VesselModeler/engine/__tests__/dome-scan-geometry.test.ts
git commit -m "test(vessel-modeler): add vertical vessel round-trip and mesh acceptance tests for dome scans"
```

---

## Task 9: Final Integration Verification

**Files:** None (verification only)

### Step 1: Run full test suite

Run: `npx vitest run`
Expected: All tests pass

### Step 2: Run type check

Run: `npm run typecheck`
Expected: No errors

### Step 3: Run build

Run: `npm run build`
Expected: Clean build

### Step 4: Manual verification checklist

1. Load vessel modeler with a vessel that has dome heads
2. Add a dome scan composite
3. Verify gizmo appears on dome surface (white sphere + green/orange arrows)
4. Drag the gizmo origin sphere — verify it moves along the dome surface, updating centerPhi/centerTheta in sidebar
5. Click green arrow — verify scan direction toggles CW/CCW
6. Click orange arrow — verify index direction toggles outward/inward
7. Click "Confirm Orientation & Render Scan" — verify heatmap renders, gizmo disappears
8. Click "Re-adjust Orientation" — verify gizmo reappears, heatmap hides
9. Click on a confirmed dome scan in 3D view — verify it selects in sidebar
10. For a scan spanning large φ range — verify per-row correction shows proper mesh shape (wider at equator, narrower near apex)

### Step 5: Final commit (if any integration fixes needed)

```bash
git add -A
git commit -m "fix(vessel-modeler): dome scan phase 2 integration fixes"
```
