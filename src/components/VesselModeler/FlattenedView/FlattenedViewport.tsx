// =============================================================================
// FlattenedViewport — 2D unwrapped vessel view on HTML5 Canvas
// =============================================================================
// Renders thickness heatmaps, geometry overlays, dimension scales, and a color
// legend onto a pannable/zoomable canvas.  Consumes the same VesselState that
// the 3D ThreeViewport uses.
// =============================================================================

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

import type { VesselState, ScanCompositeConfig } from '../types';
import {
  getCircumference,
  angleToCircumMm,
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
} from './legend-renderer';
import type { LegendConfig } from './legend-renderer';
import { interpolateColor, getColorscale } from '../../../utils/colorscales';

// ---------------------------------------------------------------------------
// Public handle exposed via ref
// ---------------------------------------------------------------------------

export interface FlattenedViewportHandle {
  exportImage: () => string | null;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  vesselState: VesselState;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PADDING = { top: 80, right: 160, bottom: 60, left: 70 };

const ZOOM_IN_FACTOR = 1.1;
const ZOOM_OUT_FACTOR = 0.9;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 20;

// ---------------------------------------------------------------------------
// Internal view state (mutable ref to avoid re-renders on every pan/zoom)
// ---------------------------------------------------------------------------

interface ViewState {
  zoom: number;
  offsetX: number;
  offsetY: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const FlattenedViewport = forwardRef<FlattenedViewportHandle, Props>(
  function FlattenedViewport({ vesselState }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const viewRef = useRef<ViewState>({ zoom: 1, offsetX: 0, offsetY: 0 });
    const draggingRef = useRef(false);
    const lastMouseRef = useRef({ x: 0, y: 0 });
    const animFrameRef = useRef(0);

    const [tooltip, setTooltip] = useState<{
      x: number;
      y: number;
      text: string;
    } | null>(null);

    // -----------------------------------------------------------------------
    // Coordinate transforms
    // -----------------------------------------------------------------------

    const getDrawDimensions = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return { drawWidth: 0, drawHeight: 0, cssWidth: 0, cssHeight: 0 };
      const dpr = window.devicePixelRatio || 1;
      const cssWidth = canvas.width / dpr;
      const cssHeight = canvas.height / dpr;
      const drawWidth = cssWidth - PADDING.left - PADDING.right;
      const drawHeight = cssHeight - PADDING.top - PADDING.bottom;
      return { drawWidth, drawHeight, cssWidth, cssHeight };
    }, []);

    const toCanvasX = useCallback(
      (mm: number) => {
        const { drawWidth } = getDrawDimensions();
        const vesselLength = vesselState.length;
        const { zoom, offsetX } = viewRef.current;
        if (vesselLength <= 0) return PADDING.left;
        return PADDING.left + (mm / vesselLength) * drawWidth * zoom + offsetX;
      },
      [vesselState.length, getDrawDimensions],
    );

    const toCanvasY = useCallback(
      (mm: number) => {
        const { drawHeight } = getDrawDimensions();
        const circumference = getCircumference(vesselState);
        const { zoom, offsetY } = viewRef.current;
        if (circumference <= 0) return PADDING.top;
        return PADDING.top + (mm / circumference) * drawHeight * zoom + offsetY;
      },
      [vesselState, getDrawDimensions],
    );

    /** Inverse: canvas pixel → vessel mm (for hover lookups) */
    const fromCanvasX = useCallback(
      (px: number) => {
        const { drawWidth } = getDrawDimensions();
        const { zoom, offsetX } = viewRef.current;
        if (drawWidth <= 0 || zoom <= 0) return 0;
        return ((px - PADDING.left - offsetX) / (drawWidth * zoom)) * vesselState.length;
      },
      [vesselState.length, getDrawDimensions],
    );

    const fromCanvasY = useCallback(
      (py: number) => {
        const { drawHeight } = getDrawDimensions();
        const circumference = getCircumference(vesselState);
        const { zoom, offsetY } = viewRef.current;
        if (drawHeight <= 0 || zoom <= 0) return 0;
        return ((py - PADDING.top - offsetY) / (drawHeight * zoom)) * circumference;
      },
      [vesselState, getDrawDimensions],
    );

