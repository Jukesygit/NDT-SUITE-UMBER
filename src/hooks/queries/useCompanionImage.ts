/**
 * useCompanionImage — request coalescing for companion B-scan/A-scan images.
 *
 * Manages one AbortController per image type. When params change (cursor move),
 * the in-flight request is aborted and a new one is sent immediately.
 * Tracks consecutive slow responses (>100ms) for degraded mode detection.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GateSettings } from '../../types/companion';

type ImageType = 'bscan-axial' | 'bscan-index' | 'ascan';

interface UseCompanionImageParams {
  port: number | null;
  type: ImageType;
  folders: string[];
  scanMm: number;
  indexMm: number;
  width?: number;
  height?: number;
  gateSettings?: GateSettings;
  enabled?: boolean;
}

interface UseCompanionImageResult {
  blobUrl: string | null;
  isLoading: boolean;
  degraded: boolean;
}

const SLOW_THRESHOLD_MS = 100;
const CONSECUTIVE_SLOW_FOR_DEGRADED = 3;
const DEGRADED_PROBE_INTERVAL_MS = 30_000;

const ENDPOINT_MAP: Record<ImageType, string> = {
  'bscan-axial': '/bscan-axial',
  'bscan-index': '/bscan-index',
  'ascan': '/ascan',
};

export function useCompanionImage(params: UseCompanionImageParams): UseCompanionImageResult {
  const { port, type, folders, scanMm, indexMm, width, height, gateSettings, enabled = true } = params;

  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [degraded, setDegraded] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const prevBlobRef = useRef<string | null>(null);
  const consecutiveSlowRef = useRef(0);
  const degradedProbeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchImage = useCallback(async () => {
    if (!port || !enabled || folders.length === 0) return;

    // Abort previous in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    const t0 = performance.now();

    try {
      const res = await fetch(`http://localhost:${port}${ENDPOINT_MAP[type]}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folders, scanMm, indexMm, width, height, gateSettings }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`${type}: ${res.status}`);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      // Revoke previous blob URL
      if (prevBlobRef.current) {
        URL.revokeObjectURL(prevBlobRef.current);
      }
      prevBlobRef.current = url;
      setBlobUrl(url);

      // Track latency for degraded mode
      const elapsed = performance.now() - t0;
      if (elapsed > SLOW_THRESHOLD_MS) {
        consecutiveSlowRef.current++;
        if (consecutiveSlowRef.current >= CONSECUTIVE_SLOW_FOR_DEGRADED) {
          setDegraded(true);
        }
      } else {
        consecutiveSlowRef.current = 0;
        if (degraded) setDegraded(false);
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return; // expected
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [port, type, folders, scanMm, indexMm, width, height, gateSettings, enabled, degraded]);

  // Fetch on param change
  useEffect(() => {
    fetchImage();
  }, [fetchImage]);

  // Degraded mode: probe every 30s to re-enable
  useEffect(() => {
    if (degraded) {
      degradedProbeTimerRef.current = setInterval(() => {
        consecutiveSlowRef.current = 0;
        fetchImage();
      }, DEGRADED_PROBE_INTERVAL_MS);
    }
    return () => {
      if (degradedProbeTimerRef.current) {
        clearInterval(degradedProbeTimerRef.current);
        degradedProbeTimerRef.current = null;
      }
    };
  }, [degraded, fetchImage]);

  // Cleanup on unmount: abort + revoke
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (prevBlobRef.current) {
        URL.revokeObjectURL(prevBlobRef.current);
        prevBlobRef.current = null;
      }
    };
  }, []);

  return { blobUrl, isLoading, degraded };
}
