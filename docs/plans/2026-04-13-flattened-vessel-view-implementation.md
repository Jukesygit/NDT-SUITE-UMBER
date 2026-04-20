# Flattened Vessel View — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a 2D flattened/unwrapped vessel shell view as a tab in the VesselModeler, showing thickness heatmap + geometry overlays (welds, nozzles, saddles, lugs) with pan/zoom and report export.

**Architecture:** Canvas 2D renderer consuming existing `VesselState` + scan composite data. Three new files under `FlattenedView/`, one reducer action for tab toggle, one report capture addition. No new dependencies.

**Tech Stack:** HTML5 Canvas 2D, existing `colorscales.ts` for heatmap rendering, React + TypeScript.

**Design doc:** `docs/plans/2026-04-13-flattened-vessel-view-design.md`

---

### Task 1: geometry-projection.ts — Coordinate Mapping Utilities

**Files:**
- Create: `src/components/VesselModeler/FlattenedView/geometry-projection.ts`

**Context:** All vessel features use coordinates in mm from left tangent line (axial) and degrees around circumference (angle). The flattened view needs to project these to a 2D rectangle where:
- X = axial position in mm (0 = left tangent line, max = vessel length)
- Y = circumferential position in mm (0 = TDC, max = π × OD)

Angle convention in `VesselState`: 90° = top (TDC), 0° = right (3 o'clock), increases CCW.

**Step 1: Create the projection utility file**

```typescript
// src/components/VesselModeler/FlattenedView/geometry-projection.ts

import type { NozzleConfig, SaddleConfig, WeldConfig, LiftingLugConfig, VesselState } from '../types';

// ---------------------------------------------------------------------------
// Types — 2D projected shapes for the flattened view
// ---------------------------------------------------------------------------

export interface FlatRect {
  label: string;
  /** Left edge in mm from left tangent */
  x: number;
  /** Top edge in circumferential mm from TDC */
  y: number;
  /** Width along vessel axis in mm */
  width: number;
  /** Height around circumference in mm */
  height: number;
}

export interface FlatCircle {
  label: string;
  /** Center X in mm from left tangent */
  cx: number;
  /** Center Y in circumferential mm from TDC */
  cy: number;
  /** Radius in mm */
  radius: number;
}

export interface FlatLine {
  label: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface FlatMarker {
  label: string;
  /** Center X in mm from left tangent */
  cx: number;
  /** Center Y in circumferential mm from TDC */
  cy: number;
}

// ---------------------------------------------------------------------------
// Coordinate conversion
// ---------------------------------------------------------------------------

/**
 * Convert vessel angle (degrees, 90° = TDC) to circumferential mm from TDC.
 * Returns a value in [0, circumference).
 *
 * TDC = 90° in vessel coords. We want 0 mm at TDC, increasing downward (CW when viewed from left end).
 * Mapping: circumMm = ((90 - angleDeg) / 360) * circumference, wrapped to [0, circ).
 */
export function angleToCirumMm(angleDeg: number, outerDiameter: number): number {
  const circumference = Math.PI * outerDiameter;
  // 90° maps to 0mm (TDC). Decreasing angle = increasing mm.
  const mm = ((90 - angleDeg) / 360) * circumference;
  return ((mm % circumference) + circumference) % circumference;
}

/**
 * Get the outer diameter from VesselState.
 * Shell thickness is not modeled, so OD ≈ ID for display purposes.
 * Using ID directly gives the inner circumference which matches scan data placement.
 */
export function getCircumference(vesselState: VesselState): number {
  return Math.PI * vesselState.id;
}

// ---------------------------------------------------------------------------
// Projection functions
// ---------------------------------------------------------------------------

export function projectNozzle(nozzle: NozzleConfig, vesselOD: number): FlatCircle {
  return {
    label: nozzle.name,
    cx: nozzle.pos,
    cy: angleToCirumMm(nozzle.angle, vesselOD),
    radius: nozzle.size / 2,
  };
}

export function projectCircWeld(weld: WeldConfig, vesselOD: number): FlatLine {
  const circumference = Math.PI * vesselOD;
  return {
    label: weld.name,
    x1: weld.pos,
    y1: 0,
    x2: weld.pos,
    y2: circumference,
  };
}

export function projectLongWeld(weld: WeldConfig, vesselOD: number): FlatLine {
  const y = angleToCirumMm(weld.angle ?? 90, vesselOD);
  return {
    label: weld.name,
    x1: weld.pos,
    y1: y,
    x2: weld.endPos ?? weld.pos,
    y2: y,
  };
}

export function projectSaddle(saddle: SaddleConfig, vesselOD: number): FlatRect {
  const circumference = Math.PI * vesselOD;
  // Saddle wraps ~120° around the bottom of the vessel (centered at 270° = bottom)
  const saddleArcDeg = 120;
  const saddleArcMm = (saddleArcDeg / 360) * circumference;
  const saddleWidthMm = 100; // axial width placeholder — saddles don't store width
  const centerY = angleToCirumMm(270, vesselOD); // bottom of vessel

  return {
    label: 'Saddle',
    x: saddle.pos - saddleWidthMm / 2,
    y: centerY - saddleArcMm / 2,
    width: saddleWidthMm,
    height: saddleArcMm,
  };
}

export function projectLiftingLug(lug: LiftingLugConfig, vesselOD: number): FlatMarker {
  return {
    label: lug.name,
    cx: lug.pos,
    cy: angleToCirumMm(lug.angle, vesselOD),
  };
}
```

**Step 2: Commit**

```bash
git add src/components/VesselModeler/FlattenedView/geometry-projection.ts
git commit -m "feat(flattened-view): add geometry projection utilities

Maps vessel features (nozzles, welds, saddles, lugs) from 3D
cylindrical coordinates to 2D flattened coordinates (axial mm × circumferential mm)."
```

---

### Task 2: legend-renderer.ts — Color Scale & Metadata Drawing

**Files:**
- Create: `src/components/VesselModeler/FlattenedView/legend-renderer.ts`

**Context:** Draws the PACMAP-style legend onto the canvas: color bar, min/max labels, and vessel metadata header. Uses `interpolateColor` from `src/utils/colorscales.ts`.

**Step 1: Create the legend renderer**

```typescript
// src/components/VesselModeler/FlattenedView/legend-renderer.ts

import { interpolateColor, getColorscale } from '../../../utils/colorscales';
import type { VesselState, ScanCompositeConfig } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LegendConfig {
  colorScaleName: string;
  reverseScale: boolean;
  rangeMin: number;
  rangeMax: number;
}

// ---------------------------------------------------------------------------
// Color Bar
// ---------------------------------------------------------------------------

/**
 * Draw a vertical color bar with min/max labels.
 * Positioned at the right edge of the canvas.
 */
export function drawColorBar(
  ctx: CanvasRenderingContext2D,
  config: LegendConfig,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const stops = getColorscale(config.colorScaleName);
  const steps = height;

  for (let i = 0; i < steps; i++) {
    // Top = max, bottom = min (conventional for thickness maps)
    const t = 1 - i / steps;
    const [r, g, b] = interpolateColor(t, stops, config.reverseScale);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(x, y + i, width, 1);
  }

  // Border
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, height);

  // Labels
  ctx.fillStyle = '#333';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const labelX = x + width + 6;
  ctx.fillText(`${config.rangeMax.toFixed(1)}mm`, labelX, y + 4);
  ctx.fillText(`${config.rangeMin.toFixed(1)}mm`, labelX, y + height - 4);
}

// ---------------------------------------------------------------------------
// Metadata Header
// ---------------------------------------------------------------------------

/**
 * Draw vessel metadata block (top-left corner, PACMAP-style).
 */
export function drawMetadataHeader(
  ctx: CanvasRenderingContext2D,
  vesselState: VesselState,
  x: number,
  y: number,
): void {
  ctx.fillStyle = '#333';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  const lineHeight = 18;
  let cy = y;

  if (vesselState.vesselName) {
    ctx.fillText(vesselState.vesselName, x, cy);
    cy += lineHeight;
  }

  ctx.font = '12px sans-serif';
  if (vesselState.location) {
    ctx.fillText(`Location: ${vesselState.location}`, x, cy);
    cy += lineHeight;
  }
  if (vesselState.inspectionDate) {
    ctx.fillText(`Date: ${vesselState.inspectionDate}`, x, cy);
    cy += lineHeight;
  }

  ctx.fillText(`ID: ${vesselState.id}mm  Length: ${vesselState.length}mm`, x, cy);
}

// ---------------------------------------------------------------------------
// Dimension Scales
// ---------------------------------------------------------------------------

/**
 * Draw axial dimension scale along the bottom of the vessel outline.
 */
export function drawAxialScale(
  ctx: CanvasRenderingContext2D,
  vesselLength: number,
  toCanvasX: (mm: number) => number,
  y: number,
): void {
  ctx.strokeStyle = '#666';
  ctx.fillStyle = '#666';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineWidth = 1;

  // Tick interval: pick a round number so we get 5-15 ticks
  const interval = niceInterval(vesselLength, 10);

  for (let mm = 0; mm <= vesselLength; mm += interval) {
    const x = toCanvasX(mm);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + 6);
    ctx.stroke();
    ctx.fillText(`${mm}`, x, y + 8);
  }
}

/**
 * Draw circumferential dimension scale along the left of the vessel outline.
 */
export function drawCircumScale(
  ctx: CanvasRenderingContext2D,
  circumference: number,
  toCanvasY: (mm: number) => number,
  x: number,
): void {
  ctx.strokeStyle = '#666';
  ctx.fillStyle = '#666';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 1;

  const interval = niceInterval(circumference, 8);

  for (let mm = 0; mm <= circumference; mm += interval) {
    const y = toCanvasY(mm);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 6, y);
    ctx.stroke();
    ctx.fillText(`${mm}`, x - 8, y);
  }
}

/**
 * Choose a "nice" interval that gives roughly `targetTicks` tick marks.
 */
function niceInterval(range: number, targetTicks: number): number {
  const rough = range / targetTicks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const residual = rough / magnitude;

  let nice: number;
  if (residual <= 1.5) nice = 1;
  else if (residual <= 3) nice = 2;
  else if (residual <= 7) nice = 5;
  else nice = 10;

  return nice * magnitude;
}
```

**Step 2: Commit**

```bash
git add src/components/VesselModeler/FlattenedView/legend-renderer.ts
git commit -m "feat(flattened-view): add legend and dimension scale renderer

Draws PACMAP-style color bar, vessel metadata header, and axial/circumferential
dimension scales onto Canvas 2D."
```

---

### Task 3: FlattenedViewport.tsx — Main Canvas Component

**Files:**
- Create: `src/components/VesselModeler/FlattenedView/FlattenedViewport.tsx`

**Context:** This is the main React component. It receives `VesselState` from VesselModeler (same props the ThreeViewport gets). It renders a Canvas 2D element with pan/zoom and paints 5 layers: background → heatmap → geometry → dimensions → legend.

Key references for scan composite coordinate mapping (from `texture-manager.ts:440-488`):
- `composite.indexStartMm` = longitudinal start position in mm from tangent line
- `composite.indexDirection` = `'forward'` | `'reverse'`
- `composite.datumAngleDeg` = 0° = TDC
- `composite.scanDirection` = `'cw'` | `'ccw'`
- `composite.xAxis` = circumferential coordinates in mm from datum
- `composite.yAxis` = longitudinal coordinates in mm from indexStart
- `composite.data[row][col]` = thickness matrix (row = index/y, col = scan/x)
- `composite.orientationConfirmed` must be `true` to render

**Step 1: Create the FlattenedViewport component**

```typescript
// src/components/VesselModeler/FlattenedView/FlattenedViewport.tsx

import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import type { VesselState, ScanCompositeConfig } from '../types';
import { interpolateColor, getColorscale } from '../../../utils/colorscales';
import {
  angleToCirumMm,
  getCircumference,
  projectNozzle,
  projectCircWeld,
  projectLongWeld,
  projectSaddle,
  projectLiftingLug,
} from './geometry-projection';
import {
  drawColorBar,
  drawMetadataHeader,
  drawAxialScale,
  drawCircumScale,
  type LegendConfig,
} from './legend-renderer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FlattenedViewportHandle {
  /** Export the current canvas as a PNG data URL */
  exportImage: () => string | null;
}

interface Props {
  vesselState: VesselState;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Padding around the vessel rectangle in canvas pixels */
const PADDING = { top: 80, right: 160, bottom: 60, left: 70 };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const FlattenedViewport = forwardRef<FlattenedViewportHandle, Props>(({ vesselState }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Pan/zoom state (imperative for performance)
  const viewRef = useRef({ offsetX: 0, offsetY: 0, zoom: 1 });
  const dragRef = useRef({ dragging: false, lastX: 0, lastY: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------------------
  // Coordinate transforms
  // ---------------------------------------------------------------------------

  const vesselOD = vesselState.id; // using ID as effective OD for circumference
  const circumference = getCircumference(vesselState);
  const vesselLength = vesselState.length;

  /** Convert vessel axial mm → canvas pixel X */
  const toCanvasX = useCallback((mm: number): number => {
    const { offsetX, zoom } = viewRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    const drawWidth = canvas.width - PADDING.left - PADDING.right;
    return PADDING.left + (mm / vesselLength) * drawWidth * zoom + offsetX;
  }, [vesselLength]);

  /** Convert vessel circumferential mm → canvas pixel Y */
  const toCanvasY = useCallback((mm: number): number => {
    const { offsetY, zoom } = viewRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    const drawHeight = canvas.height - PADDING.top - PADDING.bottom;
    return PADDING.top + (mm / circumference) * drawHeight * zoom + offsetY;
  }, [circumference]);

  /** Convert canvas pixel → vessel mm (for hover tooltip) */
  const fromCanvas = useCallback((px: number, py: number): { axialMm: number; circumMm: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const { offsetX, offsetY, zoom } = viewRef.current;
    const drawWidth = canvas.width - PADDING.left - PADDING.right;
    const drawHeight = canvas.height - PADDING.top - PADDING.bottom;
    const axialMm = ((px - PADDING.left - offsetX) / (drawWidth * zoom)) * vesselLength;
    const circumMm = ((py - PADDING.top - offsetY) / (drawHeight * zoom)) * circumference;
    if (axialMm < 0 || axialMm > vesselLength || circumMm < 0 || circumMm > circumference) return null;
    return { axialMm, circumMm };
  }, [vesselLength, circumference]);

  // ---------------------------------------------------------------------------
  // Render pipeline
  // ---------------------------------------------------------------------------

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // --- Layer 0: Clear ---
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    // --- Layer 1: Vessel outline ---
    const x0 = toCanvasX(0);
    const y0 = toCanvasY(0);
    const x1 = toCanvasX(vesselLength);
    const y1 = toCanvasY(circumference);

    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);

    // --- Layer 2: Heatmap (scan composites) ---
    const confirmedComposites = vesselState.scanComposites.filter(c => c.orientationConfirmed);
    for (const composite of confirmedComposites) {
      renderScanComposite(ctx, composite);
    }

    // --- Layer 3: Geometry overlays ---
    // Circumferential welds
    ctx.setLineDash([8, 4]);
    ctx.lineWidth = 1;
    for (const weld of vesselState.welds) {
      if (weld.type === 'circumferential') {
        const proj = projectCircWeld(weld, vesselOD);
        ctx.strokeStyle = weld.color || '#00aa00';
        ctx.beginPath();
        ctx.moveTo(toCanvasX(proj.x1), toCanvasY(proj.y1));
        ctx.lineTo(toCanvasX(proj.x2), toCanvasY(proj.y2));
        ctx.stroke();
        // Label
        ctx.fillStyle = '#333';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(proj.label, toCanvasX(proj.x1), toCanvasY(proj.y2) + 14);
      }
    }

    // Longitudinal welds
    for (const weld of vesselState.welds) {
      if (weld.type === 'longitudinal') {
        const proj = projectLongWeld(weld, vesselOD);
        ctx.strokeStyle = weld.color || '#00aa00';
        ctx.beginPath();
        ctx.moveTo(toCanvasX(proj.x1), toCanvasY(proj.y1));
        ctx.lineTo(toCanvasX(proj.x2), toCanvasY(proj.y2));
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);

    // Saddles
    for (const saddle of vesselState.saddles) {
      const proj = projectSaddle(saddle, vesselOD);
      const sx = toCanvasX(proj.x);
      const sy = toCanvasY(proj.y);
      const sw = toCanvasX(proj.x + proj.width) - sx;
      const sh = toCanvasY(proj.y + proj.height) - sy;
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx, sy, sw, sh);
      ctx.fillStyle = '#666';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(proj.label, sx + sw / 2, sy + sh / 2);
    }

    // Nozzles
    for (const nozzle of vesselState.nozzles) {
      const proj = projectNozzle(nozzle, vesselOD);
      const cx = toCanvasX(proj.cx);
      const cy = toCanvasY(proj.cy);
      // Radius in pixels: scale by same factor as the axial axis
      const drawWidth = w - PADDING.left - PADDING.right;
      const rPx = (proj.radius / vesselLength) * drawWidth * viewRef.current.zoom;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(rPx, 4), 0, Math.PI * 2);
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fill();
      // Label
      ctx.fillStyle = '#333';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(proj.label, cx, cy - Math.max(rPx, 4) - 2);
    }

    // Lifting lugs
    for (const lug of vesselState.liftingLugs) {
      const proj = projectLiftingLug(lug, vesselOD);
      const cx = toCanvasX(proj.cx);
      const cy = toCanvasY(proj.cy);
      // Small diamond marker
      const s = 6;
      ctx.beginPath();
      ctx.moveTo(cx, cy - s);
      ctx.lineTo(cx + s, cy);
      ctx.lineTo(cx, cy + s);
      ctx.lineTo(cx - s, cy);
      ctx.closePath();
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,200,0.8)';
      ctx.fill();
      ctx.fillStyle = '#333';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(proj.label, cx, cy - s - 3);
    }

    // --- Layer 4: Dimension scales ---
    drawAxialScale(ctx, vesselLength, toCanvasX, toCanvasY(circumference) + 4);
    drawCircumScale(ctx, circumference, toCanvasY, toCanvasX(0) - 4);

    // --- Layer 5: Legend ---
    // Compute global range from all confirmed composites
    const allStats = confirmedComposites.map(c => c.stats);
    if (allStats.length > 0) {
      const globalMin = Math.min(...confirmedComposites.map(c => c.rangeMin ?? c.stats.min));
      const globalMax = Math.max(...confirmedComposites.map(c => c.rangeMax ?? c.stats.max));
      const colorScaleName = confirmedComposites[0]?.colorScale ?? 'Jet';
      const legendConfig: LegendConfig = {
        colorScaleName,
        reverseScale: false,
        rangeMin: globalMin,
        rangeMax: globalMax,
      };
      drawColorBar(ctx, legendConfig, w - PADDING.right + 20, PADDING.top, 20, 200);
    }

    // Metadata header
    drawMetadataHeader(ctx, vesselState, 10, 10);

  }, [vesselState, vesselOD, circumference, vesselLength, toCanvasX, toCanvasY]);

  // ---------------------------------------------------------------------------
  // Scan composite heatmap rendering
  // ---------------------------------------------------------------------------

  /**
   * Render a single scan composite's thickness data onto the 2D canvas.
   *
   * Coordinate mapping (matches texture-manager.ts logic):
   * - yAxis = longitudinal coordinates in mm from indexStartMm
   * - xAxis = circumferential coordinates in mm from datum
   * - data[row][col]: row indexes yAxis, col indexes xAxis
   * - datumAngleDeg: 0° = TDC in user-facing coords
   * - scanDirection: 'cw' = circumferential distance increases clockwise from datum
   */
  const renderScanComposite = useCallback((ctx: CanvasRenderingContext2D, composite: ScanCompositeConfig) => {
    const { data, xAxis, yAxis, stats, colorScale, rangeMin, rangeMax } = composite;
    if (!data.length || !data[0].length) return;

    const rows = data.length;
    const cols = data[0].length;
    const min = rangeMin ?? stats.min;
    const max = rangeMax ?? stats.max;
    const range = max === min ? 1 : max - min;
    const stops = getColorscale(colorScale || 'Jet');

    // Pre-compute the vessel mm position for each data point
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const value = data[row][col];
        if (value == null) continue;

        // Longitudinal position
        const indexMm = yAxis[row] ?? 0;
        const axialMm = composite.indexDirection === 'forward'
          ? composite.indexStartMm + indexMm
          : composite.indexStartMm - indexMm;

        // Circumferential position
        const scanMm = xAxis[col] ?? 0;
        // datumAngleDeg: 0° = TDC in user coords. Convert to vessel angle (90° = TDC).
        const datumVesselAngle = composite.datumAngleDeg + 90; // now in vessel angle convention
        const circumMmFromDatum = scanMm; // mm from datum along circumference
        // Convert datum angle to circumMm from TDC
        const datumCircumMm = angleToCirumMm(datumVesselAngle, vesselOD);
        // Add scan offset (CW = positive direction in our mm convention)
        const circumMm = composite.scanDirection === 'cw'
          ? datumCircumMm + circumMmFromDatum
          : datumCircumMm - circumMmFromDatum;
        // Wrap to [0, circumference)
        const wrappedCircumMm = ((circumMm % circumference) + circumference) % circumference;

        // Map to canvas pixel
        const px = toCanvasX(axialMm);
        const py = toCanvasY(wrappedCircumMm);

        // Color
        const t = (value - min) / range;
        const [r, g, b] = interpolateColor(t, stops);
        ctx.fillStyle = `rgba(${r},${g},${b},${composite.opacity ?? 1})`;

        // Pixel size: compute from spacing between adjacent data points
        const nextAxial = row + 1 < rows
          ? composite.indexDirection === 'forward'
            ? composite.indexStartMm + (yAxis[row + 1] ?? indexMm)
            : composite.indexStartMm - (yAxis[row + 1] ?? indexMm)
          : axialMm;
        const nextCircum = col + 1 < cols ? (xAxis[col + 1] ?? scanMm) : scanMm;

        const pxW = Math.max(1, Math.abs(toCanvasX(axialMm + (nextAxial - axialMm || 1)) - px));
        const pxH = Math.max(1, Math.abs(toCanvasY(wrappedCircumMm + (nextCircum - circumMmFromDatum || 1)) - py));
        ctx.fillRect(px, py, Math.ceil(pxW), Math.ceil(pxH));
      }
    }
  }, [vesselOD, circumference, toCanvasX, toCanvasY]);

  // ---------------------------------------------------------------------------
  // Resize handling
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const observer = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      render();
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [render]);

  // Re-render when vessel state changes
  useEffect(() => { render(); }, [render]);

  // ---------------------------------------------------------------------------
  // Pan & Zoom
  // ---------------------------------------------------------------------------

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const view = viewRef.current;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(20, view.zoom * delta));

    // Zoom toward cursor position
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      view.offsetX = mx - (mx - view.offsetX) * (newZoom / view.zoom);
      view.offsetY = my - (my - view.offsetY) * (newZoom / view.zoom);
    }

    view.zoom = newZoom;
    render();
  }, [render]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = { dragging: true, lastX: e.clientX, lastY: e.clientY };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const drag = dragRef.current;
    if (drag.dragging) {
      viewRef.current.offsetX += e.clientX - drag.lastX;
      viewRef.current.offsetY += e.clientY - drag.lastY;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      render();
    }

    // Tooltip
    const tooltip = tooltipRef.current;
    if (!tooltip) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = (e.clientX - rect.left) * window.devicePixelRatio;
    const py = (e.clientY - rect.top) * window.devicePixelRatio;
    const coords = fromCanvas(px, py);
    if (!coords) {
      tooltip.style.display = 'none';
      return;
    }

    // Find thickness at this point from scan composites
    const thickness = sampleThicknessAt(coords.axialMm, coords.circumMm);
    if (thickness != null) {
      tooltip.style.display = 'block';
      tooltip.style.left = `${e.clientX - rect.left + 12}px`;
      tooltip.style.top = `${e.clientY - rect.top - 24}px`;
      tooltip.textContent = `${thickness.toFixed(2)}mm`;
    } else {
      tooltip.style.display = 'none';
    }
  }, [render, fromCanvas]);

  const handleMouseUp = useCallback(() => {
    dragRef.current.dragging = false;
  }, []);

  // ---------------------------------------------------------------------------
  // Thickness sampling (for hover tooltip)
  // ---------------------------------------------------------------------------

  const sampleThicknessAt = useCallback((axialMm: number, circumMm: number): number | null => {
    for (const composite of vesselState.scanComposites) {
      if (!composite.orientationConfirmed) continue;
      const { data, xAxis, yAxis } = composite;

      // Compute axial index
      const indexMm = composite.indexDirection === 'forward'
        ? axialMm - composite.indexStartMm
        : composite.indexStartMm - axialMm;

      // Check if within yAxis range
      const yMin = Math.min(yAxis[0], yAxis[yAxis.length - 1]);
      const yMax = Math.max(yAxis[0], yAxis[yAxis.length - 1]);
      if (indexMm < yMin || indexMm > yMax) continue;

      // Compute circumferential index
      const datumVesselAngle = composite.datumAngleDeg + 90;
      const datumCircumMm = angleToCirumMm(datumVesselAngle, vesselOD);
      const scanMm = composite.scanDirection === 'cw'
        ? circumMm - datumCircumMm
        : datumCircumMm - circumMm;
      // Wrap
      const wrappedScanMm = ((scanMm % circumference) + circumference) % circumference;

      const xMin = Math.min(xAxis[0], xAxis[xAxis.length - 1]);
      const xMax = Math.max(xAxis[0], xAxis[xAxis.length - 1]);
      if (wrappedScanMm < xMin || wrappedScanMm > xMax) continue;

      // Find nearest data point
      const row = nearestIndex(yAxis, indexMm);
      const col = nearestIndex(xAxis, wrappedScanMm);
      if (row < 0 || row >= data.length || col < 0 || col >= data[0].length) continue;

      const value = data[row][col];
      if (value != null) return value;
    }
    return null;
  }, [vesselState.scanComposites, vesselOD, circumference]);

  // ---------------------------------------------------------------------------
  // Fit to view
  // ---------------------------------------------------------------------------

  const fitToView = useCallback(() => {
    viewRef.current = { offsetX: 0, offsetY: 0, zoom: 1 };
    render();
  }, [render]);

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  useImperativeHandle(ref, () => ({
    exportImage: () => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      return canvas.toDataURL('image/png');
    },
  }));

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div ref={containerRef} className="absolute inset-0 bg-white">
      <canvas
        ref={canvasRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: dragRef.current.dragging ? 'grabbing' : 'grab' }}
      />
      {/* Fit-to-view button */}
      <button
        onClick={fitToView}
        className="absolute top-2 right-2 px-3 py-1 bg-white border border-gray-300 rounded shadow-sm text-xs hover:bg-gray-50"
        title="Fit to view"
      >
        Fit
      </button>
      {/* Hover tooltip */}
      <div
        ref={tooltipRef}
        className="absolute pointer-events-none bg-gray-900 text-white text-xs px-2 py-1 rounded"
        style={{ display: 'none' }}
      />
    </div>
  );
});

FlattenedViewport.displayName = 'FlattenedViewport';
export default FlattenedViewport;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Find the index of the nearest value in a sorted array. */
function nearestIndex(arr: number[], target: number): number {
  let lo = 0;
  let hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(arr[lo - 1] - target) < Math.abs(arr[lo] - target)) return lo - 1;
  return lo;
}
```

**Step 2: Commit**

```bash
git add src/components/VesselModeler/FlattenedView/FlattenedViewport.tsx
git commit -m "feat(flattened-view): add main canvas viewport component

Canvas 2D renderer with pan/zoom showing thickness heatmap, vessel geometry
overlays (welds, nozzles, saddles, lugs), dimension scales, color legend,
and hover tooltip. Exports canvas as PNG for report integration."
```

---

### Task 4: Wire Into VesselModeler — Tab Toggle

**Files:**
- Modify: `src/components/VesselModeler/VesselModeler.tsx`

**Context:** Add a `viewMode: '3d' | 'flattened'` state to UIState. Add a reducer action. Add a toggle button in the toolbar area. Conditionally render FlattenedViewport instead of ThreeViewport.

**Step 1: Add view mode to UIState and reducer**

In `VesselModeler.tsx`, add to the `UIState` interface (around line 136):

```typescript
// Add to UIState interface:
viewMode: '3d' | 'flattened';
```

Add to `INITIAL_STATE.ui` (around line 189):

```typescript
viewMode: '3d',
```

Add to `VesselAction` union (around line 224):

```typescript
| { type: 'SET_VIEW_MODE'; mode: '3d' | 'flattened' }
```

Add case to `vesselReducer` (before the `default:` case, around line 344):

```typescript
case 'SET_VIEW_MODE':
    return { ...state, ui: { ...state.ui, viewMode: action.mode } };
```

**Step 2: Add lazy import for FlattenedViewport**

Near the other lazy imports (around line 63):

```typescript
const FlattenedViewport = lazy(() => import('./FlattenedView/FlattenedViewport'));
```

**Step 3: Add tab toggle buttons**

Add a view mode toggle in the toolbar area. Find the toolbar section that contains the existing buttons (near line 1980, inside the main content area). Add just above the `viewportContainerRef` div:

```typescript
{/* View mode toggle */}
<div className="flex items-center gap-1 px-2 py-1 bg-gray-800 border-b border-gray-700">
    <button
        className={`px-3 py-1 text-xs rounded ${ui.viewMode === '3d' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
        onClick={() => dispatch({ type: 'SET_VIEW_MODE', mode: '3d' })}
    >
        <Box className="w-3.5 h-3.5 inline mr-1" />
        3D
    </button>
    <button
        className={`px-3 py-1 text-xs rounded ${ui.viewMode === 'flattened' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
        onClick={() => dispatch({ type: 'SET_VIEW_MODE', mode: 'flattened' })}
    >
        Flattened
    </button>
</div>
```

**Step 4: Conditionally render viewport**

Replace the ThreeViewport rendering block (lines ~1988-2036) with a conditional:

```typescript
{ui.viewMode === '3d' ? (
    <ErrorBoundary fallback={/* existing error fallback */}>
        <ThreeViewport
            ref={viewportRef}
            {/* ... all existing props ... */}
        />
    </ErrorBoundary>
) : (
    <Suspense fallback={<div className="absolute inset-0 flex items-center justify-center bg-white text-gray-500">Loading flattened view...</div>}>
        <FlattenedViewport vesselState={vesselState} />
    </Suspense>
)}
```

**Step 5: Commit**

```bash
git add src/components/VesselModeler/VesselModeler.tsx
git commit -m "feat(flattened-view): wire tab toggle into VesselModeler

Adds 3D/Flattened view mode toggle. FlattenedViewport lazy-loaded,
renders in same container as ThreeViewport when selected."
```

---

### Task 5: Report Export Integration

**Files:**
- Modify: `src/components/VesselModeler/engine/report-image-capture.ts`

**Context:** Add a function to capture the flattened view canvas for report insertion. The FlattenedViewport already exposes `exportImage()` via its ref handle.

**Step 1: Add flattenedViewport ref to VesselModeler**

In `VesselModeler.tsx`, add a ref for the flattened viewport (near line 384):

```typescript
const flattenedViewportRef = useRef<{ exportImage: () => string | null }>(null);
```

Pass it to FlattenedViewport:

```typescript
<FlattenedViewport ref={flattenedViewportRef} vesselState={vesselState} />
```

**Step 2: Add capture function to report-image-capture.ts**

At the end of `report-image-capture.ts`, add:

```typescript
/**
 * Capture the flattened vessel view as a PNG data URL.
 * Requires the FlattenedViewport to be mounted and visible.
 */
export function captureFlattenedView(
  flattenedRef: { exportImage: () => string | null } | null,
): string | null {
  if (!flattenedRef) return null;
  return flattenedRef.exportImage();
}
```

**Step 3: Commit**

```bash
git add src/components/VesselModeler/engine/report-image-capture.ts src/components/VesselModeler/VesselModeler.tsx
git commit -m "feat(flattened-view): add report export integration

Exposes captureFlattenedView() for DOCX report generation.
FlattenedViewport ref wired through VesselModeler."
```

---

### Task 6: Build Verification & Polish

**Step 1: Run TypeScript check**

```bash
npx tsc --noEmit
```

Fix any type errors.

**Step 2: Run build**

```bash
npm run build
```

Fix any build errors.

**Step 3: Manual testing checklist**

- [ ] Open VesselModeler with a vessel that has scan composites
- [ ] Click "Flattened" tab — canvas renders with vessel outline
- [ ] Heatmap renders in correct position matching the 3D view
- [ ] Circumferential welds show as dashed vertical lines with labels
- [ ] Nozzles show as circles at correct positions
- [ ] Saddles show as rectangles at vessel bottom
- [ ] Lifting lugs show as diamond markers
- [ ] Mouse wheel zooms toward cursor
- [ ] Click-drag pans the view
- [ ] "Fit" button resets zoom
- [ ] Hover over heatmap shows thickness tooltip
- [ ] Color legend and metadata header display correctly
- [ ] Switch back to "3D" tab — ThreeViewport works normally
- [ ] No console errors

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(flattened-view): build fixes and polish"
```