    // -----------------------------------------------------------------------
    // Render pipeline
    // -----------------------------------------------------------------------

    const render = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const cssWidth = canvas.width / dpr;
      const cssHeight = canvas.height / dpr;

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // 1. Clear
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cssWidth, cssHeight);

      const vesselLength = vesselState.length;
      const circumference = getCircumference(vesselState);
      if (vesselLength <= 0 || circumference <= 0) {
        ctx.restore();
        return;
      }

      // 2. Vessel outline rectangle
      const x0 = toCanvasX(0);
      const y0 = toCanvasY(0);
      const x1 = toCanvasX(vesselLength);
      const y1 = toCanvasY(circumference);
      ctx.strokeStyle = '#999';
      ctx.lineWidth = 1;
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);

      // 3. Clip to vessel rect for heatmap + overlays
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, x1 - x0, y1 - y0);
      ctx.clip();

      // 3a. Heatmap from scan composites
      renderHeatmap(ctx, vesselState);

      // 3b. Geometry overlays
      renderGeometry(ctx, vesselState);

      ctx.restore(); // un-clip

      // 4. Dimension scales
      drawAxialScale(ctx, vesselLength, toCanvasX, y1 + 4);
      drawCircumScale(ctx, circumference, toCanvasY, x0 - 4);

      // 5. Metadata header
      drawMetadataHeader(ctx, vesselState, PADDING.left, 10);

      // 6. Color legend (from first confirmed composite, if any)
      const firstComposite = vesselState.scanComposites.find(
        (c) => c.orientationConfirmed && c.data.length > 0,
      );
      if (firstComposite) {
        const legendConfig: LegendConfig = {
          colorScaleName: firstComposite.colorScale,
          reverseScale: false,
          rangeMin: firstComposite.rangeMin ?? firstComposite.stats.min,
          rangeMax: firstComposite.rangeMax ?? firstComposite.stats.max,
        };
        const legendX = cssWidth - PADDING.right + 20;
        const legendY = PADDING.top;
        const legendH = Math.min(200, cssHeight - PADDING.top - PADDING.bottom);
        drawColorBar(ctx, legendConfig, legendX, legendY, 18, legendH);
      }

      ctx.restore();
    }, [vesselState, toCanvasX, toCanvasY]);

    // -----------------------------------------------------------------------
    // Heatmap rendering helper — offscreen ImageData approach
    // -----------------------------------------------------------------------

    const renderHeatmap = useCallback(
      (
        ctx: CanvasRenderingContext2D,
        state: VesselState,
      ) => {
        for (const composite of state.scanComposites) {
          if (!composite.orientationConfirmed) continue;
          if (composite.data.length === 0) continue;

          const { yAxis, xAxis, data, indexStartMm, indexDirection, scanDirection } =
            composite;
          const rows = data.length;
          const cols = data[0]?.length ?? 0;
          if (rows === 0 || cols === 0) continue;

          const scale = getColorscale(composite.colorScale);
          const rMin = composite.rangeMin ?? composite.stats.min;
          const rMax = composite.rangeMax ?? composite.stats.max;
          const range = rMax === rMin ? 1 : rMax - rMin;
          const alpha = Math.round(Math.max(0, Math.min(1, composite.opacity)) * 255);

          // --- Build an offscreen pixel buffer at native data resolution ---
          const offscreen = document.createElement('canvas');
          offscreen.width = cols;
          offscreen.height = rows;
          const offCtx = offscreen.getContext('2d');
          if (!offCtx) continue;

          const imageData = offCtx.createImageData(cols, rows);
          const pixels = imageData.data;

          for (let row = 0; row < rows; row++) {
            const rowData = data[row];
            if (!rowData) continue;
            for (let col = 0; col < cols; col++) {
              const value = rowData[col];
              const idx = (row * cols + col) * 4;
              if (value == null) {
                pixels[idx + 3] = 0; // transparent
                continue;
              }
              const t = (value - rMin) / range;
              const [r, g, b] = interpolateColor(Math.max(0, Math.min(1, t)), scale);
              pixels[idx] = r;
              pixels[idx + 1] = g;
              pixels[idx + 2] = b;
              pixels[idx + 3] = alpha;
            }
          }
          offCtx.putImageData(imageData, 0, 0);

          // --- Compute bounding box in vessel mm ---
          // Axial bounds from yAxis + indexStartMm
          const yFirst = yAxis[0];
          const yLast = yAxis[yAxis.length - 1];
          const axialStart = indexDirection === 'forward'
            ? indexStartMm + Math.min(yFirst, yLast)
            : indexStartMm - Math.max(yFirst, yLast);
          const axialEnd = indexDirection === 'forward'
            ? indexStartMm + Math.max(yFirst, yLast)
            : indexStartMm - Math.min(yFirst, yLast);

          // Circumferential bounds from xAxis + datum
          // datumAngleDeg: 0° = TDC in user coords. Convert to vessel angle: +90°
          const datumCircMm = angleToCircumMm(
            composite.datumAngleDeg + 90,
            state.id,
          );
          const xFirst = xAxis[0];
          const xLast = xAxis[xAxis.length - 1];
          const scanMin = Math.min(xFirst, xLast);
          const scanMax = Math.max(xFirst, xLast);

          // CW: scan extends in positive circumMm direction from datum
          // CCW: scan extends in negative circumMm direction from datum
          let circumStart: number;
          let circumEnd: number;
          if (scanDirection === 'cw') {
            circumStart = datumCircMm + scanMin;
            circumEnd = datumCircMm + scanMax;
          } else {
            circumStart = datumCircMm - scanMax;
            circumEnd = datumCircMm - scanMin;
          }

          // --- Draw the offscreen canvas onto the main canvas at correct position ---
          const px0 = toCanvasX(axialStart);
          const px1 = toCanvasX(axialEnd);
          const py0 = toCanvasY(circumStart);
          const py1 = toCanvasY(circumEnd);

          const destW = Math.abs(px1 - px0) || 1;
          const destH = Math.abs(py1 - py0) || 1;

          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(
            offscreen,
            Math.min(px0, px1),
            Math.min(py0, py1),
            destW,
            destH,
          );
        }
      },
      [toCanvasX, toCanvasY],
    );

    // -----------------------------------------------------------------------
    // Geometry overlay helper
    // -----------------------------------------------------------------------

    const renderGeometry = useCallback(
      (ctx: CanvasRenderingContext2D, state: VesselState) => {
        const od = state.id; // geometry-projection functions accept vesselOD

        // Welds
        ctx.lineWidth = 1.5;
        for (const weld of state.welds) {
          const projected =
            weld.type === 'circumferential'
              ? projectCircWeld(weld, od)
              : projectLongWeld(weld, od);
          ctx.strokeStyle = weld.color || '#ffff00';
          ctx.beginPath();
          ctx.moveTo(toCanvasX(projected.x1), toCanvasY(projected.y1));
          ctx.lineTo(toCanvasX(projected.x2), toCanvasY(projected.y2));
          ctx.stroke();

          // Label
          ctx.fillStyle = '#333';
          ctx.font = '10px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(
            projected.label,
            toCanvasX((projected.x1 + projected.x2) / 2),
            toCanvasY(Math.min(projected.y1, projected.y2)) - 3,
          );
        }

        // Saddles
        for (const saddle of state.saddles) {
          const rect = projectSaddle(saddle, od);
          ctx.strokeStyle = '#888';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 3]);
          ctx.strokeRect(
            toCanvasX(rect.x),
            toCanvasY(rect.y),
            toCanvasX(rect.x + rect.width) - toCanvasX(rect.x),
            toCanvasY(rect.y + rect.height) - toCanvasY(rect.y),
          );
          ctx.setLineDash([]);

          ctx.fillStyle = '#666';
          ctx.font = '10px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(
            rect.label,
            toCanvasX(rect.x + rect.width / 2),
            toCanvasY(rect.y + rect.height) + 2,
          );
        }

        // Nozzles
        for (const nozzle of state.nozzles) {
          const circle = projectNozzle(nozzle, od);
          const cx = toCanvasX(circle.cx);
          const cy = toCanvasY(circle.cy);
          // Scale radius by zoom
          const rPx =
            Math.abs(toCanvasX(circle.cx + circle.radius) - cx) || 4;

          ctx.strokeStyle = '#e74c3c';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
          ctx.stroke();

          // Cross-hair
          ctx.beginPath();
          ctx.moveTo(cx - rPx, cy);
          ctx.lineTo(cx + rPx, cy);
          ctx.moveTo(cx, cy - rPx);
          ctx.lineTo(cx, cy + rPx);
          ctx.stroke();

          ctx.fillStyle = '#333';
          ctx.font = '10px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(circle.label, cx, cy - rPx - 3);
        }

        // Lifting lugs
        for (const lug of state.liftingLugs) {
          const marker = projectLiftingLug(lug, od);
          const cx = toCanvasX(marker.cx);
          const cy = toCanvasY(marker.cy);
          const size = 6;

          ctx.fillStyle = '#2ecc71';
          ctx.beginPath();
          ctx.moveTo(cx, cy - size);
          ctx.lineTo(cx + size, cy + size);
          ctx.lineTo(cx - size, cy + size);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = '#333';
          ctx.font = '10px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(marker.label, cx, cy - size - 3);
        }
      },
      [toCanvasX, toCanvasY],
    );

    // -----------------------------------------------------------------------
    // Resize handling
    // -----------------------------------------------------------------------

    const syncCanvasSize = useCallback(() => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    }, []);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const observer = new ResizeObserver(() => {
        syncCanvasSize();
        render();
      });
      observer.observe(container);
      return () => observer.disconnect();
    }, [syncCanvasSize, render]);

    // Re-render on vesselState change
    useEffect(() => {
      render();
    }, [render]);

    // -----------------------------------------------------------------------
    // Interaction handlers
    // -----------------------------------------------------------------------

    const handleWheel = useCallback(
      (e: React.WheelEvent) => {
        e.preventDefault();
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        const v = viewRef.current;
        const factor = e.deltaY < 0 ? ZOOM_IN_FACTOR : ZOOM_OUT_FACTOR;
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom * factor));

        // Zoom toward cursor
        v.offsetX = mx - ((mx - v.offsetX) * newZoom) / v.zoom;
        v.offsetY = my - ((my - v.offsetY) * newZoom) / v.zoom;
        v.zoom = newZoom;

        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = requestAnimationFrame(render);
      },
      [render],
    );

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
      if (e.button !== 0) return;
      draggingRef.current = true;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
    }, []);

    const handleMouseMove = useCallback(
      (e: React.MouseEvent) => {
        if (draggingRef.current) {
          const dx = e.clientX - lastMouseRef.current.x;
          const dy = e.clientY - lastMouseRef.current.y;
          viewRef.current.offsetX += dx;
          viewRef.current.offsetY += dy;
          lastMouseRef.current = { x: e.clientX, y: e.clientY };

          cancelAnimationFrame(animFrameRef.current);
          animFrameRef.current = requestAnimationFrame(render);
          setTooltip(null);
          return;
        }

        // Hover tooltip — find thickness under cursor
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        const axialMm = fromCanvasX(mx);
        const circumMm = fromCanvasY(my);

        // Out of vessel bounds → no tooltip
        const vesselLength = vesselState.length;
        const circumference = getCircumference(vesselState);
        if (
          axialMm < 0 ||
          axialMm > vesselLength ||
          circumMm < 0 ||
          circumMm > circumference
        ) {
          setTooltip(null);
          return;
        }

        // Check composites for a thickness value at this position
        const hit = findThicknessAt(
          vesselState.scanComposites,
          axialMm,
          circumMm,
          circumference,
          vesselState.id,
        );
        if (hit != null) {
          setTooltip({
            x: e.clientX - rect.left + 12,
            y: e.clientY - rect.top - 20,
            text: `${hit.toFixed(2)} mm`,
          });
        } else {
          setTooltip(null);
        }
      },
      [render, fromCanvasX, fromCanvasY, vesselState],
    );

    const handleMouseUp = useCallback(() => {
      draggingRef.current = false;
    }, []);

    const handleMouseLeave = useCallback(() => {
      draggingRef.current = false;
      setTooltip(null);
    }, []);

    const handleFitView = useCallback(() => {
      viewRef.current = { zoom: 1, offsetX: 0, offsetY: 0 };
      render();
    }, [render]);

    // -----------------------------------------------------------------------
    // Imperative handle
    // -----------------------------------------------------------------------

    useImperativeHandle(ref, () => ({
      exportImage: () => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        return canvas.toDataURL('image/png');
      },
    }));

    // -----------------------------------------------------------------------
    // JSX
    // -----------------------------------------------------------------------

    return (
      <div ref={containerRef} className="absolute inset-0 bg-white">
        <canvas
          ref={canvasRef}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          style={{ cursor: draggingRef.current ? 'grabbing' : 'crosshair' }}
        />

        {/* Fit button */}
        <button
          type="button"
          onClick={handleFitView}
          className="absolute top-2 right-2 px-2 py-1 text-xs bg-white border border-gray-300 rounded shadow-sm hover:bg-gray-50"
        >
          Fit
        </button>

        {/* Tooltip */}
        {tooltip && (
          <div
            className="absolute pointer-events-none px-2 py-1 text-xs text-white bg-gray-800 rounded-full whitespace-nowrap"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            {tooltip.text}
          </div>
        )}
      </div>
    );
  },
);

