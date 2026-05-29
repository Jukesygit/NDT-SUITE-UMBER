---
tags:
  - plans/cscan
  - compositor
---

# Compositor Layout Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a toggleable "Layout Mode" to the C-scan compositor that lets users drag scan heatmap previews into position on a shared canvas with edge snapping, then apply positions to create a composite.

**Architecture:** New `useLayoutMode` hook manages scan positions, z-order, drag state, camera, and snap logic as pure state. New `LayoutCanvas` component renders a 2D canvas with requestAnimationFrame, consuming the hook. CscanVisualizer toggles between CanvasViewport (Plotly) and LayoutCanvas. Apply builds adjusted scans immutably and calls `createCompositeFromDataWithWorker()` directly — no mutation of processedScans.

**Tech Stack:** React 18, TypeScript, Canvas 2D API, existing heatmap-renderer Web Worker, Vitest

---

## Task 1: useLayoutMode Hook — Core State and Initialization

**Files:**
- Create: `src/components/CscanVisualizer/hooks/useLayoutMode.ts`
- Test: `src/components/CscanVisualizer/hooks/__tests__/useLayoutMode.test.ts`
- Read: `src/components/CscanVisualizer/types.ts` (CscanData interface)

**Context:** This hook manages all layout mode state. It takes an array of `CscanData` and provides positions, z-order, camera, and actions. Positions are initialized from each scan's axis min values (using `Math.min(...xAxis)` and `Math.min(...yAxis)`) to handle axes that may not start at index 0 or may be descending.

**Step 1: Write the failing test**

```typescript
// src/components/CscanVisualizer/hooks/__tests__/useLayoutMode.test.ts
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLayoutMode } from '../useLayoutMode';
import type { CscanData } from '../../types';

function makeScan(id: string, xAxis: number[], yAxis: number[]): CscanData {
  const width = xAxis.length;
  const height = yAxis.length;
  return {
    id,
    filename: `${id}.csv`,
    width,
    height,
    data: Array.from({ length: height }, () => Array(width).fill(5.0)),
    xAxis,
    yAxis,
  };
}

describe('useLayoutMode', () => {
  const scanA = makeScan('a', [0, 5, 10], [0, 1, 2, 3]);
  const scanB = makeScan('b', [100, 105, 110], [0, 1, 2, 3]);

  it('initializes positions from axis min values', () => {
    const { result } = renderHook(() => useLayoutMode([scanA, scanB]));

    const posA = result.current.scanPositions.get('a');
    const posB = result.current.scanPositions.get('b');
    expect(posA).toEqual({ x: 0, y: 0 });
    expect(posB).toEqual({ x: 100, y: 0 });
  });

  it('initializes z-order matching scan order', () => {
    const { result } = renderHook(() => useLayoutMode([scanA, scanB]));
    expect(result.current.zOrder).toEqual(['a', 'b']);
  });

  it('initializes camera centered on scan extents', () => {
    const { result } = renderHook(() => useLayoutMode([scanA, scanB]));
    expect(result.current.camera.zoom).toBeGreaterThan(0);
    expect(typeof result.current.camera.panX).toBe('number');
    expect(typeof result.current.camera.panY).toBe('number');
  });

  it('bringToFront moves scan to end of z-order', () => {
    const { result } = renderHook(() => useLayoutMode([scanA, scanB]));
    act(() => result.current.bringToFront('a'));
    expect(result.current.zOrder).toEqual(['b', 'a']);
  });

  it('setScanPosition updates position for a scan', () => {
    const { result } = renderHook(() => useLayoutMode([scanA, scanB]));
    act(() => result.current.setScanPosition('a', { x: 50, y: 25 }));
    expect(result.current.scanPositions.get('a')).toEqual({ x: 50, y: 25 });
  });

  it('resetPositions restores original axis-derived positions', () => {
    const { result } = renderHook(() => useLayoutMode([scanA, scanB]));
    act(() => result.current.setScanPosition('a', { x: 999, y: 999 }));
    act(() => result.current.resetPositions());
    expect(result.current.scanPositions.get('a')).toEqual({ x: 0, y: 0 });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/CscanVisualizer/hooks/__tests__/useLayoutMode.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// src/components/CscanVisualizer/hooks/useLayoutMode.ts
import { useState, useCallback, useMemo } from 'react';
import type { CscanData } from '../types';

export interface ScanPosition {
  x: number;
  y: number;
}

export interface Camera {
  panX: number;
  panY: number;
  zoom: number;
}

export interface ScanExtents {
  width: number;
  height: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface UseLayoutModeResult {
  scanPositions: Map<string, ScanPosition>;
  zOrder: string[];
  camera: Camera;
  scanExtentsMap: Map<string, ScanExtents>;
  setScanPosition: (id: string, pos: ScanPosition) => void;
  bringToFront: (id: string) => void;
  setCamera: (camera: Camera) => void;
  resetPositions: () => void;
}

function computeInitialPositions(scans: CscanData[]): Map<string, ScanPosition> {
  const map = new Map<string, ScanPosition>();
  for (const scan of scans) {
    map.set(scan.id, {
      x: Math.min(...scan.xAxis),
      y: Math.min(...scan.yAxis),
    });
  }
  return map;
}

function computeScanExtents(scan: CscanData): ScanExtents {
  const minX = Math.min(...scan.xAxis);
  const maxX = Math.max(...scan.xAxis);
  const minY = Math.min(...scan.yAxis);
  const maxY = Math.max(...scan.yAxis);
  return { width: maxX - minX, height: maxY - minY, minX, maxX, minY, maxY };
}

function computeInitialCamera(scans: CscanData[]): Camera {
  if (scans.length === 0) return { panX: 0, panY: 0, zoom: 1 };
  let gMinX = Infinity, gMaxX = -Infinity, gMinY = Infinity, gMaxY = -Infinity;
  for (const scan of scans) {
    const minX = Math.min(...scan.xAxis);
    const maxX = Math.max(...scan.xAxis);
    const minY = Math.min(...scan.yAxis);
    const maxY = Math.max(...scan.yAxis);
    if (minX < gMinX) gMinX = minX;
    if (maxX > gMaxX) gMaxX = maxX;
    if (minY < gMinY) gMinY = minY;
    if (maxY > gMaxY) gMaxY = maxY;
  }
  return {
    panX: (gMinX + gMaxX) / 2,
    panY: (gMinY + gMaxY) / 2,
    zoom: 1,
  };
}

export function useLayoutMode(scans: CscanData[]): UseLayoutModeResult {
  const initialPositions = useMemo(() => computeInitialPositions(scans), [scans]);
  const [scanPositions, setScanPositions] = useState(() => computeInitialPositions(scans));
  const [zOrder, setZOrder] = useState(() => scans.map(s => s.id));
  const [camera, setCamera] = useState(() => computeInitialCamera(scans));

  const scanExtentsMap = useMemo(() => {
    const map = new Map<string, ScanExtents>();
    for (const scan of scans) {
      map.set(scan.id, computeScanExtents(scan));
    }
    return map;
  }, [scans]);

  const setScanPosition = useCallback((id: string, pos: ScanPosition) => {
    setScanPositions(prev => {
      const next = new Map(prev);
      next.set(id, pos);
      return next;
    });
  }, []);

  const bringToFront = useCallback((id: string) => {
    setZOrder(prev => {
      const filtered = prev.filter(x => x !== id);
      return [...filtered, id];
    });
  }, []);

  const resetPositions = useCallback(() => {
    setScanPositions(new Map(initialPositions));
  }, [initialPositions]);

  return {
    scanPositions,
    zOrder,
    camera,
    scanExtentsMap,
    setScanPosition,
    bringToFront,
    setCamera,
    resetPositions,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/CscanVisualizer/hooks/__tests__/useLayoutMode.test.ts`
