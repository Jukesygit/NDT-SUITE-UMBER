/**
 * CscanHeatmap — dual-canvas heatmap with crosshair cursors.
 *
 * Canvas 1 (heatmap): receives ImageData from useHeatmapRenderer
 * Canvas 2 (overlay): draws crosshair cursors
 * Both share the same CSS transform from useZoomPan.
 *
 * The canvas is rendered at data-proportional resolution so aspect ratio
 * is correct.  The initial zoom fills the viewport width; the user can
 * pan vertically and zoom freely.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHeatmapRenderer } from '../../../hooks/useHeatmapRenderer';
import { useZoomPan } from '../../../hooks/useZoomPan';
import type { CompositeData } from '../../../types/companion';

/** Cap the largest canvas dimension to keep memory reasonable (~16 MP). */
const MAX_RENDER_DIM = 4096;

interface CscanHeatmapProps {
  composite: CompositeData;
  cursorScanMm: number;
  cursorIndexMm: number;
  colormap: string;
  onCursorMove: (scanMm: number, indexMm: number) => void;
  thicknessMin?: number | null;
  thicknessMax?: number | null;
  /** Minimum amplitude % — points below this are filtered out (gate threshold). */
  amplitudeMin?: number | null;
  /** Worker-computed thickness matrix from gate adjustment. Overrides composite.matrix when set. */
  thicknessOverride?: Float32Array | null;
  /** Reports the visible data region when zoom/pan changes (for frustum culling). */
  onVisibleRegionChange?: (region: { x0: number; y0: number; x1: number; y1: number }) => void;
}

