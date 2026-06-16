# Dome End Scan Overlay System

**Date:** 2026-06-16
**Status:** Draft (rev 3 — incorporates Codex audit + Jonas review)
**Author:** Claude (design session with Jonas)

## Problem

C-scan composites currently map onto the vessel surface using cylindrical coordinates `(pos, angle)`. This works well for the shell section but produces severe distortion on the ellipsoidal heads — as `pos` approaches the dome apex, the local radius collapses to zero and the scan warps inward along an invisible cylinder, converging to a point. Dome inspections are performed as separate scan passes in the field and need their own mapping system.

## Approach

Add a separate **dome scan** feature rather than modifying the existing `ScanCompositeConfig` / `createScanCompositePlane()` pipeline. The shell scan overlay system is stable and should not be touched.

### Why Separate

1. **Different coordinate system.** Shell scans use cylindrical `(pos along axis, angle around circumference)`. Dome scans need polar/azimuthal `(φ from apex, θ around axis)`.
2. **Reflects real inspection practice.** Dome ends are inspected as separate scan passes with their own datum and grid. They don't share a longitudinal axis with shell scans.
3. **No transition ambiguity.** A scan is either a shell scan or a dome scan. No need for hybrid geometry or cross-region blending.
4. **Keeps the engine clean.** `createScanCompositePlane()` is ~300 lines of dense geometry code that works correctly. A dome-specific factory avoids adding conditionals into that path.

## Coordinate System

### Axis Convention & Units

All dome geometry follows the **existing vessel-geometry.ts / texture-manager.ts convention**:

- **Horizontal vessels:** x = longitudinal (left→right), y = vertical, z = horizontal-transverse
- **Vertical vessels:** y = longitudinal (bottom→top), x and z = radial plane

All 3D positions are in **scaled world units** (`mm × SCALE` where `SCALE = 0.001` from `materials.ts`). The shared helpers accept mm inputs and return scaled coordinates, matching `createScanCompositePlane()` which applies `* SCALE` to every vertex component.

**Phase 1 scope: horizontal vessels only.** The helpers accept an `orientation` parameter but Phase 1 only implements and tests the horizontal path. Vertical vessel dome scans are Phase 2+ (the existing shell scan composite code already handles both orientations via `isVertical` branching, and the dome helpers follow the same pattern).

### Current Shell Mapping (unchanged)

```
pos:   mm from left tangent line (0 = LTL, length = RTL)
angle: degrees around circumference (0° = 3-o'clock, 90° = TDC)

Vertex position on head (pos < 0 or pos > TAN_TAN):
  ratio = |pos_local / HEAD_DEPTH|
  r_local = RADIUS × √(1 - ratio²)
  → r_local → 0 as pos → apex  ← THE BUG for dome-centered scans
```

### Proposed Dome Mapping

Parameterize the ellipsoidal head surface using polar coordinates centered on the dome axis:

```
φ (phi):   polar angle from apex toward equator
           0° = dead center of dome
           90° = tangent line (equator where dome meets shell)

θ (theta): azimuthal angle around dome axis
           Same convention as shell angle (0° = 3-o'clock, 90° = TDC)
```

### Shared Helpers

Two pure functions define the mapping between `(φ, θ)` and 3D Cartesian. Both live in `dome-scan-geometry.ts` and are the **single source of truth** for dome surface parameterization. All geometry code (vertex loops, drag inverse, gizmo placement) must use these rather than inline formulas.

The forward helper (`domeLocalFromPhiTheta`) returns **mm-space local coordinates** — it does NOT apply SCALE or vessel centering. The vertex loop in `createDomeScanPlane()` handles `* SCALE`, centering (`- TAN_TAN/2`), `headSign`, `surfaceOffset`, and the `isVertical` axis swap — exactly mirroring how `createScanCompositePlane()` builds its vertices (see `texture-manager.ts:518-558`).

The inverse helper (`domePhiThetaFromPoint`) accepts **world-space scaled coordinates** (from raycaster hits) and reverses the SCALE + axis swap.

