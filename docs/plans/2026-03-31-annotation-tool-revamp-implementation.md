# Annotation Tool Revamp — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make annotations data-aware (thickness stats from scan composites), add inspection mode with locked camera + detail panel, severity-coded borders, image attachments, and modernized labels.

**Architecture:** Extends the existing VesselModeler annotation system. New types added to `types.ts`, new computation engine for sampling thickness data, new `InspectionPanel` component for the detail view, camera animation via TWEEN.js or manual lerp in the render loop, SVG overlay for stat leader lines, Supabase Storage for image attachments.

**Tech Stack:** React 18, Three.js, CSS2DRenderer, Supabase Storage, TypeScript

**Design Document:** `docs/plans/2026-03-31-annotation-tool-revamp-design.md`

---

## Task 1: Type Definitions

**Files:**
- Modify: `src/components/VesselModeler/types.ts:209-235` (AnnotationShapeConfig)
- Modify: `src/components/VesselModeler/types.ts:344-365` (VesselState)

**Step 1: Add ThicknessThresholds interface**

After `MeasurementConfig` (line 322), add:

```typescript
export interface ThicknessThresholds {
  mode: 'absolute' | 'percentage';
  /** Red severity if min thickness below this value (mm) — absolute mode */
  redBelow?: number;
  /** Yellow severity if min thickness below this value (mm) — absolute mode */
  yellowBelow?: number;
  /** Nominal wall thickness in mm — percentage mode */
  nominalThickness?: number;
  /** Red severity if min < this % of nominal — percentage mode */
  redBelowPct?: number;
  /** Yellow severity if min < this % of nominal — percentage mode */
  yellowBelowPct?: number;
}
```

**Step 2: Add AnnotationThicknessStats and AnnotationAttachment types**

After the new `ThicknessThresholds`, add:

```typescript
export interface AnnotationThicknessStats {
  min: number;
  max: number;
  avg: number;
  stdDev: number;
  /** Location of the minimum reading on the vessel */
  minPoint: { pos: number; angle: number };
  /** Location of the maximum reading on the vessel */
  maxPoint: { pos: number; angle: number };
  /** Number of valid data points sampled within the footprint */
  sampleCount: number;
}

export interface AnnotationAttachment {
  id: string;
  type: 'upload' | 'viewport-capture';
  /** Supabase Storage path */
  storagePath: string;
  caption?: string;
  capturedAt: string;
}
```

**Step 3: Extend AnnotationShapeConfig**

Add new optional fields to `AnnotationShapeConfig` (before the closing `}`):

```typescript
  /** Auto-computed thickness stats when annotation overlaps scan data */
  thicknessStats?: AnnotationThicknessStats;
  /** Image attachments (uploaded photos + viewport captures) */
  attachments?: AnnotationAttachment[];
  /** Computed severity level based on thickness thresholds */
  severityLevel?: 'red' | 'yellow' | 'green' | null;
```

**Step 4: Add thicknessThresholds to VesselState**

Add to `VesselState` interface (after `measurementConfig`):

```typescript
  thicknessThresholds?: ThicknessThresholds;
```

**Step 5: Verify build**

Run: `npm run typecheck`
Expected: PASS (new fields are all optional, no breaking changes)

**Step 6: Commit**

```bash
git add src/components/VesselModeler/types.ts
git commit -m "feat(annotations): add type definitions for thickness stats, attachments, and severity thresholds"
```

---

## Task 2: Thickness Stats Computation Engine

**Files:**
- Create: `src/components/VesselModeler/engine/annotation-stats.ts`

This is the core engine that samples scan composite data within an annotation footprint and computes statistics.

**Step 1: Create the computation module**

