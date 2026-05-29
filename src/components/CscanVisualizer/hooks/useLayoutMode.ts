import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { CscanData } from '../types';

export interface ScanPosition {
  x: number;
  y: number;
}

export interface Camera {
  panX: number;
  panY: number;
  zoom: number;
}

export interface ScanExtents {
  width: number;
  height: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface UseLayoutModeResult {
  scanPositions: Map<string, ScanPosition>;
  zOrder: string[];
  camera: Camera;
  scanExtentsMap: Map<string, ScanExtents>;
  setScanPosition: (id: string, pos: ScanPosition) => void;
  bringToFront: (id: string) => void;
  setCamera: (camera: Camera) => void;
  resetPositions: () => void;
}

function computeInitialPositions(scans: CscanData[]): Map<string, ScanPosition> {
  const map = new Map<string, ScanPosition>();
  for (const scan of scans) {
    map.set(scan.id, {
      x: Math.min(...scan.xAxis),
      y: Math.min(...scan.yAxis),
    });
  }
  return map;
}

function computeScanExtents(scan: CscanData): ScanExtents {
  const minX = Math.min(...scan.xAxis);
  const maxX = Math.max(...scan.xAxis);
  const minY = Math.min(...scan.yAxis);
  const maxY = Math.max(...scan.yAxis);
  return { width: maxX - minX, height: maxY - minY, minX, maxX, minY, maxY };
}

function computeInitialCamera(scans: CscanData[]): Camera {
  if (scans.length === 0) return { panX: 0, panY: 0, zoom: 1 };
  let gMinX = Infinity,
    gMaxX = -Infinity,
    gMinY = Infinity,
    gMaxY = -Infinity;
  for (const scan of scans) {
    const minX = Math.min(...scan.xAxis);
    const maxX = Math.max(...scan.xAxis);
    const minY = Math.min(...scan.yAxis);
    const maxY = Math.max(...scan.yAxis);
    if (minX < gMinX) gMinX = minX;
    if (maxX > gMaxX) gMaxX = maxX;
    if (minY < gMinY) gMinY = minY;
    if (maxY > gMaxY) gMaxY = maxY;
  }
  return {
    panX: (gMinX + gMaxX) / 2,
    panY: (gMinY + gMaxY) / 2,
    zoom: 1,
  };
}

export function useLayoutMode(scans: CscanData[]): UseLayoutModeResult {
  const initialPositions = useMemo(() => computeInitialPositions(scans), [scans]);
  const [scanPositions, setScanPositions] = useState(() => computeInitialPositions(scans));
  const [zOrder, setZOrder] = useState(() => scans.map((s) => s.id));
  const [camera, setCamera] = useState(() => computeInitialCamera(scans));

  // Re-sync state when the scan list changes (useState initializers only run once)
  const prevScansRef = useRef(scans);
  useEffect(() => {
    if (prevScansRef.current !== scans) {
      prevScansRef.current = scans;
      setScanPositions(computeInitialPositions(scans));
      setZOrder(scans.map((s) => s.id));
      setCamera(computeInitialCamera(scans));
    }
  }, [scans]);

  const scanExtentsMap = useMemo(() => {
    const map = new Map<string, ScanExtents>();
    for (const scan of scans) {
      map.set(scan.id, computeScanExtents(scan));
    }
    return map;
  }, [scans]);

  const setScanPosition = useCallback((id: string, pos: ScanPosition) => {
    setScanPositions((prev) => {
      const next = new Map(prev);
      next.set(id, pos);
      return next;
    });
  }, []);

  const bringToFront = useCallback((id: string) => {
    setZOrder((prev) => {
      const filtered = prev.filter((x) => x !== id);
      return [...filtered, id];
    });
  }, []);

  const resetPositions = useCallback(() => {
    setScanPositions(new Map(initialPositions));
  }, [initialPositions]);

  return {
    scanPositions,
    zOrder,
    camera,
    scanExtentsMap,
    setScanPosition,
    bringToFront,
    setCamera,
    resetPositions,
  };
}