Expected: PASS — all 6 tests

**Step 5: Commit**

```bash
git add src/components/CscanVisualizer/hooks/useLayoutMode.ts src/components/CscanVisualizer/hooks/__tests__/useLayoutMode.test.ts
git commit -m "feat(cscan): add useLayoutMode hook with positions, z-order, camera"
```

---

## Task 2: Snap Logic

**Files:**
- Create: `src/components/CscanVisualizer/hooks/layoutSnap.ts`
- Test: `src/components/CscanVisualizer/hooks/__tests__/layoutSnap.test.ts`
- Read: `src/components/CscanVisualizer/hooks/useLayoutMode.ts` (ScanPosition, ScanExtents)

**Context:** Pure function that takes a dragged scan's proposed position plus all other scans' positions/extents, and returns a snap result if any edge is within 10mm tolerance. Must check that the scans actually overlap on the perpendicular axis before snapping (e.g., horizontal snap only if index ranges intersect).

**Step 1: Write the failing test**

```typescript
// src/components/CscanVisualizer/hooks/__tests__/layoutSnap.test.ts
import { describe, it, expect } from 'vitest';
import { findSnap, type SnapResult } from '../layoutSnap';
import type { ScanPosition, ScanExtents } from '../useLayoutMode';

describe('findSnap', () => {
  // Scan A: 10mm wide, 4mm tall
  const extentsA: ScanExtents = { width: 10, height: 4, minX: 0, maxX: 10, minY: 0, maxY: 4 };
  // Scan B: 10mm wide, 4mm tall, positioned at x=20, y=0
  const extentsB: ScanExtents = { width: 10, height: 4, minX: 0, maxX: 10, minY: 0, maxY: 4 };

  const otherScans: Array<{ id: string; position: ScanPosition; extents: ScanExtents }> = [
    { id: 'b', position: { x: 20, y: 0 }, extents: extentsB },
  ];

  it('snaps right-to-left when within tolerance', () => {
    // Drag A so its right edge (x + 10 = 17) is near B's left edge (20)
    // Distance = 3mm, within 10mm tolerance
    const result = findSnap('a', { x: 7, y: 0 }, extentsA, otherScans, false);
    expect(result).not.toBeNull();
    expect(result!.snappedPosition.x).toBe(10); // right edge = 20 = B's left
  });

  it('does not snap when beyond tolerance', () => {
    // Drag A to x=-5, right edge = 5, distance to B's left = 15mm > 10mm
    const result = findSnap('a', { x: -5, y: 0 }, extentsA, otherScans, false);
    expect(result).toBeNull();
  });

  it('does not snap when shift key is held', () => {
    const result = findSnap('a', { x: 7, y: 0 }, extentsA, otherScans, true);
    expect(result).toBeNull();
  });

  it('does not snap horizontally when no vertical overlap', () => {
    // Move A to y=100, no vertical overlap with B at y=0
    const result = findSnap('a', { x: 7, y: 100 }, extentsA, otherScans, false);
    expect(result).toBeNull();
  });

  it('snaps vertically (bottom-to-top)', () => {
    // B at x=0, y=10. Drag A so bottom edge (y + 4 = 8) is near B's top (10)
    const vertScans = [{ id: 'b', position: { x: 0, y: 10 }, extents: extentsB }];
    const result = findSnap('a', { x: 0, y: 4 }, extentsA, vertScans, false);
    expect(result).not.toBeNull();
    expect(result!.snappedPosition.y).toBe(6); // bottom = 10 = B's top
  });

  it('picks closest snap when multiple edges are near', () => {
    // B at x=11 (left edge 11, right edge 21)
    // Drag A to x=0 → right edge = 10, distance to B left = 1mm
    const closeScans = [{ id: 'b', position: { x: 11, y: 0 }, extents: extentsB }];
    const result = findSnap('a', { x: 0, y: 0 }, extentsA, closeScans, false);
    expect(result).not.toBeNull();
    expect(result!.snappedPosition.x).toBe(1); // right edge = 11 = B's left
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/CscanVisualizer/hooks/__tests__/layoutSnap.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// src/components/CscanVisualizer/hooks/layoutSnap.ts
import type { ScanPosition, ScanExtents } from './useLayoutMode';

const SNAP_TOLERANCE = 10; // mm

export interface SnapCandidate {
  axis: 'x' | 'y';
  edge: 'left' | 'right' | 'top' | 'bottom';
  targetEdge: 'left' | 'right' | 'top' | 'bottom';
  targetId: string;
  distance: number;
  snapValue: number;
}

export interface SnapResult {
  snappedPosition: ScanPosition;
  guides: Array<{
    axis: 'x' | 'y';
    value: number;
    start: number;
    end: number;
    targetId: string;
  }>;
}

function rangesOverlap(aMin: number, aMax: number, bMin: number, bMax: number): boolean {
  return aMin < bMax && aMax > bMin;
}

export function findSnap(
  _draggedId: string,
  proposedPos: ScanPosition,
  draggedExtents: ScanExtents,
  otherScans: Array<{ id: string; position: ScanPosition; extents: ScanExtents }>,
  shiftHeld: boolean,
): SnapResult | null {
  if (shiftHeld) return null;

  const dLeft = proposedPos.x;
  const dRight = proposedPos.x + draggedExtents.width;
  const dTop = proposedPos.y;
  const dBottom = proposedPos.y + draggedExtents.height;

  const candidates: SnapCandidate[] = [];

  for (const other of otherScans) {
    const oLeft = other.position.x;
    const oRight = other.position.x + other.extents.width;
    const oTop = other.position.y;
    const oBottom = other.position.y + other.extents.height;

    const hOverlap = rangesOverlap(dTop, dBottom, oTop, oBottom);
    const vOverlap = rangesOverlap(dLeft, dRight, oLeft, oRight);

    if (hOverlap) {
      // right-to-left
      const d1 = Math.abs(dRight - oLeft);
      if (d1 <= SNAP_TOLERANCE) {
        candidates.push({ axis: 'x', edge: 'right', targetEdge: 'left', targetId: other.id, distance: d1, snapValue: oLeft - draggedExtents.width });
      }
      // left-to-right
      const d2 = Math.abs(dLeft - oRight);
      if (d2 <= SNAP_TOLERANCE) {
        candidates.push({ axis: 'x', edge: 'left', targetEdge: 'right', targetId: other.id, distance: d2, snapValue: oRight });
      }
      // left-to-left
      const d3 = Math.abs(dLeft - oLeft);
      if (d3 <= SNAP_TOLERANCE) {
        candidates.push({ axis: 'x', edge: 'left', targetEdge: 'left', targetId: other.id, distance: d3, snapValue: oLeft });
      }
      // right-to-right
      const d4 = Math.abs(dRight - oRight);
      if (d4 <= SNAP_TOLERANCE) {
        candidates.push({ axis: 'x', edge: 'right', targetEdge: 'right', targetId: other.id, distance: d4, snapValue: oRight - draggedExtents.width });
      }
    }

    if (vOverlap) {
      // bottom-to-top
      const d5 = Math.abs(dBottom - oTop);
      if (d5 <= SNAP_TOLERANCE) {
        candidates.push({ axis: 'y', edge: 'bottom', targetEdge: 'top', targetId: other.id, distance: d5, snapValue: oTop - draggedExtents.height });
      }
      // top-to-bottom
      const d6 = Math.abs(dTop - oBottom);
      if (d6 <= SNAP_TOLERANCE) {
        candidates.push({ axis: 'y', edge: 'top', targetEdge: 'bottom', targetId: other.id, distance: d6, snapValue: oBottom });
      }
      // top-to-top
      const d7 = Math.abs(dTop - oTop);
      if (d7 <= SNAP_TOLERANCE) {
        candidates.push({ axis: 'y', edge: 'top', targetEdge: 'top', targetId: other.id, distance: d7, snapValue: oTop });
      }
      // bottom-to-bottom
      const d8 = Math.abs(dBottom - oBottom);
      if (d8 <= SNAP_TOLERANCE) {
        candidates.push({ axis: 'y', edge: 'bottom', targetEdge: 'bottom', targetId: other.id, distance: d8, snapValue: oBottom - draggedExtents.height });
      }
    }
  }

  if (candidates.length === 0) return null;

  // Pick best X snap and best Y snap independently
  const xCandidates = candidates.filter(c => c.axis === 'x');
  const yCandidates = candidates.filter(c => c.axis === 'y');

  const bestX = xCandidates.length > 0 ? xCandidates.reduce((a, b) => a.distance < b.distance ? a : b) : null;
  const bestY = yCandidates.length > 0 ? yCandidates.reduce((a, b) => a.distance < b.distance ? a : b) : null;

  const snappedPosition: ScanPosition = {
    x: bestX ? bestX.snapValue : proposedPos.x,
    y: bestY ? bestY.snapValue : proposedPos.y,
  };

  const guides: SnapResult['guides'] = [];
  if (bestX) {
    const snapX = bestX.edge === 'right' ? snappedPosition.x + draggedExtents.width : snappedPosition.x;
    const target = otherScans.find(s => s.id === bestX.targetId)!;
    const minY = Math.min(snappedPosition.y, target.position.y);
    const maxY = Math.max(snappedPosition.y + draggedExtents.height, target.position.y + target.extents.height);
    guides.push({ axis: 'x', value: snapX, start: minY, end: maxY, targetId: bestX.targetId });
  }
  if (bestY) {
    const snapY = bestY.edge === 'bottom' ? snappedPosition.y + draggedExtents.height : snappedPosition.y;
    const target = otherScans.find(s => s.id === bestY.targetId)!;
    const minX = Math.min(snappedPosition.x, target.position.x);
    const maxX = Math.max(snappedPosition.x + draggedExtents.width, target.position.x + target.extents.width);
    guides.push({ axis: 'y', value: snapY, start: minX, end: maxX, targetId: bestY.targetId });
  }

  return { snappedPosition, guides };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/CscanVisualizer/hooks/__tests__/layoutSnap.test.ts`
