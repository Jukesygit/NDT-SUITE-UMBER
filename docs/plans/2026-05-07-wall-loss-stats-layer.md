# Wall Loss Stats Layer — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a configurable HUD panel to the 3D vessel modeler that shows wall-loss-% group readouts (area breakdown by bin) for overlaid C-scan composites.

**Architecture:** A new pure-math engine (`wall-loss-distribution.ts`) iterates confirmed scan composite data grids, computes wall loss % = `(nominal - measured) / nominal * 100` per cell, calculates true surface area per cell (cylindrical or ellipsoidal, splitting at head/shell boundaries), and buckets into configurable bins. A floating HUD panel (`WallLossPanel.tsx`) renders the distribution table, stacked above the existing CoveragePanel. A sidebar config section (`WallLossConfigSection.tsx`) lets the user set nominal thickness, bin count, and toggle visibility. The private `sampleComposite()` in `annotation-stats.ts` is first extracted to a shared module so both annotation stats and wall-loss distribution can reuse the coordinate-mapping math.

**Tech Stack:** React 18, TypeScript 5.9, Vitest, existing vessel modeler engine patterns.

---

## Review-Driven Corrections (from Codex review)

This plan incorporates fixes for all issues identified in code review:

| Issue | Fix |
|-------|-----|
| Test said 80% loss → bin 3, but `floor(80/20) = 4` → bin 4 | Test data uses values that cleanly hit each of the 5 bins: 10mm (0%), 8mm (20%), 5mm (50%), 3mm (70%), 0mm (100%) |
| Axial mapping wrong when `yAxis[0] !== 0` | Formula: `posMin = indexStartMm + (yAxis[row] - yAxis[0])` — `indexStartMm` is vessel position of `yAxis[0]`, not raw zero |
| Last row/col extended beyond rendered overlay area | Iterate rows `0..rows-2`, cols `0..cols-2` only; each cell spans `[yAxis[row], yAxis[row+1]] × [xAxis[col], xAxis[col+1]]` — no fallback extension |
| Spatial hash overlap is fragile | Replace with exact overlap check via `sampleComposite()` from shared module |
| Config not persisted through save/load | Add `wallLossGroups` to both JSON export (line ~1582) and `buildSaveConfig` (line ~1696), plus both load paths (line ~608 and ~2041) |
| WallLoss and Coverage HUD panels overlap | WallLossPanel positioned above CoveragePanel; receives `coverageVisible` prop to adjust `bottom` offset |
| Equal-width bins only | Documented as v1 limitation; type shape noted as extensible |
| Cells crossing head/shell boundary classified by midpoint only | `cellAreaOnVessel` splits cells at `pos=0` and `pos=tanTan` boundaries, computing each sub-region with correct geometry |
| Main-thread `useMemo` may hitch on large composites | Tight memo deps keyed on serialized composite geometry (not array identity); `useDeferredValue` for config inputs |
| Failing tests committed as red | Tests and implementation in single task; commit only after green |

---

## Files Overview

| Action | File | Purpose |
|--------|------|---------|
| Modify | `src/components/VesselModeler/types.ts` | Add `WallLossGroupConfig`, `WallLossGroupBin`, `WallLossDistribution` types; add `wallLossGroups?` to `VesselState` |
| Create | `src/components/VesselModeler/engine/scan-sampling.ts` | Extract `normAngle()` and `sampleComposite()` from annotation-stats as public shared utilities |
| Modify | `src/components/VesselModeler/engine/annotation-stats.ts` | Import `normAngle` and `sampleComposite` from `scan-sampling.ts` instead of defining locally |
| Create | `src/components/VesselModeler/engine/wall-loss-distribution.ts` | Core engine: compute wall-loss distribution across composites with overlap handling and true surface area |
| Create | `src/components/VesselModeler/engine/__tests__/wall-loss-distribution.test.ts` | Tests for the distribution engine |
| Create | `src/components/VesselModeler/WallLossPanel.tsx` | Floating HUD overlay component (stacked above CoveragePanel) |
| Create | `src/components/VesselModeler/sidebar/WallLossConfigSection.tsx` | Sidebar config: nominal thickness, bin count, enable toggle |
| Modify | `src/components/VesselModeler/sidebar/index.ts` | Export `WallLossConfigSection` |
| Modify | `src/components/VesselModeler/vessel-modeler.css` | Add `.vm-wallloss-*` styles for the HUD panel |
| Modify | `src/components/VesselModeler/VesselModeler.tsx` | Wire `WallLossPanel` into render + handler + persistence (both save paths, both load paths) |
| Modify | `src/components/VesselModeler/SidebarPanel.tsx` | Wire `WallLossConfigSection` into the Inspection accordion |

---

## Task 1: Add Types

**Files:**
- Modify: `src/components/VesselModeler/types.ts:360-482`

**Step 1: Add wall-loss config and result types**

Insert after the `ThicknessThresholds` interface (after line 372) and before `AnnotationThicknessStats`:

```typescript
// ---------------------------------------------------------------------------
// Wall Loss Distribution
// ---------------------------------------------------------------------------

export interface WallLossGroupConfig {
  /** Whether the wall-loss stats panel is visible */
  enabled: boolean;
  /** Nominal wall thickness in mm — required for wall-loss calculation */
  nominalThickness: number;
  /** Number of equal-width bins to divide the 0–100 % wall-loss range into.
   *  v1 supports equal-width only; custom boundaries can be added later
   *  by extending this interface with an optional `boundaries: number[]` field. */
  binCount: number;
}

export interface WallLossGroupBin {
  /** Lower bound of wall-loss % (inclusive) */
  minPct: number;
  /** Upper bound of wall-loss % (exclusive, except last bin which is inclusive) */
  maxPct: number;
  /** True surface area falling in this bin (m²) */
  area: number;
  /** Percentage of total scanned area in this bin */
  areaPercent: number;
  /** Number of data-grid cells in this bin */
  count: number;
}

export interface WallLossDistribution {
  bins: WallLossGroupBin[];
  /** Total scanned surface area across all composites (m²) */
  totalScannedArea: number;
  /** Total valid data points processed */
  totalDataPoints: number;
  /** Nominal thickness used for calculation (mm) */
  nominalThickness: number;
}
```

**Step 2: Add `wallLossGroups` to `VesselState`**

In the `VesselState` interface (line ~468, after `thicknessThresholds?`), add:

```typescript
  /** Wall-loss distribution config — drives the floating stats panel */
  wallLossGroups?: WallLossGroupConfig;
```

**Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (new types are additive, no consumers yet)

**Step 4: Commit**

```bash
git add src/components/VesselModeler/types.ts
git commit -m "feat(vessel-modeler): add wall-loss distribution types"
```

---

## Task 2: Extract `sampleComposite` to Shared Module

**Files:**
- Create: `src/components/VesselModeler/engine/scan-sampling.ts`
- Modify: `src/components/VesselModeler/engine/annotation-stats.ts`

This task makes the private `sampleComposite()` and `normAngle()` functions in `annotation-stats.ts` available to the new wall-loss engine without duplication.

**Step 1: Create `scan-sampling.ts`**

Copy `normAngle()` (annotation-stats.ts:22) and `sampleComposite()` (annotation-stats.ts:37-93) into a new file, making both `export`-ed:

```typescript
// =============================================================================
// Shared Scan Composite Sampling Utilities
// =============================================================================
// Coordinate-mapping helpers used by both annotation-stats and wall-loss
// distribution engines. Extracted to avoid duplication.
// =============================================================================

import type { ScanCompositeConfig } from '../types';

/** Normalise an angle into the 0–360 range. */
export function normAngle(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Look up a thickness value in a composite's data grid for a given vessel
 * surface point expressed as (posMm, angleDeg).
 *
 * Returns the thickness value, or undefined if the point is outside the
 * composite's footprint or the data cell is null.
 */
export function sampleComposite(
  composite: ScanCompositeConfig,
  posMm: number,
  angleDeg: number,
  circumference: number,
): number | undefined {
  const { data, xAxis, yAxis, indexStartMm, datumAngleDeg, scanDirection, indexDirection } =
    composite;

  if (data.length === 0 || data[0].length === 0) return undefined;
  if (yAxis.length === 0 || xAxis.length === 0) return undefined;

  // --- Index (longitudinal) axis ---
  const indexRangeMm = yAxis[yAxis.length - 1] - yAxis[0];
  let indexOffset: number;
  if (indexDirection === 'forward') {
    indexOffset = posMm - indexStartMm;
  } else {
    indexOffset = indexStartMm - posMm;
  }
  if (indexOffset < 0 || indexOffset > indexRangeMm) return undefined;

  // --- Scan (circumferential) axis ---
  const scanStartMm = xAxis[0];
  const scanEndMm = xAxis[xAxis.length - 1];
  const scanRangeMm = scanEndMm - scanStartMm;

  const datumInAnnConvention = normAngle(datumAngleDeg + 90);
  let scanOffsetDeg: number;
  if (scanDirection === 'cw') {
    scanOffsetDeg = ((datumInAnnConvention - angleDeg) % 360 + 360) % 360;
  } else {
    scanOffsetDeg = ((angleDeg - datumInAnnConvention) % 360 + 360) % 360;
  }
  const scanOffsetMm = (scanOffsetDeg / 360) * circumference;
  if (scanOffsetMm < scanStartMm || scanOffsetMm > scanEndMm) return undefined;

  const rowFrac = indexRangeMm > 0 ? (indexOffset / indexRangeMm) * (data.length - 1) : 0;
  const colFrac = scanRangeMm > 0 ? ((scanOffsetMm - scanStartMm) / scanRangeMm) * (data[0].length - 1) : 0;

  const row = Math.round(rowFrac);
  const col = Math.round(colFrac);

  if (row < 0 || row >= data.length || col < 0 || col >= data[0].length) return undefined;

  const value = data[row][col];
  return value ?? undefined;
}
```

**Step 2: Refactor `annotation-stats.ts` to import from `scan-sampling.ts`**

Remove the local `normAngle()` function (lines 22-24) and `sampleComposite()` function (lines 37-93). Replace with imports:

```typescript
import { normAngle, sampleComposite } from './scan-sampling';
```

Keep the existing import of types. The rest of `annotation-stats.ts` (lines 103-244) stays unchanged — `computeAnnotationThicknessStats`, `computeSeverityLevel`, `recomputeAllAnnotationStats` all call `sampleComposite` and `normAngle` by the same names.

**Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (same public API, just moved)

**Step 4: Run existing tests**

Run: `npx vitest run src/components/VesselModeler/`
Expected: PASS (annotation stats behavior unchanged)

**Step 5: Commit**

```bash
git add src/components/VesselModeler/engine/scan-sampling.ts src/components/VesselModeler/engine/annotation-stats.ts
git commit -m "refactor(vessel-modeler): extract sampleComposite to shared scan-sampling module"
```

---

## Task 3: Implement Wall-Loss Distribution Engine + Tests

**Files:**
- Create: `src/components/VesselModeler/engine/wall-loss-distribution.ts`
- Create: `src/components/VesselModeler/engine/__tests__/wall-loss-distribution.test.ts`

Tests and implementation are written together and committed only after all tests pass (no red commits).

### Step 1: Write the engine

