# 3D Topology Viewer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a standalone experimental 3D surface viewer that renders NDE thickness grids as interactive topographic surfaces — corrosion pits become valleys, nominal wall is a plateau. Every measurement and display decision must preserve inspection truth.

**Architecture:** Reuse the existing `CscanData` type and file parser pipeline (including offset repair) to load scan data. Build a Three.js `BufferGeometry` with per-vertex Y-displacement from a user-specified nominal baseline, using min-preserving decimation for display while keeping full-resolution data for measurements and cross-sections. Null/ND regions create genuine gaps in the mesh. A lightweight scene wrapper (separate from VesselModeler) provides orbit controls, raycasting for hover readout, cross-section slicing, and two-point measurement. The page is a new `/topology` route with sidebar entry under Tools, labeled as experimental.

**Tech Stack:** Three.js (BufferGeometry, OrbitControls, Raycaster), React 18, TypeScript, existing `colorscales.ts`, existing `fileParser.ts` / `workerManager.ts`, existing `CsvRepairModal`

---

## Data Integrity Invariants

These rules are non-negotiable. Every engine function and test must respect them.

1. **Measurements are physical.** All distances and thickness values reported to the user are in true mm. Visual exaggeration never contaminates measurement outputs.
2. **Downsampling preserves extremes.** Display decimation uses min-of-block (not nearest-neighbor or averaging) so the thinnest point in any decimation block survives. Measurements and cross-sections always sample from the full-resolution grid.
3. **No-data is no-data.** Null grid cells produce no geometry. Triangles touching a null vertex are omitted from the index buffer. ND regions are genuine holes in the mesh, not flat plateaus.
4. **Baseline is explicit.** The flat reference plane is the user-specified nominal wall thickness (from GA drawing). Fallback is the 95th percentile of data. Never use `stats.max` — it can be noise.
5. **Scan repair runs before render.** Offset detection and correction from the existing CsvRepairModal pipeline run before any 3D surface is built.

---

## Coordinate Convention (Three.js Y-Up)

The surface uses Three.js standard Y-up orientation:

| Axis | Maps to | Direction |
|------|---------|-----------|
| **X** | Scan axis | mm along circumference |
| **Z** | Index axis | mm along vessel length |
| **Y** | Displacement | 0 = nominal wall, negative = wall loss (valleys) |

Camera starts elevated and angled, looking down at the XZ plane. `OrbitControls` target is the surface center. Hemisphere light sky color comes from above (+Y), ground color from below (-Y). Directional lights positioned with Y as the dominant up component.

---

## Architecture Overview

```
TopologyViewerPage (/topology route, lazy-loaded, labeled "Experimental")
└── TopologyViewer (main component, <150 lines)
    ├── TopologyToolbar (Z-scale, nominal wall, colorscale, tool mode)
    ├── TopologyViewport (Three.js canvas, all 3D interaction)
    ├── TopologyInfoPanel (hover readout overlay, surface stats)
    └── CrossSectionPanel (2D profile chart, visible when slicing)

Engine (pure functions + scene management):
├── topology-surface.ts       — CscanData → BufferGeometry (min-preserving decimation, null-gap index)
├── topology-scene.ts         — Three.js scene lifecycle (Y-up camera, lights, renderer)
├── topology-cross-section.ts — Full-res bilinear sampling → profile with traceability
├── topology-measurement.ts   — True physical distance/depth (no exaggeration)
└── topology-decimation.ts    — Min-preserving grid decimation (shared)
```

**Data flow:**
```
File drop/upload → workerManager.processFilesWithWorker()
  → hasOffsetIssues? → CsvRepairModal → corrected CscanData
    → buildTopologySurface(cscan, options)
      → decimateGridMinPreserving(data, maxRes) [display geometry]
      → buildIndexBuffer() [skips null-adjacent triangles]
      → THREE.BufferGeometry (positions, normals, colors)
        → TopologyViewport renders mesh with MeshStandardMaterial

Hover/Measure/CrossSection → full-res CscanData (never decimated grid)
```

---

## File Map

All new files live under `src/components/TopologyViewer/`:

| File | Purpose | Lines (est.) |
|------|---------|-------------|
| `types.ts` | TopologyViewState, SurfaceOptions (with nominalThickness), tools, cross-section/measurement types | ~70 |
| `engine/topology-decimation.ts` | `decimateGridMinPreserving()` — pure, min-of-block downsampling | ~60 |
| `engine/__tests__/topology-decimation.test.ts` | Tests: min preservation, null handling, passthrough under threshold | ~80 |
| `engine/topology-surface.ts` | `buildTopologySurface()` — nominal baseline, null-gap indices, Y-up | ~200 |
| `engine/__tests__/topology-surface.test.ts` | Tests: nominal baseline, null gaps, exaggeration, axis mapping | ~160 |
| `engine/topology-cross-section.ts` | `extractCrossSection()` — full-res bilinear, auto sample count, traceability | ~100 |
| `engine/__tests__/topology-cross-section.test.ts` | Tests: bilinear accuracy, null handling, coordinate traceability | ~90 |
| `engine/topology-measurement.ts` | `computeMeasurement()` — true physical distances only | ~30 |
| `engine/__tests__/topology-measurement.test.ts` | Tests: physical truth, no exaggeration leakage | ~50 |
| `engine/topology-scene.ts` | `TopologySceneManager` — Y-up, hemisphere+directional lights | ~200 |
| `TopologyViewport.tsx` | Three.js canvas + raycasting (hover maps to full-res grid) | ~260 |
| `TopologyToolbar.tsx` | Z-scale, nominal input, colorscale, tool buttons | ~170 |
| `TopologyInfoPanel.tsx` | Hover readout + surface stats + nominal indicator | ~90 |
| `CrossSectionPanel.tsx` | 2D canvas profile with coordinate traceability | ~130 |
| `TopologyViewer.tsx` | Main composition (includes offset repair flow) | ~160 |
| `topology-viewer.css` | Styles (industrial theme tokens, dark canvas) | ~80 |
| `src/pages/TopologyViewerPage.tsx` | Page wrapper | ~25 |

**Modified files:**

| File | Change |
|------|--------|
| `src/App.tsx` | Add lazy import + `/topology` route |
| `src/components/LayoutNew.tsx` | Add "3D Topology (Experimental)" to Tools children |

---

## Task 1: Types & Data Structures

**Files:**
- Create: `src/components/TopologyViewer/types.ts`

**Step 1: Write the types file**