Expected: PASS — all 6 tests

**Step 5: Commit**

```bash
git add src/components/CscanVisualizer/hooks/layoutSnap.ts src/components/CscanVisualizer/hooks/__tests__/layoutSnap.test.ts
git commit -m "feat(cscan): add edge snap logic for layout mode"
```

---

## Task 3: LayoutCanvas Component — Thumbnail Rendering and Basic Canvas

**Files:**
- Create: `src/components/CscanVisualizer/LayoutCanvas.tsx`
- Read: `src/hooks/useHeatmapRenderer.ts` (for worker pattern reference)
- Read: `src/workers/heatmap-renderer.worker.ts` (worker message format)
- Read: `src/components/CscanVisualizer/hooks/useLayoutMode.ts`

**Context:** The LayoutCanvas mounts when layout mode is toggled on. It creates a dedicated heatmap-renderer worker instance, renders each scan sequentially at ~200px width with fixed Jet/reversed colormap, caches results as `ImageBitmap`, and paints them on a canvas via `requestAnimationFrame`. The existing `useHeatmapRenderer` hook only tracks the latest result — we need a multi-scan cache, so the component manages its own worker directly (same pattern, different caching strategy).

**Step 1: Create LayoutCanvas with thumbnail generation and canvas rendering**

```typescript
// src/components/CscanVisualizer/LayoutCanvas.tsx
import { useRef, useEffect, useCallback, useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import type { CscanData } from './types';
import type { ScanPosition, ScanExtents } from './hooks/useLayoutMode';
import { findSnap, type SnapResult } from './hooks/layoutSnap';

const THUMBNAIL_MAX_WIDTH = 200;
const SNAP_GUIDE_COLOR = '#35a058'; // --green-bright from design tokens
const HIGHLIGHT_COLOR = '#2d8a4e'; // --green from design tokens
const LABEL_BG = 'rgba(28, 27, 24, 0.75)'; // neutral-950 with alpha
const LABEL_TEXT = '#f5f4f2'; // --text-inverse
const CANVAS_BG = '#1c1b18'; // --color-neutral-900

interface LayoutCanvasProps {
  scans: CscanData[];
  scanPositions: Map<string, ScanPosition>;
  scanExtentsMap: Map<string, ScanExtents>;
  zOrder: string[];
  highlightedScanId: string | null;
  onPositionChange: (id: string, pos: ScanPosition) => void;
  onBringToFront: (id: string) => void;
  onApply: () => void;
  onReset: () => void;
  camera: { panX: number; panY: number; zoom: number };
  onCameraChange: (camera: { panX: number; panY: number; zoom: number }) => void;
}

export default function LayoutCanvas({
  scans,
  scanPositions,
  scanExtentsMap,
  zOrder,
  highlightedScanId,
  onPositionChange,
  onBringToFront,
  onApply,
  onReset,
  camera,
  onCameraChange,
}: LayoutCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const thumbnailCache = useRef<Map<string, ImageBitmap>>(new Map());
  const workerRef = useRef<Worker | null>(null);
  const rafRef = useRef<number>(0);

  // Drag state
  const dragRef = useRef<{
    scanId: string;
    startMouse: { x: number; y: number };
    startPos: ScanPosition;
  } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<ScanPosition | null>(null);
  const [snapResult, setSnapResult] = useState<SnapResult | null>(null);
  const shiftRef = useRef(false);

  // Right-drag pan state
  const panDragRef = useRef<{
    startMouse: { x: number; y: number };
    startCamera: { panX: number; panY: number };
  } | null>(null);

  // Convert canvas pixel to mm-space
  const pixelToMm = useCallback((px: number, py: number, canvasWidth: number, canvasHeight: number) => {
    const mmX = (px - canvasWidth / 2) / camera.zoom + camera.panX;
    const mmY = (py - canvasHeight / 2) / camera.zoom + camera.panY;
    return { x: mmX, y: mmY };
  }, [camera]);

  // Convert mm-space to canvas pixel
  const mmToPixel = useCallback((mmX: number, mmY: number, canvasWidth: number, canvasHeight: number) => {
    const px = (mmX - camera.panX) * camera.zoom + canvasWidth / 2;
    const py = (mmY - camera.panY) * camera.zoom + canvasHeight / 2;
    return { x: px, y: py };
  }, [camera]);

  // Generate thumbnails via heatmap worker
  useEffect(() => {
    const worker = new Worker(
      new URL('../../workers/heatmap-renderer.worker.ts', import.meta.url),
      { type: 'module' },
    );
    workerRef.current = worker;

    let pendingQueue = [...scans];
    let currentId = 0;

    worker.onmessage = async (e: MessageEvent<{ id: number; imageData: ImageData }>) => {
      const { imageData } = e.data;
      const scan = scans.find((_, idx) => idx === e.data.id);
      if (scan) {
        const bitmap = await createImageBitmap(imageData);
        thumbnailCache.current.set(scan.id, bitmap);
      }
      // Process next
      processNext();
    };

    function processNext() {
      if (pendingQueue.length === 0) return;
      const scan = pendingQueue.shift()!;
      const idx = scans.indexOf(scan);

      // Convert CscanData.data (number|null)[][] to Float32Array
      const totalCells = scan.width * scan.height;
      const matrix = new Float32Array(totalCells);
      for (let row = 0; row < scan.height; row++) {
        for (let col = 0; col < scan.width; col++) {
          const val = scan.data[row]?.[col];
          matrix[row * scan.width + col] = val === null || val === undefined ? NaN : val;
        }
      }

      const aspect = scan.height / scan.width;
      const viewportWidth = THUMBNAIL_MAX_WIDTH;
      const viewportHeight = Math.round(THUMBNAIL_MAX_WIDTH * aspect);

      worker.postMessage(
        {
          id: idx,
          matrix,
          width: scan.width,
          height: scan.height,
          viewportWidth,
          viewportHeight,
          colormap: 'Jet',
          reverseColormap: true,
        },
        [matrix.buffer],
      );
    }

    processNext();

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [scans]);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function draw() {
      const cw = canvas!.width;
      const ch = canvas!.height;

      ctx!.clearRect(0, 0, cw, ch);
      ctx!.fillStyle = CANVAS_BG;
      ctx!.fillRect(0, 0, cw, ch);

      // Draw scans in z-order
      for (const scanId of zOrder) {
        const scan = scans.find(s => s.id === scanId);
        if (!scan) continue;

        const extents = scanExtentsMap.get(scanId);
        if (!extents) continue;

        const isDragging = dragRef.current?.scanId === scanId;
        let pos = scanPositions.get(scanId);
        if (!pos) continue;

        // If dragging this scan, use current drag position
        if (isDragging && dragCurrent) {
          pos = dragCurrent;
        }

        const bitmap = thumbnailCache.current.get(scanId);
        if (!bitmap) continue;

        // Convert mm position/size to canvas pixels
        const topLeft = mmToPixel(pos.x, pos.y, cw, ch);
        const bottomRight = mmToPixel(pos.x + extents.width, pos.y + extents.height, cw, ch);
        const drawW = bottomRight.x - topLeft.x;
        const drawH = bottomRight.y - topLeft.y;

        // Draw thumbnail
        ctx!.drawImage(bitmap, topLeft.x, topLeft.y, drawW, drawH);

        // Draw highlight border if selected
        if (scanId === highlightedScanId) {
          ctx!.strokeStyle = HIGHLIGHT_COLOR;
          ctx!.lineWidth = 2;
          ctx!.strokeRect(topLeft.x, topLeft.y, drawW, drawH);
        }

        // Draw filename label above
        const label = scan.filename.replace(/\.[^/.]+$/, '');
        ctx!.font = '12px Barlow, sans-serif';
        const textMetrics = ctx!.measureText(label);
        const labelPadX = 6;
        const labelPadY = 3;
        const labelW = textMetrics.width + labelPadX * 2;
        const labelH = 16 + labelPadY * 2;
        const labelX = topLeft.x;
        const labelY = topLeft.y - labelH - 4;

        ctx!.fillStyle = LABEL_BG;
        ctx!.beginPath();
        ctx!.roundRect(labelX, labelY, labelW, labelH, 4);
        ctx!.fill();

        ctx!.fillStyle = LABEL_TEXT;
        ctx!.fillText(label, labelX + labelPadX, labelY + labelPadY + 12);
      }

      // Draw snap guides and ghost preview
      if (dragRef.current && snapResult && dragCurrent) {
        const scanId = dragRef.current.scanId;
        const extents = scanExtentsMap.get(scanId);
        const bitmap = thumbnailCache.current.get(scanId);

        if (extents && bitmap) {
          // Ghost preview at snapped position
          const ghostPos = snapResult.snappedPosition;
          const ghostTL = mmToPixel(ghostPos.x, ghostPos.y, cw, ch);
          const ghostBR = mmToPixel(ghostPos.x + extents.width, ghostPos.y + extents.height, cw, ch);
          ctx!.globalAlpha = 0.5;
          ctx!.drawImage(bitmap, ghostTL.x, ghostTL.y, ghostBR.x - ghostTL.x, ghostBR.y - ghostTL.y);
          ctx!.globalAlpha = 1.0;

          // Draw guide lines
          for (const guide of snapResult.guides) {
            ctx!.strokeStyle = SNAP_GUIDE_COLOR;
            ctx!.lineWidth = 2;
            ctx!.setLineDash([6, 4]);
            ctx!.beginPath();
            if (guide.axis === 'x') {
              const px = mmToPixel(guide.value, guide.start, cw, ch);
              const py = mmToPixel(guide.value, guide.end, cw, ch);
              ctx!.moveTo(px.x, px.y);
              ctx!.lineTo(py.x, py.y);
            } else {
              const px = mmToPixel(guide.start, guide.value, cw, ch);
              const py = mmToPixel(guide.end, guide.value, cw, ch);
              ctx!.moveTo(px.x, px.y);
              ctx!.lineTo(py.x, py.y);
            }
            ctx!.stroke();
            ctx!.setLineDash([]);
          }
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [scans, scanPositions, scanExtentsMap, zOrder, highlightedScanId, camera, dragCurrent, snapResult, mmToPixel]);

  // Resize canvas to container
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ro = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * devicePixelRatio;
      canvas.height = rect.height * devicePixelRatio;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(devicePixelRatio, devicePixelRatio);
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Hit test: find topmost scan at mm position
  const hitTest = useCallback((mmX: number, mmY: number): string | null => {
    for (let i = zOrder.length - 1; i >= 0; i--) {
      const id = zOrder[i];
      const pos = scanPositions.get(id);
      const ext = scanExtentsMap.get(id);
      if (!pos || !ext) continue;
      if (mmX >= pos.x && mmX <= pos.x + ext.width && mmY >= pos.y && mmY <= pos.y + ext.height) {
        return id;
      }
    }
    return null;
  }, [zOrder, scanPositions, scanExtentsMap]);

  // Pointer events
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const mm = pixelToMm(px, py, rect.width, rect.height);

    if (e.button === 2) {
      // Right-click: start pan
      panDragRef.current = {
        startMouse: { x: e.clientX, y: e.clientY },
        startCamera: { panX: camera.panX, panY: camera.panY },
      };
      canvas.setPointerCapture(e.pointerId);
      return;
    }

    if (e.button === 0) {
      const hitId = hitTest(mm.x, mm.y);
      if (hitId) {
        const pos = scanPositions.get(hitId)!;
        dragRef.current = {
          scanId: hitId,
          startMouse: { x: e.clientX, y: e.clientY },
          startPos: { ...pos },
        };
        setDragCurrent({ ...pos });
        onBringToFront(hitId);
        canvas.setPointerCapture(e.pointerId);
      }
    }
  }, [camera, pixelToMm, hitTest, scanPositions, onBringToFront]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Right-drag pan
    if (panDragRef.current) {
      const dx = (e.clientX - panDragRef.current.startMouse.x) / camera.zoom;
      const dy = (e.clientY - panDragRef.current.startMouse.y) / camera.zoom;
      onCameraChange({
        ...camera,
        panX: panDragRef.current.startCamera.panX - dx,
        panY: panDragRef.current.startCamera.panY - dy,
      });
      return;
    }

    // Left-drag scan
    if (!dragRef.current) return;
    const { scanId, startMouse, startPos } = dragRef.current;
    const dx = (e.clientX - startMouse.x) / camera.zoom;
    const dy = (e.clientY - startMouse.y) / camera.zoom;
    const proposedPos: ScanPosition = {
      x: startPos.x + dx,
      y: startPos.y + dy,
    };

    const extents = scanExtentsMap.get(scanId);
    if (!extents) return;

    const otherScans = zOrder
      .filter(id => id !== scanId)
      .map(id => ({
        id,
        position: scanPositions.get(id)!,
        extents: scanExtentsMap.get(id)!,
      }))
      .filter(s => s.position && s.extents);

    const snap = findSnap(scanId, proposedPos, extents, otherScans, shiftRef.current);
    setSnapResult(snap);
    setDragCurrent(snap ? snap.snappedPosition : proposedPos);
  }, [camera, scanPositions, scanExtentsMap, zOrder, onCameraChange]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (canvas) canvas.releasePointerCapture(e.pointerId);

    if (panDragRef.current) {
      panDragRef.current = null;
      return;
    }

    if (dragRef.current && dragCurrent) {
      onPositionChange(dragRef.current.scanId, dragCurrent);
    }
    dragRef.current = null;
    setDragCurrent(null);
    setSnapResult(null);
  }, [dragCurrent, onPositionChange]);

  // Wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.05, Math.min(50, camera.zoom * factor));
    onCameraChange({ ...camera, zoom: newZoom });
  }, [camera, onCameraChange]);

  // Keyboard: shift tracking + arrow nudge
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftRef.current = true;
      if (!highlightedScanId) return;
      const step = e.shiftKey ? 1 : 5;
      const pos = scanPositions.get(highlightedScanId);
      if (!pos) return;
      switch (e.key) {
        case 'ArrowLeft':  e.preventDefault(); onPositionChange(highlightedScanId, { x: pos.x - step, y: pos.y }); break;
        case 'ArrowRight': e.preventDefault(); onPositionChange(highlightedScanId, { x: pos.x + step, y: pos.y }); break;
        case 'ArrowUp':    e.preventDefault(); onPositionChange(highlightedScanId, { x: pos.x, y: pos.y - step }); break;
        case 'ArrowDown':  e.preventDefault(); onPositionChange(highlightedScanId, { x: pos.x, y: pos.y + step }); break;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftRef.current = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [highlightedScanId, scanPositions, onPositionChange]);

  // Prevent context menu on canvas
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full relative" style={{ backgroundColor: CANVAS_BG }}>
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
        className="w-full h-full"
        style={{ cursor: dragRef.current ? 'grabbing' : 'default', touchAction: 'none' }}
        tabIndex={0}
      />
      {/* Apply / Reset buttons */}
      <div className="absolute bottom-4 right-4 flex gap-2 z-10">
        <button
          onClick={onReset}
          className="flex items-center gap-1.5 px-3 py-2 text-sm rounded transition-colors"
          style={{ backgroundColor: '#4a4845', color: '#f5f4f2' }}
        >
          <RotateCcw className="w-4 h-4" />
          Reset
        </button>
        <button
          onClick={onApply}
          className="flex items-center gap-1.5 px-3 py-2 text-sm rounded font-medium transition-colors"
          style={{ backgroundColor: '#2d8a4e', color: '#f5f4f2' }}
        >
          <Check className="w-4 h-4" />
          Apply & Composite
        </button>
      </div>
    </div>
  );
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors in LayoutCanvas.tsx

**Step 3: Commit**

```bash
git add src/components/CscanVisualizer/LayoutCanvas.tsx
git commit -m "feat(cscan): add LayoutCanvas component with thumbnail rendering, drag, snap, and keyboard nudge"
```

---

## Task 4: Integrate into CscanVisualizer and ToolBar

**Files:**
- Modify: `src/components/CscanVisualizer/CscanVisualizer.tsx`
- Modify: `src/components/CscanVisualizer/ToolBar.tsx`
- Modify: `src/components/CscanVisualizer/FilePanel.tsx`

**Context:** Wire up the layout mode toggle. CscanVisualizer adds `layoutMode` state and swaps between CanvasViewport and LayoutCanvas. The ToolBar gets a "Layout" toggle button disabled when < 2 scans loaded. FilePanel gets an `onBringToFront` prop that fires instead of `onFileSelect` when in layout mode. The Apply handler builds adjusted scans immutably (shifting axis arrays by delta) and calls `createCompositeFromDataWithWorker()` directly — never mutates `processedScans`.

**Step 1: Add layout mode state and LayoutCanvas to CscanVisualizer**

In `CscanVisualizer.tsx`, add:

```typescript
// After existing imports
import LayoutCanvas from './LayoutCanvas';
import { useLayoutMode } from './hooks/useLayoutMode';