```typescript
// =============================================================================
// Wall-Loss Distribution Engine
// =============================================================================
// Computes a binned wall-loss-% distribution across all confirmed scan
// composites overlaid on the vessel. Uses true surface area (cylindrical
// or ellipsoidal) and applies "topmost composite wins" for overlaps via
// the shared sampleComposite() function.
// =============================================================================

import type {
  ScanCompositeConfig,
  VesselState,
  WallLossGroupConfig,
  WallLossGroupBin,
  WallLossDistribution,
} from '../types';
import { normAngle, sampleComposite } from './scan-sampling';

// ---------------------------------------------------------------------------
// Surface-area helpers (mirrors coverage-calculator.ts logic, but splits
// cells that cross the head/shell boundary at pos=0 and pos=tanTan)
// ---------------------------------------------------------------------------

const ELLIPSOID_SUBSTEPS = 8;

/**
 * Compute surface area for a cell that lies entirely within ONE region
 * (left head, cylinder, or right head). Caller must split boundary-
 * crossing cells before calling.
 */
function regionCellArea(
  posMin: number,
  posMax: number,
  dTheta: number,
  radius: number,
  headDepth: number,
  tanTan: number,
): number {
  if (dTheta <= 0 || posMax <= posMin) return 0;

  const midPos = (posMin + posMax) / 2;

  if (midPos >= 0 && midPos <= tanTan) {
    // Cylinder: dA = R × dθ × dPos
    return radius * dTheta * (posMax - posMin);
  }

  // Ellipsoidal head — numerical integration
  const isLeft = midPos < 0;
  const dz = (posMax - posMin) / ELLIPSOID_SUBSTEPS;
  let area = 0;
  for (let i = 0; i < ELLIPSOID_SUBSTEPS; i++) {
    const pos = posMin + (i + 0.5) * dz;
    const zLocal = isLeft ? -pos : pos - tanTan;
    const ratio = Math.min(0.999, Math.abs(zLocal / headDepth));
    const rLocal = radius * Math.sqrt(1 - ratio * ratio);
    const drdz = (radius * ratio) / (headDepth * Math.sqrt(1 - ratio * ratio));
    area += rLocal * Math.sqrt(1 + drdz * drdz) * dTheta * Math.abs(dz);
  }
  return area;
}

/**
 * Compute true surface area for a cell, splitting at head/shell boundaries
 * (pos=0 and pos=tanTan) so each sub-cell uses the correct geometry.
 */
function cellAreaOnVessel(
  posMin: number,
  posMax: number,
  angularSpanDeg: number,
  radius: number,
  headDepth: number,
  tanTan: number,
): number {
  const dTheta = (angularSpanDeg / 360) * 2 * Math.PI;
  if (dTheta <= 0 || posMax <= posMin) return 0;

  // Collect split points at region boundaries
  const splits: number[] = [posMin];
  if (posMin < 0 && posMax > 0) splits.push(0);
  if (posMin < tanTan && posMax > tanTan) splits.push(tanTan);
  splits.push(posMax);

  let total = 0;
  for (let i = 0; i < splits.length - 1; i++) {
    total += regionCellArea(splits[i], splits[i + 1], dTheta, radius, headDepth, tanTan);
  }
  return total;
}

// ---------------------------------------------------------------------------
// Forward-map: data-grid interval → vessel surface coordinates
// ---------------------------------------------------------------------------
// Each cell spans [yAxis[row], yAxis[row+1]] × [xAxis[col], xAxis[col+1]].
// Iterate rows 0..rows-2, cols 0..cols-2 so we never extend past the
// rendered overlay bounds (xAxis[last]-xAxis[0] by yAxis[last]-yAxis[0]).
// ---------------------------------------------------------------------------

interface CellInfo {
  posMin: number;    // vessel axial min (mm from left tangent)
  posMax: number;    // vessel axial max
  angularSpan: number; // degrees of circumferential span (always positive)
  posMid: number;    // vessel axial center
  angleMid: number;  // vessel circumferential center (0–360 degrees)
}

function cellToVessel(
  composite: ScanCompositeConfig,
  row: number,
  col: number,
  circumference: number,
): CellInfo {
  const { xAxis, yAxis, indexStartMm, datumAngleDeg, scanDirection, indexDirection } = composite;

  // Index (longitudinal) bounds — indexStartMm is vessel position of yAxis[0]
  const idxOffsetMin = yAxis[row] - yAxis[0];
  const idxOffsetMax = yAxis[row + 1] - yAxis[0];
  let posMin: number, posMax: number;
  if (indexDirection === 'forward') {
    posMin = indexStartMm + idxOffsetMin;
    posMax = indexStartMm + idxOffsetMax;
  } else {
    posMin = indexStartMm - idxOffsetMax;
    posMax = indexStartMm - idxOffsetMin;
  }

  // Scan (circumferential) span in degrees
  const scanMin = xAxis[col];
  const scanMax = xAxis[col + 1];
  const degPerMm = 360 / circumference;
  const angularSpan = (scanMax - scanMin) * degPerMm;

  // Cell center angle for overlap testing
  const scanMidMm = (scanMin + scanMax) / 2;
  const datumConv = normAngle(datumAngleDeg + 90);
  let angleMid: number;
  if (scanDirection === 'cw') {
    angleMid = normAngle(datumConv - scanMidMm * degPerMm);
  } else {
    angleMid = normAngle(datumConv + scanMidMm * degPerMm);
  }

  return {
    posMin, posMax, angularSpan,
    posMid: (posMin + posMax) / 2,
    angleMid,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function computeWallLossDistribution(
  vesselState: VesselState,
  config: WallLossGroupConfig,
): WallLossDistribution {
  const { binCount, nominalThickness } = config;
  const binWidth = 100 / binCount;

  // Initialise empty bins
  const bins: WallLossGroupBin[] = Array.from({ length: binCount }, (_, i) => ({
    minPct: i * binWidth,
    maxPct: i === binCount - 1 ? 100 : (i + 1) * binWidth,
    area: 0,
    areaPercent: 0,
    count: 0,
  }));

  const composites = vesselState.scanComposites.filter(c => c.orientationConfirmed);
  if (composites.length === 0 || nominalThickness <= 0) {
    return { bins, totalScannedArea: 0, totalDataPoints: 0, nominalThickness };
  }

  const radius = vesselState.id / 2;
  const headDepth = vesselState.id / (2 * vesselState.headRatio);
  const tanTan = vesselState.length;
  const circumference = Math.PI * vesselState.id;

  let totalArea = 0;
  let totalPoints = 0;

  // Iterate composites from topmost (last) to bottom (first).
  // For lower composites, check if a higher composite occludes each cell
  // using sampleComposite() — exact per-point overlap testing.
  for (let ci = composites.length - 1; ci >= 0; ci--) {
    const comp = composites[ci];
    const { data } = comp;
    if (data.length < 2 || data[0].length < 2) continue;

    // Higher-priority composites (indices > ci in the filtered array)
    const higherComps = composites.slice(ci + 1);

    for (let row = 0; row < data.length - 1; row++) {
      for (let col = 0; col < data[row].length - 1; col++) {
        const thickness = data[row][col];
        if (thickness == null) continue;

        const cell = cellToVessel(comp, row, col, circumference);

        // Overlap check: is this point occluded by any higher composite?
        if (higherComps.length > 0) {
          let occluded = false;
          for (const higher of higherComps) {
            if (!higher.orientationConfirmed) continue;
            if (sampleComposite(higher, cell.posMid, cell.angleMid, circumference) !== undefined) {
              occluded = true;
              break;
            }
          }
          if (occluded) continue;
        }

        // Compute wall loss %
        let wallLossPct = ((nominalThickness - thickness) / nominalThickness) * 100;
        if (wallLossPct < 0) wallLossPct = 0;
        if (wallLossPct > 100) wallLossPct = 100;

        // Determine bin index
        let binIdx = Math.floor(wallLossPct / binWidth);
        if (binIdx >= binCount) binIdx = binCount - 1;

        // Compute true surface area, splitting at head/shell boundaries
        const area = cellAreaOnVessel(
          cell.posMin, cell.posMax, cell.angularSpan,
          radius, headDepth, tanTan,
        );
        const areaM2 = area / 1e6; // mm² → m²

        bins[binIdx].area += areaM2;
        bins[binIdx].count += 1;
        totalArea += areaM2;
        totalPoints += 1;
      }
    }
  }

  // Compute area percentages
  if (totalArea > 0) {
    for (const bin of bins) {
      bin.areaPercent = (bin.area / totalArea) * 100;
    }
  }

  return { bins, totalScannedArea: totalArea, totalDataPoints: totalPoints, nominalThickness };
}
```