```typescript
import type {
  AnnotationShapeConfig,
  AnnotationThicknessStats,
  ScanCompositeConfig,
  VesselState,
  ThicknessThresholds,
} from '../types';

/**
 * Check whether a point (posMm, angleDeg) falls within an annotation footprint.
 * For circles: distance from center ≤ radius.
 * For rectangles: within half-width axially, half-height circumferentially.
 */
function isInsideAnnotation(
  ann: AnnotationShapeConfig,
  posMm: number,
  angleDeg: number,
  vesselState: VesselState,
): boolean {
  const circumference = Math.PI * vesselState.id; // mm
  const dPos = posMm - ann.pos;

  // Circumferential distance in mm (shortest arc)
  let dAngle = angleDeg - ann.angle;
  if (dAngle > 180) dAngle -= 360;
  if (dAngle < -180) dAngle += 360;
  const dCircMm = (dAngle / 360) * circumference;

  if (ann.type === 'circle') {
    const radius = ann.width / 2;
    return dPos * dPos + dCircMm * dCircMm <= radius * radius;
  }
  // rectangle
  return Math.abs(dPos) <= ann.width / 2 && Math.abs(dCircMm) <= ann.height / 2;
}

/**
 * Map a vessel position (posMm, angleDeg) to a scan composite's data grid.
 * Returns the thickness value at that point, or null if outside the composite.
 */
function sampleComposite(
  composite: ScanCompositeConfig,
  posMm: number,
  angleDeg: number,
  vesselState: VesselState,
): number | null {
  if (!composite.orientationConfirmed || !composite.data.length) return null;

  const circumference = Math.PI * vesselState.id;
  const rows = composite.data.length;
  const cols = composite.data[0]?.length ?? 0;
  if (rows === 0 || cols === 0) return null;

  // Index axis: longitudinal position
  const indexRange = composite.yAxis[composite.yAxis.length - 1] - composite.yAxis[0];
  let indexStart: number;
  if (composite.indexDirection === 'forward') {
    indexStart = composite.indexStartMm;
  } else {
    indexStart = composite.indexStartMm - indexRange;
  }
  const indexEnd = indexStart + indexRange;
  if (posMm < indexStart || posMm > indexEnd) return null;

  // Scan axis: circumferential position
  const scanRange = composite.xAxis[composite.xAxis.length - 1] - composite.xAxis[0];
  const angularSpanDeg = (scanRange / circumference) * 360;
  let scanStartAngle: number;
  if (composite.scanDirection === 'cw') {
    scanStartAngle = composite.datumAngleDeg;
  } else {
    scanStartAngle = composite.datumAngleDeg;
  }

  // Compute angular offset from datum
  let angularOffset = angleDeg - composite.datumAngleDeg;
  if (composite.scanDirection === 'cw') {
    // CW means angle decreases
    angularOffset = -angularOffset;
  }
  // Normalize to [0, 360)
  angularOffset = ((angularOffset % 360) + 360) % 360;
  if (angularOffset > angularSpanDeg) return null;

  // Map to grid coordinates
  const scanFraction = angularOffset / angularSpanDeg;
  const indexFraction = (posMm - indexStart) / indexRange;

  const col = Math.min(Math.floor(scanFraction * cols), cols - 1);
  const row = composite.indexDirection === 'reverse'
    ? Math.min(Math.floor(indexFraction * rows), rows - 1)
    : Math.min(Math.floor((1 - indexFraction) * rows), rows - 1);

  return composite.data[row]?.[col] ?? null;
}

/**
 * Compute thickness statistics for an annotation by sampling all overlapping scan composites.
 */
export function computeAnnotationThicknessStats(
  ann: AnnotationShapeConfig,
  vesselState: VesselState,
): AnnotationThicknessStats | undefined {
  const composites = vesselState.scanComposites.filter(sc => sc.orientationConfirmed);
  if (composites.length === 0) return undefined;

  const circumference = Math.PI * vesselState.id;

  // Determine sampling bounds
  const halfWidthMm = ann.width / 2;
  const halfHeightDeg = ann.type === 'circle'
    ? ((ann.width / 2) / circumference) * 360
    : (ann.height / circumference) * 360 / 2;

  // Sample spacing: ~2mm or coarser based on data resolution
  const spacing = 2;

  const values: number[] = [];
  let minVal = Infinity;
  let maxVal = -Infinity;
  let minPoint = { pos: ann.pos, angle: ann.angle };
  let maxPoint = { pos: ann.pos, angle: ann.angle };

  const posStart = ann.pos - halfWidthMm;
  const posEnd = ann.pos + halfWidthMm;
  const angleStart = ann.angle - halfHeightDeg;
  const angleEnd = ann.angle + halfHeightDeg;
  const angleStepDeg = (spacing / circumference) * 360;

  for (let p = posStart; p <= posEnd; p += spacing) {
    for (let a = angleStart; a <= angleEnd; a += angleStepDeg) {
      const normalizedAngle = ((a % 360) + 360) % 360;
      if (!isInsideAnnotation(ann, p, normalizedAngle, vesselState)) continue;

      // Sample from the topmost composite that has data at this point
      for (let i = composites.length - 1; i >= 0; i--) {
        const val = sampleComposite(composites[i], p, normalizedAngle, vesselState);
        if (val !== null) {
          values.push(val);
          if (val < minVal) {
            minVal = val;
            minPoint = { pos: p, angle: normalizedAngle };
          }
          if (val > maxVal) {
            maxVal = val;
            maxPoint = { pos: p, angle: normalizedAngle };
          }
          break; // topmost composite wins
        }
      }
    }
  }

  if (values.length === 0) return undefined;

  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / values.length;
  const variance = values.reduce((a, b) => a + (b - avg) ** 2, 0) / values.length;

  return {
    min: minVal,
    max: maxVal,
    avg,
    stdDev: Math.sqrt(variance),
    minPoint,
    maxPoint,
    sampleCount: values.length,
  };
}

/**
 * Compute severity level from thickness stats and thresholds.
 */
export function computeSeverityLevel(
  stats: AnnotationThicknessStats | undefined,
  thresholds: ThicknessThresholds | undefined,
): 'red' | 'yellow' | 'green' | null {
  if (!stats || !thresholds) return null;

  let redThreshold: number;
  let yellowThreshold: number;

  if (thresholds.mode === 'absolute') {
    if (thresholds.redBelow == null || thresholds.yellowBelow == null) return null;
    redThreshold = thresholds.redBelow;
    yellowThreshold = thresholds.yellowBelow;
  } else {
    if (
      thresholds.nominalThickness == null ||
      thresholds.redBelowPct == null ||
      thresholds.yellowBelowPct == null
    ) return null;
    redThreshold = thresholds.nominalThickness * (thresholds.redBelowPct / 100);
    yellowThreshold = thresholds.nominalThickness * (thresholds.yellowBelowPct / 100);
  }

  if (stats.min < redThreshold) return 'red';
  if (stats.min < yellowThreshold) return 'yellow';
  return 'green';
}

/**
 * Recompute thickness stats and severity for all annotations.
 * Returns a new annotations array with updated stats and severity.
 */
export function recomputeAllAnnotationStats(
  vesselState: VesselState,
): AnnotationShapeConfig[] {
  return vesselState.annotations.map(ann => {
    const thicknessStats = computeAnnotationThicknessStats(ann, vesselState);
    const severityLevel = computeSeverityLevel(thicknessStats, vesselState.thicknessThresholds);
    return { ...ann, thicknessStats, severityLevel };
  });
}
```