// After existing UI state (around line 54)
const [layoutMode, setLayoutMode] = useState(false);

// After existing hooks (around line 86)
const layoutState = useLayoutMode(processedScans);

// New state for FilePanel layout mode interaction
const [layoutHighlightId, setLayoutHighlightId] = useState<string | null>(null);
```

Add the Apply handler (does NOT mutate processedScans):

```typescript
const handleLayoutApply = useCallback(async () => {
  const adjustedScans: CscanData[] = processedScans.map(scan => {
    const pos = layoutState.scanPositions.get(scan.id);
    if (!pos) return scan;

    const origMinX = Math.min(...scan.xAxis);
    const origMinY = Math.min(...scan.yAxis);
    const deltaX = pos.x - origMinX;
    const deltaY = pos.y - origMinY;

    if (Math.abs(deltaX) < 0.001 && Math.abs(deltaY) < 0.001) return scan;

    return {
      ...scan,
      xAxis: scan.xAxis.map(v => v + deltaX),
      yAxis: scan.yAxis.map(v => v + deltaY),
    };
  });

  setLayoutMode(false);
  setLayoutHighlightId(null);

  // Clear cache and composite from adjusted data
  getCscanWorkerManager().clearCache();

  setProcessingProgress({
    current: 0,
    total: adjustedScans.length + 2,
    message: 'Creating composite from layout...',
  });

  try {
    const result = await createCompositeFromDataWithWorker(adjustedScans, {
      onProgress: (progress) => setProcessingProgress(progress),
    });
    setProcessingProgress(null);

    if (result) {
      setProcessedScans([result.composite]);
      setScanData(result.composite);
      setSelectedScans(new Set());
      setDisplaySettings(prev => ({ ...prev, range: { min: null, max: null } }));
      getCscanWorkerManager().clearCache();
      setStatusMessage({ type: 'success', message: `Layout composite created from ${adjustedScans.length} files` });
      setTimeout(() => setStatusMessage(null), 4000);
    }
  } catch (error) {
    setProcessingProgress(null);
    const msg = error instanceof Error ? error.message : 'Failed to create composite';
    setStatusMessage({ type: 'error', message: msg });
    setTimeout(() => setStatusMessage(null), 5000);
  }
}, [processedScans, layoutState.scanPositions]);

