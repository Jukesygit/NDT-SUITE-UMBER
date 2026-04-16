/**
 * CscanHeatmap — dual-canvas heatmap with crosshair cursors.
 *
 * Canvas 1 (heatmap): receives ImageData from useHeatmapRenderer
 * Canvas 2 (overlay): draws crosshair cursors
 * Both share the same CSS transform from useZoomPan.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useHeatmapRenderer } from '../../../hooks/useHeatmapRenderer';
import { useZoomPan } from '../../../hooks/useZoomPan';
import type { CompositeData } from '../../../types/companion';

interface CscanHeatmapProps {
  composite: CompositeData;
  cursorScanMm: number;
  cursorIndexMm: number;
  colormap: string;
  onCursorMove: (scanMm: number, indexMm: number) => void;
}

export default function CscanHeatmap({
  composite,
  cursorScanMm,
  cursorIndexMm,
  colormap,
  onCursorMove,
}: CscanHeatmapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const heatmapCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const readoutRef = useRef<HTMLDivElement>(null);

  const { width: dataW, height: dataH, xAxis, yAxis, stats } = composite;

  // Data extent in mm
  const dataWidthMm = xAxis.length > 1 ? xAxis[xAxis.length - 1] - xAxis[0] : dataW;
  const dataHeightMm = yAxis.length > 1 ? yAxis[yAxis.length - 1] - yAxis[0] : dataH;

  const containerWidth = 800;
  const containerHeight = 500;

  const { requestRender, imageData, isRendering } = useHeatmapRenderer();
  const { transform, pixelToData, dataToPixel, handlers } = useZoomPan({
    dataWidth: dataWidthMm,
    dataHeight: dataHeightMm,
    viewportWidth: containerWidth,
    viewportHeight: containerHeight,
  });

  // Request render when composite or colormap changes
  useEffect(() => {
    requestRender({
      matrix: composite.matrix,
      width: dataW,
      height: dataH,
      viewportWidth: containerWidth,
      viewportHeight: containerHeight,
      colormap,
      rangeMin: stats.min,
      rangeMax: stats.max,
    });
  }, [composite, colormap, requestRender, dataW, dataH, stats.min, stats.max]);

  // Paint heatmap ImageData to canvas
  useEffect(() => {
    if (!imageData || !heatmapCanvasRef.current) return;
    const ctx = heatmapCanvasRef.current.getContext('2d');
    if (!ctx) return;
    heatmapCanvasRef.current.width = imageData.width;
    heatmapCanvasRef.current.height = imageData.height;
    ctx.putImageData(imageData, 0, 0);
  }, [imageData]);

  // Draw crosshair overlay
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    canvas.width = containerWidth;
    canvas.height = containerHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, containerWidth, containerHeight);

    const { px: cx, py: cy } = dataToPixel(
      cursorScanMm - (xAxis[0] ?? 0),
      cursorIndexMm - (yAxis[0] ?? 0),
    );

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 1;

    // Vertical line (scan position)
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, containerHeight);
    ctx.stroke();

    // Horizontal line (index position)
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(containerWidth, cy);
    ctx.stroke();
  }, [cursorScanMm, cursorIndexMm, dataToPixel, xAxis, yAxis, containerWidth, containerHeight]);

  // Update readout (direct DOM mutation for performance)
  useEffect(() => {
    if (!readoutRef.current) return;
    // Find thickness at cursor
    const colIdx = Math.round(((cursorScanMm - (xAxis[0] ?? 0)) / dataWidthMm) * (dataW - 1));
    const rowIdx = Math.round(((cursorIndexMm - (yAxis[0] ?? 0)) / dataHeightMm) * (dataH - 1));
    let thickness = '—';
    if (colIdx >= 0 && colIdx < dataW && rowIdx >= 0 && rowIdx < dataH) {
      const val = composite.matrix[rowIdx * dataW + colIdx];
      thickness = isNaN(val) ? 'ND' : `${val.toFixed(2)} mm`;
    }
    readoutRef.current.textContent =
      `Scan: ${cursorScanMm.toFixed(1)} mm | Index: ${cursorIndexMm.toFixed(1)} mm | Thickness: ${thickness}`;
  }, [cursorScanMm, cursorIndexMm, composite, xAxis, yAxis, dataW, dataH, dataWidthMm, dataHeightMm]);

  // Click to move cursor
  const handleClick = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const { scanMm, indexMm } = pixelToData(px, py);
    onCursorMove(scanMm + (xAxis[0] ?? 0), indexMm + (yAxis[0] ?? 0));
  }, [pixelToData, onCursorMove, xAxis, yAxis]);

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: containerWidth, height: containerHeight, overflow: 'hidden', cursor: 'crosshair' }}
      onClick={handleClick}
      {...handlers}
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
