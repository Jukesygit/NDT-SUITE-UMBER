# C-Scan Distribution Stats Panel — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a configurable binned distribution panel to the C-scan compositor that shows area breakdowns by either raw mm thickness brackets or wall-loss % brackets, switchable via toggle.

**Architecture:** A pure-function engine (`utils/distributionEngine.ts`) iterates the active scan's flat 2D data grid, bins each non-null cell by either raw mm range or wall-loss %, and computes flat area per cell (`xSpacing × ySpacing`). A new `DistributionPanel.tsx` renders the binned results as a floating overlay stacked above the existing StatsPanel. Config controls (mode toggle, nominal thickness, bin count) live in the ToolBar. State is held in `CscanVisualizer.tsx` as a single `DistributionConfig` object.

**Tech Stack:** React 18, TypeScript 5.9, Vitest, existing CscanVisualizer patterns.

---

## Files Overview

| Action | File | Purpose |
|--------|------|---------|
| Modify | `src/components/CscanVisualizer/types.ts` | Add `DistributionConfig`, `DistributionBin`, `DistributionResult` types |
| Create | `src/components/CscanVisualizer/utils/distributionEngine.ts` | Pure-function engine: bin data by mm or wall-loss %, compute flat area |
| Create | `src/components/CscanVisualizer/utils/__tests__/distributionEngine.test.ts` | Tests for the engine |
| Create | `src/components/CscanVisualizer/DistributionPanel.tsx` | Floating overlay: binned table with swatches, stacks above StatsPanel |
| Modify | `src/components/CscanVisualizer/ToolBar.tsx` | Add distribution config controls: mode toggle, nominal thickness, bin count |
| Modify | `src/components/CscanVisualizer/CscanVisualizer.tsx` | Wire state, pass config to ToolBar, render DistributionPanel |

---

## Task 1: Add Types

**Files:**
- Modify: `src/components/CscanVisualizer/types.ts:1-97`

**Step 1: Add distribution types**

Append after the `CsvRepairResult` interface (end of file, after line 97):

```typescript

// ---------------------------------------------------------------------------
// Distribution Stats Panel
// ---------------------------------------------------------------------------

export type DistributionMode = 'thickness' | 'wallLoss';

export interface DistributionConfig {
  /** Whether the distribution panel is visible */
  enabled: boolean;
  /** 'thickness' bins by raw mm ranges; 'wallLoss' bins by % wall loss */
  mode: DistributionMode;
  /** Number of equal-width bins */
  binCount: number;
  /** Nominal wall thickness in mm — only used in wallLoss mode */
  nominalThickness: number;
}

export interface DistributionBin {
  /** Lower bound (inclusive) */
  min: number;
  /** Upper bound (exclusive, except last bin which is inclusive) */
  max: number;
  /** Area in this bin (m²) */
  area: number;
  /** Percentage of total valid area */
  areaPercent: number;
  /** Number of data points in this bin */
  count: number;
}

export interface DistributionResult {
  bins: DistributionBin[];
  /** Total valid data area (m²) */
  totalArea: number;
  /** Total valid data points */
  totalPoints: number;
  /** The mode used for this computation */
  mode: DistributionMode;
  /** Unit label for display ('mm' or '%') */
  unit: string;
}
```

**Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/CscanVisualizer/types.ts
git commit -m "feat(cscan): add distribution stats panel types"
```

---

## Task 2: Implement Distribution Engine + Tests

**Files:**
- Create: `src/components/CscanVisualizer/utils/distributionEngine.ts`
- Create: `src/components/CscanVisualizer/utils/__tests__/distributionEngine.test.ts`

Tests and implementation are written together; commit only after all tests pass.

### Step 1: Write the engine

Create `src/components/CscanVisualizer/utils/distributionEngine.ts`:

```typescript
import type { CscanData, DistributionConfig, DistributionBin, DistributionResult } from '../types';

/**
 * Compute a binned distribution of the active scan data.
 *
 * - Thickness mode: bins span the data's [min, max] range in mm.
 * - Wall-loss mode: bins span 0–100 % wall loss, where
 *   wallLoss = (nominal - measured) / nominal × 100, clamped to [0, 100].
 *
 * Cell area is flat: xSpacing × ySpacing (mm²), converted to m².
 */