```typescript
import type { CscanData } from '../CscanVisualizer/types';

export type TopologyTool = 'orbit' | 'crossSection' | 'measure';

export interface SurfaceOptions {
  /** Vertical displacement exaggeration factor (1 = true scale) */
  exaggeration: number;
  /** Colorscale name from shared colorscales.ts */
  colorScale: string;
  /** Whether to reverse the colorscale */
  reverseScale: boolean;
  /** Override min for colorscale range (null = auto from stats) */
  rangeMin: number | null;
  /** Override max for colorscale range (null = auto from stats) */
  rangeMax: number | null;
  /** Max grid dimension before min-preserving display decimation */
  maxDisplayResolution: number;
  /**
   * Nominal wall thickness in mm — defines the "flat" reference plane.
   * null = auto-detect via 95th percentile of data.
   */
  nominalThickness: number | null;
}

export interface TopologyViewState {
  cscanData: CscanData | null;
  surfaceOptions: SurfaceOptions;
  activeTool: TopologyTool;
  hoverInfo: HoverInfo | null;
  crossSection: CrossSectionData | null;
  measurement: MeasurementState | null;
}

export interface HoverInfo {
  /** Thickness in mm at hover point (from full-res grid, not display mesh) */
  thickness: number | null;
  /** Scan axis position in mm */
  scanMm: number;
  /** Index axis position in mm */
  indexMm: number;
  /** Screen position for tooltip */
  screenX: number;
  screenY: number;
  /** Grid row index (full-res) */
  row: number;
  /** Grid column index (full-res) */
  col: number;
}

export interface CrossSectionData {
  points: CrossSectionPoint[];
  totalDistance: number;
  startScanMm: number;
  startIndexMm: number;
  endScanMm: number;
  endIndexMm: number;
}

export interface CrossSectionPoint {
  /** Distance from start along the line in mm */
  distance: number;
  /** Thickness at this point in mm (null = no data) */
  thickness: number | null;
  /** Scan axis coordinate of this sample (mm) — for traceability */
  scanMm: number;
  /** Index axis coordinate of this sample (mm) — for traceability */
  indexMm: number;
}

export interface MeasurementState {
  pointA: MeasurementPoint | null;
  pointB: MeasurementPoint | null;
}

export interface MeasurementPoint {
  scanMm: number;
  indexMm: number;
  /** Thickness from full-res grid (null = ND) */
  thickness: number | null;
}

export interface MeasurementResult {
  /** True horizontal distance between points in mm */
  horizontalDistance: number;
  /** True thickness difference (B - A) in mm, null if either is ND */
  depthDifference: number | null;
  /** Wall loss at point A relative to nominal, null if ND or no nominal */
  wallLossA: number | null;
  /** Wall loss at point B relative to nominal, null if ND or no nominal */
  wallLossB: number | null;
}

export const DEFAULT_SURFACE_OPTIONS: SurfaceOptions = {
  exaggeration: 10,
  colorScale: 'Jet',
  reverseScale: true,
  rangeMin: null,
  rangeMax: null,
  maxDisplayResolution: 512,
  nominalThickness: null,
};

/**
 * Compute the effective nominal baseline for displacement.
 * Uses explicit nominal if provided, otherwise 95th percentile of data.
 */
export function resolveNominal(
  explicitNominal: number | null,
  data: (number | null)[][],
): number {
  if (explicitNominal != null) return explicitNominal;

  const values: number[] = [];
  for (const row of data) {
    for (const v of row) {
      if (v != null) values.push(v);
    }
  }
  if (values.length === 0) return 0;

  values.sort((a, b) => a - b);
  const idx = Math.floor((values.length - 1) * 0.95);
  return values[idx];
}
```

**Step 2: Commit**

```bash
git add src/components/TopologyViewer/types.ts
git commit -m "feat(topology): add type definitions with nominal baseline and physical measurement types"
```

Also create a unit test for `resolveNominal()` in Task 3's test file, but the function itself lives here. Add this test block to `src/components/TopologyViewer/engine/__tests__/topology-surface.test.ts` (Task 3):

```typescript
import { resolveNominal } from '../../types';

describe('resolveNominal', () => {
  it('returns explicit nominal when provided', () => {
    const data: (number | null)[][] = [[10, 10], [10, 10]];
    expect(resolveNominal(14, data)).toBe(14);
  });

  it('returns 95th percentile when nominal is null', () => {
    // 9 values: [50, 10, 10, 10, 10, 10, 10, 10, 10]
    // Sorted: [10, 10, 10, 10, 10, 10, 10, 10, 50]
    // 95th percentile index = floor((9-1) * 0.95) = floor(7.6) = 7 → value 10
    const data: (number | null)[][] = [
      [50, 10, 10],
      [10, 10, 10],
      [10, 10, 10],
    ];
    expect(resolveNominal(null, data)).toBe(10);
  });

  it('ignores null values in percentile calculation', () => {
    const data: (number | null)[][] = [
      [null, 10, 10],
      [10, null, 10],
    ];
    // 4 values: [10, 10, 10, 10], 95th = 10
    expect(resolveNominal(null, data)).toBe(10);
  });

  it('returns 0 for all-null data', () => {
    const data: (number | null)[][] = [[null, null]];
    expect(resolveNominal(null, data)).toBe(0);
  });
});
```

---

## Task 2: Min-Preserving Decimation — Tests & Implementation

**Files:**
- Create: `src/components/TopologyViewer/engine/topology-decimation.ts`
- Create: `src/components/TopologyViewer/engine/__tests__/topology-decimation.test.ts`

**Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { decimateGridMinPreserving } from '../topology-decimation';

describe('decimateGridMinPreserving', () => {
  it('returns original when under maxResolution', () => {
    const data: (number | null)[][] = [[10, 11], [12, 13]];
    const result = decimateGridMinPreserving(data, [0, 1], [0, 1], 512);
    expect(result.data).toEqual(data);
  });

  it('preserves minimum value in each decimation block', () => {
    // 4x4 grid, decimated to 2x2 → each 2x2 block takes min
    const data: (number | null)[][] = [
      [10, 8,  12, 11],
      [9,  7,  14, 13],
      [15, 16, 3,  20],
      [18, 17, 5,  19],
    ];
    const xAxis = [0, 1, 2, 3];
    const yAxis = [0, 1, 2, 3];
    const result = decimateGridMinPreserving(data, xAxis, yAxis, 2);

    // Block [0:2, 0:2] min = 7
    expect(result.data[0][0]).toBe(7);
    // Block [0:2, 2:4] min = 11
    expect(result.data[0][1]).toBe(11);
    // Block [2:4, 0:2] min = 15
    expect(result.data[1][0]).toBe(15);
    // Block [2:4, 2:4] min = 3
    expect(result.data[1][1]).toBe(3);
  });

  it('treats null as transparent — min of non-null values in block', () => {
    const data: (number | null)[][] = [
      [null, 8],
      [9,    null],
    ];
    const result = decimateGridMinPreserving(data, [0, 1], [0, 1], 1);
    // Only block, non-null values are 8 and 9, min = 8
    expect(result.data[0][0]).toBe(8);
  });

  it('produces null when entire block is null', () => {
    const data: (number | null)[][] = [
      [null, null],
      [null, null],
    ];
    const result = decimateGridMinPreserving(data, [0, 1], [0, 1], 1);
    expect(result.data[0][0]).toBeNull();
  });

  it('assigns block-center axis coordinates (not block-start)', () => {
    const data: (number | null)[][] = [
      [10, 8],
      [9,  7],  // min is at [1][1]
    ];
    const xAxis = [0, 100];
    const yAxis = [0, 200];
    const result = decimateGridMinPreserving(data, xAxis, yAxis, 1);
    // Block center: X = (0+100)/2 = 50, Y = (0+200)/2 = 100
    expect(result.xAxis[0]).toBeCloseTo(50);
    expect(result.yAxis[0]).toBeCloseTo(100);
  });

  it('returns isDecimated flag', () => {
    const data4x4: (number | null)[][] = Array.from({ length: 4 }, () => [1, 2, 3, 4]);
    const decimated = decimateGridMinPreserving(data4x4, [0, 1, 2, 3], [0, 1, 2, 3], 2);
    expect(decimated.isDecimated).toBe(true);

    const passthrough = decimateGridMinPreserving(data4x4, [0, 1, 2, 3], [0, 1, 2, 3], 512);
    expect(passthrough.isDecimated).toBe(false);
  });
});
```

**Step 2: Run tests → FAIL**

**Step 3: Implement**

```typescript
export interface DecimationResult {
  data: (number | null)[][];
  xAxis: number[];
  yAxis: number[];
  /** True if the grid was actually decimated (not a passthrough). */
  isDecimated: boolean;
}

/**
 * Downsample a grid using min-of-block so that the thinnest point
 * in each decimation block survives. This is critical for inspection —
 * average or nearest-neighbor decimation can erase corrosion pits.
 *
 * Null values are ignored within blocks. A block that is entirely null
 * produces a null output cell.
 */