```typescript
import { degToRad, radToDeg } from 'three/src/math/MathUtils.js';

const PHI_EPSILON = 0.01; // degrees — clamp to avoid exact-zero sin(φ)

interface DomeLocalResult {
  /** Axial distance from tangent line toward apex, in mm */
  axialMm: number;
  /** Radial distance from dome axis, in mm */
  rLocalMm: number;
  /** Azimuthal angle in radians (for sin/cos decomposition into y/z or x/z) */
  thetaRad: number;
  /** Ellipsoid surface normal (unit vector in local dome frame) */
  normal: THREE.Vector3;
}

/**
 * Map dome polar coords → local dome coordinates in mm.
 * Does NOT apply SCALE or vessel centering — the caller (createDomeScanPlane)
 * handles that, matching how createScanCompositePlane builds vertices.
 *
 * Returns axialMm (from tangent line toward apex), rLocalMm (radial),
 * thetaRad (azimuthal), and the ellipsoid surface normal.
 */
function domeLocalFromPhiTheta(
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

  // Ellipsoid surface gradient: ∇F for F(x,y,z) = (x/D)² + (y/R)² + (z/R)² - 1
  // In dome-local coords (axial, radial·sinθ, radial·cosθ):
  //   ∂F/∂axial = 2·cosPhi / D²  → simplified direction: cosPhi / D
  //   ∂F/∂y     = 2·sinPhi·sinθ / R²  → sinPhi·sinθ / R
  //   ∂F/∂z     = 2·sinPhi·cosθ / R²  → sinPhi·cosθ / R
  // At apex (phi→0): cosPhi/D ≈ 1/D dominates → normal points along head axis ✓
  // At equator (phi→90): sinPhi/R dominates → normal points radially outward ✓
  const nAxial = cosPhi / headDepth;
  const nRadSin = sinPhi * Math.sin(theta) / radius;
  const nRadCos = sinPhi * Math.cos(theta) / radius;

  // Normal in vessel-local frame (caller swaps axes for vertical orientation)
  // Convention: (axial, sin-component, cos-component)
  const normal = new THREE.Vector3(nAxial, nRadSin, nRadCos).normalize();

  return { axialMm, rLocalMm, thetaRad: theta, normal };
}

/**
 * Inverse: 3D world-space point → dome polar coords (φ°, θ°).
 * Point must be in SCALED world coordinates (same frame as vertices).
 * Returns null if the point is not on the specified dome head.
 *
 * headSign: +1 for right/top head, -1 for left/bottom head.
 * tangentLineWorld: scaled world-coord of the tangent line along the vessel axis.
 * isVertical: axis swap flag.
 */
function domePhiThetaFromPoint(
  point: THREE.Vector3,
  radius: number,
  headDepth: number,
  tangentLineWorld: number,
  headSign: 1 | -1,
  isVertical: boolean,
): { phiDeg: number; thetaDeg: number } | null {
  // Extract axial and radial components based on orientation
  let axialWorld: number, radY: number, radZ: number;
  if (isVertical) {
    axialWorld = point.y;
    radY = point.x;  // Note: for vertical, x/z are the radial plane
    radZ = point.z;
  } else {
    axialWorld = point.x;
    radY = point.y;
    radZ = point.z;
  }

  // Convert from world coords back to mm from tangent line
  const axialFromTL = headSign * (axialWorld - tangentLineWorld) / SCALE;
  if (axialFromTL < 0) return null; // point is on shell side

  const rLocalWorld = Math.sqrt(radY * radY + radZ * radZ);
  const rLocalMm = rLocalWorld / SCALE;

  // Inverse ellipsoidal parameterization
  const phiRad = Math.atan2(rLocalMm / radius, axialFromTL / headDepth);
  const phiDeg = radToDeg(phiRad);
  if (phiDeg < 0 || phiDeg > 90) return null;

  const thetaRad = Math.atan2(radY, radZ);
  const thetaDeg = radToDeg(thetaRad);

  return { phiDeg, thetaDeg: ((thetaDeg % 360) + 360) % 360 };
}
```