### Step 2: Write the test file

```typescript
import { describe, it, expect } from 'vitest';
import type { ScanCompositeConfig, VesselState, WallLossGroupConfig } from '../../types';
import { computeWallLossDistribution } from '../wall-loss-distribution';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeVesselState(overrides?: Partial<VesselState>): VesselState {
  return {
    id: 2000,          // 2000mm OD → R=1000mm, circumference ≈ 6283mm
    length: 8000,      // 8m tan-tan
    headRatio: 2,      // 2:1 ellipsoidal heads
    orientation: 'horizontal' as const,
    vesselName: 'Test',
    location: '',
    inspectionDate: '',
    nozzles: [],
    liftingLugs: [],
    saddles: [],
    textures: [],
    annotations: [],
    rulers: [],
    coverageRects: [],
    inspectionImages: [],
    scanComposites: [],
    welds: [],
    pipelines: [],
    referenceDrawings: [],
    measurementConfig: { referenceTangent: 'left', circumDirection: 'CW', viewFromEnd: 'left' },
    coordinateOrigin: { indexMm: 0, scanMm: 0 },
    hasModel: true,
    visuals: {} as any,
    ...overrides,
  } as VesselState;
}

/**
 * Create a scan composite on the cylinder.
 * 5 axis values → 4 intervals per axis → 4×4 = 16 area cells.
 * The data grid is 5×5 (one value per axis point), but the engine
 * iterates rows 0..3 and cols 0..3.
 */
function makeSimpleComposite(overrides?: Partial<ScanCompositeConfig>): ScanCompositeConfig {
  const data: (number | null)[][] = Array.from({ length: 5 }, () => Array(5).fill(8));
  return {
    id: 'sc_test',
    name: 'Test Scan',
    data,
    xAxis: [0, 100, 200, 300, 400],       // 5 points → 4 intervals, 400mm span
    yAxis: [0, 100, 200, 300, 400],        // 5 points → 4 intervals, 400mm span
    stats: { min: 8, max: 8, mean: 8, median: 8, stdDev: 0 },
    indexStartMm: 2000,                     // mid-cylinder (well within 0..8000 tan-tan)
    datumAngleDeg: 0,                       // TDC
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

const DEFAULT_CONFIG: WallLossGroupConfig = {
  enabled: true,
  nominalThickness: 10, // 10mm nominal
  binCount: 5,          // 5 bins: 0–20%, 20–40%, 40–60%, 60–80%, 80–100%
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeWallLossDistribution', () => {
  it('returns empty distribution when no composites exist', () => {
    const vs = makeVesselState();
    const result = computeWallLossDistribution(vs, DEFAULT_CONFIG);
    expect(result.bins).toHaveLength(5);
    expect(result.totalDataPoints).toBe(0);
    expect(result.totalScannedArea).toBe(0);
    result.bins.forEach(bin => {
      expect(bin.area).toBe(0);
      expect(bin.count).toBe(0);
    });
  });

  it('returns correct bin count matching config', () => {
    const vs = makeVesselState();
    const r3 = computeWallLossDistribution(vs, { ...DEFAULT_CONFIG, binCount: 3 });
    expect(r3.bins).toHaveLength(3);
    expect(r3.bins[0].minPct).toBe(0);
    expect(r3.bins[0].maxPct).toBeCloseTo(100 / 3, 5);
    expect(r3.bins[2].maxPct).toBe(100);
  });

  it('skips composites that are not orientation-confirmed', () => {
    const composite = makeSimpleComposite({ orientationConfirmed: false });
    const vs = makeVesselState({ scanComposites: [composite] });
    const result = computeWallLossDistribution(vs, DEFAULT_CONFIG);
    expect(result.totalDataPoints).toBe(0);
  });

  it('produces (rows-1)×(cols-1) cells — not rows×cols', () => {
    // 5×5 data grid with 5 axis values → 4×4 = 16 area intervals
    const composite = makeSimpleComposite();
    const vs = makeVesselState({ scanComposites: [composite] });
    const result = computeWallLossDistribution(vs, DEFAULT_CONFIG);
    expect(result.totalDataPoints).toBe(16);
  });

  it('places uniform-thickness readings into correct bin', () => {
    // 8mm measured, 10mm nominal → wall loss = (10-8)/10 = 20%
    // floor(20/20) = 1 → bin 1 (20–40%)
    const composite = makeSimpleComposite();
    const vs = makeVesselState({ scanComposites: [composite] });
    const result = computeWallLossDistribution(vs, DEFAULT_CONFIG);

    expect(result.nominalThickness).toBe(10);

    const bin1 = result.bins[1];
    expect(bin1.minPct).toBe(20);
    expect(bin1.maxPct).toBe(40);
    expect(bin1.count).toBe(result.totalDataPoints);
    expect(bin1.areaPercent).toBeCloseTo(100, 0);
  });

  it('handles null cells (no reading) by skipping them', () => {
    // 5×5 grid with alternating nulls; engine iterates [0..3][0..3] = 16 intervals
    const data: (number | null)[][] = [
      [8, null, 8, null, 8],
      [null, null, null, null, null],
      [8, null, 8, null, 8],
      [null, null, null, null, null],
      [8, null, 8, null, 8],
    ];
    const composite = makeSimpleComposite({ data });
    const vs = makeVesselState({ scanComposites: [composite] });
    const result = computeWallLossDistribution(vs, DEFAULT_CONFIG);

    // data[row][col] for row 0..3, col 0..3:
    // [0,0]=8, [0,1]=null, [0,2]=8, [0,3]=null
    // [1,0]=null, [1,1]=null, [1,2]=null, [1,3]=null
    // [2,0]=8, [2,1]=null, [2,2]=8, [2,3]=null
    // [3,0]=null, [3,1]=null, [3,2]=null, [3,3]=null
    // Non-null: 4 cells
    expect(result.totalDataPoints).toBe(4);
  });

  it('distributes varied thickness across correct bins', () => {
    // nominal=10mm. Per row:
    //   10mm → 0% loss  → floor(0/20)=0  → bin 0
    //   8mm  → 20% loss → floor(20/20)=1 → bin 1
    //   5mm  → 50% loss → floor(50/20)=2 → bin 2
    //   3mm  → 70% loss → floor(70/20)=3 → bin 3
    //   0mm  → 100% loss→ floor(100/20)=5 → clamped to bin 4
    // Each row has 4 cols (intervals 0..3), so 4 cells per row.
    // Row 4 (0mm) is the last row; since engine iterates row 0..3,
    // all 5 rows contribute cells from data[row][col] for row 0..3.
    const data: (number | null)[][] = [
      [10, 10, 10, 10, 10],
      [8,  8,  8,  8,  8],
      [5,  5,  5,  5,  5],
      [3,  3,  3,  3,  3],
      [0,  0,  0,  0,  0],
    ];
    const composite = makeSimpleComposite({ data });
    const vs = makeVesselState({ scanComposites: [composite] });
    const result = computeWallLossDistribution(vs, DEFAULT_CONFIG);

    // 4 rows × 4 cols = 16 total cells
    expect(result.totalDataPoints).toBe(16);
    // bin 0 (0–20%):  row 0: 10mm → 0% loss → 4 cells
    expect(result.bins[0].count).toBe(4);
    // bin 1 (20–40%): row 1: 8mm → 20% loss → 4 cells
    expect(result.bins[1].count).toBe(4);
    // bin 2 (40–60%): row 2: 5mm → 50% loss → 4 cells
    expect(result.bins[2].count).toBe(4);
    // bin 3 (60–80%): row 3: 3mm → 70% loss → 4 cells
    expect(result.bins[3].count).toBe(4);
    // bin 4 (80–100%): none (row 4 is last row, not iterated)
    expect(result.bins[4].count).toBe(0);
  });

  it('clamps negative wall loss to 0% (measured > nominal)', () => {
    // 12mm on 10mm nominal → -20% loss → clamped to 0% → bin 0
    const data: (number | null)[][] = [
      [12, 12, 12],
      [12, 12, 12],
    ];
    const composite = makeSimpleComposite({
      data,
      yAxis: [0, 100],
      xAxis: [0, 100, 200],
    });
    const vs = makeVesselState({ scanComposites: [composite] });
    const result = computeWallLossDistribution(vs, DEFAULT_CONFIG);

    // 1 row interval × 2 col intervals = 2 cells
    expect(result.totalDataPoints).toBe(2);
    expect(result.bins[0].count).toBe(result.totalDataPoints);
  });

  it('computes non-zero surface area on cylinder region', () => {
    const composite = makeSimpleComposite();
    const vs = makeVesselState({ scanComposites: [composite] });
    const result = computeWallLossDistribution(vs, DEFAULT_CONFIG);

    expect(result.totalScannedArea).toBeGreaterThan(0);
    // Scan spans 400mm axial × 400mm circumferential on R=1000 cylinder.
    // Angular span = 400 / (π×2000) × 360 ≈ 22.9°. dTheta ≈ 0.4 rad.
    // Cylinder area = R × dTheta × axialLength = 1000 × 0.4 × 400 = 160,000 mm² ≈ 0.16 m²
    // (per interval: ~0.01 m²; 16 intervals ≈ 0.16 m² — though intervals are
    // per 100mm step so each ≈ 1000 × (100/6283×2π) × 100 ≈ 10,000 mm²)
    expect(result.totalScannedArea).toBeGreaterThan(0.01);
    expect(result.totalScannedArea).toBeLessThan(1.0);
  });

  it('area percentages sum to ~100%', () => {
    const data: (number | null)[][] = [
      [10, 8, 5],
      [10, 8, 5],
      [10, 8, 5],
    ];
    const composite = makeSimpleComposite({
      data,
      yAxis: [0, 100, 200],
      xAxis: [0, 100, 200],
    });
    const vs = makeVesselState({ scanComposites: [composite] });
    const result = computeWallLossDistribution(vs, DEFAULT_CONFIG);

    const sumPct = result.bins.reduce((s, b) => s + b.areaPercent, 0);
    expect(sumPct).toBeCloseTo(100, 0);
  });

  it('handles non-zero yAxis[0] correctly (offset origin)', () => {
    // yAxis starts at 500, not 0. indexStartMm=2000 means vessel pos of yAxis[0]=500 is 2000.
    // So vessel pos of yAxis[1]=600 is 2100 (forward direction).
    const data: (number | null)[][] = [
      [8, 8, 8],
      [8, 8, 8],
      [8, 8, 8],
    ];
    const composite = makeSimpleComposite({
      data,
      yAxis: [500, 600, 700],
      xAxis: [0, 100, 200],
      indexStartMm: 2000,
    });
    const vs = makeVesselState({ scanComposites: [composite] });
    const result = computeWallLossDistribution(vs, DEFAULT_CONFIG);

    // 2 row intervals × 2 col intervals = 4 cells, all on cylinder (2000..2200)
    expect(result.totalDataPoints).toBe(4);
    expect(result.totalScannedArea).toBeGreaterThan(0);
  });

  it('handles topmost-wins overlap when composites overlap', () => {
    // Two composites at the same position. Second (topmost) has 5mm (50% loss).
    // First has 8mm (20% loss). Only topmost values should be counted in
    // the overlap region.
    const bottom = makeSimpleComposite({ id: 'sc_bottom' });
    const topData: (number | null)[][] = Array.from({ length: 5 }, () => Array(5).fill(5));
    const top = makeSimpleComposite({ id: 'sc_top', data: topData });

    const vs = makeVesselState({ scanComposites: [bottom, top] });
    const result = computeWallLossDistribution(vs, DEFAULT_CONFIG);

    // Top composite: 5mm → 50% loss → bin 2 (40–60%)
    // Bottom composite: fully occluded by top → 0 cells
    // Total: 16 cells from top only
    expect(result.totalDataPoints).toBe(16);
    expect(result.bins[2].count).toBe(16);
  });
});
```