export function decimateGridMinPreserving(
  data: (number | null)[][],
  xAxis: number[],
  yAxis: number[],
  maxResolution: number,
): DecimationResult {
  const rows = data.length;
  const cols = rows > 0 ? data[0].length : 0;

  if (rows <= maxResolution && cols <= maxResolution) {
    return { data, xAxis, yAxis, isDecimated: false };
  }

  const stepR = Math.max(1, Math.ceil(rows / maxResolution));
  const stepC = Math.max(1, Math.ceil(cols / maxResolution));

  const outRows = Math.ceil(rows / stepR);
  const outCols = Math.ceil(cols / stepC);

  const newData: (number | null)[][] = [];
  const newYAxis: number[] = [];
  const newXAxis: number[] = [];

  // Compute output axes using block-center coordinates.
  // Block-start would shift displayed pit locations by up to one block width.
  for (let c = 0; c < cols; c += stepC) {
    const cEnd = Math.min(c + stepC - 1, cols - 1);
    newXAxis.push((xAxis[c] + xAxis[cEnd]) / 2);
  }

  for (let r = 0; r < rows; r += stepR) {
    const rEnd = Math.min(r + stepR - 1, rows - 1);
    newYAxis.push((yAxis[r] + yAxis[rEnd]) / 2);
    const outRow: (number | null)[] = [];

    for (let c = 0; c < cols; c += stepC) {
      // Find min of non-null values in this block
      let blockMin: number | null = null;
      const rEnd = Math.min(r + stepR, rows);
      const cEnd = Math.min(c + stepC, cols);

      for (let br = r; br < rEnd; br++) {
        for (let bc = c; bc < cEnd; bc++) {
          const v = data[br][bc];
          if (v != null && (blockMin === null || v < blockMin)) {
            blockMin = v;
          }
        }
      }

      outRow.push(blockMin);
    }

    newData.push(outRow);
  }

  return { data: newData, xAxis: newXAxis, yAxis: newYAxis, isDecimated: true };
}
```

**Step 4: Run tests → PASS**

**Step 5: Commit**

```bash
git add src/components/TopologyViewer/engine/topology-decimation.ts src/components/TopologyViewer/engine/__tests__/topology-decimation.test.ts
git commit -m "feat(topology): add min-preserving grid decimation with tests"
```

---

## Task 3: Surface Builder — Tests

**Files:**
- Create: `src/components/TopologyViewer/engine/__tests__/topology-surface.test.ts`

**Step 1: Write failing tests**

Tests verify: nominal baseline (not stats.max), null gaps in index buffer, Y-up axis convention, exaggeration only on geometry.

```typescript
import { describe, it, expect } from 'vitest';
import { buildTopologySurface } from '../topology-surface';
import type { CscanData } from '../../../CscanVisualizer/types';
import type { SurfaceOptions } from '../../types';

function makeCscan(rows: number, cols: number, fillValue: number): CscanData {
  const data: (number | null)[][] = [];
  for (let r = 0; r < rows; r++) {
    data.push(Array.from({ length: cols }, () => fillValue));
  }
  return {
    id: 'test', filename: 'test.csv', width: cols, height: rows, data,
    xAxis: Array.from({ length: cols }, (_, i) => i * 10.0),
    yAxis: Array.from({ length: rows }, (_, i) => i * 10.0),
    stats: {
      min: fillValue, max: fillValue, mean: fillValue, median: fillValue,
      stdDev: 0, validPoints: rows * cols, totalPoints: rows * cols,
      totalArea: 0, validArea: 0, ndPercent: 0, ndCount: 0, ndArea: 0,
    },
  };
}

const BASE_OPTIONS: SurfaceOptions = {
  exaggeration: 1, colorScale: 'Jet', reverseScale: true,
  rangeMin: null, rangeMax: null, maxDisplayResolution: 512,
  nominalThickness: null,
};

describe('buildTopologySurface', () => {
  it('uses Y-up convention: X=scan, Z=index, Y=displacement', () => {
    const cscan = makeCscan(3, 3, 10.0);
    const geom = buildTopologySurface(cscan, { ...BASE_OPTIONS, nominalThickness: 10 });
    const pos = geom.getAttribute('position');

    // Vertex [0] at row=0, col=0: X=xAxis[0]=0, Z=yAxis[0]=0
    expect(pos.getX(0)).toBeCloseTo(0);   // scan axis
    expect(pos.getZ(0)).toBeCloseTo(0);   // index axis
    // Y should be 0 since thickness == nominal
    expect(pos.getY(0)).toBeCloseTo(0);
  });

  it('displaces from nominal baseline, not stats.max', () => {
    const cscan = makeCscan(3, 3, 10.0);
    cscan.data[1][1] = 8.0;
    cscan.stats = { ...cscan.stats!, min: 8, max: 10 };

    // Nominal = 12mm (from GA drawing, intentionally different from max)
    const geom = buildTopologySurface(cscan, { ...BASE_OPTIONS, nominalThickness: 12 });
    const pos = geom.getAttribute('position');

    // Corner vertex (10mm): Y = -(12 - 10) * 1 = -2
    expect(pos.getY(0)).toBeCloseTo(-2);
    // Center vertex (8mm): Y = -(12 - 8) * 1 = -4
    expect(pos.getY(4)).toBeCloseTo(-4);
  });

  it('uses 95th percentile as nominal when nominalThickness is null', () => {
    // 3x3 uniform 10mm except one noisy high point at 50mm
    const cscan = makeCscan(3, 3, 10.0);
    cscan.data[0][0] = 50.0; // noise
    cscan.stats = { ...cscan.stats!, min: 10, max: 50 };

    const geom = buildTopologySurface(cscan, { ...BASE_OPTIONS, nominalThickness: null });
    const pos = geom.getAttribute('position');

    // 95th percentile of [50, 10, 10, 10, 10, 10, 10, 10, 10] = 10
    // So nominal ≈ 10. Normal vertices at 10mm should have Y ≈ 0
    // The noisy 50mm point should be positive (above the surface)
    expect(pos.getY(4)).toBeCloseTo(0); // center is 10mm = nominal
  });

  it('applies exaggeration to Y displacement only', () => {
    const cscan = makeCscan(3, 3, 10.0);
    cscan.data[1][1] = 8.0;
    cscan.stats = { ...cscan.stats!, min: 8, max: 10 };

    const geom = buildTopologySurface(cscan, {
      ...BASE_OPTIONS, nominalThickness: 10, exaggeration: 10,
    });
    const pos = geom.getAttribute('position');

    // Center vertex: Y = -(10 - 8) * 10 = -20
    expect(pos.getY(4)).toBeCloseTo(-20);
    // X and Z positions must NOT be affected by exaggeration
    expect(pos.getX(4)).toBeCloseTo(10); // xAxis[1] = 10
    expect(pos.getZ(4)).toBeCloseTo(10); // yAxis[1] = 10
  });

  it('omits triangles touching null vertices', () => {
    const cscan = makeCscan(3, 3, 10.0);
    cscan.data[1][1] = null; // center is ND

    const geom = buildTopologySurface(cscan, { ...BASE_OPTIONS, nominalThickness: 10 });
    const index = geom.getIndex()!;

    // 3x3 grid normally has 2x2 quads = 4 quads = 8 triangles = 24 indices.
    // Center null touches all 4 quads, so all 8 triangles are omitted → 0 indices.
    expect(index.count).toBe(0);
  });

  it('preserves triangles in quads where all 4 vertices have data', () => {
    const cscan = makeCscan(3, 3, 10.0);
    // Only corner null — affects 1 quad (top-left), 3 quads survive = 6 triangles
    cscan.data[0][0] = null;

    const geom = buildTopologySurface(cscan, { ...BASE_OPTIONS, nominalThickness: 10 });
    const index = geom.getIndex()!;

    // 4 quads total, 1 touches null → 3 quads × 2 triangles × 3 indices = 18
    expect(index.count).toBe(18);
  });

  it('has correct vertex count regardless of nulls', () => {
    const cscan = makeCscan(3, 3, 10.0);
    cscan.data[1][1] = null;

    const geom = buildTopologySurface(cscan, { ...BASE_OPTIONS, nominalThickness: 10 });
    const pos = geom.getAttribute('position');

    // All 9 vertices still exist — only triangles are omitted
    expect(pos.count).toBe(9);
  });

  it('computes normals', () => {
    const cscan = makeCscan(4, 4, 10.0);
    const geom = buildTopologySurface(cscan, { ...BASE_OPTIONS, nominalThickness: 10 });
    const normals = geom.getAttribute('normal');
    expect(normals).not.toBeNull();
    expect(normals.count).toBe(16);
  });

  it('colors ND vertices distinctly', () => {
    const cscan = makeCscan(3, 3, 10.0);
    cscan.data[0][0] = null;

    const geom = buildTopologySurface(cscan, { ...BASE_OPTIONS, nominalThickness: 10 });
    const colors = geom.getAttribute('color');

    // ND vertex gets dark grey
    expect(colors.getX(0)).toBeCloseTo(0.15, 1);
    expect(colors.getY(0)).toBeCloseTo(0.15, 1);
    expect(colors.getZ(0)).toBeCloseTo(0.15, 1);
  });
});
```

**Step 2: Run tests → FAIL**

**Step 3: Commit failing tests**

```bash
git add src/components/TopologyViewer/engine/__tests__/topology-surface.test.ts
git commit -m "test(topology): add failing surface builder tests with nominal baseline and null gaps"
```

---

## Task 4: Surface Builder — Implementation

**Files:**
- Create: `src/components/TopologyViewer/engine/topology-surface.ts`

**Step 1: Implement the surface builder**

```typescript
import * as THREE from 'three';
import { interpolateColor, getColorscale } from '../../../utils/colorscales';
import type { CscanData } from '../../CscanVisualizer/types';
import type { SurfaceOptions } from '../types';
import { resolveNominal } from '../types';
import { decimateGridMinPreserving } from './topology-decimation';