**Key design decisions:**
- **`isVertical` parameter** is present on the inverse helper; the forward helper returns orientation-agnostic local coords so the caller does the axis swap (keeping the helper pure and testable).
- `phiDeg` is clamped to `[PHI_EPSILON, 90]` in the forward direction to avoid `sin(0) = 0`. The inverse can return `phiDeg ≈ 0` for points near the crown.
- **Normal formula uses the ellipsoid gradient** `(cosPhi/D, sinPhi·sinθ/R, sinPhi·cosθ/R)`. At the apex (φ→0) this correctly points along the head axis; at the equator (φ→90) it points radially outward.

### Scan Data Mapping

The 2D scan grid maps onto `(φ, θ)`:

| Scan axis           | Maps to          | Dome direction                      |
|---------------------|------------------|-------------------------------------|
| Circumferential (x) | θ (azimuthal)    | Around the dome at constant φ       |
| Longitudinal (y)    | φ (polar/radial) | From apex outward toward equator    |

This preserves the physical layout — circumferential scan lines become rings around the dome, index lines become meridians from apex to equator.

## Data Model

### `DomeScanConfig` Interface

```typescript
interface DomeScanConfig {
  /** Unique local ID */
  id: string;
  /** Display name */
  name: string;
  /** Supabase record ID (if saved to cloud) */
  cloudId?: string;

  // --- Dome placement ---
  /** Which head this scan is attached to */
  head: 'left' | 'right';
  /** Polar angle of scan center from dome apex in degrees (0 = apex, 90 = equator) */
  centerPhi: number;
  /** Azimuthal angle of scan center around dome axis in degrees.
   *  This is the SOLE source of truth for circumferential position.
   *  Same convention as shell angle (0° = 3-o'clock, 90° = TDC). */
  centerTheta: number;

  // --- Orientation ---
  /** Scan direction around dome: 'cw' or 'ccw' when viewed from outside */
  scanDirection: 'cw' | 'ccw';
  /** Index direction on dome: 'outward' (apex→equator) or 'inward' (equator→apex) */
  indexDirection: 'outward' | 'inward';
  /** Whether the user has confirmed orientation (Phase 1: always true after add) */
  orientationConfirmed: boolean;

  // --- Scan data (same shape as ScanCompositeConfig) ---
  /** 2D thickness matrix [rows][cols] */
  data: (number | null)[][];
  /** Scan axis coordinates in mm (circumferential) */
  xAxis: number[];
  /** Index axis coordinates in mm (radial on dome surface) */
  yAxis: number[];
  /** Pre-computed statistics */
  stats: { min: number; max: number; mean: number; median: number; stdDev: number };

  // --- Visual settings (same as ScanCompositeConfig) ---
  colorScale: string;
  rangeMin: number | null;
  rangeMax: number | null;
  opacity: number;

  // --- Source tracking ---
  sourceFiles?: Array<{
    filename: string;
    minX: number; maxX: number;
    minY: number; maxY: number;
  }>;
}
```

**Removed `datumAngleDeg`** — Codex correctly flagged the ambiguity between `centerTheta`, `centerPhi`, and `datumAngleDeg`. The shell scan system needs `datumAngleDeg` because the scan's circumferential origin is a separate concept from its longitudinal position. On a dome, `centerTheta` fully describes where the scan sits circumferentially — there is no separate "datum" because the scan center IS the datum. Scan/index direction toggles handle orientation.

### VesselState Addition

```typescript
interface VesselState {
  // ... existing fields ...
  domeScanComposites: DomeScanConfig[];
}
```

### Pipe Shape Guard

Dome scans are only meaningful for `vesselShape === 'vessel'`. The UI should hide/disable the "Add Dome Scan" option when in pipe mode.

## Geometry: `createDomeScanPlane()`

New factory function in `dome-scan-geometry.ts`, parallel to `createScanCompositePlane()`. Key differences:

### Angular Span Calculation

```typescript
// All angles in this section are in RADIANS (converted at boundaries)
const centerPhiRad = degToRad(Math.max(PHI_EPSILON, config.centerPhi));
const centerThetaRad = degToRad(config.centerTheta);

// --- Circumferential extent → azimuthal span ---
// At polar angle φ, the local circumference is 2π × R × sin(φ)
const sinCenterPhi = Math.sin(centerPhiRad);
const localCircumference = 2 * Math.PI * RADIUS * sinCenterPhi;
// Guard: if scan is near apex, cap angular span to avoid >360° wrapping
// Use Math.abs to handle descending axis arrays (e.g. right-to-left scan)
const scanRangeMm = Math.abs(config.xAxis[config.xAxis.length - 1] - config.xAxis[0]);
const rawAngularSpan = (scanRangeMm / Math.max(localCircumference, 1)) * 2 * Math.PI;
const angularSpan = Math.min(rawAngularSpan, 2 * Math.PI);

// --- Longitudinal extent → polar span ---
// Meridian arc length on ellipsoid (R, R, D) from φ₁ to φ₂
// Exact integral: ∫ √(R²cos²φ + D²sin²φ) dφ — no closed form for R ≠ D.
// Approximation: treat as sphere of effective radius √(R × D).
// Error bound: for headRatio ≤ 2 (D = R/2), max error is ~6% at φ=45°.
// Phase 1 uses this approximation. Phase 2 can switch to numeric quadrature
// if distortion on eccentric heads is unacceptable (see Acceptance Tests).
const effectiveRadius = Math.sqrt(RADIUS * HEAD_DEPTH);
const indexRangeMm = Math.abs(config.yAxis[config.yAxis.length - 1] - config.yAxis[0]);
const phiSpan = indexRangeMm / effectiveRadius;
```

**Note on the arc-length approximation:** The geometric-mean radius `√(R × D)` is exact for a sphere (R = D) and degrades gracefully for ellipsoids. For the common 2:1 semi-ellipsoidal head (D = R/2), the meridian arc error peaks at ~6% near φ = 45°. An acceptance test (see below) will validate that the rendered scan extents match the expected physical footprint within 8% for headRatio ≤ 2.0.

### Vertex Loop

```typescript
const surfaceOffset = 2; // mm above the shell surface, matching shell scans
const TAN_TAN_HALF = TAN_TAN / 2;

for (let iy = 0; iy <= segmentsY; iy++) {
  const v = iy / segmentsY;
  // φ offset from center (polar / radial from apex)
  const phiOffset = (v - 0.5) * phiSpan;
  const currentPhiRad = centerPhiRad + phiOffset;
  const clampedPhiDeg = Math.max(PHI_EPSILON, Math.min(90,
    THREE.MathUtils.radToDeg(currentPhiRad)));

  for (let ix = 0; ix <= segmentsX; ix++) {
    const u = ix / segmentsX;
    // θ offset from center (azimuthal / circumferential)
    const thetaOffset = (u - 0.5) * angularSpan;
    const currentThetaDeg = THREE.MathUtils.radToDeg(centerThetaRad + thetaOffset);

    // Shared helper returns mm-space local coords
    const local = domeLocalFromPhiTheta(
      clampedPhiDeg, currentThetaDeg, RADIUS, HEAD_DEPTH,
    );

    // Convert to scaled world coordinates (matching texture-manager.ts pattern)
    const rScaled = (local.rLocalMm + surfaceOffset) * SCALE;
    const tangentLinePos = tangentLineMm; // mm from LTL for this head
    const axialPosMm = tangentLinePos + headSign * local.axialMm;
    const axialGlobal = (axialPosMm - TAN_TAN_HALF) * SCALE; // centered on vessel midpoint

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

    // UV mapping: dome loop axes differ from shell loop axes.
    // Here ix/u = theta (circumferential/scan) and iy/v = phi (radial/index).
    // texture.x (scanMapped) tracks the scan/circumferential axis → derived from u.
    // texture.y (indexMapped) tracks the index/radial axis → derived from v.
    const scanMapped = config.scanDirection === 'ccw' ? u : 1 - u;
    const indexMapped = config.indexDirection === 'inward' ? v : 1 - v;
    uvs.push(scanMapped, indexMapped);
  }
}
```