export function computeDistribution(
  data: CscanData,
  config: DistributionConfig,
): DistributionResult | null {
  const { mode, binCount, nominalThickness } = config;

  if (!data.data || data.data.length === 0) return null;
  if (mode === 'wallLoss' && nominalThickness <= 0) return null;

  // Determine cell area (mm²)
  const xSpacing = data.xAxis.length > 1
    ? Math.abs(data.xAxis[1] - data.xAxis[0])
    : 1.0;
  const ySpacing = data.yAxis.length > 1
    ? Math.abs(data.yAxis[1] - data.yAxis[0])
    : 1.0;
  const cellAreaMm2 = xSpacing * ySpacing;

  // Collect valid values
  const values: number[] = [];
  for (let row = 0; row < data.data.length; row++) {
    const rowData = data.data[row];
    for (let col = 0; col < rowData.length; col++) {
      const v = rowData[col];
      if (v != null && !isNaN(v)) values.push(v);
    }
  }

  if (values.length === 0) return null;

  // Determine bin range and width
  let rangeMin: number;
  let rangeMax: number;
  let unit: string;

  if (mode === 'thickness') {
    // Bins span the data's actual range
    let dMin = Infinity;
    let dMax = -Infinity;
    for (const v of values) {
      if (v < dMin) dMin = v;
      if (v > dMax) dMax = v;
    }
    rangeMin = dMin;
    rangeMax = dMax;
    unit = 'mm';
  } else {
    // Wall-loss mode: fixed 0–100 %
    rangeMin = 0;
    rangeMax = 100;
    unit = '%';
  }

  const rangeSpan = rangeMax - rangeMin;
  if (rangeSpan <= 0 && mode === 'thickness') {
    // All values identical — single bin
    const totalAreaM2 = (values.length * cellAreaMm2) / 1e6;
    return {
      bins: [{
        min: rangeMin,
        max: rangeMax,
        area: totalAreaM2,
        areaPercent: 100,
        count: values.length,
      }],
      totalArea: totalAreaM2,
      totalPoints: values.length,
      mode,
      unit,
    };
  }

  const binWidth = rangeSpan / binCount;

  // Initialise bins
  const bins: DistributionBin[] = Array.from({ length: binCount }, (_, i) => ({
    min: rangeMin + i * binWidth,
    max: i === binCount - 1 ? rangeMax : rangeMin + (i + 1) * binWidth,
    area: 0,
    areaPercent: 0,
    count: 0,
  }));

  let totalArea = 0;

  for (const v of values) {
    let binValue: number;
    if (mode === 'wallLoss') {
      let wl = ((nominalThickness - v) / nominalThickness) * 100;
      if (wl < 0) wl = 0;
      if (wl > 100) wl = 100;
      binValue = wl;
    } else {
      binValue = v;
    }

    let idx = binWidth > 0 ? Math.floor((binValue - rangeMin) / binWidth) : 0;
    if (idx >= binCount) idx = binCount - 1;
    if (idx < 0) idx = 0;

    const areaM2 = cellAreaMm2 / 1e6;
    bins[idx].area += areaM2;
    bins[idx].count += 1;
    totalArea += areaM2;
  }

  // Compute percentages
  if (totalArea > 0) {
    for (const bin of bins) {
      bin.areaPercent = (bin.area / totalArea) * 100;
    }
  }

  return { bins, totalArea, totalPoints: values.length, mode, unit };
}
```

### Step 2: Write the test file

Create `src/components/CscanVisualizer/utils/__tests__/distributionEngine.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { CscanData, DistributionConfig } from '../../types';
import { computeDistribution } from '../distributionEngine';

function makeScan(overrides?: Partial<CscanData>): CscanData {
  // 3×3 grid, 100mm spacing, all 8mm thickness
  const data: (number | null)[][] = [
    [8, 8, 8],
    [8, 8, 8],
    [8, 8, 8],
  ];
  return {
    id: 'test',
    filename: 'test.csv',
    width: 3,
    height: 3,
    data,
    xAxis: [0, 100, 200],
    yAxis: [0, 100, 200],
    ...overrides,
  };
}

const THICKNESS_CONFIG: DistributionConfig = {
  enabled: true,
  mode: 'thickness',
  binCount: 5,
  nominalThickness: 10,
};