const ND_COLOR: [number, number, number] = [0.15, 0.15, 0.15];

/**
 * Build a Three.js BufferGeometry representing the scan data as a 3D surface.
 *
 * Coordinate convention (Y-up):
 *   X = scan axis (mm)
 *   Z = index axis (mm)
 *   Y = -(nominal - thickness) * exaggeration
 *       → 0 at nominal wall, negative for wall loss (valleys)
 *
 * Null vertices exist in the position buffer but no triangles reference them,
 * creating genuine holes in the mesh rather than fake plateaus.
 */
export function buildTopologySurface(
  cscan: CscanData,
  options: SurfaceOptions,
): THREE.BufferGeometry {
  const {
    exaggeration, colorScale: scaleName, reverseScale,
    rangeMin, rangeMax, maxDisplayResolution, nominalThickness,
  } = options;
  const { data: rawData, xAxis: rawX, yAxis: rawY, stats } = cscan;

  if (!stats) throw new Error('CscanData must have stats computed');

  // Resolve nominal baseline
  const nominal = resolveNominal(nominalThickness, rawData);

  // Min-preserving decimation for display geometry
  const { data, xAxis, yAxis } = decimateGridMinPreserving(
    rawData, rawX, rawY, maxDisplayResolution,
  );

  const rows = data.length;
  const cols = rows > 0 ? data[0].length : 0;
  if (rows < 2 || cols < 2) throw new Error('Grid must be at least 2x2');

  const vertexCount = rows * cols;
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);

  const scale = getColorscale(scaleName);
  const cMin = rangeMin != null ? rangeMin : stats.min;
  const cMax = rangeMax != null ? rangeMax : stats.max;
  const cRange = cMax === cMin ? 1 : cMax - cMin;

  // --- Build vertex positions and colors ---
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const value = data[r][c];

      // X = scan axis, Z = index axis (Y-up convention)
      positions[idx * 3]     = xAxis[c];  // X
      positions[idx * 3 + 2] = yAxis[r];  // Z

      if (value != null) {
        // Y = displacement from nominal, exaggerated
        positions[idx * 3 + 1] = -(nominal - value) * exaggeration;

        const t = (value - cMin) / cRange;
        const [cr, cg, cb] = interpolateColor(t, scale, reverseScale);
        colors[idx * 3]     = cr / 255;
        colors[idx * 3 + 1] = cg / 255;
        colors[idx * 3 + 2] = cb / 255;
      } else {
        // ND vertex: position at Y=0, but no triangles will reference it
        positions[idx * 3 + 1] = 0;
        colors[idx * 3]     = ND_COLOR[0];
        colors[idx * 3 + 1] = ND_COLOR[1];
        colors[idx * 3 + 2] = ND_COLOR[2];
      }

      uvs[idx * 2]     = c / (cols - 1);
      uvs[idx * 2 + 1] = r / (rows - 1);
    }
  }

  // --- Build index buffer, skipping quads with any null vertex ---
  const indexList: number[] = [];

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const tl = r * cols + c;
      const tr = tl + 1;
      const bl = (r + 1) * cols + c;
      const br = bl + 1;

      // Skip entire quad if any corner is null
      if (
        data[r][c] == null ||
        data[r][c + 1] == null ||
        data[r + 1][c] == null ||
        data[r + 1][c + 1] == null
      ) {
        continue;
      }

      indexList.push(tl, bl, tr);
      indexList.push(tr, bl, br);
    }
  }

  const indices = new Uint32Array(indexList);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();

  return geometry;
}
```

**Step 2: Run tests → PASS**

**Step 3: Commit**

```bash
git add src/components/TopologyViewer/engine/topology-surface.ts
git commit -m "feat(topology): implement surface builder with nominal baseline and null-gap geometry"
```

---

## Task 5: Cross-Section Engine — Tests & Implementation

**Files:**
- Create: `src/components/TopologyViewer/engine/topology-cross-section.ts`
- Create: `src/components/TopologyViewer/engine/__tests__/topology-cross-section.test.ts`

**Step 1: Write failing tests**

Tests verify: bilinear interpolation accuracy, auto sample count from axis spacing, coordinate traceability per point, full-resolution sampling (not display grid).

```typescript
import { describe, it, expect } from 'vitest';
import { extractCrossSection, bilinearSample } from '../topology-cross-section';
import type { CscanData } from '../../../CscanVisualizer/types';

function makeGradientCscan(): CscanData {
  // 5x5 grid, 10mm spacing. Thickness: linearly 5→9 along X (scan axis)
  const data: (number | null)[][] = Array.from({ length: 5 }, () =>
    [5, 6, 7, 8, 9]
  );
  return {
    id: 'test', filename: 'test.csv', width: 5, height: 5, data,
    xAxis: [0, 10, 20, 30, 40],
    yAxis: [0, 10, 20, 30, 40],
    stats: { min: 5, max: 9, mean: 7, median: 7, stdDev: 1.41,
      validPoints: 25, totalPoints: 25, totalArea: 1600, validArea: 1600,
      ndPercent: 0, ndCount: 0, ndArea: 0 },
  };
}

describe('bilinearSample', () => {
  it('returns exact value at grid nodes', () => {
    const data: (number | null)[][] = [[10, 20], [30, 40]];
    expect(bilinearSample(data, [0, 1], [0, 1], 0, 0)).toBeCloseTo(10);
    expect(bilinearSample(data, [0, 1], [0, 1], 1, 1)).toBeCloseTo(40);
  });

  it('interpolates between grid nodes', () => {
    const data: (number | null)[][] = [[10, 20], [30, 40]];
    // Center point: average of all 4 = 25
    expect(bilinearSample(data, [0, 10], [0, 10], 5, 5)).toBeCloseTo(25);
  });

  it('returns null if any corner of the interpolation cell is null', () => {
    const data: (number | null)[][] = [[null, 20], [30, 40]];
    expect(bilinearSample(data, [0, 1], [0, 1], 0.5, 0.5)).toBeNull();
  });

  it('returns null when scanMm is below axis range', () => {
    const data: (number | null)[][] = [[10, 20], [30, 40]];
    expect(bilinearSample(data, [10, 20], [0, 10], 5, 5)).toBeNull();
  });

  it('returns null when scanMm is above axis range', () => {
    const data: (number | null)[][] = [[10, 20], [30, 40]];
    expect(bilinearSample(data, [10, 20], [0, 10], 25, 5)).toBeNull();
  });

  it('returns null when indexMm is below axis range', () => {
    const data: (number | null)[][] = [[10, 20], [30, 40]];
    expect(bilinearSample(data, [0, 10], [10, 20], 5, 5)).toBeNull();
  });

  it('returns null when indexMm is above axis range', () => {
    const data: (number | null)[][] = [[10, 20], [30, 40]];
    expect(bilinearSample(data, [0, 10], [10, 20], 5, 25)).toBeNull();
  });
});