const handleLayoutReset = useCallback(() => {
  layoutState.resetPositions();
}, [layoutState]);
```

In the JSX viewport area (around line 401-427), swap CanvasViewport and LayoutCanvas:

```tsx
{/* VIEWPORT LAYER */}
<div className="absolute inset-0" style={{ backgroundColor: '#1c1b18' }}>
  {layoutMode && processedScans.length >= 2 ? (
    <LayoutCanvas
      scans={processedScans}
      scanPositions={layoutState.scanPositions}
      scanExtentsMap={layoutState.scanExtentsMap}
      zOrder={layoutState.zOrder}
      highlightedScanId={layoutHighlightId}
      onPositionChange={layoutState.setScanPosition}
      onBringToFront={(id) => {
        layoutState.bringToFront(id);
        setLayoutHighlightId(id);
      }}
      onApply={handleLayoutApply}
      onReset={handleLayoutReset}
      camera={layoutState.camera}
      onCameraChange={layoutState.setCamera}
    />
  ) : scanData ? (
    <CanvasViewport
      ref={canvasRef}
      data={scanData}
      activeTool={activeTool}
      displaySettings={displaySettings}
    />
  ) : (
    /* existing empty state JSX */
  )}
</div>
```

**Step 2: Add Layout toggle to ToolBar**

In `ToolBar.tsx`:

```typescript
// Add to imports
import { Move, ZoomIn, BarChart2, LayoutGrid } from 'lucide-react';