**Step 2: Verify build**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/VesselModeler/engine/annotation-stats.ts
git commit -m "feat(annotations): add thickness stats computation engine with severity levels"
```

---

## Task 3: Wire Stats Recomputation into VesselModeler

**Files:**
- Modify: `src/components/VesselModeler/VesselModeler.tsx`

Stats must recompute when: annotations move/resize/create, scan composites change orientation, or thresholds change.

**Step 1: Import the new module**

At the imports section of VesselModeler.tsx, add:

```typescript
import { recomputeAllAnnotationStats } from './engine/annotation-stats';
```

**Step 2: Add a recompute helper**

After the existing annotation handlers (around line 400), add a function that recomputes stats on the current vessel state and dispatches the update:

```typescript
const recomputeAnnotationStats = useCallback(() => {
  const updatedAnnotations = recomputeAllAnnotationStats(vesselState);
  // Only update if stats actually changed to avoid unnecessary rebuilds
  const changed = updatedAnnotations.some((ann, i) => {
    const old = vesselState.annotations[i];
    return ann.thicknessStats !== old.thicknessStats || ann.severityLevel !== old.severityLevel;
  });
  if (changed) {
    updateVessel({ annotations: updatedAnnotations });
  }
}, [vesselState]);
```

**Step 3: Add a new reducer action for threshold updates**

In the reducer, add a case for updating thresholds:

```typescript
case 'UPDATE_THICKNESS_THRESHOLDS':
  return {
    ...state,
    vessel: { ...state.vessel, thicknessThresholds: action.thresholds },
  };
```

**Step 4: Call recompute at the right moments**

Add `useEffect` that recomputes when relevant dependencies change:

```typescript
// Recompute annotation thickness stats when annotations, scan composites, or thresholds change
const annotationsJson = JSON.stringify(vesselState.annotations.map(a => ({ id: a.id, pos: a.pos, angle: a.angle, width: a.width, height: a.height, type: a.type })));
const compositesJson = JSON.stringify(vesselState.scanComposites.map(c => ({ id: c.id, orientationConfirmed: c.orientationConfirmed, indexStartMm: c.indexStartMm, datumAngleDeg: c.datumAngleDeg, scanDirection: c.scanDirection, indexDirection: c.indexDirection })));
const thresholdsJson = JSON.stringify(vesselState.thicknessThresholds);

useEffect(() => {
  recomputeAnnotationStats();
}, [annotationsJson, compositesJson, thresholdsJson]);
```

Note: We serialize only the geometry-affecting fields to avoid infinite loops (since recompute updates annotations which would re-trigger). The serialized keys deliberately exclude `thicknessStats` and `severityLevel`.

**Step 5: Verify build**

Run: `npm run typecheck`
Expected: PASS

**Step 6: Commit**

```bash
git add src/components/VesselModeler/VesselModeler.tsx
git commit -m "feat(annotations): wire thickness stats recomputation into vessel modeler lifecycle"
```

---

## Task 4: Severity-Coded Annotation Borders

**Files:**
- Modify: `src/components/VesselModeler/engine/annotation-geometry.ts:262-292` (createAnnotationShape)

**Step 1: Update createAnnotationShape to use severity color**

In `createAnnotationShape`, the outline color is currently taken from `config.color`. Add logic to override with severity color when available:

```typescript
// At the top of createAnnotationShape, compute the effective outline color
const SEVERITY_COLORS: Record<string, string> = {
  red: '#ff3333',
  yellow: '#ffaa00',
  green: '#33cc33',
};
const outlineColor = config.severityLevel
  ? SEVERITY_COLORS[config.severityLevel]
  : config.color;
