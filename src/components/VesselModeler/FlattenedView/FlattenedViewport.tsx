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
  datumToCircumMm,
  projectNozzle,
  projectCircWeld,
  projectLongWeld,
  projectSaddle,
  projectLiftingLug,
  wrapCircumCenters,
  getAxialOrientation,
  axialToIndexMm,
  axialFrac,
  fitScale,
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
  selectedWeldIndex?: number;
  selectedNozzleIndex?: number;
  selectedSaddleIndex?: number;
  selectedLugIndex?: number;
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
  function FlattenedViewport({ vesselState, selectedWeldIndex = -1, selectedNozzleIndex = -1, selectedSaddleIndex = -1, selectedLugIndex = -1 }, ref) {
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

    // Single to-scale (1:1) layout: equal mm/pixel on both axes so round bores
    // render round and scan footprints are not axis-stretched. The looser axis
    // is letterboxed (centred) via marginX/marginY.
    const getPlotMetrics = useCallback(() => {
      const { drawWidth, drawHeight } = getDrawDimensions();
      const vesselLength = vesselState.length;
      const circumference = getCircumference(vesselState);
      const { pxPerMm, marginX, marginY } = fitScale(
        drawWidth, drawHeight, vesselLength, circumference,
      );
      const reversed = getAxialOrientation(vesselState.scanComposites)?.reversed ?? false;
      return { pxPerMm, marginX, marginY, vesselLength, circumference, reversed };
    }, [vesselState, getDrawDimensions]);

    const toCanvasX = useCallback(
      (mm: number) => {
        const { pxPerMm, marginX, vesselLength, reversed } = getPlotMetrics();
        const { zoom, offsetX } = viewRef.current;
        if (pxPerMm <= 0) return PADDING.left;
        const pos = axialFrac(mm, vesselLength, reversed) * vesselLength; // reversed ? len-mm : mm
        return PADDING.left + marginX + pos * pxPerMm * zoom + offsetX;
      },
      [getPlotMetrics],
    );

    const toCanvasY = useCallback(
      (mm: number) => {
        const { pxPerMm, marginY } = getPlotMetrics();
        const { zoom, offsetY } = viewRef.current;
        if (pxPerMm <= 0) return PADDING.top;
        return PADDING.top + marginY + mm * pxPerMm * zoom + offsetY;
      },
      [getPlotMetrics],
    );

    /** Inverse: canvas pixel → vessel mm (for hover lookups) */
    const fromCanvasX = useCallback(
      (px: number) => {
        const { pxPerMm, marginX, vesselLength, reversed } = getPlotMetrics();
        const { zoom, offsetX } = viewRef.current;
        if (pxPerMm <= 0 || zoom <= 0) return 0;
        const pos = (px - PADDING.left - marginX - offsetX) / (pxPerMm * zoom);
        return reversed ? vesselLength - pos : pos;
      },
      [getPlotMetrics],
    );

    const fromCanvasY = useCallback(
      (py: number) => {
        const { pxPerMm, marginY } = getPlotMetrics();
        const { zoom, offsetY } = viewRef.current;
        if (pxPerMm <= 0 || zoom <= 0) return 0;
        return (py - PADDING.top - marginY - offsetY) / (pxPerMm * zoom);
      },
      [getPlotMetrics],
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
      renderHeatmap(ctx, vesselState, circumference);

      // 3b. Geometry overlays
      renderGeometry(ctx, vesselState);

      ctx.restore(); // un-clip

      // 3c. Selection glow — drawn OUTSIDE clip so it radiates freely.
      //     Uses concentric strokes with decreasing opacity for a soft halo.
      const GLOW_LAYERS = [
        { width: 20, alpha: 0.07 },
        { width: 14, alpha: 0.12 },
        { width: 8,  alpha: 0.2 },
        { width: 4,  alpha: 0.35 },
      ];

      const od = vesselState.id;

      // Saddle glow
      if (selectedSaddleIndex >= 0 && selectedSaddleIndex < vesselState.saddles.length) {
        const rect = projectSaddle(vesselState.saddles[selectedSaddleIndex], od);
        const rx = toCanvasX(rect.x);
        const ry = toCanvasY(rect.y);
        const rw = toCanvasX(rect.x + rect.width) - rx;
        const rh = toCanvasY(rect.y + rect.height) - ry;
        ctx.save();
        ctx.setLineDash([]);
        for (const layer of GLOW_LAYERS) {
          ctx.globalAlpha = layer.alpha;
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = layer.width;
          ctx.strokeRect(rx, ry, rw, rh);
        }
        ctx.globalAlpha = 1;
        ctx.restore();
      }

      // Nozzle glow — match the marker: per-axis radius + seam wrap.
      if (selectedNozzleIndex >= 0 && selectedNozzleIndex < vesselState.nozzles.length) {
        const circle = projectNozzle(vesselState.nozzles[selectedNozzleIndex], od);
        const cx = toCanvasX(circle.cx);
        const rxPx = Math.abs(toCanvasX(circle.cx + circle.radius) - cx) || 4;
        const ryPx =
          Math.abs(toCanvasY(circle.cy + circle.radius) - toCanvasY(circle.cy)) || rxPx;
        ctx.save();
        for (const cyMm of wrapCircumCenters(circle.cy, circle.radius, circumference)) {
          const cy = toCanvasY(cyMm);
          for (const layer of GLOW_LAYERS) {
            ctx.globalAlpha = layer.alpha;
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = layer.width;
            ctx.beginPath();
            ctx.ellipse(cx, cy, rxPx, ryPx, 0, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
        ctx.restore();
      }

      // Lug glow
      if (selectedLugIndex >= 0 && selectedLugIndex < vesselState.liftingLugs.length) {
        const marker = projectLiftingLug(vesselState.liftingLugs[selectedLugIndex], od);
        const cx = toCanvasX(marker.cx);
        const cy = toCanvasY(marker.cy);
        ctx.save();
        for (const layer of GLOW_LAYERS) {
          ctx.globalAlpha = layer.alpha;
          ctx.fillStyle = '#22c55e';
          ctx.beginPath();
          ctx.arc(cx, cy, layer.width, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.restore();
      }

      // 3d. Welds (drawn outside clip so they extend beyond vessel bounds)
      ctx.save();
      for (let wi = 0; wi < vesselState.welds.length; wi++) {
        const weld = vesselState.welds[wi];
        const isSelected = wi === selectedWeldIndex;
        const projected =
          weld.type === 'circumferential'
            ? projectCircWeld(weld, od)
            : projectLongWeld(weld, od);

        const px = toCanvasX(projected.x1);

        // Base weld line
        ctx.strokeStyle = isSelected ? '#4ade80' : '#22c55e';
        ctx.lineWidth = isSelected ? 2.5 : 1;
        ctx.setLineDash(isSelected ? [8, 4] : [6, 4]);
        ctx.globalAlpha = isSelected ? 1 : 0.7;

        if (weld.type === 'circumferential') {
          ctx.beginPath();
          ctx.moveTo(px, y0 - 15);
          ctx.lineTo(px, y1 + 15);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.moveTo(toCanvasX(projected.x1), toCanvasY(projected.y1));
          ctx.lineTo(toCanvasX(projected.x2), toCanvasY(projected.y2));
          ctx.stroke();
        }

        // Label — CW above chart, LW to the right of the line
        ctx.globalAlpha = 1;
        ctx.setLineDash([]);
        ctx.fillStyle = isSelected ? '#16a34a' : '#333';
        ctx.font = isSelected ? 'bold 11px sans-serif' : '10px sans-serif';
        if (weld.type === 'circumferential') {
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(projected.label, px, y0 - 18);
        } else {
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(projected.label, toCanvasX(projected.x2) + 6, toCanvasY(projected.y2));
        }
      }
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
      ctx.restore();

      // 4. Dimension scales — axial axis labelled as scan-index distance from
      //    the scan start (0 on the left), matching the mirrored orientation.
      const axialOri = getAxialOrientation(vesselState.scanComposites);
      drawAxialScale(ctx, vesselLength, toCanvasX, y1 + 4, (mm) =>
        axialToIndexMm(mm, axialOri),
      );
      // Anchor the circumferential scale to the actual left edge — when the
      // axial axis is mirrored, toCanvasX(0) becomes the right edge.
      drawCircumScale(ctx, circumference, toCanvasY, Math.min(x0, x1) - 4);

      // 5. Metadata header
      drawMetadataHeader(ctx, vesselState, PADDING.left, 10);

      // 6. Color legend (from first confirmed composite, if any)
      const firstComposite = vesselState.scanComposites.find(
        (c) => c.orientationConfirmed && c.data.length > 0,
      );
      if (firstComposite) {
        const legendConfig: LegendConfig = {
          colorScaleName: firstComposite.colorScale,
          reverseScale: true,
          rangeMin: firstComposite.rangeMin ?? firstComposite.stats.min,
          rangeMax: firstComposite.rangeMax ?? firstComposite.stats.max,
        };
        const legendX = cssWidth - PADDING.right + 20;
        const legendY = PADDING.top;
        const legendH = Math.min(200, cssHeight - PADDING.top - PADDING.bottom);
        drawColorBar(ctx, legendConfig, legendX, legendY, 18, legendH);
      }

      ctx.restore();
    }, [vesselState, selectedWeldIndex, selectedNozzleIndex, selectedSaddleIndex, selectedLugIndex, toCanvasX, toCanvasY]);

    // -----------------------------------------------------------------------
    // Heatmap rendering helper — per-pixel mapping to screen-space ImageData
    // -----------------------------------------------------------------------

    const renderHeatmap = useCallback(
      (
        ctx: CanvasRenderingContext2D,
        state: VesselState,
        circumference: number,
      ) => {
        const { drawWidth, drawHeight } = getDrawDimensions();
        if (drawWidth <= 0 || drawHeight <= 0) return;

        // Create a screen-sized buffer to paint scan pixels into
        const bufW = Math.ceil(drawWidth);
        const bufH = Math.ceil(drawHeight);
        const offscreen = document.createElement('canvas');
        offscreen.width = bufW;
        offscreen.height = bufH;
        const offCtx = offscreen.getContext('2d');
        if (!offCtx) return;
        const imageData = offCtx.createImageData(bufW, bufH);
        const pixels = imageData.data;

        const vesselLength = state.length;
        const { zoom, offsetX, offsetY } = viewRef.current;
        // Axial axis follows the reference scan's index direction (scan start on
        // the left). Mirror the row→pixel mapping the same way toCanvasX does.
        const reversed = getAxialOrientation(state.scanComposites)?.reversed ?? false;
        // Same 1:1 scale + letterbox margins as toCanvasX/Y. Buffer is blitted at
        // (PADDING.left, PADDING.top), so pixels are relative to that origin.
        const { pxPerMm, marginX, marginY } = fitScale(
          drawWidth, drawHeight, vesselLength, circumference,
        );
        if (pxPerMm <= 0) return;
        const circSpanZoomed = circumference * pxPerMm * zoom;
        let hasData = false;

        for (const composite of state.scanComposites) {
          if (!composite.orientationConfirmed) continue;
          if (composite.data.length === 0) continue;

          const { yAxis, xAxis, data, indexStartMm, indexDirection, scanDirection } =
            composite;
          const scale = getColorscale(composite.colorScale);
          const rMin = composite.rangeMin ?? composite.stats.min;
          const rMax = composite.rangeMax ?? composite.stats.max;
          const range = rMax === rMin ? 1 : rMax - rMin;
          const alpha = Math.round(Math.max(0, Math.min(1, composite.opacity)) * 255);

          // datumAngleDeg is user-facing (0° = TDC). datumToCircumMm applies the
          // +90° (same as the 3D path) so a datum-0 scan starts at the TDC line
          // (Y = 0), aligned with the geometry overlays.
          const datumCircMm = datumToCircumMm(
            composite.datumAngleDeg,
            state.id,
          );

          // Pre-compute axial pixel for each row
          const rowPx: number[] = new Array(yAxis.length);
          const rowPxNext: number[] = new Array(yAxis.length);
          for (let row = 0; row < yAxis.length; row++) {
            const axialMm = indexDirection === 'forward'
              ? indexStartMm + yAxis[row]
              : indexStartMm - yAxis[row];
            const nextMm = row + 1 < yAxis.length
              ? (indexDirection === 'forward'
                ? indexStartMm + yAxis[row + 1]
                : indexStartMm - yAxis[row + 1])
              : axialMm + (row > 0 ? Math.abs(yAxis[row] - yAxis[row - 1]) : 1);
            // Convert to buffer pixel (relative to PADDING.left), to-scale and
            // mirrored to match the scan-index axis orientation.
            const pos = axialFrac(axialMm, vesselLength, reversed) * vesselLength;
            const posNext = axialFrac(nextMm, vesselLength, reversed) * vesselLength;
            rowPx[row] = marginX + pos * pxPerMm * zoom + offsetX;
            rowPxNext[row] = marginX + posNext * pxPerMm * zoom + offsetX;
          }

          // Pre-compute circumferential pixel for each col
          const colPy: number[] = new Array(xAxis.length);
          const colPyNext: number[] = new Array(xAxis.length);
          for (let col = 0; col < xAxis.length; col++) {
            const circumOffset = scanDirection === 'cw' ? xAxis[col] : -xAxis[col];
            let circumMm = datumCircMm + circumOffset;
            circumMm = ((circumMm % circumference) + circumference) % circumference;

            const nextOffset = col + 1 < xAxis.length
              ? (scanDirection === 'cw' ? xAxis[col + 1] : -xAxis[col + 1])
              : circumOffset + (col > 0
                ? (scanDirection === 'cw' ? xAxis[col] - xAxis[col - 1] : xAxis[col - 1] - xAxis[col])
                : 1);
            let circumMmNext = datumCircMm + nextOffset;
            circumMmNext = ((circumMmNext % circumference) + circumference) % circumference;

            colPy[col] = marginY + circumMm * pxPerMm * zoom + offsetY;
            colPyNext[col] = marginY + circumMmNext * pxPerMm * zoom + offsetY;
          }

          for (let row = 0; row < data.length; row++) {
            const rowData = data[row];
            if (!rowData) continue;
            const px = rowPx[row];
            const pxNext = rowPxNext[row];
            const cellW = Math.abs(pxNext - px) || 1;
            const cellX = Math.min(px, pxNext);

            for (let col = 0; col < rowData.length; col++) {
              const value = rowData[col];
              if (value == null) continue;

              const py = colPy[col];
              const pyNext = colPyNext[col];
              // Skip smearing: if the gap between adjacent pixels is more than
              // half a circumference in pixels, the wrap crossed the seam — skip.
              if (Math.abs(pyNext - py) > circSpanZoomed * 0.5) continue;

              const cellH = Math.abs(pyNext - py) || 1;
              const cellY = Math.min(py, pyNext);

              const t = Math.max(0, Math.min(1, (value - rMin) / range));
              const [r, g, b] = interpolateColor(t, scale, true);

              // Fill the rectangle in the pixel buffer
              const x0 = Math.max(0, Math.floor(cellX));
              const y0 = Math.max(0, Math.floor(cellY));
              const x1 = Math.min(bufW, Math.ceil(cellX + cellW));
              const y1 = Math.min(bufH, Math.ceil(cellY + cellH));

              for (let fy = y0; fy < y1; fy++) {
                for (let fx = x0; fx < x1; fx++) {
                  const idx = (fy * bufW + fx) * 4;
                  pixels[idx] = r;
                  pixels[idx + 1] = g;
                  pixels[idx + 2] = b;
                  pixels[idx + 3] = alpha;
                }
              }
              hasData = true;
            }
          }
        }

        if (hasData) {
          offCtx.putImageData(imageData, 0, 0);
          ctx.drawImage(offscreen, PADDING.left, PADDING.top);
        }
      },
      [getDrawDimensions, toCanvasX, toCanvasY],
    );

    // -----------------------------------------------------------------------
    // Geometry overlay helper
    // -----------------------------------------------------------------------

    const renderGeometry = useCallback(
      (ctx: CanvasRenderingContext2D, state: VesselState) => {
        const od = state.id; // geometry-projection functions accept vesselOD

        // 12 o'clock reference line (vessel TDC = 90° → Y = 0, top of the view)
        const tdcMm = angleToCircumMm(90, od);
        const tdcY = toCanvasY(tdcMm);
        const x0 = toCanvasX(0);
        const x1 = toCanvasX(state.length);
        ctx.save();
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(x0, tdcY);
        ctx.lineTo(x1, tdcY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#22c55e';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        // Left edge — toCanvasX(0) is the right edge when the axis is mirrored.
        ctx.fillText('12 o\'clock (TDC)', Math.min(x0, x1) + 4, tdcY - 3);
        ctx.restore();

        // Welds are rendered outside the clip region (see main draw fn)

        // Saddles
        for (const saddle of state.saddles) {
          const rect = projectSaddle(saddle, od);
          const rx = toCanvasX(rect.x);
          const ry = toCanvasY(rect.y);
          const rw = toCanvasX(rect.x + rect.width) - rx;
          const rh = toCanvasY(rect.y + rect.height) - ry;

          ctx.strokeStyle = '#888';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 3]);
          ctx.strokeRect(rx, ry, rw, rh);
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

        // Nozzles — drawn as ellipses because the developed view scales the axial
        // and circumferential axes independently, so a bore that is round on the
        // shell must use a separate pixel radius per axis (a single radius makes
        // it bulge/shrink circumferentially). Each nozzle is also drawn at every
        // seam-wrapped centre so a feature straddling the TDC cut is not clipped
        // in half at the top/bottom boundary.
        const circumference = getCircumference(state);
        for (const nozzle of state.nozzles) {
          const circle = projectNozzle(nozzle, od);
          const cx = toCanvasX(circle.cx);
          const rxPx =
            Math.abs(toCanvasX(circle.cx + circle.radius) - cx) || 4;
          const ryPx =
            Math.abs(toCanvasY(circle.cy + circle.radius) - toCanvasY(circle.cy)) ||
            rxPx;

          for (const cyMm of wrapCircumCenters(circle.cy, circle.radius, circumference)) {
            const cy = toCanvasY(cyMm);

            ctx.strokeStyle = '#e74c3c';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.ellipse(cx, cy, rxPx, ryPx, 0, 0, Math.PI * 2);
            ctx.stroke();

            // Cross-hair
            ctx.beginPath();
            ctx.moveTo(cx - rxPx, cy);
            ctx.lineTo(cx + rxPx, cy);
            ctx.moveTo(cx, cy - ryPx);
            ctx.lineTo(cx, cy + ryPx);
            ctx.stroke();

            ctx.fillStyle = '#333';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(circle.label, cx, cy - ryPx - 3);
          }
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

    const datumCircMm = datumToCircumMm(composite.datumAngleDeg, vesselOD);

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