// Add to ToolBarProps interface
layoutMode?: boolean;
onToggleLayoutMode?: () => void;
layoutModeDisabled?: boolean;
```

Add the Layout button in JSX after the existing tool group (after the closing `</div>` of the tool group, before the first separator `<div className="w-px ..."`):

```tsx
{onToggleLayoutMode && (
  <>
    <div className="w-px h-6 bg-gray-700" />
    <button
      onClick={onToggleLayoutMode}
      disabled={layoutModeDisabled}
      className={`
        flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors
        ${layoutMode
          ? 'bg-green-600 text-white'
          : layoutModeDisabled
          ? 'bg-gray-700 text-gray-600 cursor-not-allowed'
          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}
      `}
      title={layoutModeDisabled ? 'Load 2+ files to use Layout Mode' : 'Toggle Layout Mode'}
    >
      <LayoutGrid className="w-4 h-4" />
      <span className="text-xs font-medium">Layout</span>
    </button>
  </>
)}
```

**Step 3: Pass layout props from CscanVisualizer to ToolBar**

In `CscanVisualizer.tsx`, update the ToolBar usage:

```tsx
<ToolBar
  activeTool={activeTool}
  onToolChange={setActiveTool}
  displaySettings={displaySettings}
  onDisplaySettingsChange={setDisplaySettings}
  dataMin={dataMin}
  dataMax={dataMax}
  showStats={showStats}
  onToggleStats={() => setShowStats(!showStats)}
  layoutMode={layoutMode}
  onToggleLayoutMode={() => setLayoutMode(prev => !prev)}
  layoutModeDisabled={processedScans.length < 2}
