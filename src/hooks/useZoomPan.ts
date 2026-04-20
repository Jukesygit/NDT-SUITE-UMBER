/**
 * useZoomPan — manages zoom/pan state for the heatmap canvas.
 *
 * Transform is computed from absolute state (zoom, centerX, centerY),
 * not accumulated — prevents floating-point drift.
 * CSS transforms are GPU-composited — zero JS cost per frame.
 *
 * The wheel handler is attached as a native DOM listener with
 * { passive: false } so preventDefault() works without console warnings.
 * Use the returned `wheelRef` callback ref on the container element.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

interface ZoomPanState {
  zoom: number;
  centerX: number; // data coordinate at viewport center
  centerY: number;
}

interface UseZoomPanParams {
  dataWidth: number;   // total data width in data units
  dataHeight: number;  // total data height in data units
  viewportWidth: number;
  viewportHeight: number;
  /** How the initial view fits the data into the viewport.
   *  - 'contain': fit the entire dataset (default)
   *  - 'width':   fill the viewport width, clip/pan vertically */
  fitMode?: 'contain' | 'width';
  minZoom?: number;
  maxZoom?: number;
}

interface UseZoomPanResult {
  transform: string;
  zoom: number;
  centerX: number;
  centerY: number;
  /** Attach to the container element to capture wheel events with { passive: false }. */
  wheelRef: (el: HTMLElement | null) => void;
  pixelToData: (px: number, py: number) => { dataX: number; dataY: number };
  dataToPixel: (dataX: number, dataY: number) => { px: number; py: number };
  handlers: {
    onMouseDown: (e: React.MouseEvent) => void;
    onMouseMove: (e: React.MouseEvent) => void;
    onMouseUp: () => void;
  };
}

export function useZoomPan(params: UseZoomPanParams): UseZoomPanResult {
  const {
    dataWidth, dataHeight, viewportWidth, viewportHeight,
    fitMode = 'contain', minZoom = 0.5, maxZoom = 20,
  } = params;

  // Base scale: fit data into viewport (contain)
  const baseScaleX = viewportWidth > 0 ? viewportWidth / dataWidth : 1;
  const baseScaleY = viewportHeight > 0 ? viewportHeight / dataHeight : 1;
  const baseScale = Math.min(baseScaleX, baseScaleY);

  // Initial zoom depends on fitMode
  const initialZoom = fitMode === 'width' && baseScale > 0
    ? baseScaleX / baseScale
    : 1;

  const [state, setState] = useState<ZoomPanState>(() => ({
    zoom: initialZoom,
    centerX: dataWidth / 2,
    centerY: dataHeight / 2,
  }));

  const draggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });

  // Stable refs for values used in the native wheel handler
  const baseScaleRef = useRef(baseScale);
  baseScaleRef.current = baseScale;
  const vpRef = useRef({ w: viewportWidth, h: viewportHeight });
  vpRef.current = { w: viewportWidth, h: viewportHeight };
  const limitsRef = useRef({ min: minZoom, max: maxZoom });
  limitsRef.current = { min: minZoom, max: maxZoom };

  // ---- Native wheel listener (passive: false) ----
  const wheelElRef = useRef<HTMLElement | null>(null);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;

    const target = e.currentTarget as HTMLElement | null;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const bs = baseScaleRef.current;
    const vw = vpRef.current.w;
    const vh = vpRef.current.h;
    const { min, max } = limitsRef.current;

    setState(prev => {
      const newZoom = Math.max(min, Math.min(max, prev.zoom * factor));
      const prevScale = bs * prev.zoom;
      const prevTx = vw / 2 - prev.centerX * prevScale;
      const prevTy = vh / 2 - prev.centerY * prevScale;
      const dataX = (mouseX - prevTx) / prevScale;
      const dataY = (mouseY - prevTy) / prevScale;
      const newScale = bs * newZoom;
      const centerX = dataX + (vw / 2 - mouseX) / newScale;
      const centerY = dataY + (vh / 2 - mouseY) / newScale;
      return { zoom: newZoom, centerX, centerY };
    });
  }, []);

  const wheelRef = useCallback((el: HTMLElement | null) => {
    if (wheelElRef.current) {
      wheelElRef.current.removeEventListener('wheel', handleWheel);
    }
    wheelElRef.current = el;
    if (el) {
      el.addEventListener('wheel', handleWheel, { passive: false });
    }
  }, [handleWheel]);

  useEffect(() => {
    return () => {
      if (wheelElRef.current) {
        wheelElRef.current.removeEventListener('wheel', handleWheel);
      }
    };
  }, [handleWheel]);

  // Effective scale
  const scale = baseScale * state.zoom;

  // Translation to center the view at (centerX, centerY)
  const tx = viewportWidth / 2 - state.centerX * scale;
  const ty = viewportHeight / 2 - state.centerY * scale;

  const transform = `translate(${tx}px, ${ty}px) scale(${scale})`;

  // Coordinate mapping
  const pixelToData = useCallback((px: number, py: number) => {
    return {
      dataX: (px - tx) / scale,
      dataY: (py - ty) / scale,
    };
  }, [tx, ty, scale]);

  const dataToPixel = useCallback((dataX: number, dataY: number) => {
    return {
      px: dataX * scale + tx,
      py: dataY * scale + ty,
    };
  }, [tx, ty, scale]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
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
    wheelRef,
    pixelToData,
    dataToPixel,
    handlers: { onMouseDown, onMouseMove, onMouseUp },
  };
}