```

Then pass `outlineColor` instead of `config.color` to the outline material. The existing code creates a `LineBasicMaterial` with `color: new THREE.Color(config.color)` — change this to use the computed `outlineColor`.

**Step 2: Verify build**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Manual test**

Open vessel modeler with a scan composite and an annotation overlapping it. Configure thresholds. Verify the annotation border changes color based on severity.

**Step 4: Commit**

```bash
git add src/components/VesselModeler/engine/annotation-geometry.ts
git commit -m "feat(annotations): severity-coded border colors based on thickness thresholds"
```

---

## Task 5: Ambient Label Revamp

**Files:**
- Modify: `src/components/VesselModeler/engine/annotation-labels.ts:172-208` (createAnnotationLabel)
- Modify: `src/components/VesselModeler/vessel-modeler.css:1096-1145` (label styles)

**Step 1: Update label content**

In `createAnnotationLabel`, replace the current label HTML (which shows position text, dimensions, and region) with the new 3-line format:

```
Line 1: Name (e.g., "A1")
Line 2: Position as scan/index mm (e.g., "Scan: 1250mm  Index: 3400mm")
Line 3: Area in m² (e.g., "0.82 m²")
```

The area calculation:
- Circle: `π × (width/2)² / 1_000_000` m²
- Rectangle: `width × height / 1_000_000` m²

The function already receives `config` (AnnotationShapeConfig) and `vesselState`. The scan/index position should use the annotation's `pos` (index mm from tangent) and circumferential position. Map `pos` and `angle` to the scan/index coordinate system.

**Step 2: Add severity accent to label CSS**

Update `.vm-annotation-label` to support a left border accent. Add a data attribute approach:

```css
.vm-annotation-label[data-severity="red"] {
  border-left: 3px solid #ff3333;
}
.vm-annotation-label[data-severity="yellow"] {
  border-left: 3px solid #ffaa00;
}
.vm-annotation-label[data-severity="green"] {
  border-left: 3px solid #33cc33;
}
```

Set the `data-severity` attribute on the label div element based on `config.severityLevel`.

**Step 3: Verify build**

Run: `npm run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/VesselModeler/engine/annotation-labels.ts src/components/VesselModeler/vessel-modeler.css
git commit -m "feat(annotations): revamp ambient labels with name, position, area, and severity accent"
```

---

## Task 6: Sidebar Severity Dots

**Files:**
- Modify: `src/components/VesselModeler/sidebar/AnnotationSection.tsx`

**Step 1: Add severity dot to annotation list items**

In the annotation list rendering (around line 100-120), add a small colored dot before/after the annotation name:

```tsx
{ann.severityLevel && (
  <span
    className="vm-severity-dot"
    style={{ backgroundColor: SEVERITY_COLORS[ann.severityLevel] }}
  />
)}
```

**Step 2: Add CSS for the dot**

In `vessel-modeler.css`, add:

```css
.vm-severity-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
  flex-shrink: 0;
}
```

**Step 3: Verify build and commit**

```bash
git add src/components/VesselModeler/sidebar/AnnotationSection.tsx src/components/VesselModeler/vessel-modeler.css
git commit -m "feat(annotations): add severity dots to annotation sidebar list"
```

---

## Task 7: Thickness Threshold Configuration UI

**Files:**
- Create: `src/components/VesselModeler/sidebar/ThresholdSection.tsx`
- Modify: `src/components/VesselModeler/sidebar/AnnotationSection.tsx` (embed threshold controls)
- Modify: `src/components/VesselModeler/sidebar/index.ts` (export)

**Step 1: Create ThresholdSection component**

A compact collapsible section inside the AnnotationSection that allows configuring vessel-level thresholds. Contains:
- Mode toggle: "Absolute (mm)" / "% of Nominal"
- For absolute: two number inputs (Red below, Yellow below)
- For percentage: nominal thickness input + two percentage inputs
- Preview: simple colored bar showing the bands

Props:
```typescript
interface ThresholdSectionProps {
  thresholds: ThicknessThresholds | undefined;
  onUpdate: (thresholds: ThicknessThresholds) => void;
}
```

Keep this under 100 lines. Use the existing `SubSection`, `.vm-control-group`, `.vm-input`, `.vm-label` patterns from the sibling sidebar components.

**Step 2: Wire into AnnotationSection**

Add the ThresholdSection at the bottom of AnnotationSection, passing `vesselState.thicknessThresholds` and a callback that dispatches `UPDATE_THICKNESS_THRESHOLDS`.

The callback needs to be threaded through from VesselModeler → SidebarPanel → AnnotationSection.

**Step 3: Thread the callback through SidebarPanel**

Add `onUpdateThicknessThresholds` prop to SidebarPanel, pass through to AnnotationSection.

In VesselModeler, add the handler:
```typescript
const updateThicknessThresholds = useCallback((thresholds: ThicknessThresholds) => {
  dispatch({ type: 'UPDATE_THICKNESS_THRESHOLDS', thresholds });
}, []);
```

**Step 4: Verify build and commit**

```bash
git add src/components/VesselModeler/sidebar/ThresholdSection.tsx src/components/VesselModeler/sidebar/AnnotationSection.tsx src/components/VesselModeler/sidebar/index.ts src/components/VesselModeler/SidebarPanel.tsx src/components/VesselModeler/VesselModeler.tsx
git commit -m "feat(annotations): add thickness threshold configuration UI"
```

---

## Task 8: Inspection Mode State Management

**Files:**
- Modify: `src/components/VesselModeler/VesselModeler.tsx:96-112` (UIState, reducer)

**Step 1: Extend UIState**

Add inspection mode fields to `UIState`:

```typescript
interface UIState {
  // ... existing fields
  /** ID of annotation being inspected (null = not in inspection mode) */
  inspectingAnnotationId: number | null;
  /** Camera state saved before entering inspection mode */
  savedCameraState: {
    position: [number, number, number];
    target: [number, number, number];
  } | null;
}
```

**Step 2: Add reducer actions**

```typescript
case 'ENTER_INSPECTION_MODE':
  return {
    ...state,
    selection: { ...state.selection, annotationId: action.annotationId },
    ui: {
      ...state.ui,
      inspectingAnnotationId: action.annotationId,
      savedCameraState: action.cameraState,
    },
  };

case 'CYCLE_INSPECTION':
  return {
    ...state,
    selection: { ...state.selection, annotationId: action.annotationId },
    ui: { ...state.ui, inspectingAnnotationId: action.annotationId },
  };

case 'EXIT_INSPECTION_MODE':
  return {
    ...state,
    ui: {
      ...state.ui,
      inspectingAnnotationId: null,
      savedCameraState: null,
    },
  };