const WALL_LOSS_CONFIG: DistributionConfig = {
  enabled: true,
  mode: 'wallLoss',
  binCount: 5,
  nominalThickness: 10,
};

describe('computeDistribution', () => {
  it('returns null for empty data', () => {
    const scan = makeScan({ data: [] });
    expect(computeDistribution(scan, THICKNESS_CONFIG)).toBeNull();
  });

  it('returns null when all cells are null', () => {
    const scan = makeScan({
      data: [[null, null], [null, null]],
      xAxis: [0, 100],
      yAxis: [0, 100],
    });
    expect(computeDistribution(scan, THICKNESS_CONFIG)).toBeNull();
  });

  it('returns null for wallLoss mode with zero nominal', () => {
    const scan = makeScan();
    expect(computeDistribution(scan, { ...WALL_LOSS_CONFIG, nominalThickness: 0 })).toBeNull();
  });

  it('counts all valid points in thickness mode', () => {
    const scan = makeScan();
    const result = computeDistribution(scan, THICKNESS_CONFIG);
    expect(result).not.toBeNull();
    expect(result!.totalPoints).toBe(9);
    expect(result!.mode).toBe('thickness');
    expect(result!.unit).toBe('mm');
  });

  it('handles uniform data in thickness mode (single-value range)', () => {
    // All 8mm → range is 0, should return single bin
    const scan = makeScan();
    const result = computeDistribution(scan, THICKNESS_CONFIG);
    expect(result).not.toBeNull();
    // With identical values, rangeSpan=0 → single-bin path
    expect(result!.bins.length).toBe(1);
    expect(result!.bins[0].count).toBe(9);
    expect(result!.bins[0].areaPercent).toBeCloseTo(100, 0);
  });

  it('distributes varied thickness into correct bins', () => {
    // Values from 2 to 10mm in 2mm steps → 5 distinct values
    const data: (number | null)[][] = [
      [2, 4, 6],
      [8, 10, 2],
      [4, 6, 8],
    ];
    const scan = makeScan({ data });
    // 5 bins over range [2, 10]: each bin width = 1.6mm
    // bin 0: [2.0, 3.6) → values 2, 2 = 2 points
    // bin 1: [3.6, 5.2) → values 4, 4 = 2 points
    // bin 2: [5.2, 6.8) → values 6, 6 = 2 points
    // bin 3: [6.8, 8.4) → values 8, 8 = 2 points
    // bin 4: [8.4, 10]  → values 10 = 1 point
    const result = computeDistribution(scan, THICKNESS_CONFIG);
    expect(result).not.toBeNull();
    expect(result!.bins).toHaveLength(5);
    expect(result!.totalPoints).toBe(9);
    expect(result!.bins[0].count).toBe(2);
    expect(result!.bins[1].count).toBe(2);
    expect(result!.bins[2].count).toBe(2);
    expect(result!.bins[3].count).toBe(2);
    expect(result!.bins[4].count).toBe(1);
  });

  it('computes correct flat area (mm² to m²)', () => {
    // 3×3 grid, 100mm spacing → 9 cells × 100×100 = 90,000 mm² = 0.09 m²
    const scan = makeScan();
    const result = computeDistribution(scan, THICKNESS_CONFIG);
    expect(result).not.toBeNull();
    expect(result!.totalArea).toBeCloseTo(0.09, 4);
  });

  it('skips null cells in area calculation', () => {
    const data: (number | null)[][] = [
      [8, null, 8],
      [null, 8, null],
      [8, null, 8],
    ];
    const scan = makeScan({ data });
    const result = computeDistribution(scan, THICKNESS_CONFIG);
    expect(result).not.toBeNull();
    expect(result!.totalPoints).toBe(5);
    // 5 cells × 10,000 mm² = 50,000 mm² = 0.05 m²
    expect(result!.totalArea).toBeCloseTo(0.05, 4);
  });

  it('bins wall loss correctly', () => {
    // nominal=10mm. Values: 10mm→0% loss, 8mm→20%, 5mm→50%, 3mm→70%, 0mm→100%
    // 5 bins: [0,20), [20,40), [40,60), [60,80), [80,100]
    const data: (number | null)[][] = [
      [10, 8, 5],
      [3, 0, 10],
      [8, 5, 3],
    ];
    const scan = makeScan({ data });
    const result = computeDistribution(scan, WALL_LOSS_CONFIG);
    expect(result).not.toBeNull();
    expect(result!.mode).toBe('wallLoss');
    expect(result!.unit).toBe('%');
    expect(result!.bins).toHaveLength(5);
    // bin 0 (0–20%): 10mm→0% loss → 2 points
    expect(result!.bins[0].count).toBe(2);
    // bin 1 (20–40%): 8mm→20% loss → 2 points
    expect(result!.bins[1].count).toBe(2);
    // bin 2 (40–60%): 5mm→50% loss → 2 points
    expect(result!.bins[2].count).toBe(2);
    // bin 3 (60–80%): 3mm→70% loss → 2 points
    expect(result!.bins[3].count).toBe(2);
    // bin 4 (80–100%): 0mm→100% loss → 1 point
    expect(result!.bins[4].count).toBe(1);
  });

  it('clamps negative wall loss (measured > nominal) to bin 0', () => {
    const data: (number | null)[][] = [[12, 15]];
    const scan = makeScan({ data, xAxis: [0, 100], yAxis: [0] });
    const result = computeDistribution(scan, WALL_LOSS_CONFIG);
    expect(result).not.toBeNull();
    expect(result!.bins[0].count).toBe(2);
  });

  it('area percentages sum to ~100%', () => {
    const data: (number | null)[][] = [
      [10, 8, 5],
      [3, 0, 10],
      [8, 5, 3],
    ];
    const scan = makeScan({ data });
    const result = computeDistribution(scan, WALL_LOSS_CONFIG);
    expect(result).not.toBeNull();
    const sumPct = result!.bins.reduce((s, b) => s + b.areaPercent, 0);
    expect(sumPct).toBeCloseTo(100, 0);
  });

  it('respects bin count parameter', () => {
    const data: (number | null)[][] = [[2, 4, 6, 8, 10]];
    const scan = makeScan({ data, xAxis: [0, 100, 200, 300, 400], yAxis: [0] });
    const r3 = computeDistribution(scan, { ...THICKNESS_CONFIG, binCount: 3 });
    expect(r3).not.toBeNull();
    expect(r3!.bins).toHaveLength(3);
    const r10 = computeDistribution(scan, { ...THICKNESS_CONFIG, binCount: 10 });
    expect(r10).not.toBeNull();
    expect(r10!.bins).toHaveLength(10);
  });
});
```

### Step 3: Run tests

Run: `npx vitest run src/components/CscanVisualizer/utils/__tests__/distributionEngine.test.ts`
Expected: ALL PASS

### Step 4: Run full test suite

Run: `npx vitest run`
Expected: PASS (no regressions)

### Step 5: Commit

```bash
git add src/components/CscanVisualizer/utils/distributionEngine.ts src/components/CscanVisualizer/utils/__tests__/distributionEngine.test.ts
git commit -m "feat(cscan): implement distribution engine with tests"
```

---

## Task 3: Add DistributionPanel Component

**Files:**
- Create: `src/components/CscanVisualizer/DistributionPanel.tsx`

This floats above the existing StatsPanel when both are visible.

**Step 1: Create the component**

```typescript
import { useMemo } from 'react';
import { X } from 'lucide-react';
import type { CscanData, DistributionConfig, DistributionResult } from './types';
import { computeDistribution } from './utils/distributionEngine';