### Heatmap Texture

Reuse the existing `createHeatmapTexture()` from `heatmap-texture.ts` — it operates on a 2D data array and returns a THREE.Texture. The dome scan just provides different geometry for the mesh that texture maps onto.

### Selection Border

Same pattern as shell scans — build a slightly larger border mesh behind the heatmap mesh, hidden when not selected.

## Orientation Gizmo: `buildDomeScanGizmo()` (Phase 2)

Similar to the existing `buildScanOrientationGizmo()` but adapted for the dome surface:

- **Origin dot** at `domeLocalFromPhiTheta(centerPhi, centerTheta, R, D)` → scaled world coords on the dome surface
- **Green arrow** follows a ring of constant φ around the dome (circumferential/scan direction)
- **Orange arrow** follows a meridian from the origin toward the equator or apex (index direction)
- **Click-to-toggle** arrows flip `scanDirection` / `indexDirection`
- **Draggable origin** moves `(centerPhi, centerTheta)` via `domePhiThetaFromPoint()` — constrained to the dome surface

The gizmo labels should display in dome-centric terms: "Scan: CW/CCW" and "Index: Outward/Inward" rather than "Forward/Reverse".

## UI: Sidebar

### Placement in Sidebar

Add a **"Dome Scans"** sub-section within the existing "Scan Overlays" accordion group, below the shell "Scan Composites" section. Only visible when `vesselShape === 'vessel'`.

### Phase 1 Add Flow (sidebar-entered placement, no gizmo)

Phase 1 does not include the interactive gizmo. Placement is entirely via sidebar controls:

1. User clicks "Add Dome Scan" button
2. File picker opens (same NDE file formats as shell composites)
3. Companion app parses the file and returns axis/data arrays
4. User selects which head: Left / Right (dropdown or toggle)
5. Default placement: `centerPhi = 45°`, `centerTheta = 90°` (TDC, halfway up the dome)
6. User adjusts placement via sidebar sliders for φ and θ
7. User toggles scan/index direction via sidebar toggles
8. `orientationConfirmed` is set to `true` on add (no gizmo confirm step in Phase 1)

### Per-Scan Controls (same pattern as shell composites)

- Name (editable)
- Head: Left / Right toggle
- Center φ: slider 0–90° with numeric input
- Center θ: slider 0–360° with numeric input
- Scan direction: CW / CCW toggle
- Index direction: Outward / Inward toggle
- Color scale dropdown
- Range min/max overrides
- Opacity slider
- Remove button

### Hover Tooltip (Phase 1)

Hover requires `interaction-manager.ts` to raycast dome scan meshes. This is a **small, bounded change** in Phase 1: add `domeScanMeshes` to the existing hover raycast alongside `scanCompositeMeshes` (see `interaction-manager.ts:498-504`). The dome meshes carry `userData.type = 'domeScan'` so the existing hit handler branches:

- For `scanComposite` hits: existing shell tooltip (position/angle)
- For `domeScan` hits: dome tooltip with φ/θ coordinates

The tooltip reads UV coordinates from the hit (same as shell scans) and maps back to data rows/cols. A **separate `onDomeScanHover` callback** avoids reusing the shell tooltip's hardcoded "Scan" / "Index" labels:

```typescript
interface DomeScanHoverInfo {
  scanId: string;
  thickness: number | null;
  phiDeg: number;   // polar angle from apex
  thetaDeg: number; // azimuthal position around dome
  row: number;
  col: number;
}
onDomeScanHover?: (info: DomeScanHoverInfo | null) => void;
```

Tooltip renders dome-native labels:

```
Thickness: 12.4 mm
φ: 34.2° from apex
θ: 127.5° (position around dome)
```