```

**Step 3: Update INITIAL_STATE**

Add defaults: `inspectingAnnotationId: null, savedCameraState: null`

**Step 4: Verify build and commit**

```bash
git add src/components/VesselModeler/VesselModeler.tsx
git commit -m "feat(annotations): add inspection mode state management to reducer"
```

---

## Task 9: Camera Animation System

**Files:**
- Create: `src/components/VesselModeler/engine/camera-animation.ts`
- Modify: `src/components/VesselModeler/ThreeViewport.tsx`
- Modify: `src/components/VesselModeler/VesselModeler.tsx`

**Step 1: Create camera animation module**

```typescript
import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { AnnotationShapeConfig, VesselState } from '../types';
import { shellPoint } from './annotation-geometry';
import { SCALE } from './materials';

interface CameraAnimationState {
  active: boolean;
  startTime: number;
  duration: number;
  startPosition: THREE.Vector3;
  startTarget: THREE.Vector3;
  endPosition: THREE.Vector3;
  endTarget: THREE.Vector3;
  onComplete?: () => void;
}

let currentAnimation: CameraAnimationState | null = null;

/**
 * Compute the camera position for inspecting an annotation front-on.
 * Camera is placed along the surface normal at the annotation center,
 * at a distance that fills ~70% of the viewport width.
 */
export function computeInspectionCameraTarget(
  ann: AnnotationShapeConfig,
  vesselState: VesselState,
  camera: THREE.PerspectiveCamera,
): { position: THREE.Vector3; target: THREE.Vector3 } {
  const angleRad = (ann.angle - 90) * Math.PI / 180; // Convert 90=TDC to internal
  const surfacePoint = shellPoint(ann.pos, angleRad, vesselState, 0);
  const target = surfacePoint.clone();

  // Normal direction = radially outward from vessel axis
  const isVertical = vesselState.orientation === 'vertical';
  const normal = new THREE.Vector3();
  if (isVertical) {
    normal.set(Math.cos(angleRad), 0, Math.sin(angleRad));
  } else {
    normal.set(0, Math.cos(angleRad), Math.sin(angleRad));
  }
  normal.normalize();

  // Distance: annotation footprint fills ~70% of viewport width
  const footprint = Math.max(ann.width, ann.height) * SCALE;
  const fovRad = camera.fov * Math.PI / 180;
  const aspect = camera.aspect;
  const hFovRad = 2 * Math.atan(Math.tan(fovRad / 2) * aspect);
  const distance = (footprint / 0.7) / (2 * Math.tan(hFovRad / 2));

  const position = target.clone().add(normal.multiplyScalar(distance));
  return { position, target };
}

/**
 * Start a smooth camera animation.
 */
export function animateCamera(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  targetPosition: THREE.Vector3,
  targetLookAt: THREE.Vector3,
  duration: number = 500,
  onComplete?: () => void,
): void {
  currentAnimation = {
    active: true,
    startTime: performance.now(),
    duration,
    startPosition: camera.position.clone(),
    startTarget: controls.target.clone(),
    endPosition: targetPosition,
    endTarget: targetLookAt,
    onComplete,
  };
}

/**
 * Call this in the render loop. Returns true if animation is active.
 */
export function updateCameraAnimation(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
): boolean {
  if (!currentAnimation || !currentAnimation.active) return false;

  const elapsed = performance.now() - currentAnimation.startTime;
  const t = Math.min(elapsed / currentAnimation.duration, 1);
  // Ease in-out cubic
  const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  camera.position.lerpVectors(currentAnimation.startPosition, currentAnimation.endPosition, eased);
  controls.target.lerpVectors(currentAnimation.startTarget, currentAnimation.endTarget, eased);
  controls.update();

  if (t >= 1) {
    const onComplete = currentAnimation.onComplete;
    currentAnimation = null;
    onComplete?.();
    return false;
  }

  return true;
}

/**
 * Cancel any running animation.
 */
export function cancelCameraAnimation(): void {
  currentAnimation = null;
}
```

**Step 2: Integrate into ThreeViewport render loop**

In ThreeViewport's animation/render loop, call `updateCameraAnimation(camera, controls)` before rendering. This ensures the tween updates every frame.

**Step 3: Add enter/exit/cycle handlers in VesselModeler**

Create handlers that:
- `enterInspectionMode(annotationId)`: Save camera state, compute target, call `animateCamera`, disable controls on complete, dispatch `ENTER_INSPECTION_MODE`
- `exitInspectionMode()`: Restore saved camera state via `animateCamera`, re-enable controls on complete, dispatch `EXIT_INSPECTION_MODE`
- `cycleInspection(annotationId)`: Compute new target, `animateCamera` to new annotation, dispatch `CYCLE_INSPECTION`

These handlers need access to the camera and controls refs from ThreeViewport. Thread them via a ref or callback.

**Step 4: Hook up annotation click to enter inspection mode**

Modify the `onSelectAnnotation` callback: if already in inspection mode, cycle; otherwise enter inspection mode.

Alternatively, use double-click for entering inspection mode and single-click for selection (to avoid breaking the current selection behavior). **Decision: single click in sidebar enters inspection mode, single click on 3D model selects.**

**Step 5: Add keyboard handler for Escape**

In VesselModeler, add a `useEffect` with a keydown listener for Escape that calls `exitInspectionMode()` when `inspectingAnnotationId !== null`.

**Step 6: Verify build and commit**

```bash
git add src/components/VesselModeler/engine/camera-animation.ts src/components/VesselModeler/ThreeViewport.tsx src/components/VesselModeler/VesselModeler.tsx
git commit -m "feat(annotations): add camera animation system for inspection mode"
```

---

## Task 10: Inspection Detail Panel Component

**Files:**
- Create: `src/components/VesselModeler/sidebar/InspectionPanel.tsx`
- Modify: `src/components/VesselModeler/vessel-modeler.css`
- Modify: `src/components/VesselModeler/VesselModeler.tsx`

**Step 1: Create InspectionPanel component**

This is a right-side overlay panel (~350px) that slides in during inspection mode. It's separate from the left sidebar.

Props:
```typescript
interface InspectionPanelProps {
  annotation: AnnotationShapeConfig;
  vesselState: VesselState;
  onClose: () => void;
  onCycleToAnnotation: (id: number) => void;
  onStatHover: (stat: 'min' | 'max' | null) => void;
  onCaptureViewport: () => void;
  onUploadImage: (file: File) => void;
  onDeleteAttachment: (attachmentId: string) => void;
}
```

Sections (implement incrementally — start with metadata + stats, add others in later tasks):

1. **Header**: Back button (calls onClose), annotation name, severity badge
2. **Metadata**: Position (scan/index mm), dimensions, area (m²)
3. **Thickness stats**: Min, Max, Avg, StdDev rows — Min/Max rows have `onMouseEnter` → `onStatHover('min'|'max')`, `onMouseLeave` → `onStatHover(null)`. Show sample count.
4. **Placeholder sections** for mini heatmap and attachments (implemented in Tasks 11-14)

Keep under 250 lines for initial version. Use clean layout with existing CSS variable patterns.

**Step 2: Add CSS for the panel**

```css
.vm-inspection-panel {
  position: absolute;
  top: 0;
  right: 0;
  width: 350px;
  height: 100%;
  background: rgba(20, 20, 30, 0.95);
  border-left: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(12px);
  overflow-y: auto;
  z-index: 100;
  animation: vm-slide-in-right 0.3s ease-out;
  padding: 16px;
}