/>
```

**Step 4: Add onBringToFront to FilePanel**

In `FilePanel.tsx`, add to `FilePanelProps`:

```typescript
onBringToFront?: (fileId: string) => void;
layoutMode?: boolean;
```

Update the file click handler in FilePanel (the `onClick` on the file row div):

```tsx
onClick={() => layoutMode && onBringToFront ? onBringToFront(file.id) : onFileSelect(file.id)}
```

Pass the new props from CscanVisualizer:

```tsx
<FilePanel
  files={processedScans}
  selectedFiles={selectedScans}
  currentFileId={scanData?.id}
  onFileSelect={handleFileSelect}
  onFileUpload={handleFileUpload}
  onSelectionChange={setSelectedScans}
  onCreateComposite={handleCreateComposite}
  onClearFiles={handleClearFiles}
  layoutMode={layoutMode}
  onBringToFront={(id) => {
    layoutState.bringToFront(id);
    setLayoutHighlightId(id);
  }}
/>
```

**Step 5: Verify compilation and basic functionality**

Run: `npx tsc --noEmit --pretty`
Run: `npm run dev` — open browser, load 2+ CSV files, click Layout button, verify canvas renders thumbnails

**Step 6: Commit**

```bash
git add src/components/CscanVisualizer/CscanVisualizer.tsx src/components/CscanVisualizer/ToolBar.tsx src/components/CscanVisualizer/FilePanel.tsx
git commit -m "feat(cscan): integrate layout mode toggle, viewport swap, and apply flow"
```

---

## Task 5: Manual Testing and Polish

**Files:**
- Possibly modify: `src/components/CscanVisualizer/LayoutCanvas.tsx`
- Possibly modify: `src/components/CscanVisualizer/CscanVisualizer.tsx`

**Context:** Start the dev server and test the full workflow with real CSV files or the test CSVs. Verify: thumbnail rendering, drag to reposition, edge snap guide lines + ghost preview, shift to disable snap, arrow key nudge, FilePanel bring-to-front, Apply creates correct composite, Reset restores positions, right-drag to pan, scroll to zoom.

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Test golden path**

1. Navigate to C-scan page
2. Upload 2-4 CSV files (or use test files if available)
3. Click "Layout" toggle in toolbar — verify viewport swaps to dark canvas with scan thumbnails
4. Verify filename labels appear above each thumbnail
5. Left-drag a scan — verify it moves
6. Drag near another scan's edge — verify green snap guide line appears and ghost preview shows at snapped position
7. Release — verify scan commits to snapped position
8. Hold Shift and drag near edge — verify no snap
9. Click a file in FilePanel — verify it highlights and comes to front on canvas
10. Use arrow keys to nudge highlighted scan (5mm default, 1mm with Shift)
11. Right-drag to pan the canvas
12. Scroll to zoom in/out
13. Click "Reset" — verify all scans return to original positions
14. Drag scans to desired positions, click "Apply & Composite" — verify composite is created with correct offsets
15. Verify Plotly viewport returns showing the merged result

**Step 3: Test edge cases**

1. Toggle layout mode with only 1 file loaded — verify button is disabled
2. Toggle layout mode, then upload more files — verify they appear
3. Upload files that all share origin (0,0) — verify they stack, can be separated

**Step 4: Fix any issues found during testing**

Apply fixes as needed.

**Step 5: Run full test suite and type check**

Run: `npm run build`
Run: `npm run test`

**Step 6: Final commit**

```bash
git add -A
git commit -m "feat(cscan): polish layout mode after manual testing"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | useLayoutMode hook + tests | hooks/useLayoutMode.ts, __tests__/ |
| 2 | Snap logic + tests | hooks/layoutSnap.ts, __tests__/ |
| 3 | LayoutCanvas component | LayoutCanvas.tsx |
| 4 | Integration (CscanVisualizer, ToolBar, FilePanel) | 3 modified files |
| 5 | Manual testing + polish | Bug fixes as needed |