describe('extractCrossSection', () => {
  it('auto-determines sample count from axis spacing', () => {
    const cscan = makeGradientCscan();
    // Horizontal line 40mm long, axis spacing 10mm → at least 5 samples
    const result = extractCrossSection(cscan, 0, 20, 40, 20);

    expect(result.points.length).toBeGreaterThanOrEqual(5);
    expect(result.totalDistance).toBeCloseTo(40);
  });

  it('includes scan/index coordinates per point for traceability', () => {
    const cscan = makeGradientCscan();
    const result = extractCrossSection(cscan, 0, 20, 40, 20);

    expect(result.points[0].scanMm).toBeCloseTo(0);
    expect(result.points[0].indexMm).toBeCloseTo(20);

    const last = result.points[result.points.length - 1];
    expect(last.scanMm).toBeCloseTo(40);
    expect(last.indexMm).toBeCloseTo(20);
  });

  it('uses bilinear interpolation, not nearest-neighbor', () => {
    const cscan = makeGradientCscan();
    // Sample at X=15mm (between xAxis[1]=10 and xAxis[2]=20)
    // At this X, bilinear should give 6.5 (halfway between 6 and 7)
    const result = extractCrossSection(cscan, 15, 20, 15, 20);
    expect(result.points[0].thickness).toBeCloseTo(6.5);
  });
});
```

**Step 2: Run tests → FAIL**

**Step 3: Implement**

```typescript
import type { CscanData } from '../../CscanVisualizer/types';
import type { CrossSectionData, CrossSectionPoint } from '../types';

/**
 * Bilinear interpolation on the full-resolution grid.
 * Returns null if any corner of the containing cell is null.
 */
export function bilinearSample(
  data: (number | null)[][],
  xAxis: number[],
  yAxis: number[],
  scanMm: number,
  indexMm: number,
): number | null {
  // Reject points outside the scan footprint — never fabricate edge values
  if (scanMm < xAxis[0] || scanMm > xAxis[xAxis.length - 1]) return null;
  if (indexMm < yAxis[0] || indexMm > yAxis[yAxis.length - 1]) return null;

  const col = findFractionalIndex(xAxis, scanMm);
  const row = findFractionalIndex(yAxis, indexMm);

  const c0 = Math.floor(col);
  const c1 = Math.min(c0 + 1, xAxis.length - 1);
  const r0 = Math.floor(row);
  const r1 = Math.min(r0 + 1, yAxis.length - 1);

  const v00 = data[r0]?.[c0];
  const v01 = data[r0]?.[c1];
  const v10 = data[r1]?.[c0];
  const v11 = data[r1]?.[c1];

  if (v00 == null || v01 == null || v10 == null || v11 == null) return null;

  const tx = c0 === c1 ? 0 : col - c0;
  const ty = r0 === r1 ? 0 : row - r0;

  return (
    v00 * (1 - tx) * (1 - ty) +
    v01 * tx * (1 - ty) +
    v10 * (1 - tx) * ty +
    v11 * tx * ty
  );
}

/**
 * Extract a cross-section profile along a line, using bilinear interpolation
 * on the full-resolution grid.
 *
 * Sample count is automatically derived from the finer axis spacing —
 * at least one sample per grid cell along the line.
 */
export function extractCrossSection(
  cscan: CscanData,
  startScanMm: number,
  startIndexMm: number,
  endScanMm: number,
  endIndexMm: number,
  numSamplesOverride?: number,
): CrossSectionData {
  const { data, xAxis, yAxis } = cscan;
  const dx = endScanMm - startScanMm;
  const dy = endIndexMm - startIndexMm;
  const totalDistance = Math.sqrt(dx * dx + dy * dy);

  // Auto sample count: one sample per minimum axis spacing along the line
  let numSamples: number;
  if (numSamplesOverride != null) {
    numSamples = numSamplesOverride;
  } else {
    const minSpacing = computeMinSpacing(xAxis, yAxis);
    numSamples = Math.max(2, Math.ceil(totalDistance / minSpacing) + 1);
  }

  const points: CrossSectionPoint[] = [];

  for (let i = 0; i < numSamples; i++) {
    const t = numSamples <= 1 ? 0 : i / (numSamples - 1);
    const scanMm = startScanMm + dx * t;
    const indexMm = startIndexMm + dy * t;

    const thickness = bilinearSample(data, xAxis, yAxis, scanMm, indexMm);

    points.push({ distance: totalDistance * t, thickness, scanMm, indexMm });
  }

  return {
    points, totalDistance,
    startScanMm, startIndexMm, endScanMm, endIndexMm,
  };
}

function findFractionalIndex(axis: number[], value: number): number {
  if (value <= axis[0]) return 0;
  if (value >= axis[axis.length - 1]) return axis.length - 1;

  for (let i = 0; i < axis.length - 1; i++) {
    if (value >= axis[i] && value <= axis[i + 1]) {
      const span = axis[i + 1] - axis[i];
      return span === 0 ? i : i + (value - axis[i]) / span;
    }
  }
  return axis.length - 1;
}

function computeMinSpacing(xAxis: number[], yAxis: number[]): number {
  let minSp = Infinity;
  for (let i = 1; i < xAxis.length; i++) {
    const sp = Math.abs(xAxis[i] - xAxis[i - 1]);
    if (sp > 0 && sp < minSp) minSp = sp;
  }
  for (let i = 1; i < yAxis.length; i++) {
    const sp = Math.abs(yAxis[i] - yAxis[i - 1]);
    if (sp > 0 && sp < minSp) minSp = sp;
  }
  return minSp === Infinity ? 1 : minSp;
}
```

**Step 4: Run tests → PASS**

**Step 5: Commit**

```bash
git add src/components/TopologyViewer/engine/topology-cross-section.ts src/components/TopologyViewer/engine/__tests__/topology-cross-section.test.ts
git commit -m "feat(topology): add cross-section engine with bilinear sampling and traceability"
```

---

## Task 6: Measurement Engine — Tests & Implementation

**Files:**
- Create: `src/components/TopologyViewer/engine/topology-measurement.ts`
- Create: `src/components/TopologyViewer/engine/__tests__/topology-measurement.test.ts`

**Step 1: Write failing tests**

All measurement outputs are physical. No exaggeration parameter.

```typescript
import { describe, it, expect } from 'vitest';
import { computeMeasurement } from '../topology-measurement';