@keyframes vm-slide-in-right {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

.vm-inspection-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.vm-inspection-stat-row {
  display: flex;
  justify-content: space-between;
  padding: 6px 8px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 0.8rem;
}

.vm-inspection-stat-row.hoverable:hover {
  background: rgba(255, 255, 255, 0.08);
  cursor: pointer;
}

.vm-inspection-section {
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.vm-inspection-section-title {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 8px;
}
```

**Step 3: Add camera lock indicator**

Small lock icon in the top-left of the viewport when in inspection mode:

```css
.vm-camera-lock-indicator {
  position: absolute;
  top: 12px;
  left: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 4px;
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.6);
  pointer-events: none;
  z-index: 50;
}
```

**Step 4: Render InspectionPanel in VesselModeler**

In VesselModeler's JSX, conditionally render the panel when `ui.inspectingAnnotationId !== null`:

```tsx
{ui.inspectingAnnotationId !== null && (
  <>
    <div className="vm-camera-lock-indicator">
      <Lock size={14} /> Inspection Mode
    </div>
    <InspectionPanel
      annotation={vesselState.annotations.find(a => a.id === ui.inspectingAnnotationId)!}
      vesselState={vesselState}
      onClose={exitInspectionMode}
      onCycleToAnnotation={cycleInspection}
      onStatHover={setStatHover}
      onCaptureViewport={captureViewport}
      onUploadImage={uploadImage}
      onDeleteAttachment={deleteAttachment}
    />
  </>
)}
```

**Step 5: Verify build and commit**

```bash
git add src/components/VesselModeler/sidebar/InspectionPanel.tsx src/components/VesselModeler/vessel-modeler.css src/components/VesselModeler/VesselModeler.tsx
git commit -m "feat(annotations): add inspection mode detail panel with metadata and thickness stats"
```

---

## Task 11: Stat Leader Lines (SVG Overlay)

**Files:**
- Create: `src/components/VesselModeler/StatLeaderOverlay.tsx`
- Modify: `src/components/VesselModeler/VesselModeler.tsx`

**Step 1: Create StatLeaderOverlay component**

An absolutely-positioned SVG that draws a dashed line from a stat row in the inspection panel to the projected 3D point on the vessel.

Props:
```typescript
interface StatLeaderOverlayProps {
  /** Which stat is being hovered */
  hoveredStat: 'min' | 'max' | null;
  /** The annotation being inspected */
  annotation: AnnotationShapeConfig;
  vesselState: VesselState;
  /** Ref to the Three.js camera for 3D→2D projection */
  cameraRef: React.RefObject<THREE.PerspectiveCamera>;
  /** Ref to the canvas container for bounds */
  containerRef: React.RefObject<HTMLDivElement>;
  /** Ref to the stat row element for source position */
  statRowRef: React.RefObject<HTMLDivElement>;
}
```

Logic:
1. If `hoveredStat` is null, render nothing
2. Get the 3D point from `annotation.thicknessStats.minPoint` or `maxPoint`
3. Convert to screen coords via `shellPoint()` → `camera.project()` → NDC → pixel coords
4. Get the stat row's bounding rect for the source point
5. Render an SVG with:
   - Dashed line between source and target
   - Small pulsing circle at the target point
   - Fade in/out via CSS transition

Keep under 80 lines.

**Step 2: Render overlay in VesselModeler**

Add state for `statHover` and pass to overlay component. Position the SVG to cover the full viewport area.

**Step 3: Verify build and commit**

```bash
git add src/components/VesselModeler/StatLeaderOverlay.tsx src/components/VesselModeler/VesselModeler.tsx
git commit -m "feat(annotations): add SVG stat leader line overlay for inspection mode"
```

---

## Task 12: Mini Heatmap in Inspection Panel

**Files:**
- Modify: `src/components/VesselModeler/sidebar/InspectionPanel.tsx`
- Create: `src/components/VesselModeler/engine/annotation-heatmap.ts`

**Step 1: Create cropping utility**

A function that extracts the sub-region of a scan composite's data that falls within an annotation footprint, and renders it to a small canvas.

```typescript
import type { AnnotationShapeConfig, ScanCompositeConfig, VesselState } from '../types';
import { createHeatmapTexture } from './heatmap-texture';

/**
 * Extract the sub-region of scan data under an annotation and render to a canvas.
 * Returns an HTMLCanvasElement or null if no data overlaps.
 */
export function createAnnotationHeatmapCanvas(
  ann: AnnotationShapeConfig,
  vesselState: VesselState,
  colorScale: string,
): HTMLCanvasElement | null {
  // Find the topmost composite overlapping this annotation
  // Extract the relevant rows/cols
  // Render via canvas 2D context using the same colorscale logic
  // Return the canvas element
}
```

This reuses the same `interpolateColor` from `colorscales.ts` but renders only the cropped footprint.

**Step 2: Add heatmap section to InspectionPanel**

Use `useEffect` + `useRef` to render the heatmap canvas into a container div. Show the colorscale name from the parent composite.

**Step 3: Verify build and commit**

```bash
git add src/components/VesselModeler/engine/annotation-heatmap.ts src/components/VesselModeler/sidebar/InspectionPanel.tsx
git commit -m "feat(annotations): add cropped mini heatmap to inspection panel"
```

---

## Task 13: Image Attachments — Supabase Storage

**Files:**
- Create: `src/services/annotation-attachment-service.ts`

**Step 1: Create the service**

```typescript
import { supabase } from '../lib/supabase';

const BUCKET = 'vessel-annotations';

export async function uploadAnnotationImage(
  organizationId: string,
  vesselModelId: string,
  annotationId: number,
  file: File | Blob,
  type: 'upload' | 'viewport-capture',
): Promise<{ storagePath: string; id: string }> {
  const id = crypto.randomUUID();
  const ext = file instanceof File ? file.name.split('.').pop() ?? 'png' : 'png';
  const path = `${organizationId}/${vesselModelId}/${annotationId}/${id}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'image/png',
  });
  if (error) throw error;

  return { storagePath: path, id };
}

export async function deleteAnnotationImage(storagePath: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (error) throw error;
}

export function getAnnotationImageUrl(storagePath: string): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}
```

**Step 2: Verify build and commit**

```bash
git add src/services/annotation-attachment-service.ts
git commit -m "feat(annotations): add Supabase Storage service for annotation image attachments"
```

---

## Task 14: Viewport Capture + Upload UI

**Files:**
- Modify: `src/components/VesselModeler/sidebar/InspectionPanel.tsx`
- Modify: `src/components/VesselModeler/VesselModeler.tsx`

**Step 1: Add viewport capture handler in VesselModeler**

```typescript
const captureViewport = useCallback(() => {
  const canvas = rendererRef.current?.domElement;
  if (!canvas || ui.inspectingAnnotationId == null) return;

  canvas.toBlob(async (blob) => {
    if (!blob) return;
    const { storagePath, id } = await uploadAnnotationImage(
      organizationId, vesselModelId, ui.inspectingAnnotationId!, blob, 'viewport-capture',
    );
    const attachment: AnnotationAttachment = {
      id,
      type: 'viewport-capture',
      storagePath,
      capturedAt: new Date().toISOString(),
    };
    updateAnnotation(ui.inspectingAnnotationId!, {
      attachments: [
        ...(vesselState.annotations.find(a => a.id === ui.inspectingAnnotationId)?.attachments ?? []),
        attachment,
      ],
    });
  }, 'image/png');
}, [ui.inspectingAnnotationId, vesselState]);
```

**Step 2: Add upload handler**

```typescript
const uploadImage = useCallback(async (file: File) => {
  if (ui.inspectingAnnotationId == null) return;
  const { storagePath, id } = await uploadAnnotationImage(
    organizationId, vesselModelId, ui.inspectingAnnotationId!, file, 'upload',
  );
  const attachment: AnnotationAttachment = {
    id,
    type: 'upload',
    storagePath,
    capturedAt: new Date().toISOString(),
  };
  updateAnnotation(ui.inspectingAnnotationId!, {
    attachments: [
      ...(vesselState.annotations.find(a => a.id === ui.inspectingAnnotationId)?.attachments ?? []),
      attachment,
    ],
  });
}, [ui.inspectingAnnotationId, vesselState]);
```

**Step 3: Add attachments section to InspectionPanel**

- Grid of thumbnail images using `getAnnotationImageUrl()`
- Each thumbnail has a hover delete button
- "Capture Viewport" button calls `onCaptureViewport`
- "Upload Image" button opens a hidden file input
- Clicking a thumbnail opens it in a lightbox (simple absolute-positioned overlay with the full image)

**Step 4: Add delete handler**

```typescript
const deleteAttachment = useCallback(async (attachmentId: string) => {
  if (ui.inspectingAnnotationId == null) return;
  const ann = vesselState.annotations.find(a => a.id === ui.inspectingAnnotationId);
  const attachment = ann?.attachments?.find(a => a.id === attachmentId);
  if (attachment) {
    await deleteAnnotationImage(attachment.storagePath);
  }
  updateAnnotation(ui.inspectingAnnotationId!, {
    attachments: (ann?.attachments ?? []).filter(a => a.id !== attachmentId),
  });
}, [ui.inspectingAnnotationId, vesselState]);
```

**Step 5: Verify build and commit**

```bash
git add src/components/VesselModeler/sidebar/InspectionPanel.tsx src/components/VesselModeler/VesselModeler.tsx
git commit -m "feat(annotations): add viewport capture and image upload to inspection panel"
```

---

## Task 15: Threshold Section in Inspection Panel

**Files:**
- Modify: `src/components/VesselModeler/sidebar/InspectionPanel.tsx`

**Step 1: Add threshold controls to bottom of inspection panel**

Reuse the same `ThresholdSection` component from Task 7, or embed the threshold controls directly at the bottom of the inspection panel. This lets users adjust thresholds while viewing the annotation in context.

Pass the `onUpdateThicknessThresholds` callback through InspectionPanel props.

**Step 2: Verify build and commit**

```bash
git add src/components/VesselModeler/sidebar/InspectionPanel.tsx
git commit -m "feat(annotations): add threshold controls to inspection panel"
```

---

## Task 16: Supabase Storage Bucket Setup

**Files:**
- Create: `database/annotation-storage-setup.sql`

**Step 1: Create the SQL for bucket and policies**

```sql
-- Create the vessel-annotations bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('vessel-annotations', 'vessel-annotations', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload annotation images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'vessel-annotations');

-- Allow authenticated users to read
CREATE POLICY "Authenticated users can read annotation images"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'vessel-annotations');

-- Allow users to delete their own uploads
CREATE POLICY "Authenticated users can delete annotation images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'vessel-annotations');
```

**Step 2: Commit**

```bash
git add database/annotation-storage-setup.sql
git commit -m "feat(annotations): add Supabase Storage bucket setup for annotation images"
```

---

## Task 17: Final Integration & Polish

**Files:**
- Modify: `src/components/VesselModeler/VesselModeler.tsx`
- Modify: `src/components/VesselModeler/ThreeViewport.tsx`

**Step 1: Ensure annotation sidebar click enters inspection mode**

Modify the `onSelectAnnotation` callback in VesselModeler:
- If there are scan composites with confirmed orientations and the annotation has thickness stats, clicking in the sidebar enters inspection mode
- If no scan data, clicking just selects as before (no inspection mode)

**Step 2: Ensure 3D click only selects (does not enter inspection mode)**

Keep the existing 3D click behavior: select the annotation. Users can then click it in the sidebar to enter inspection mode. This prevents accidental inspection mode entry while working in 3D.

**Step 3: Ensure Escape exits inspection mode**

Verify the keydown handler from Task 8 works correctly.

**Step 4: Ensure clicking another annotation in sidebar cycles**

When `inspectingAnnotationId !== null` and user clicks a different annotation in the sidebar, call `cycleInspection(newId)`.

**Step 5: Disable orbit controls during inspection mode**

In ThreeViewport, check if `inspectingAnnotationId !== null` and disable OrbitControls. Re-enable on exit.

**Step 6: Full build check**

Run: `npm run typecheck && npm run build`
Expected: PASS

**Step 7: Manual end-to-end test**

1. Load a vessel with a scan composite
2. Place an annotation over the scan data
3. Configure thresholds → verify severity border color changes
4. Verify ambient label shows name, position, area
5. Verify sidebar severity dot appears
6. Click annotation in sidebar → camera animates, panel slides in, controls lock
7. Verify stats display (min, max, avg, stddev, sample count)
8. Hover Min stat → leader line to vessel surface
9. Hover Max stat → leader line to vessel surface
10. Verify mini heatmap shows cropped data
11. Click "Capture Viewport" → thumbnail appears
12. Click "Upload Image" → pick file → thumbnail appears
13. Click another annotation in sidebar → camera cycles, panel updates
14. Press Escape → camera restores, panel closes, controls unlock

**Step 8: Final commit**

```bash
git add -A
git commit -m "feat(annotations): complete annotation tool revamp with inspection mode, thickness stats, and image attachments"
```

---

## Task Dependencies

```
Task 1 (types) ─────────┬──→ Task 2 (stats engine)
                         │      ↓
                         ├──→ Task 3 (wire recomputation)
                         │      ↓
                         ├──→ Task 4 (severity borders)
                         ├──→ Task 5 (ambient labels)
                         ├──→ Task 6 (sidebar dots)
                         ├──→ Task 7 (threshold UI) ──→ Task 15 (thresholds in panel)
                         │
                         ├──→ Task 8 (inspection state)
                         │      ↓
                         ├──→ Task 9 (camera animation)
                         │      ↓
                         ├──→ Task 10 (inspection panel) ──→ Task 11 (stat leaders)
                         │      ↓                           ↓
                         │   Task 12 (mini heatmap)      Task 14 (capture + upload UI)
                         │                                  ↑
                         └──→ Task 13 (storage service) ────┘
                                                            ↓
                         Task 16 (Supabase bucket) ─────────┘
                                                            ↓
                         Task 17 (final integration) ←──────┘
```

**Parallelizable groups:**
- Tasks 4, 5, 6, 7 can run in parallel (all depend only on Task 1-3)
- Tasks 8-9 can run in parallel with Tasks 4-7
- Tasks 11, 12, 13 can run in parallel (all depend on Task 10)
- Task 16 is independent (just SQL)