export default function CscanHeatmap({
  composite,
  cursorScanMm,
  cursorIndexMm,
  colormap,
  onCursorMove,
  thicknessMin = null,
  thicknessMax = null,
  amplitudeMin = null,
  thicknessOverride = null,
  onVisibleRegionChange,
}: CscanHeatmapProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const heatmapCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const readoutRef = useRef<HTMLDivElement>(null);

  // containerRef is defined after useZoomPan (needs wheelRef)

  const { width: dataW, height: dataH, xAxis, yAxis, stats } = composite;

  // ---- Apply amplitude filter (client-side, instant) ----
  const filtered = useMemo(() => {
    const sourceMatrix = thicknessOverride ?? composite.matrix;
    const hasAmplitudeFilter = amplitudeMin !== null && composite.amplitude !== null;
    if (!hasAmplitudeFilter) return sourceMatrix;

    const out = new Float32Array(sourceMatrix);
    const amp = composite.amplitude!;

    for (let i = 0; i < out.length; i++) {
      if (isNaN(out[i])) continue;
      if (amp[i] < amplitudeMin!) out[i] = NaN;
    }
    return out;
  }, [thicknessOverride, composite.matrix, composite.amplitude, amplitudeMin]);

  // ---- Measure parent ----
  const [viewportSize, setViewportSize] = useState({ w: 800, h: 500 });

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) return;
      const { width: w, height: h } = entry.contentRect;
      if (w > 0 && h > 0) setViewportSize({ w: Math.round(w), h: Math.round(h) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- Compute render resolution (data-proportional, capped) ----
  const renderScale = Math.min(1, MAX_RENDER_DIM / Math.max(dataW, dataH));
  const renderW = Math.max(1, Math.round(dataW * renderScale));
  const renderH = Math.max(1, Math.round(dataH * renderScale));

  // ---- Zoom / pan ----
  const { requestRender, imageData, isRendering } = useHeatmapRenderer();
  const { transform, pixelToData, dataToPixel, wheelRef, handlers } = useZoomPan({
    dataWidth: renderW,
    dataHeight: renderH,
    viewportWidth: viewportSize.w,
    viewportHeight: viewportSize.h,
    fitMode: 'width',
  });

  // Attach native wheel listener via useEffect (avoids callback ref issues)
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    wheelRef(el);
    return () => wheelRef(null);
  }, [wheelRef]);

  // ---- Report visible data region for frustum culling ----
  // Convert from render-pixel space to data-grid space (worker expects grid indices)
  const onVisibleRegionChangeRef = useRef(onVisibleRegionChange);
  onVisibleRegionChangeRef.current = onVisibleRegionChange;

  useEffect(() => {
    if (!onVisibleRegionChangeRef.current) return;
    const topLeft = pixelToData(0, 0);
    const bottomRight = pixelToData(viewportSize.w, viewportSize.h);

    // Scale from render-pixel coords to data-grid coords
    const scaleX = dataW / renderW;
    const scaleY = dataH / renderH;

    onVisibleRegionChangeRef.current({
      x0: Math.max(0, Math.floor(topLeft.dataX * scaleX)),
      y0: Math.max(0, Math.floor(topLeft.dataY * scaleY)),
      x1: Math.min(dataW, Math.ceil(bottomRight.dataX * scaleX)),
      y1: Math.min(dataH, Math.ceil(bottomRight.dataY * scaleY)),
    });
  // Only fire when zoom/pan actually changes, not on every parent re-render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pixelToData, viewportSize.w, viewportSize.h, dataW, dataH, renderW, renderH]);

  // ---- Coordinate helpers (render pixels ↔ mm) ----
  const xMin = xAxis[0] ?? 0;
  const yMin = yAxis[0] ?? 0;
  const xRange = xAxis.length > 1 ? xAxis[xAxis.length - 1] - xMin : dataW;
  const yRange = yAxis.length > 1 ? yAxis[yAxis.length - 1] - yMin : dataH;

  const renderToMm = useCallback(
    (rx: number, ry: number) => ({
      scanMm: xMin + (rx / renderW) * xRange,
      indexMm: yMin + (ry / renderH) * yRange,
    }),
    [xMin, yMin, xRange, yRange, renderW, renderH],
  );

  const mmToRender = useCallback(
    (scanMm: number, indexMm: number) => ({
      rx: ((scanMm - xMin) / xRange) * renderW,
      ry: ((indexMm - yMin) / yRange) * renderH,
    }),
    [xMin, yMin, xRange, yRange, renderW, renderH],
  );

  // ---- Request render when composite/colormap/size/filter changes ----
  // thicknessMin/Max control the color range; stats.min/max are the fallback
  const colorRangeMin = thicknessMin ?? stats.min;
  const colorRangeMax = thicknessMax ?? stats.max;

  useEffect(() => {
    if (renderW <= 0 || renderH <= 0) return;
    requestRender({
      matrix: filtered,
      width: dataW,
      height: dataH,
      viewportWidth: renderW,
      viewportHeight: renderH,
      colormap,
      reverseColormap: true, // blue = thick (safe), red = thin (danger) — UT convention
      rangeMin: colorRangeMin,
      rangeMax: colorRangeMax,
    });
  }, [filtered, colormap, requestRender, dataW, dataH, colorRangeMin, colorRangeMax, renderW, renderH]);

  // ---- Paint heatmap ImageData to canvas ----
  useEffect(() => {
    if (!imageData || !heatmapCanvasRef.current) return;
    const ctx = heatmapCanvasRef.current.getContext('2d');
    if (!ctx) return;
    heatmapCanvasRef.current.width = imageData.width;
    heatmapCanvasRef.current.height = imageData.height;
    ctx.putImageData(imageData, 0, 0);
  }, [imageData]);

  // ---- Draw crosshair overlay ----
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    canvas.width = viewportSize.w;
    canvas.height = viewportSize.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, viewportSize.w, viewportSize.h);

    const { rx, ry } = mmToRender(cursorScanMm, cursorIndexMm);
    const { px: cx, py: cy } = dataToPixel(rx, ry);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 1;

    // Vertical line (scan position)
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, viewportSize.h);
    ctx.stroke();

    // Horizontal line (index position)
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(viewportSize.w, cy);
    ctx.stroke();
  }, [cursorScanMm, cursorIndexMm, mmToRender, dataToPixel, viewportSize]);

  // ---- Update readout (direct DOM mutation for performance) ----
  useEffect(() => {
    if (!readoutRef.current) return;
    const colIdx = Math.round(((cursorScanMm - xMin) / xRange) * (dataW - 1));
    const rowIdx = Math.round(((cursorIndexMm - yMin) / yRange) * (dataH - 1));
    let thickness = '—';
    if (colIdx >= 0 && colIdx < dataW && rowIdx >= 0 && rowIdx < dataH) {
      const val = composite.matrix[rowIdx * dataW + colIdx];
      thickness = isNaN(val) ? 'ND' : `${val.toFixed(2)} mm`;
    }
    readoutRef.current.textContent =
      `Scan: ${cursorScanMm.toFixed(1)} mm | Index: ${cursorIndexMm.toFixed(1)} mm | Thickness: ${thickness}`;
  }, [cursorScanMm, cursorIndexMm, composite, xMin, yMin, xRange, yRange, dataW, dataH]);

  // ---- Click to move cursor ----
  const handleClick = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const { dataX, dataY } = pixelToData(px, py);
    const { scanMm, indexMm } = renderToMm(dataX, dataY);
    onCursorMove(scanMm, indexMm);
  }, [pixelToData, renderToMm, onCursorMove]);

  // ---- Mousemove: real-time cursor tracking (throttled) ----
  const lastCursorUpdateRef = useRef(0);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // Always let zoom/pan handle its drag logic
    handlers.onMouseMove(e);

    // Only update cursor when not dragging (hover)
    if (e.buttons !== 0) return;

    const now = performance.now();
    if (now - lastCursorUpdateRef.current < 50) return;
    lastCursorUpdateRef.current = now;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const { dataX, dataY } = pixelToData(px, py);
    const { scanMm, indexMm } = renderToMm(dataX, dataY);
    onCursorMove(scanMm, indexMm);
  }, [handlers.onMouseMove, pixelToData, renderToMm, onCursorMove]);

  return (
    <div
      ref={outerRef}
      style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', cursor: 'crosshair' }}
      onClick={handleClick}
      onMouseDown={handlers.onMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handlers.onMouseUp}
    >
      {/* Heatmap canvas */}
      <canvas
        ref={heatmapCanvasRef}
        style={{ position: 'absolute', top: 0, left: 0, transformOrigin: '0 0', transform, imageRendering: 'pixelated' }}
      />

      {/* Crosshair overlay */}
      <canvas
        ref={overlayCanvasRef}
        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
      />

      {/* Coordinate readout */}
      <div
        ref={readoutRef}
        style={{
          position: 'absolute',
          top: 6,
          right: 6,
          padding: '3px 8px',
          background: 'rgba(0,0,0,0.7)',
          borderRadius: 4,
          fontSize: '0.7rem',
          color: '#ddd',
          fontVariantNumeric: 'tabular-nums',
          pointerEvents: 'none',
        }}
      />

      {isRendering && (
        <div style={{
          position: 'absolute',
          bottom: 6,
          left: 6,
          fontSize: '0.65rem',
          color: 'var(--text-quaternary)',
        }}>
          Rendering...
        </div>
      )}
    </div>
  );
}