describe('computeMeasurement', () => {
  it('computes true horizontal distance in mm', () => {
    const result = computeMeasurement(
      { scanMm: 0, indexMm: 0, thickness: 10 },
      { scanMm: 30, indexMm: 40, thickness: 10 },
      12,
    );
    expect(result.horizontalDistance).toBeCloseTo(50); // 3-4-5 triangle
  });

  it('computes true thickness difference in mm', () => {
    const result = computeMeasurement(
      { scanMm: 0, indexMm: 0, thickness: 10 },
      { scanMm: 0, indexMm: 0, thickness: 7 },
      12,
    );
    expect(result.depthDifference).toBeCloseTo(-3);
  });

  it('returns null depth when either point is ND', () => {
    const result = computeMeasurement(
      { scanMm: 0, indexMm: 0, thickness: null },
      { scanMm: 10, indexMm: 0, thickness: 7 },
      12,
    );
    expect(result.depthDifference).toBeNull();
  });

  it('computes wall loss relative to nominal, clamped to zero', () => {
    const result = computeMeasurement(
      { scanMm: 0, indexMm: 0, thickness: 10 },
      { scanMm: 0, indexMm: 0, thickness: 7 },
      12, // nominal
    );
    // Wall loss A = max(0, 12 - 10) = 2mm
    expect(result.wallLossA).toBeCloseTo(2);
    // Wall loss B = max(0, 12 - 7) = 5mm
    expect(result.wallLossB).toBeCloseTo(5);
  });

  it('clamps wall loss to zero when thickness exceeds nominal', () => {
    const result = computeMeasurement(
      { scanMm: 0, indexMm: 0, thickness: 15 },
      { scanMm: 0, indexMm: 0, thickness: 7 },
      12,
    );
    // 15mm > 12mm nominal → wall loss = 0, not -3
    expect(result.wallLossA).toBe(0);
    expect(result.wallLossB).toBeCloseTo(5);
  });

  it('returns null wall loss when point is ND', () => {
    const result = computeMeasurement(
      { scanMm: 0, indexMm: 0, thickness: null },
      { scanMm: 0, indexMm: 0, thickness: 7 },
      12,
    );
    expect(result.wallLossA).toBeNull();
    expect(result.wallLossB).toBeCloseTo(5);
  });

  it('never includes visual exaggeration in any output', () => {
    // This test exists to document the invariant: computeMeasurement
    // does not accept an exaggeration parameter. All outputs are physical.
    const result = computeMeasurement(
      { scanMm: 0, indexMm: 0, thickness: 10 },
      { scanMm: 0, indexMm: 0, thickness: 5 },
      10,
    );
    // Depth difference is 5mm, not 50mm
    expect(result.depthDifference).toBeCloseTo(-5);
  });
});
```

**Step 2: Run tests → FAIL**

**Step 3: Implement**

```typescript
import type { MeasurementPoint, MeasurementResult } from '../types';

/**
 * Compute true physical measurements between two surface points.
 *
 * All outputs are in real mm — visual exaggeration is never applied.
 * The nominal parameter is used only to compute wall-loss context.
 */