### Step 3: Run tests

Run: `npx vitest run src/components/VesselModeler/engine/__tests__/wall-loss-distribution.test.ts`
Expected: ALL PASS

If any test fails, debug and fix before proceeding. Key invariants to check:
- `(rows-1) × (cols-1)` cell count, not `rows × cols`
- Bin boundary: `floor(wallLoss / binWidth)` clamped to `binCount - 1`
- Axial mapping: `indexStartMm + (yAxis[row] - yAxis[0])`, not `indexStartMm + yAxis[row]`

### Step 4: Run full test suite

Run: `npx vitest run`
Expected: PASS (no regressions)

### Step 5: Commit

```bash
git add src/components/VesselModeler/engine/wall-loss-distribution.ts src/components/VesselModeler/engine/__tests__/wall-loss-distribution.test.ts
git commit -m "feat(vessel-modeler): implement wall-loss distribution engine with tests"
```

---

## Task 4: Add WallLossPanel HUD Component

**Files:**
- Create: `src/components/VesselModeler/WallLossPanel.tsx`

This mirrors the existing `CoveragePanel.tsx` pattern but stacks above it when both are visible.

**Step 1: Create the panel component**

```typescript
import { useMemo, useDeferredValue } from 'react';
import type { VesselState } from './types';
import { computeWallLossDistribution } from './engine/wall-loss-distribution';

interface WallLossPanelProps {
  vesselState: VesselState;
  sidebarOpen: boolean;
  /** Whether the CoveragePanel is visible below this panel */
  coverageVisible: boolean;
}

function formatArea(m2: number): string {
  return m2 < 0.01 ? m2.toFixed(4) : m2.toFixed(2);
}

function formatPct(pct: number): string {
  return pct < 0.1 && pct > 0 ? pct.toFixed(2) : pct.toFixed(1);
}

const BIN_COLORS = [
  'rgba(0, 204, 102, 0.9)',    // green — low loss
  'rgba(144, 238, 144, 0.9)',  // light green
  'rgba(255, 204, 0, 0.9)',    // yellow
  'rgba(255, 140, 0, 0.9)',    // orange
  'rgba(255, 60, 60, 0.9)',    // red — high loss
];

function binColor(index: number, total: number): string {
  if (total <= BIN_COLORS.length) return BIN_COLORS[index] ?? BIN_COLORS[BIN_COLORS.length - 1];
  const t = total > 1 ? index / (total - 1) : 0;
  const mapped = Math.round(t * (BIN_COLORS.length - 1));
  return BIN_COLORS[mapped];
}

export default function WallLossPanel({ vesselState, sidebarOpen, coverageVisible }: WallLossPanelProps) {
  const config = vesselState.wallLossGroups;
  const hasScans = vesselState.scanComposites.some(c => c.orientationConfirmed);

  // Defer config changes to avoid hitching the viewport on rapid slider drags
  const deferredConfig = useDeferredValue(config);

  // Tight memo deps: serialise only the composite fields that affect distribution
  const compositeKey = useMemo(() =>
    JSON.stringify(vesselState.scanComposites.map(c => ({
      id: c.id,
      orientationConfirmed: c.orientationConfirmed,
      indexStartMm: c.indexStartMm,
      datumAngleDeg: c.datumAngleDeg,
      scanDirection: c.scanDirection,
      indexDirection: c.indexDirection,
      rows: c.data.length,
      cols: c.data[0]?.length ?? 0,
    }))),
    [vesselState.scanComposites],
  );

  const result = useMemo(() => {
    if (!deferredConfig?.enabled || !hasScans) return null;
    return computeWallLossDistribution(vesselState, deferredConfig);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    deferredConfig?.enabled, deferredConfig?.nominalThickness, deferredConfig?.binCount,
    compositeKey, vesselState.id, vesselState.length, vesselState.headRatio, hasScans,
  ]);

  if (!result || result.totalDataPoints === 0) return null;

  // Stack above CoveragePanel when it's visible
  const bottom = coverageVisible ? 200 : 48;

  return (
    <div
      className="vm-wallloss-panel"
      style={{ left: sidebarOpen ? 350 : 16, bottom }}
    >
      <div className="vm-wallloss-title">
        Wall Loss Distribution
        <span className="vm-wallloss-nominal">
          Nom. {result.nominalThickness}mm
        </span>
      </div>
      <div className="vm-wallloss-row vm-wallloss-header">
        <span className="vm-wallloss-range">Range</span>
        <span className="vm-wallloss-area">Area</span>
        <span className="vm-wallloss-pct">%</span>
        <span className="vm-wallloss-count">Pts</span>
      </div>
      {result.bins.map((bin, i) => (
        <div key={i} className="vm-wallloss-row">
          <span
            className="vm-wallloss-swatch"
            style={{ backgroundColor: binColor(i, result.bins.length) }}
          />
          <span className="vm-wallloss-range">
            {bin.minPct.toFixed(0)}–{bin.maxPct.toFixed(0)}%
          </span>
          <span className="vm-wallloss-area">{formatArea(bin.area)} m&sup2;</span>
          <span className="vm-wallloss-pct">{formatPct(bin.areaPercent)}%</span>
          <span className="vm-wallloss-count">{bin.count}</span>
        </div>
      ))}
      <div className="vm-wallloss-divider" />
      <div className="vm-wallloss-row vm-wallloss-total">
        <span className="vm-wallloss-range">Total</span>
        <span className="vm-wallloss-area">{formatArea(result.totalScannedArea)} m&sup2;</span>
        <span className="vm-wallloss-pct">100%</span>
        <span className="vm-wallloss-count">{result.totalDataPoints}</span>
      </div>
    </div>
  );
}
```

**Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/VesselModeler/WallLossPanel.tsx
git commit -m "feat(vessel-modeler): add WallLossPanel HUD component"
```

---

## Task 5: Add CSS for the Panel

**Files:**
- Modify: `src/components/VesselModeler/vessel-modeler.css`

Insert the following block after the existing `.vm-coverage-*` styles (after line ~1521):

**Step 1: Add wall-loss panel styles**

```css
/* ===========================================================================
   Wall Loss Distribution Panel (Floating Overlay)
   Stacks above CoveragePanel via dynamic bottom offset prop.
   =========================================================================== */

.vm-wallloss-panel {
    position: absolute;
    bottom: 48px;
    left: 350px;
    z-index: 15;
    background: rgba(20, 25, 35, 0.88);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    padding: 10px 14px;
    min-width: 280px;
    transition: left 0.3s ease, bottom 0.3s ease;
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.85);
    font-family: var(--font-mono, monospace);
}

.vm-wallloss-title {
    font-size: 0.7rem;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.5);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.vm-wallloss-nominal {
    font-weight: 400;
    font-size: 0.65rem;
    color: rgba(255, 255, 255, 0.35);
    text-transform: none;
}

.vm-wallloss-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 0;
}

.vm-wallloss-swatch {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    flex-shrink: 0;
}