**This is the only `interaction-manager.ts` change in Phase 1.** Dragging, gizmo interaction, and click-to-select remain Phase 2.

## Interaction: Dragging (Phase 2)

Dome scans should be draggable on the dome surface. The raycaster hit point needs to be converted from Cartesian to `(φ, θ)` using the shared `domePhiThetaFromPoint()` helper:

```typescript
// In interaction-manager.ts drag handler for dome scans:
const tangentLineWorld = tangentLineMm * SCALE; // scaled tangent line position
const result = domePhiThetaFromPoint(
  hitPoint, RADIUS, HEAD_DEPTH, tangentLineWorld, headSign, isVertical,
);
if (result) {
  domeScan.centerPhi = result.phiDeg;
  domeScan.centerTheta = result.thetaDeg;
}
```

This replaces the shell drag logic which converts hit points to `(pos, angle)`.

## Sampling / Stats

For annotations that overlap dome scans, the existing `scan-sampling.ts` logic needs a dome-aware path. An annotation placed on the dome head would need to sample from `domeScanComposites` using `(φ, θ)` coordinates rather than `(pos, angle)`.

Deferred to Phase 3. Annotations on dome heads currently have no scan data to sample.

## Wall Loss Distribution

The wall loss distribution system reads `vesselState.scanComposites` exclusively (`useWallLossWorker.ts:102`). Dome scans stored in `domeScanComposites` will be **silently excluded** from wall loss calculations.

### Phase 1: Explicit exclusion

Add a guard comment and ensure the "has scans" check does not include dome scans. The wall loss panel should display a note when dome scans exist but aren't included: *"Note: Dome scan data is not included in wall loss distribution (shell scans only)."*

### Phase 3: Full inclusion

Feed dome scans into the worker with dome-specific area calculations (surface area per data point on ellipsoid differs from shell cylinder). Use `domeNominalThickness` (already on `VesselState`) as the reference for dome loss percentages.

## Report Generation