FlattenedViewport.displayName = 'FlattenedViewport';
export default FlattenedViewport;

// ---------------------------------------------------------------------------
// Standalone helper: find thickness value at a given vessel coordinate
// ---------------------------------------------------------------------------

function findThicknessAt(
  composites: ScanCompositeConfig[],
  axialMm: number,
  circumMm: number,
  circumference: number,
  vesselOD: number,
): number | null {
  for (const composite of composites) {
    if (!composite.orientationConfirmed || composite.data.length === 0) continue;

    const { yAxis, xAxis, data, indexStartMm, indexDirection, scanDirection } =
      composite;

    const datumCircMm = angleToCircumMm(composite.datumAngleDeg + 90, vesselOD);

    // Find the closest row (axial)
    let bestRow = -1;
    let bestRowDist = Infinity;
    for (let row = 0; row < yAxis.length; row++) {
      const rowAxial =
        indexDirection === 'forward'
          ? indexStartMm + yAxis[row]
          : indexStartMm - yAxis[row];
      const dist = Math.abs(rowAxial - axialMm);
      if (dist < bestRowDist) {
        bestRowDist = dist;
        bestRow = row;
      }
    }

    // Find the closest col (circumferential)
    let bestCol = -1;
    let bestColDist = Infinity;
    for (let col = 0; col < xAxis.length; col++) {
      const offset = scanDirection === 'cw' ? xAxis[col] : -xAxis[col];
      let colCirc = datumCircMm + offset;
      colCirc = ((colCirc % circumference) + circumference) % circumference;
      // Wraparound-aware distance
      let dist = Math.abs(colCirc - circumMm);
      if (dist > circumference / 2) dist = circumference - dist;
      if (dist < bestColDist) {
        bestColDist = dist;
        bestCol = col;
      }
    }

    if (bestRow < 0 || bestCol < 0) continue;

    // Tolerance: accept if within half the grid spacing
    const rowSpacing =
      yAxis.length > 1 ? Math.abs(yAxis[1] - yAxis[0]) : 10;
    const colSpacing =
      xAxis.length > 1 ? Math.abs(xAxis[1] - xAxis[0]) : 10;
    if (bestRowDist > rowSpacing || bestColDist > colSpacing) continue;

    const value = data[bestRow]?.[bestCol];
    if (value != null) return value;
  }

  return null;
}
