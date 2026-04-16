/**
 * useZoomPan — manages zoom/pan state for the heatmap canvas.
 *
 * Transform is computed from absolute state (zoom, centerX, centerY),
 * not accumulated — prevents floating-point drift.
 * CSS transforms are GPU-composited — zero JS cost per frame.
 */

import { useCallback, useRef, useState } from 'react';

interface ZoomPanState {
  zoom: number;
  centerX: number; // data coordinate at viewport center
  centerY: number;
}

interface UseZoomPanParams {
  dataWidth: number;   // total data width in data units (mm)
  dataHeight: number;  // total data height in data units (mm)
  viewportWidth: number;
  viewportHeight: number;
  minZoom?: number;
  maxZoom?: number;
}

interface UseZoomPanResult {
  transform: string;
  zoom: number;
  centerX: number;
  centerY: number;
  pixelToData: (px: number, py: number) => { scanMm: number; indexMm: number };
  dataToPixel: (scanMm: number, indexMm: number) => { px: number; py: number };
  handlers: {
    onWheel: (e: React.WheelEvent) => void;
    onMouseDown: (e: React.MouseEvent) => void;
    onMouseMove: (e: React.MouseEvent) => void;
    onMouseUp: () => void;
  };
}

export function useZoomPan(params: UseZoomPanParams): UseZoomPanResult {
  const { dataWidth, dataHeight, viewportWidth, viewportHeight, minZoom = 0.5, maxZoom = 20 } = params;

  const [state, setState] = useState<ZoomPanState>({
    zoom: 1,
    centerX: dataWidth / 2,
    centerY: dataHeight / 2,
  });

  const draggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });

  // Base scale: fit data into viewport
  const baseScaleX = viewportWidth > 0 ? viewportWidth / dataWidth : 1;
  const baseScaleY = viewportHeight > 0 ? viewportHeight / dataHeight : 1;
  const baseScale = Math.min(baseScaleX, baseScaleY);

  // Effective scale
  const scale = baseScale * state.zoom;

  // Translation to center the view at (centerX, centerY)
  const tx = viewportWidth / 2 - state.centerX * scale;
  const ty = viewportHeight / 2 - state.centerY * scale;

  const transform = `translate(${tx}px, ${ty}px) scale(${scale})`;

  // Coordinate mapping
  const pixelToData = useCallback((px: number, py: number) => {
    return {
      scanMm: (px - tx) / scale,
      indexMm: (py - ty) / scale,
    };
  }, [tx, ty, scale]);

  const dataToPixel = useCallback((scanMm: number, indexMm: number) => {
    return {
      px: scanMm * scale + tx,
      py: indexMm * scale + ty,
    };
  }, [tx, ty, scale]);

  // Zoom toward cursor
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;

    setState(prev => {
      const newZoom = Math.max(minZoom, Math.min(maxZoom, prev.zoom * factor));
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Data coordinate under cursor before zoom
      const prevScale = baseScale * prev.zoom;
      const prevTx = viewportWidth / 2 - prev.centerX * prevScale;
      const prevTy = viewportHeight / 2 - prev.centerY * prevScale;
      const dataX = (mouseX - prevTx) / prevScale;
      const dataY = (mouseY - prevTy) / prevScale;

      // Keep the data point under cursor stationary
      const newScale = baseScale * newZoom;
      const centerX = dataX + (viewportWidth / 2 - mouseX) / newScale;
      const centerY = dataY + (viewportHeight / 2 - mouseY) / newScale;

      return { zoom: newZoom, centerX, centerY };
    });
  }, [baseScale, viewportWidth, viewportHeight, minZoom, maxZoom]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // left button only
    draggingRef.current = true;
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingRef.current) return;

    const dx = e.clientX - lastMouseRef.current.x;
    const dy = e.clientY - lastMouseRef.current.y;
    lastMouseRef.current = { x: e.clientX, y: e.clientY };

    setState(prev => {
      const currentScale = baseScale * prev.zoom;
      return {
        ...prev,
        centerX: prev.centerX - dx / currentScale,
        centerY: prev.centerY - dy / currentScale,
      };
    });
  }, [baseScale]);

  const onMouseUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  return {
    transform,
    zoom: state.zoom,
    centerX: state.centerX,
    centerY: state.centerY,
    pixelToData,
    dataToPixel,
    handlers: { onWheel, onMouseDown, onMouseMove, onMouseUp },
  };
}