interface DistributionPanelProps {
  data: CscanData | null;
  config: DistributionConfig;
  /** Whether the basic StatsPanel is visible below */
  statsVisible: boolean;
  onClose: () => void;
}

function formatArea(m2: number): string {
  return m2 < 0.01 ? m2.toFixed(4) : m2.toFixed(2);
}

function formatPct(pct: number): string {
  return pct < 0.1 && pct > 0 ? pct.toFixed(2) : pct.toFixed(1);
}

function formatBound(val: number, unit: string): string {
  if (unit === '%') return val.toFixed(0);
  return val.toFixed(1);
}

const BIN_COLORS = [
  'rgba(0, 204, 102, 0.9)',
  'rgba(144, 238, 144, 0.9)',
  'rgba(255, 204, 0, 0.9)',
  'rgba(255, 140, 0, 0.9)',
  'rgba(255, 60, 60, 0.9)',
];

function binColor(index: number, total: number): string {
  if (total <= BIN_COLORS.length) return BIN_COLORS[index] ?? BIN_COLORS[BIN_COLORS.length - 1];
  const t = total > 1 ? index / (total - 1) : 0;
  const mapped = Math.round(t * (BIN_COLORS.length - 1));
  return BIN_COLORS[mapped];
}

export default function DistributionPanel({
  data,
  config,
  statsVisible,
  onClose,
}: DistributionPanelProps) {
  const result = useMemo<DistributionResult | null>(() => {
    if (!data || !config.enabled) return null;
    return computeDistribution(data, config);
  }, [data, config]);

  if (!result) return null;

  // Stack above StatsPanel when it's visible (~220px tall)
  const bottom = statsVisible ? 240 : 12;

  return (
    <div
      className="absolute left-4 z-30 rounded-lg shadow-xl border border-gray-700"
      style={{
        backgroundColor: 'rgba(20, 25, 35, 0.95)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        minWidth: '320px',
        bottom,
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: '0.75rem',
        color: 'rgba(255, 255, 255, 0.85)',
        transition: 'bottom 0.3s ease',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b"
        style={{ borderColor: 'rgba(255,255,255,0.12)' }}
      >
        <div className="flex items-center gap-2">
          <span
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              color: 'rgba(255,255,255,0.5)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {result.mode === 'thickness' ? 'Thickness Distribution' : 'Wall Loss Distribution'}
          </span>
          {result.mode === 'wallLoss' && (
            <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)' }}>
              Nom. {config.nominalThickness}mm
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-700 rounded transition-colors"
          title="Close"
        >
          <X className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.4)' }} />
        </button>
      </div>

      {/* Table */}
      <div className="px-3 py-2">
        {/* Header row */}
        <div className="flex items-center gap-1.5 pb-1" style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)' }}>
          <span style={{ flex: 1 }}>Range</span>
          <span style={{ width: 72, textAlign: 'right' }}>Area</span>
          <span style={{ width: 44, textAlign: 'right' }}>%</span>
          <span style={{ width: 40, textAlign: 'right' }}>Pts</span>
        </div>

        {/* Bin rows */}
        {result.bins.map((bin, i) => (
          <div key={i} className="flex items-center gap-1.5 py-0.5">
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                flexShrink: 0,
                backgroundColor: binColor(i, result.bins.length),
              }}
            />
            <span style={{ flex: 1, color: 'rgba(255,255,255,0.7)' }}>
              {formatBound(bin.min, result.unit)}–{formatBound(bin.max, result.unit)}{result.unit}
            </span>
            <span style={{ width: 72, textAlign: 'right', color: 'rgba(255,255,255,0.6)' }}>
              {formatArea(bin.area)} m²
            </span>
            <span style={{ width: 44, textAlign: 'right', color: 'rgba(0,204,102,0.9)', fontWeight: 600 }}>
              {formatPct(bin.areaPercent)}%
            </span>
            <span style={{ width: 40, textAlign: 'right', color: 'rgba(255,255,255,0.4)' }}>
              {bin.count}
            </span>
          </div>
        ))}

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.12)', margin: '4px 0' }} />

        {/* Total row */}
        <div className="flex items-center gap-1.5 py-0.5">
          <span style={{ flex: 1, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>Total</span>
          <span style={{ width: 72, textAlign: 'right', fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>
            {formatArea(result.totalArea)} m²
          </span>
          <span style={{ width: 44, textAlign: 'right', fontWeight: 700, color: 'rgba(0,204,102,0.9)' }}>
            100%
          </span>
          <span style={{ width: 40, textAlign: 'right', color: 'rgba(255,255,255,0.4)' }}>
            {result.totalPoints}
          </span>
        </div>
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
git add src/components/CscanVisualizer/DistributionPanel.tsx
git commit -m "feat(cscan): add DistributionPanel component"
```

---

## Task 4: Add Distribution Controls to ToolBar

**Files:**
- Modify: `src/components/CscanVisualizer/ToolBar.tsx`

This adds a "Distribution" toggle button and inline config controls (mode, nominal, bins) to the toolbar.

**Step 1: Add props and imports**

In `ToolBar.tsx`, add `DistributionConfig` and `DistributionMode` to the type import from `'./types'` (line 3):

```typescript
import { Tool, DisplaySettings, DistributionConfig, DistributionMode } from './types';
```

Add three new props to `ToolBarProps` (after `layoutModeDisabled`, line 17):

```typescript
  distributionConfig?: DistributionConfig;
  onDistributionConfigChange?: (config: DistributionConfig) => void;
  hasData?: boolean;
```

Destructure them in the component (after `layoutModeDisabled` in the destructuring, around line 31):

```typescript
  distributionConfig,
  onDistributionConfigChange,
  hasData = false
```

**Step 2: Add the Distribution control group**

Insert after the Stats toggle button (after the `{onToggleStats && ( ... )}` block that ends around line 308), before the closing `</div>` of the flex container:

```tsx
        {/* Distribution Controls */}
        {onDistributionConfigChange && distributionConfig && (
          <>
            <div className="w-px h-6 bg-gray-700" />
            <button
              onClick={() => onDistributionConfigChange({
                ...distributionConfig,
                enabled: !distributionConfig.enabled,
              })}
              disabled={!hasData}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors
                ${distributionConfig.enabled
                  ? 'bg-green-600 text-white'
                  : hasData
                  ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  : 'bg-gray-700 text-gray-600 cursor-not-allowed'}
              `}
              title="Toggle Distribution Panel"
            >
              <span className="text-xs font-medium">Dist</span>
            </button>

            {distributionConfig.enabled && (
              <>
                <select
                  value={distributionConfig.mode}
                  onChange={(e) => onDistributionConfigChange({
                    ...distributionConfig,
                    mode: e.target.value as DistributionMode,
                  })}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: '#374151',
                    color: '#ffffff',
                    fontSize: '12px',
                    border: '1px solid #4b5563',
                    borderRadius: '4px',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                  title="Distribution mode"
                >
                  <option value="thickness">Thickness (mm)</option>
                  <option value="wallLoss">Wall Loss (%)</option>
                </select>

                {distributionConfig.mode === 'wallLoss' && (
                  <div className="flex items-center gap-1">
                    <label className="text-xs text-gray-400">Nom:</label>
                    <input
                      type="number"
                      value={distributionConfig.nominalThickness}
                      min={0.1}
                      step={0.1}
                      onChange={(e) => onDistributionConfigChange({
                        ...distributionConfig,
                        nominalThickness: Math.max(0.1, Number(e.target.value)),
                      })}
                      style={{
                        width: '56px',
                        padding: '4px 6px',
                        backgroundColor: '#374151',
                        color: '#ffffff',
                        fontSize: '12px',
                        border: '1px solid #4b5563',
                        borderRadius: '4px',
                        outline: 'none',
                      }}
                      title="Nominal thickness (mm)"
                    />
                    <span className="text-xs text-gray-500">mm</span>
                  </div>
                )}

                <div className="flex items-center gap-1">
                  <label className="text-xs text-gray-400">Bins:</label>
                  <input
                    type="number"
                    value={distributionConfig.binCount}
                    min={2}
                    max={20}
                    step={1}
                    onChange={(e) => onDistributionConfigChange({
                      ...distributionConfig,
                      binCount: Math.max(2, Math.min(20, Math.round(Number(e.target.value)))),
                    })}
                    style={{
                      width: '44px',
                      padding: '4px 6px',
                      backgroundColor: '#374151',
                      color: '#ffffff',
                      fontSize: '12px',
                      border: '1px solid #4b5563',
                      borderRadius: '4px',
                      outline: 'none',
                    }}
                    title="Number of bins"
                  />
                </div>
              </>
            )}
          </>
        )}
```

**Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/CscanVisualizer/ToolBar.tsx
git commit -m "feat(cscan): add distribution controls to toolbar"
```

---

## Task 5: Wire Into CscanVisualizer

**Files:**
- Modify: `src/components/CscanVisualizer/CscanVisualizer.tsx`

**Step 1: Add imports**

After `import StatsPanel from './StatsPanel';` (line 19), add:

```typescript
import DistributionPanel from './DistributionPanel';
```

Add `DistributionConfig` to the type import from `'./types'` (line 21). Change:
```typescript
import { CscanData, Tool, DisplaySettings } from './types';
```
to:
```typescript
import { CscanData, Tool, DisplaySettings, DistributionConfig } from './types';
```

**Step 2: Add state**

After the `displaySettings` state (line ~88), add:

```typescript
  // Distribution panel state
  const [distributionConfig, setDistributionConfig] = useState<DistributionConfig>({
    enabled: false,
    mode: 'thickness',
    binCount: 5,
    nominalThickness: 10,
  });
```

**Step 3: Pass props to ToolBar**

In the `<ToolBar>` JSX (around line 455-467), add after `layoutModeDisabled={processedScans.length < 2}`:

```tsx
        distributionConfig={distributionConfig}
        onDistributionConfigChange={setDistributionConfig}
        hasData={!!scanData}
```

**Step 4: Render DistributionPanel**

After the StatsPanel block (which ends around line 591, after `</div>`), add:

```tsx
        {/* Distribution Panel - stacks above stats panel */}
        {distributionConfig.enabled && (
          <DistributionPanel
            data={scanData}
            config={distributionConfig}
            statsVisible={showStats}
            onClose={() => setDistributionConfig(prev => ({ ...prev, enabled: false }))}
          />
        )}
```

**Step 5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 6: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

**Step 7: Commit**

```bash
git add src/components/CscanVisualizer/CscanVisualizer.tsx
git commit -m "feat(cscan): wire distribution panel into compositor"
```

---

## Task 6: Build Verification and Manual Test

**Step 1: Run production build**

Run: `npm run build`
Expected: PASS with no errors

**Step 2: Visual smoke test**

Run: `npm run dev`

Test checklist:
- [ ] Open the C-scan compositor (`/cscan`)
- [ ] Load a C-scan data file
- [ ] Click "Dist" button in toolbar — panel appears at bottom-left
- [ ] Verify thickness mode shows bins with mm ranges spanning the data's actual range
- [ ] Switch mode dropdown to "Wall Loss (%)" — panel updates, Nom input appears
- [ ] Set nominal thickness — bins show 0–100% wall loss range
- [ ] Change bin count — panel updates
- [ ] Verify area percentages sum to ~100%
- [ ] Verify total area matches the existing Stats panel's "Valid Area"
- [ ] Toggle Stats panel off — distribution panel shifts down
- [ ] Close distribution panel via X button — panel disappears
- [ ] Click "Dist" in toolbar again — panel reappears with previous config
- [ ] Load a composite (create from multiple files) — panel updates with composite data
- [ ] Test with a file that has many ND cells — verify ND cells are excluded from distribution
- [ ] Disable distribution panel, re-enable — same config preserved

**Step 3: Final commit (if any adjustments needed)**

```bash
git add -A
git commit -m "fix(cscan): adjustments from distribution panel smoke test"
```

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Flat area (`xSpacing × ySpacing`) not 3D surface area | The compositor works with 2D data grids — there's no vessel geometry to map onto. Flat area matches the existing StatsPanel's area calculation. |
| Thickness mode bins span data's [min, max] range | Unlike wall-loss (which always spans 0–100%), thickness has no universal range. Data-driven bins are more useful than a fixed range. |
| Wall-loss mode bins span fixed 0–100% | Industry-standard range. Values outside (negative wall loss from measured > nominal) are clamped to 0%. |
| Config in toolbar (not separate panel) | The compositor's toolbar already has Range/Stats/Layout controls. Adding distribution controls maintains the established UX pattern — no sidebar to add them to. |
| Inline styles instead of CSS file | The compositor uses inline styles and Tailwind utilities throughout (no `.css` file). Following existing patterns. |
| State in CscanVisualizer (not persisted) | The compositor has no save/load model — scans are loaded fresh each session. Persisting distribution config adds no value. |
| Single `DistributionConfig` object | Cleaner than separate `mode`, `binCount`, `nominalThickness` states. One `useState` call, one prop to pass down. |
| DistributionPanel stacks above StatsPanel | Same pattern as vessel modeler's WallLossPanel stacking above CoveragePanel. Dynamic `bottom` offset avoids overlap. |
