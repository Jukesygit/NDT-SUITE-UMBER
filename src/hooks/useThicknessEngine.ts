/**
 * useThicknessEngine — manages the thickness computation Web Worker.
 *
 * Maintains a persistent thickness buffer that accumulates results:
 * - Gate changes → recompute entire grid (full reset)
 * - Viewport changes → only compute newly visible NaN regions (expand)
 *
 * The envelope is NOT transferred (it's needed for subsequent calls).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface GatePosition {
  startUs: number;
  endUs: number;
  thresholdPct: number;
}

interface UseThicknessEngineParams {
  envelope: Uint8Array | null;
  width: number;
  height: number;
  envelopeSamples: number;
  timeStartUs: number;
  timeEndUs: number;
  velocity: number;
  refGate: GatePosition | null;
  measGate: GatePosition | null;
  visibleRegion?: { x0: number; y0: number; x1: number; y1: number };
}

interface UseThicknessEngineResult {
  thickness: Float32Array | null;
  isComputing: boolean;
  computeMs: number;
  computedCount: number;
}

export function useThicknessEngine(
  params: UseThicknessEngineParams,
): UseThicknessEngineResult {
  const workerRef = useRef<Worker | null>(null);
  const idRef = useRef(0);
  const latestIdRef = useRef(0);
  const [thickness, setThickness] = useState<Float32Array | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const [computeMs, setComputeMs] = useState(0);
  const [computedCount, setComputedCount] = useState(0);

  // Persistent accumulated thickness buffer — survives across worker responses
  const accumulatedRef = useRef<Float32Array | null>(null);

  // Track which gates produced the accumulated buffer
  const accGatesRef = useRef<{ ref: GatePosition; meas: GatePosition } | null>(null);

  const getWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL('../workers/thickness-engine.worker.ts', import.meta.url),
        { type: 'module' },
      );
      workerRef.current.onmessage = (e: MessageEvent) => {
        const { id, thickness: result, computeMs: ms, computedCount: count } = e.data;
        if (id !== latestIdRef.current) return; // stale

        // Merge worker result into accumulated buffer
        if (accumulatedRef.current && result) {
          const acc = accumulatedRef.current;
          for (let i = 0; i < result.length; i++) {
            if (!isNaN(result[i])) {
              acc[i] = result[i];
            }
          }
          // Return a copy so React sees a new reference
          setThickness(new Float32Array(acc));
        } else if (result) {
          accumulatedRef.current = new Float32Array(result);
          setThickness(new Float32Array(result));
        }

        setIsComputing(false);
        setComputeMs(ms);
        setComputedCount(count);
      };
    }
    return workerRef.current;
  }, []);

  // Track gate values as serialized strings for comparison
  const gateKeyRef = useRef('');

  // Dispatch computation on gate changes
  useEffect(() => {
    const { envelope, width, height, envelopeSamples, timeStartUs, timeEndUs, velocity, refGate, measGate, visibleRegion } = params;

    if (!envelope || !refGate || !measGate || width <= 0 || height <= 0) {
      setThickness(null);
      accumulatedRef.current = null;
      accGatesRef.current = null;
      gateKeyRef.current = '';
      return;
    }

    const newGateKey = `${refGate.startUs},${refGate.endUs},${refGate.thresholdPct},${measGate.startUs},${measGate.endUs},${measGate.thresholdPct}`;
    const gatesChanged = newGateKey !== gateKeyRef.current;
    gateKeyRef.current = newGateKey;

    if (gatesChanged) {
      // Full reset — clear accumulated buffer, compute entire grid
      accumulatedRef.current = new Float32Array(width * height).fill(NaN);
      accGatesRef.current = { ref: { ...refGate }, meas: { ...measGate } };
    }

    const worker = getWorker();
    const id = ++idRef.current;
    latestIdRef.current = id;
    setIsComputing(true);

    // On gate change: compute visible region first (fast), then queue full grid
    worker.postMessage({
      id,
      envelope,
      width,
      height,
      envelopeSamples,
      timeStartUs,
      timeEndUs,
      velocity,
      refGate,
      measGate,
      visibleRegion: gatesChanged ? visibleRegion : visibleRegion,
    });

    // Queue full-grid fill after the visible region renders
    if (gatesChanged && visibleRegion) {
      const fullId = ++idRef.current;
      latestIdRef.current = fullId;
      setTimeout(() => {
        if (latestIdRef.current !== fullId) return; // newer request superseded
        worker.postMessage({
          id: fullId,
          envelope, width, height, envelopeSamples, timeStartUs, timeEndUs, velocity,
          refGate, measGate,
          // no visibleRegion = full grid
        });
      }, 16); // one frame delay
    }
  // Gate changes trigger recomputation. visibleRegion intentionally excluded —
  // viewport panning is handled by the separate expand effect below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    params.envelope, params.width, params.height, params.envelopeSamples,
    params.timeStartUs, params.timeEndUs, params.velocity,
    params.refGate, params.measGate,
    getWorker,
  ]);

  // Expand computation when viewport changes (fill in newly visible NaN regions)
  const expandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const { envelope, width, height, envelopeSamples, timeStartUs, timeEndUs, velocity, visibleRegion } = params;
    const gates = accGatesRef.current;

    // Only expand if we have an accumulated buffer and gates haven't changed
    if (!envelope || !gates || !visibleRegion || !accumulatedRef.current || width <= 0 || height <= 0) return;

    // Check if visible region has NaN points that need computing
    const acc = accumulatedRef.current;
    const x0 = Math.max(0, Math.floor(visibleRegion.x0));
    const y0 = Math.max(0, Math.floor(visibleRegion.y0));
    const x1 = Math.min(width, Math.ceil(visibleRegion.x1));
    const y1 = Math.min(height, Math.ceil(visibleRegion.y1));

    let hasNaN = false;
    outer: for (let row = y0; row < y1; row += 10) { // sample every 10th row for speed
      for (let col = x0; col < x1; col += 10) {
        if (isNaN(acc[row * width + col])) {
          hasNaN = true;
          break outer;
        }
      }
    }

    if (!hasNaN) return; // visible region already computed

    // Debounce expand requests (don't fire during rapid panning)
    if (expandTimerRef.current) clearTimeout(expandTimerRef.current);
    expandTimerRef.current = setTimeout(() => {
      expandTimerRef.current = null;
      const worker = getWorker();
      const id = ++idRef.current;
      latestIdRef.current = id;
      setIsComputing(true);

      worker.postMessage({
        id,
        envelope,
        width,
        height,
        envelopeSamples,
        timeStartUs,
        timeEndUs,
        velocity,
        refGate: gates.ref,
        measGate: gates.meas,
        visibleRegion,
      });
    }, 100); // 100ms debounce for panning

    return () => {
      if (expandTimerRef.current) {
        clearTimeout(expandTimerRef.current);
        expandTimerRef.current = null;
      }
    };
  }, [params.envelope, params.width, params.height, params.envelopeSamples,
      params.timeStartUs, params.timeEndUs, params.velocity,
      params.visibleRegion, getWorker]);

  // Terminate worker on unmount
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  return { thickness, isComputing, computeMs, computedCount };
}