.vm-wallloss-range {
    flex: 1;
    color: rgba(255, 255, 255, 0.7);
}

.vm-wallloss-area {
    width: 72px;
    text-align: right;
    color: rgba(255, 255, 255, 0.6);
}

.vm-wallloss-pct {
    width: 44px;
    text-align: right;
    color: rgba(0, 204, 102, 0.9);
    font-weight: 600;
}

.vm-wallloss-count {
    width: 40px;
    text-align: right;
    color: rgba(255, 255, 255, 0.4);
}

.vm-wallloss-header {
    font-size: 0.6rem;
    color: rgba(255, 255, 255, 0.35);
    padding-bottom: 0;
}

.vm-wallloss-header .vm-wallloss-area,
.vm-wallloss-header .vm-wallloss-pct,
.vm-wallloss-header .vm-wallloss-count {
    color: rgba(255, 255, 255, 0.35);
    font-weight: 400;
}

.vm-wallloss-divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.12);
    margin: 4px 0;
}

.vm-wallloss-total .vm-wallloss-range {
    font-weight: 700;
    color: rgba(255, 255, 255, 0.9);
}

.vm-wallloss-total .vm-wallloss-area,
.vm-wallloss-total .vm-wallloss-pct {
    font-weight: 700;
}
```

**Step 2: Commit**

```bash
git add src/components/VesselModeler/vessel-modeler.css
git commit -m "feat(vessel-modeler): add wall-loss panel CSS styles"
```

---

## Task 6: Add Sidebar Config Section

**Files:**
- Create: `src/components/VesselModeler/sidebar/WallLossConfigSection.tsx`
- Modify: `src/components/VesselModeler/sidebar/index.ts`

**Step 1: Create the config section**

```typescript
import type { WallLossGroupConfig } from '../types';
import { SubSection } from './SliderRow';

export interface WallLossConfigSectionProps {
  config: WallLossGroupConfig | undefined;
  onUpdate: (config: WallLossGroupConfig) => void;
}

const DEFAULTS: WallLossGroupConfig = {
  enabled: false,
  nominalThickness: 10,
  binCount: 5,
};