The report generator (`report-generator.ts:560-600`) only reads `vessel.scanComposites` for scan log tables. Dome scan meshes will appear in viewport screenshots (they're Three.js meshes in the scene), but dome scans will **not** appear in scan summary tables.

### Phase 1: Screenshot-only

Dome scans render visually in report screenshots — no code change needed for that. Add a defensive note in the scan log table section: if `domeScanComposites.length > 0`, append a row: *"Dome scans: [N] (see viewport images)"*.

### Phase 3: Full report tables

Add dome-specific summary tables with dome coordinate columns (φ, θ instead of position/angle).

## Persistence

### Save/Load

`DomeScanConfig[]` serializes the same way as `ScanCompositeConfig[]` — the vessel state JSON blob stored via `vessel-model-service.ts`. The data array, axes, and placement parameters are all JSON-serializable.

**Hydration guard:** On load, if `domeScanComposites` is missing from the JSON (older saves), default to `[]`.

### Cloud Sync

The current `scan_composites` table uses a unique constraint on `(project_vessel_id, section_type)`. The existing `section_type` value `dome_end` cannot distinguish left from right head.

**Schema change:** Use `dome_left` and `dome_right` as `section_type` values instead of `dome_end`. This requires:

1. A migration to document the new allowed values (no DDL change needed — `section_type` is `TEXT`, not an enum).
2. Update `scan-composite-service.ts` to pass `dome_left` or `dome_right` based on `config.head`.
3. The unique constraint `(project_vessel_id, section_type)` then naturally allows one scan per head per vessel, with upsert working correctly.

If a vessel needs multiple dome scans on the same head (e.g. two passes), the constraint would need to be relaxed. **Phase 1 assumes one scan per head.** Phase 3 can revisit with a compound key if needed.

## Implementation Phases

### Phase 1: Core Rendering (MVP) — horizontal vessels only

- [ ] Add `DomeScanConfig` interface to `types.ts`
- [ ] Add `domeScanComposites: DomeScanConfig[]` to `VesselState` and defaults
- [ ] Create `dome-scan-geometry.ts` with shared helpers (`domeLocalFromPhiTheta`, `domePhiThetaFromPoint`) + `createDomeScanPlane()`
- [ ] Wire into `buildVesselScene()` render loop (add `domeScanMeshes` to `BuildSceneResult`)
- [ ] Add "Dome Scans" sub-section in sidebar with placement controls (sliders, not gizmo)
- [ ] Support adding a dome scan from companion NDE file data
- [ ] Heatmap rendering using existing `createHeatmapTexture()`
- [ ] Selection highlight border
- [ ] Hover tooltip with dome coordinates (add `domeScanMeshes` to interaction-manager raycast, `onDomeScanHover` callback)
- [ ] Save/load hydration with `domeScanComposites` defaulting to `[]`
- [ ] Wall loss panel note when dome scans exist but aren't in distribution
- [ ] Report scan-log defensive row for dome scan count

**Phase 1 does NOT include:** interactive gizmo, drag-to-reposition, cloud sync, wall loss integration, annotation sampling, vertical vessel orientation.

### Phase 2: Orientation, Interaction & Vertical Support

- [ ] Dome-specific orientation gizmo (`buildDomeScanGizmo()`) using shared helpers
- [ ] Drag-to-reposition on dome surface via `domePhiThetaFromPoint()`
- [ ] Wire into `interaction-manager.ts` (drag callbacks, click-to-select, mesh group registration)
- [ ] Confirm/reset orientation flow
- [ ] Per-row angular span correction for large-φ-range scans
- [ ] Cloud sync with `dome_left` / `dome_right` section types
- [ ] Vertical vessel orientation support (`isVertical` axis swap in vertex loop + inverse helper)
- [ ] Vertical vessel round-trip acceptance tests

### Phase 3: Analysis Integration

- [ ] Dome scan sampling for annotations placed on heads (`scan-sampling.ts`)
- [ ] Wall loss distribution inclusion (separate dome category, `useWallLossWorker.ts`)
- [ ] Dome-specific nominal thickness in distribution calcs
- [ ] Report tables for dome scan statistics (`report-generator.ts`)
- [ ] Multi-scan-per-head support (relax unique constraint if needed)

## Files Affected

| File | Change | Phase |
|------|--------|-------|
| `types.ts` | Add `DomeScanConfig`, extend `VesselState` | 1 |
| `engine/dome-scan-geometry.ts` | **New** — shared helpers + `createDomeScanPlane()` | 1 |
| `engine/vessel-geometry.ts` | Extend `BuildSceneResult` with `domeScanMeshes`, wire into `buildVesselScene()` | 1 |
| `engine/heatmap-texture.ts` | No changes (reused as-is) | — |
| `engine/interaction-manager.ts` | Add `domeScanMeshes` to hover raycast + dome tooltip branch (hover only) | 1 |
| `sidebar/DomeScanSection.tsx` | **New** — dome scan sub-section UI | 1 |
| `SidebarPanel.tsx` | Wire new section, add `ScanOverlaySubId` variant | 1 |
| `VesselModeler.tsx` | Add dome scan state management, callbacks, pass meshes to interaction-manager | 1 |
| `WallLossPanel.tsx` | Informational note when dome scans exist | 1 |
| `engine/report-generator.ts` | Defensive row in scan log table | 1 |
| `engine/scan-gizmo-geometry.ts` | `buildDomeScanGizmo()` using shared helpers | 2 |
| `engine/interaction-manager.ts` | Dome-surface drag callbacks, click-to-select, mesh group registration | 2 |
| `services/scan-composite-service.ts` | `dome_left` / `dome_right` section type support | 2 |
| `engine/scan-sampling.ts` | Dome scan sampling via `(φ, θ)` | 3 |
| `hooks/useWallLossWorker.ts` | Include dome composites with dome area calcs | 3 |
| `workers/wall-loss.worker.ts` | Dome surface area per data point | 3 |

## Acceptance Tests

These tests validate correctness at key risk points identified during review.

### Apex Safety (P0)

- `domeLocalFromPhiTheta(0, 0, R, D)` returns a valid result at the dome crown with no NaN in `axialMm`, `rLocalMm`, or `normal`.
- `domeLocalFromPhiTheta(PHI_EPSILON, θ, R, D)` for θ ∈ {0, 90, 180, 270} returns four distinct `(rLocalMm, thetaRad)` positions forming a tiny ring (not collapsed to one point).
- `createDomeScanPlane()` with `centerPhi = 5` (near apex) produces geometry with no NaN vertices and no degenerate (zero-area) triangles.

### Round-Trip Consistency (P1)

- For each `(phiDeg, thetaDeg)` in `{ (0.1, 0), (45, 90), (45, 270), (89, 180) }` × `{ left, right }`:
  - Build a vertex via the forward path in `createDomeScanPlane()` (mm → scaled world coords), then pass it through `domePhiThetaFromPoint()` — result must match `(φ, θ)` within 0.01°.
- Phase 1: horizontal orientation only. Phase 2 adds vertical round-trip tests.

### UV Correctness

- A 10×10 test scan placed at `(centerPhi=45, centerTheta=0)`:
  - Corner UVs are `(0,0), (1,0), (0,1), (1,1)` with default directions (`scanDirection='cw'`, `indexDirection='outward'`).
  - The center vertex UV is `(0.5, 0.5)`.
  - Swapping `scanDirection` to `'ccw'` flips the U/texture-x component (circumferential axis): `scanMapped = u` instead of `1-u`.
  - Swapping `indexDirection` to `'inward'` flips the V/texture-y component (radial axis): `indexMapped = v` instead of `1-v`.
  - Note: the dome loop's UV axis assignment differs from the shell loop. In the shell, `v` is circumferential; in the dome, `u` (ix/theta) is circumferential. The test must verify the dome-specific mapping, not copy the shell assertion.

### Arc-Length Approximation

- For `headRatio` ∈ `{1.0, 1.5, 2.0, 2.5}`:
  - Place a scan from `φ = 20°` to `φ = 70°` and compute the rendered meridian arc length (sum of vertex-to-vertex distances along a meridian).
  - Compare against numerical quadrature of the ellipsoidal meridian integral.
  - Rendered arc must be within **8%** of the true arc for `headRatio ≤ 2.0` and within **15%** for `headRatio = 2.5`.
  - If the 8% threshold fails for any common head ratio, switch to Simpson's rule quadrature in Phase 2.

### Save/Load Hydration

- Save a vessel state with one dome scan, reload — `domeScanComposites[0]` round-trips identically (all fields including `head`, `centerPhi`, `centerTheta`, `data`, `stats`).
- Load a vessel state JSON that has no `domeScanComposites` key — defaults to `[]` with no error.

### Cloud Sync (Phase 2)

- Upsert with `section_type = 'dome_left'` creates a record; upsert again replaces it.
- Upsert with `section_type = 'dome_right'` on the same vessel creates a separate record.
- Both records coexist under the same `project_vessel_id`.

## Open Questions

1. **Variable angular density.** Near the apex (small φ), a given circumferential mm covers a much larger angle than near the equator. Should the mesh compensate by varying segment density, or is uniform φ/θ spacing acceptable visually? *Likely fine for Phase 1 — the PHI_EPSILON clamp prevents the worst case.*

2. **Apex coverage.** Can a dome scan actually cover the dead center (φ ≈ 0)? If so, the mesh needs to handle the polar singularity gracefully — probably a small cap or fan of triangles converging at the pole. *Phase 1 clamps to PHI_EPSILON; a proper apex cap mesh is a Phase 2 enhancement if real scans need it.*

3. **Cross-boundary scans.** If a real-world scan straddles the tangent line (some data on shell, some on dome), how should this be handled? *User splits it into two composites — a shell scan and a dome scan — using the C-scan visualizer's crop tool.*
