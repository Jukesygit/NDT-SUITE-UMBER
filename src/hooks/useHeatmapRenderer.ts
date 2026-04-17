/**
 * useHeatmapRenderer — manages the singleton heatmap Web Worker.
 *
 * Sends render requests with incrementing IDs and discards stale results.
 * The worker is created on first call and terminated on cleanup.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

interface RenderParams {
  matrix: Float32Array;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  colormap: string;
  reverseColormap?: boolean;
  rangeMin?: number;
  rangeMax?: number;
  visibleRegion?: { x0: number; y0: number; x1: number; y1: number };
}

interface UseHeatmapRendererResult {
  requestRender: (params: RenderParams) => void;
  imageData: ImageData | null;
  isRendering: boolean;
}

export function useHeatmapRenderer(): UseHeatmapRendererResult {
  const workerRef = useRef<Worker | null>(null);
  const idRef = useRef(0);
  const latestIdRef = useRef(0);
  const [imageData, setImageData] = useState<ImageData | null>(null);
  const [isRendering, setIsRendering] = useState(false);

  // Create worker lazily
  const getWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL('../workers/heatmap-renderer.worker.ts', import.meta.url),
        { type: 'module' },
      );
      workerRef.current.onmessage = (e: MessageEvent<{ id: number; imageData: ImageData }>) => {
        const { id, imageData: result } = e.data;
        // Discard stale results
        if (id === latestIdRef.current) {
          setImageData(result);
          setIsRendering(false);
        }
      };
    }
    return workerRef.current;
  }, []);

  const requestRender = useCallback((params: RenderParams) => {
    const worker = getWorker();
    const id = ++idRef.current;
    latestIdRef.current = id;
    setIsRendering(true);

    // Transfer the matrix buffer to the worker (zero-copy)
    // We need to create a copy since the source may be a subarray view
    const matrixCopy = new Float32Array(params.matrix);

    worker.postMessage(
      {
        id,
        matrix: matrixCopy,
        width: params.width,
        height: params.height,
        viewportWidth: params.viewportWidth,
        viewportHeight: params.viewportHeight,
        colormap: params.colormap,
        reverseColormap: params.reverseColormap,
        rangeMin: params.rangeMin,
        rangeMax: params.rangeMax,
        visibleRegion: params.visibleRegion,
      },
      [matrixCopy.buffer],
    );
  }, [getWorker]);

  // Terminate worker on unmount
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  return { requestRender, imageData, isRendering };
}