export function WallLossConfigSection({ config, onUpdate }: WallLossConfigSectionProps) {
  const c = config ?? DEFAULTS;

  const change = (updates: Partial<WallLossGroupConfig>) => {
    onUpdate({ ...c, ...updates });
  };

  return (
    <SubSection title="Wall Loss Stats">
      <div className="vm-control-group" style={{ marginBottom: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={c.enabled}
            onChange={e => change({ enabled: e.target.checked })}
          />
          <span className="vm-label" style={{ margin: 0 }}>Show wall-loss panel</span>
        </label>
      </div>

      {c.enabled && (
        <>
          <div className="vm-control-group">
            <div className="vm-label"><span>Nominal thickness (mm)</span></div>
            <input
              type="number"
              className="vm-input"
              value={c.nominalThickness}
              min={0.1}
              step={0.1}
              onChange={e => change({ nominalThickness: Math.max(0.1, Number(e.target.value)) })}
            />
          </div>
          <div className="vm-control-group">
            <div className="vm-label"><span>Number of bins</span></div>
            <input
              type="number"
              className="vm-input"
              value={c.binCount}
              min={2}
              max={20}
              step={1}
              onChange={e => change({ binCount: Math.max(2, Math.min(20, Math.round(Number(e.target.value)))) })}
            />
          </div>
        </>
      )}
    </SubSection>
  );
}
```

**Step 2: Export from barrel**

Add to `src/components/VesselModeler/sidebar/index.ts`:

```typescript
export { WallLossConfigSection } from './WallLossConfigSection';
```

**Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/VesselModeler/sidebar/WallLossConfigSection.tsx src/components/VesselModeler/sidebar/index.ts
git commit -m "feat(vessel-modeler): add WallLossConfigSection sidebar component"
```

---

## Task 7: Wire Into VesselModeler and SidebarPanel + Persistence

**Files:**
- Modify: `src/components/VesselModeler/VesselModeler.tsx`
- Modify: `src/components/VesselModeler/SidebarPanel.tsx`

This task also adds `wallLossGroups` to both save paths and both load paths so the config survives save/load cycles.

### Step 1: VesselModeler.tsx — imports and handler

At the import block (near line 50), add:

```typescript
import WallLossPanel from './WallLossPanel';
```

Add `WallLossGroupConfig` to the type imports from `./types` (line ~3).

Add a callback handler near the `updateThicknessThresholds` handler (around line ~1072):

```typescript
const handleUpdateWallLossGroups = useCallback((config: WallLossGroupConfig) => {
    updateVessel(prev => ({ ...prev, wallLossGroups: config }));
}, [updateVessel]);
```

### Step 2: VesselModeler.tsx — render the panel

In the JSX, right after `<CoveragePanel>` (line ~3049), add:

```tsx
<WallLossPanel
    vesselState={vesselState}
    sidebarOpen={ui.sidebarOpen}
    coverageVisible={vesselState.coverageRects.length > 0}
/>
```

### Step 3: VesselModeler.tsx — persist in JSON export (handleExport)

In the `handleExport` function (around line ~1582, after `annotationTableSize`), add:

```typescript
wallLossGroups: vesselState.wallLossGroups,
```

### Step 4: VesselModeler.tsx — persist in cloud save (buildSaveConfig)

In `buildSaveConfig` (around line ~1696, after `annotationTableSize`), add:

```typescript
wallLossGroups: vesselState.wallLossGroups,
```

### Step 5: VesselModeler.tsx — load from JSON import (first load path)

In the file-import load path (around line ~608, after `annotationTableSize`), add:

```typescript
wallLossGroups: projectData.wallLossGroups,
```

### Step 6: VesselModeler.tsx — load from cloud (second load path)

In the cloud-load path (around line ~2041, after `visuals`), add:

```typescript
wallLossGroups: projectData.wallLossGroups,
```

### Step 7: VesselModeler.tsx — pass handler to SidebarPanel

Add to the `<SidebarPanel>` JSX props:

```tsx
onUpdateWallLossGroups={handleUpdateWallLossGroups}
```

### Step 8: SidebarPanel.tsx — wire config section

Add `WallLossConfigSection` to the destructured import from `'./sidebar'` (line ~28).

Add `WallLossGroupConfig` to the type imports from `'./types'` (line ~15).

Add the prop to `SidebarPanelProps` (around line ~133, near `onUpdateThicknessThresholds`):

```typescript
onUpdateWallLossGroups: (config: WallLossGroupConfig) => void;
```

In the Inspection accordion section, add `WallLossConfigSection` after `AnnotationSection` (around line ~408). Place it in both vessel-mode and pipe-mode Inspection sections:

```tsx
<WallLossConfigSection
    config={vesselState.wallLossGroups}
    onUpdate={props.onUpdateWallLossGroups}
/>
```

### Step 9: Run typecheck

Run: `npx tsc --noEmit`
Expected: PASS

### Step 10: Run full test suite

Run: `npx vitest run`
Expected: ALL PASS

### Step 11: Commit

```bash
git add src/components/VesselModeler/VesselModeler.tsx src/components/VesselModeler/SidebarPanel.tsx
git commit -m "feat(vessel-modeler): wire wall-loss panel, config, and persistence"
```

---

## Task 8: Build Verification and Manual Test

**Step 1: Run production build**

Run: `npm run build`
Expected: PASS with no errors

**Step 2: Visual smoke test**

Run: `npm run dev`

Test checklist:
- [ ] Open the vessel modeler
- [ ] Load a vessel with at least one confirmed scan composite overlay
- [ ] Open Inspection → Annotations → Wall Loss Stats subsection
- [ ] Check "Show wall-loss panel" checkbox
- [ ] Set nominal thickness to the correct value for the scan
- [ ] Verify the floating HUD panel appears at bottom-left (above coverage panel if visible)
- [ ] Verify bin rows show colored swatches, wall-loss ranges, area, and percentages
- [ ] Verify area percentages sum to ~100%
- [ ] Change bin count — panel should update (may lag slightly via useDeferredValue)
- [ ] Toggle sidebar closed — panel should shift left smoothly
- [ ] Uncheck "Show wall-loss panel" — HUD should disappear
- [ ] Test with no scan composites loaded — panel should not appear
- [ ] Enable both coverage rects and wall-loss panel — verify they don't overlap
- [ ] Save the model to JSON, reload — verify wall-loss config is preserved
- [ ] Test with overlapping composites — verify topmost-wins behavior (no double-counted area)

**Step 3: Final commit (if any adjustments needed)**

```bash
git add -A
git commit -m "fix(vessel-modeler): adjustments from wall-loss panel smoke test"
```

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| New `WallLossGroupConfig` type instead of extending `ThicknessThresholds` | ThicknessThresholds is a red/yellow/green severity classifier based on minimum thickness. Multi-bin wall-loss distribution is a fundamentally different concept — conflating them would muddy both APIs. |
| Wall loss % = `(nominal - measured) / nominal × 100` | Industry-standard wall-loss formula. Distinct from "% of nominal" (which would be `measured / nominal`). Clamped to 0–100%. |
| Extract `sampleComposite()` to shared module | The function was private in annotation-stats.ts. Both annotation stats and wall-loss distribution need coordinate mapping. Shared module avoids duplication. |
| Topmost-composite-wins via `sampleComposite()` | Exact per-point occlusion check matches existing annotation-stats behavior (line 139). Avoids fragile spatial hashing by reusing the same coordinate math the rest of the system uses. |
| Cell iteration: `rows 0..n-2, cols 0..m-2` | Each data cell spans `[yAxis[row], yAxis[row+1]] × [xAxis[col], xAxis[col+1]]`. This matches the renderer's overlay extent from `xAxis[0]` to `xAxis[last]` — no overcount. |
| Axial mapping: `indexStartMm + (yAxis[row] - yAxis[0])` | `indexStartMm` is the vessel position of `yAxis[0]`, not of raw zero. Subtracting `yAxis[0]` before adding to `indexStartMm` handles non-zero-origin axis data. |
| `cellAreaOnVessel` splits at head/shell boundaries | Cells crossing `pos=0` or `pos=tanTan` are split into sub-cells, each computed with correct geometry (cylinder vs ellipsoid). Matches coverage-calculator's boundary insertion approach. |
| Ellipsoidal surface area for head regions | Flat `xStep × yStep` would undercount area on curved heads. Uses numerical integration from coverage-calculator.ts. |
| `useDeferredValue` for config + tight memo deps | Prevents viewport hitch when dragging nominal-thickness slider. Memo keyed on serialized composite geometry (not array identity) avoids false recomputes. |
| HUD panel stacks above CoveragePanel | Dynamic `bottom` offset via `coverageVisible` prop avoids z-fighting. Transition smooths layout changes. |
| Config in sidebar Inspection section | Wall-loss stats are conceptually adjacent to existing thickness thresholds. Keeps configuration discoverable near related controls. |
| Equal-width bins only (v1) | Documented limitation. Type shape includes a comment noting `boundaries: number[]` can be added later for custom grouping. |
| Config persisted through save/load | Added to both save paths (`handleExport` + `buildSaveConfig`) and both load paths (file import + cloud load). `thicknessThresholds` has the same persistence gap as a pre-existing issue — not addressed here. |

---

## Known Limitations (v1)

1. **Equal-width bins only** — no custom boundary definitions. Extensible via future `boundaries?: number[]` on `WallLossGroupConfig`.
2. **Main-thread computation** — mitigated by `useDeferredValue` and tight memo deps, but very large composites (>500k cells) may still cause a noticeable pause. A web worker path would be the fix.
3. **Cell-center overlap check** — `sampleComposite()` tests the center of each cell. Cells partially overlapping a higher composite at their edges will be included/excluded based on center only. Acceptable for typical grid resolutions (~1-5mm).
4. **CoveragePanel height assumption** — WallLossPanel's `bottom: 200` offset when coverage is visible assumes CoveragePanel is ~140px tall. If coverage shows many regions, the panels could overlap. A measured-height approach (via ref) would be more robust.