export function computeMeasurement(
  a: MeasurementPoint,
  b: MeasurementPoint,
  nominal: number,
): MeasurementResult {
  const dx = b.scanMm - a.scanMm;
  const dy = b.indexMm - a.indexMm;
  const horizontalDistance = Math.sqrt(dx * dx + dy * dy);

  const depthDifference = (a.thickness != null && b.thickness != null)
    ? b.thickness - a.thickness
    : null;

  // Clamp to zero: negative wall loss (thickness > nominal) is not meaningful.
  // Matches existing convention in distributionEngine.ts.
  const wallLossA = a.thickness != null ? Math.max(0, nominal - a.thickness) : null;
  const wallLossB = b.thickness != null ? Math.max(0, nominal - b.thickness) : null;

  return { horizontalDistance, depthDifference, wallLossA, wallLossB };
}
```

**Step 4: Run tests → PASS**

**Step 5: Commit**

```bash
git add src/components/TopologyViewer/engine/topology-measurement.ts src/components/TopologyViewer/engine/__tests__/topology-measurement.test.ts
git commit -m "feat(topology): add physical measurement engine — no exaggeration leakage"
```

---

## Task 7: Scene Manager

**Files:**
- Create: `src/components/TopologyViewer/engine/topology-scene.ts`

**Step 1: Implement Y-up Three.js scene wrapper**

Key differences from the original plan:
- Camera and lights use Y-up consistently
- Camera starts elevated above the XZ plane, looking down at the surface
- OrbitControls target set to surface center after auto-fit
- No CSS2D renderer needed (hover readout is React overlay, not Three.js label)

```typescript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class TopologySceneManager {
  private container: HTMLDivElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private animationFrameId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private surfaceMesh: THREE.Mesh | null = null;
  private disposed = false;

  constructor(container: HTMLDivElement) {
    this.container = container;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a1a);

    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 100000);
    // Y-up: start above and to the side, looking down at XZ plane
    this.camera.position.set(300, 400, 300);
    this.camera.up.set(0, 1, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
  }

  init(): void {
    this.container.appendChild(this.renderer.domElement);

    // Hemisphere light: sky from +Y, ground from -Y
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    hemi.position.set(0, 1, 0);
    this.scene.add(hemi);

    // Key light from upper-right
    const key = new THREE.DirectionalLight(0xffffff, 0.8);
    key.position.set(200, 400, 200);
    this.scene.add(key);

    // Fill light from opposite side
    const fill = new THREE.DirectionalLight(0xffffff, 0.3);
    fill.position.set(-200, 200, -200);
    this.scene.add(fill);

    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(this.container);

    this.animate();
  }

  setSurfaceGeometry(geometry: THREE.BufferGeometry): void {
    if (this.surfaceMesh) {
      this.scene.remove(this.surfaceMesh);
      this.surfaceMesh.geometry.dispose();
      (this.surfaceMesh.material as THREE.Material).dispose();
    }

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.6,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });

    this.surfaceMesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.surfaceMesh);
    this.fitCameraToSurface();
  }

  getSurfaceMesh(): THREE.Mesh | null { return this.surfaceMesh; }
  getCamera(): THREE.PerspectiveCamera { return this.camera; }
  getControls(): OrbitControls { return this.controls; }
  getRenderer(): THREE.WebGLRenderer { return this.renderer; }
  getScene(): THREE.Scene { return this.scene; }

  fitCameraToSurface(): void {
    if (!this.surfaceMesh) return;
    const box = new THREE.Box3().setFromObject(this.surfaceMesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.camera.fov * (Math.PI / 180);
    const dist = maxDim / (2 * Math.tan(fov / 2)) * 1.5;

    // Position camera above and behind the center
    this.camera.position.set(center.x, center.y + dist * 0.7, center.z + dist * 0.7);
    this.controls.target.copy(center);
    this.controls.update();
  }

  private onResize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private animate = (): void => {
    if (this.disposed) return;
    this.animationFrameId = requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    this.disposed = true;
    if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
    this.resizeObserver?.disconnect();
    if (this.surfaceMesh) {
      this.surfaceMesh.geometry.dispose();
      (this.surfaceMesh.material as THREE.Material).dispose();
    }
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
```

**Step 2: Commit**

```bash
git add src/components/TopologyViewer/engine/topology-scene.ts
git commit -m "feat(topology): add Y-up Three.js scene manager"
```

---

## Task 8: TopologyViewport Component

**Files:**
- Create: `src/components/TopologyViewer/TopologyViewport.tsx`

**Step 1: Implement**

Key correctness requirements for this component:

- **Hover readout maps to full-res grid.** When the raycaster hits the display mesh, the intersection XZ coordinates (scan mm, index mm) are used to look up the **full-resolution** `CscanData.data` via nearest-neighbor index lookup — not the decimated display data. The `onHover` callback receives the true thickness from the original grid.

- **Cross-section uses full-res data.** When the user completes a cross-section line, `extractCrossSection()` is called with the original `CscanData` (not the display mesh). The line endpoints come from raycaster intersection XZ, but sampling is bilinear on the full grid.

- **Measurement uses full-res data.** When the user clicks to place measurement points, the thickness is looked up from the full-res grid, and `computeMeasurement()` receives the resolved nominal value.

The component interface:

```typescript
interface TopologyViewportProps {
  cscanData: CscanData | null;
  surfaceOptions: SurfaceOptions;
  activeTool: TopologyTool;
  /** Whether the display mesh is decimated (affects hover tooltip wording) */
  isDecimated: boolean;
  onHover: (info: HoverInfo | null) => void;
  onCrossSection: (data: CrossSectionData) => void;
  onMeasurementPoint: (point: MeasurementPoint) => void;
  measurementState: MeasurementState | null;
  /** Resolved nominal thickness for measurement wall-loss context */
  nominalThickness: number;
}
```

Refer to `src/components/VesselModeler/ThreeViewport.tsx` for the `useRef` + `useEffect` lifecycle pattern. Use `THREE.Raycaster.intersectObject()` on the surface mesh.

**Hover on decimated meshes:** The raycaster intersection gives XZ coordinates on the display mesh (which uses block-center coordinates). The hover handler maps these back to the full-resolution grid via nearest-index lookup on the *original* `cscanData.xAxis`/`yAxis`. Because block-center coordinates may not align exactly with the full-res grid, the tooltip value is the true full-res value at the nearest grid node — which may differ from the min value shown on the decimated surface at that vertex. When `isDecimated` is true, the info panel should show a subtle "Display decimated" indicator so the user understands the surface geometry is approximate while readouts are exact.

For cross-section visualization: draw a `THREE.Line` on the surface between the two endpoints. For measurement: draw `THREE.Mesh` spheres at each clicked point with a dashed line between them.

**Estimated: ~260 lines**

**Step 2: Commit**

```bash
git add src/components/TopologyViewer/TopologyViewport.tsx
git commit -m "feat(topology): add viewport with full-res hover, cross-section, and measurement"
```

---

## Task 9: TopologyToolbar Component

**Files:**
- Create: `src/components/TopologyViewer/TopologyToolbar.tsx`

**Step 1: Implement**

Controls (left to right):
1. **File upload button** — triggers hidden `<input type="file">`, accepts `.csv,.nde`
2. **Nominal wall input** — number input labeled "Nominal (mm)", placeholder shows auto-detected value
3. **Z-Scale slider** — range input `1–50`, displays current value
4. **"1:1" true-scale button** — resets exaggeration to 1
5. **Colorscale dropdown** — populated from `getAvailableColorscales()`
6. **Reverse scale toggle**
7. **Range inputs** — min/max number inputs (auto from stats when blank)
8. **Tool buttons** — Orbit (default), Cross-Section, Measure — radio-style toggle

Styling direction (per P2 finding — industrial theme, not glassmorphic):
- Container uses `var(--ctrl)` background with `var(--glass-border)` bottom border
- Buttons use existing `btn btn--sm` classes from the design system
- Slider styled with `var(--accent-primary)` accent color
- Use Lucide icons: `Move3d` (orbit), `ScissorsLineDashed` (cross-section), `Ruler` (measure)
- Labels use `var(--text-secondary)`, values use `var(--text-primary)`

Refer to `src/components/CscanVisualizer/ToolBar.tsx` for the existing toolbar pattern.

**Estimated: ~170 lines**

**Step 2: Commit**

```bash
git add src/components/TopologyViewer/TopologyToolbar.tsx
git commit -m "feat(topology): add toolbar with nominal wall, Z-scale, and industrial styling"
```

---

## Task 10: TopologyInfoPanel Component

**Files:**
- Create: `src/components/TopologyViewer/TopologyInfoPanel.tsx`

**Step 1: Implement**

Hover readout overlay positioned absolutely in the bottom-left of the viewport:
- **Thickness:** `12.4 mm` (or `ND`)
- **Wall loss:** `1.6 mm` (relative to nominal, only when thickness is known)
- **Scan:** `125.0 mm`
- **Index:** `340.0 mm`
- **Grid cell:** `[row, col]` (full-res indices)

Static stats section (always visible when data is loaded):
- **Nominal:** `14.0 mm` (shows whether user-specified or auto-detected)
- **Min / Max / Mean** from `cscan.stats`
- **Grid:** `500 × 500`
- **Valid:** `98.5%`
- **Display decimated** indicator (only shown when `isDecimated` is true) — small subtle badge explaining that the 3D surface is a reduced-resolution display while hover values and measurements use the full-resolution data

Styling: use `var(--ctrl)` background, `var(--text-secondary)` labels, monospace font for numeric values. No `glass-card` class.

**Estimated: ~90 lines**

**Step 2: Commit**

```bash
git add src/components/TopologyViewer/TopologyInfoPanel.tsx
git commit -m "feat(topology): add info panel with hover readout and nominal indicator"
```

---

## Task 11: CrossSectionPanel Component

**Files:**
- Create: `src/components/TopologyViewer/CrossSectionPanel.tsx`

**Step 1: Implement**

Panel at the bottom of the viewer when a cross-section is active. Renders `CrossSectionData` as a 2D line chart on `<canvas>`:

- X-axis: distance along the cut line (mm)
- Y-axis: thickness (mm), inverted so thin is down (matches 3D view)
- Line chart with filled area below
- Horizontal dashed line at nominal thickness
- Axis labels and gridlines
- Null gaps shown as breaks in the line (not interpolated through)

Header shows traceability info:
- Start: `Scan 12.0mm, Index 340.0mm`
- End: `Scan 245.0mm, Index 340.0mm`
- Distance: `233.0mm`
- Samples: `24 points`

Close button clears the cross-section state.

**Estimated: ~130 lines**

**Step 2: Commit**

```bash
git add src/components/TopologyViewer/CrossSectionPanel.tsx
git commit -m "feat(topology): add cross-section profile panel with traceability"
```

---

## Task 12: Main TopologyViewer Component

**Files:**
- Create: `src/components/TopologyViewer/TopologyViewer.tsx`
- Create: `src/components/TopologyViewer/topology-viewer.css`

**Step 1: Implement**

This component owns top-level state and composes all sub-components.

**Critical: scan repair flow.** After `processFilesWithWorker()`, check `result.hasOffsetIssues`. If true, show the existing `CsvRepairModal` from `src/components/CscanVisualizer/CsvRepairModal.tsx` and apply corrections before rendering. After repair, clear the worker cache (stale cache has uncorrected data). Follow the pattern at `CscanVisualizer.tsx` lines ~206-232.

**Multi-file and composite behavior:**

1. **Single file upload:** Parse → repair (if needed) → render surface immediately.
2. **Multiple files uploaded at once:** Parse all → repair (if any have offset issues) → auto-composite via `createCompositeFromDataWithWorker()` → render the composite surface. This matches the C-scan visualizer's batch behavior.
3. **Additional files dropped onto an existing session:** Add to `processedScans`, re-composite all, rebuild surface.
4. **After repair:** Call `getCscanWorkerManager().clearCache()` before compositing — the worker cache holds pre-repair data and will produce a wrong composite if not cleared. This is the bug the C-scan visualizer already handles at ~line 232.
5. **Only the composite/single scan is passed to the surface builder.** Individual `processedScans` are kept in state only for re-compositing when files are added or removed.

State management:
- `cscanData: CscanData | null` — the active scan for rendering (single scan or composite, always post-repair)
- `processedScans: CscanData[]` — individual scans, retained for re-compositing
- `surfaceOptions: SurfaceOptions` — Z-scale, nominal, colorscale, range
- `resolvedNominal: number` — computed via `resolveNominal()`, passed to viewport + measurement
- `isDecimated: boolean` — from decimation result, passed to viewport + info panel
- `activeTool: TopologyTool` — orbit/crossSection/measure
- `hoverInfo: HoverInfo | null` — from viewport raycasting
- `crossSection: CrossSectionData | null` — from viewport cross-section tool
- `measurement: MeasurementState` — from viewport measure tool
- `processingProgress` — for file upload progress indicator
- `showRepairModal` / `pendingScans` — for scan repair flow

When `nominalThickness` changes (user input or auto-detection), recompute `resolvedNominal` and trigger surface rebuild.

Layout:

```
┌─ TopologyToolbar ──────────────────────────────────────────────┐
│  [Upload] [Nominal: 14mm] [Z: ===10x===] [1:1] [Jet ▼] [⟲]  │
│  [◎ Orbit] [✂ Section] [📏 Measure]                           │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│              TopologyViewport (Three.js canvas)                │
│                                                                │
│  ┌─ InfoPanel ──┐                                              │
│  │ T: 12.4mm    │                                              │
│  │ Loss: 1.6mm  │                                              │
│  │ S: 125.0mm   │                                              │
│  │ I: 340.0mm   │                                              │
│  │ Nom: 14.0mm  │                                              │
│  └──────────────┘                                              │
├─ CrossSectionPanel (when active) ─────────────────────────────┤
│  [2D profile chart with traceability]                          │
└────────────────────────────────────────────────────────────────┘
```

**Estimated: ~160 lines**

CSS file provides layout using industrial theme tokens. Dark background (`#1a1a1a`) for the 3D canvas area. Controls use `var(--ctrl)`, `var(--panel-mid)`.

**Step 2: Commit**

```bash
git add src/components/TopologyViewer/TopologyViewer.tsx src/components/TopologyViewer/topology-viewer.css
git commit -m "feat(topology): add main component with scan repair flow"
```

---

## Task 13: Page, Route & Sidebar Entry

**Files:**
- Create: `src/pages/TopologyViewerPage.tsx`
- Modify: `src/App.tsx` (add lazy import + route)
- Modify: `src/components/LayoutNew.tsx` (add sidebar entry)

**Step 1: Create the page wrapper**

```typescript
import TopologyViewer from '../components/TopologyViewer/TopologyViewer';

function TopologyViewerPage() {
  return (
    <div
      className="topology-page-wrapper"
      style={{
        marginTop: 'calc(-1 * var(--spacing-8, 2rem))',
        marginLeft: 'calc(50% - 50vw)',
        width: '100vw',
        height: 'calc(100vh - var(--header-height, 4rem))',
        maxWidth: 'none',
        overflow: 'hidden',
      }}
    >
      <TopologyViewer />
    </div>
  );
}

export default TopologyViewerPage;
```

**Step 2: Add lazy import in App.tsx**

After the `ScanViewerLandingPage` lazy import (~line 38):
```typescript
const TopologyViewerPage = lazy(() => import('./pages/TopologyViewerPage'));
```

**Step 3: Add route in App.tsx**

After the `/scan-viewer` route (~line 163):
```tsx
<Route path="/topology" element={
  <RequireTabVisible tabId="tools">
    <ErrorBoundary><TopologyViewerPage /></ErrorBoundary>
  </RequireTabVisible>
} />
```

**Step 4: Add sidebar entry in LayoutNew.tsx**

In the `children` array of the `tools` nav item (~line 153), add after the Scan Viewer entry:
```typescript
{
  id: 'topology',
  path: '/topology',
  label: '3D Topology (Experimental)',
  description: 'Interactive 3D surface visualization of scan thickness data'
},
```

**Step 5: Commit**

```bash
git add src/pages/TopologyViewerPage.tsx src/App.tsx src/components/LayoutNew.tsx
git commit -m "feat(topology): add page, route, and sidebar entry (experimental)"
```

---

## Task 14: Integration Test & Polish

**Step 1: Run full test suite**

```bash
npm run test
```

Verify no regressions. Fix any import or type issues.

**Step 2: Run type check**

```bash
npm run typecheck
```

**Step 3: Run build**

```bash
npm run build
```

**Step 4: Manual testing checklist**

Start dev server (`npm run dev`) and verify:

- [ ] `/topology` route loads without errors
- [ ] Sidebar shows "3D Topology (Experimental)" under Tools
- [ ] File upload accepts CSV files
- [ ] **Offset repair modal appears when files have axis issues** — verify before surface renders
- [ ] Surface renders with correct orientation (scan=X, index=Z, valleys=down)
- [ ] Nominal wall input works — surface re-baselines when changed
- [ ] Auto-detected nominal (95th percentile) shown as placeholder
- [ ] Z-scale slider adjusts exaggeration live
- [ ] "1:1" button resets to true scale
- [ ] Colorscale dropdown changes surface colors
- [ ] **Null/ND regions are genuine holes** — no flat plateaus
- [ ] Orbit/zoom/pan work with Y-up convention
- [ ] **Hover shows full-res thickness** — not decimated display value
- [ ] Cross-section: draw line → profile chart with coordinate traceability
- [ ] **Cross-section uses bilinear interpolation** — smooth profile, not staircase
- [ ] Measure: click two points → true horizontal distance and depth in mm
- [ ] **Measurement values are physical** — changing Z-scale does NOT change measurements
- [ ] Stats panel shows min/max/mean/grid size and nominal thickness source
- [ ] Large files (500×500) render without freezing
- [ ] No console errors

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat(topology): integration fixes and polish"
```

---

## Summary

| Task | Description | Test? | Est. Lines |
|------|-------------|-------|-----------|
| 1 | Types with nominal baseline + physical measurements | — | 70 |
| 2 | Min-preserving decimation + tests | YES | 140 |
| 3 | Surface builder tests (nominal, null gaps, Y-up) | YES | 160 |
| 4 | Surface builder implementation | YES | 200 |
| 5 | Cross-section engine + tests (bilinear, traceability) | YES | 190 |
| 6 | Measurement engine + tests (physical only) | YES | 80 |
| 7 | Scene manager (Y-up) | — | 200 |
| 8 | TopologyViewport (full-res hover/measure/section) | — | 260 |
| 9 | TopologyToolbar (nominal input, industrial styling) | — | 170 |
| 10 | TopologyInfoPanel (wall loss, nominal source) | — | 90 |
| 11 | CrossSectionPanel (traceability, null gaps) | — | 130 |
| 12 | TopologyViewer (scan repair flow) | — | 240 |
| 13 | Page, route, sidebar (experimental label) | — | 40 |
| 14 | Integration test & polish | YES | — |

**Total new code: ~1,970 lines across 18 new files + 3 modified files**

---

## Review Findings Addressed

### Round 1 (initial review)

| Finding | Severity | Resolution |
|---------|----------|------------|
| Downsampling erases pits | P0 | Task 2: min-preserving decimation. Measurements/sections use full-res. |
| Measurements use exaggeration | P0 | Task 6: `computeMeasurement()` takes nominal, no exaggeration param. Tests verify. |
| Null data = fake plateaus | P0 | Task 4: index buffer skips null-adjacent quads. Tests verify triangle count. |
| Axis convention confused | P1 | Task 7: explicit Y-up. Camera, lights, controls consistent. Tests verify XZ plane. |
| stats.max as baseline | P1 | Task 1: `resolveNominal()` — user-specified or 95th percentile fallback. |
| Scan repair skipped | P1 | Task 12: `hasOffsetIssues` check + CsvRepairModal before rendering. |
| Cross-section aliased | P1 | Task 5: bilinear interpolation, auto sample count, coordinate traceability. |
| Standalone vs integrated | P2 | Task 13: `/topology` labeled "Experimental", no vessel modeler coupling. |
| Glassmorphic styling | P2 | Tasks 9-12: industrial theme tokens, `--ctrl`/`--panel-mid`, no `glass-*`. |

### Round 2 (second review)

| Finding | Severity | Resolution |
|---------|----------|------------|
| `resolveNominal()` percentile formula wrong | P0 | Task 1: changed `Math.floor(values.length * 0.95)` → `Math.floor((values.length - 1) * 0.95)`. Added dedicated `resolveNominal()` unit tests. |
| Decimation shifts pit locations | P1 | Task 2: block-center coordinates instead of block-start. `isDecimated` flag returned. Task 10: info panel shows "Display decimated" indicator. |
| `bilinearSample()` fabricates edge values | P1 | Task 5: out-of-bounds returns null (not edge clamp). Added 4 boundary tests. |
| Multi-file/composite behavior underspecified | P2 | Task 12: explicit 5-step flow (single → composite → add → repair+cache-clear → render). |
| Wall loss can go negative | P2 | Task 6: `Math.max(0, nominal - thickness)` matches existing `distributionEngine.ts` convention. Added clamp test. |
| "Z-axis" wording in Y-up plan | P3 | Task 1: JSDoc changed to "vertical displacement exaggeration factor". |
