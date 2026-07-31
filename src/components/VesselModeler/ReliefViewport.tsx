import { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import type { CscanData } from '../CscanVisualizer/types';
import type { SurfaceOptions, MeasurementPoint, MeasurementState } from '../TopologyViewer/types';
import { TopologySceneManager } from '../TopologyViewer/engine/topology-scene';
import {
  buildTopologySurface,
  buildPlateBody,
  clampDisplayDisplacement,
} from '../TopologyViewer/engine/topology-surface';
import { findNearestIndex, toNDC, resolveGridFromHit } from '../TopologyViewer/engine/topology-raycast';

export interface ReliefHoverInfo {
  thickness: number | null;
  scanMm: number;
  indexMm: number;
  screenX: number;
  screenY: number;
}

interface ReliefViewportProps {
  cscan: CscanData;
  surfaceOptions: SurfaceOptions;
  activeTool: 'orbit' | 'measure';
  nominal: number;
  measurement: MeasurementState;
  onMeasurementPoint: (point: MeasurementPoint) => void;
  onHover: (info: ReliefHoverInfo | null) => void;
}

/**
 * Imperative Three.js canvas for the relief view. Builds the elevation surface
 * with the shared TopologyViewer engine and handles hover / measure raycasting
 * against the full-resolution grid. Disposes every scene resource on unmount.
 */
export default function ReliefViewport({
  cscan,
  surfaceOptions,
  activeTool,
  nominal,
  measurement,
  onMeasurementPoint,
  onHover,
}: ReliefViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<TopologySceneManager | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const measureSpheresRef = useRef<THREE.Mesh[]>([]);
  const measureLineRef = useRef<THREE.Line | null>(null);
  const [isRebuilding, setIsRebuilding] = useState(true);

  // Latest-value refs so the once-attached DOM handlers avoid stale closures.
  const cscanRef = useRef(cscan);
  cscanRef.current = cscan;
  const toolRef = useRef(activeTool);
  toolRef.current = activeTool;
  const onHoverRef = useRef(onHover);
  onHoverRef.current = onHover;
  const onMeasureRef = useRef(onMeasurementPoint);
  onMeasureRef.current = onMeasurementPoint;

  const clearMeasureVisuals = useCallback(() => {
    const scene = sceneRef.current?.getScene();
    if (!scene) return;
    for (const s of measureSpheresRef.current) {
      scene.remove(s);
      s.geometry.dispose();
      (s.material as THREE.Material).dispose();
    }
    measureSpheresRef.current = [];
    if (measureLineRef.current) {
      scene.remove(measureLineRef.current);
      measureLineRef.current.geometry.dispose();
      (measureLineRef.current.material as THREE.Material).dispose();
      measureLineRef.current = null;
    }
  }, []);

  const raycastSurface = useCallback((clientX: number, clientY: number): THREE.Intersection | null => {
    const mgr = sceneRef.current;
    const mesh = mgr?.getSurfaceMesh();
    if (!mgr || !mesh) return null;
    const mat = mesh.material as THREE.Material;
    const prevSide = mat.side;
    mat.side = THREE.DoubleSide;
    const rect = mgr.getRenderer().domElement.getBoundingClientRect();
    raycasterRef.current.setFromCamera(toNDC(clientX, clientY, rect), mgr.getCamera());
    const hits = raycasterRef.current.intersectObject(mesh);
    mat.side = prevSide;
    return hits.length > 0 ? hits[0] : null;
  }, []);

  // --- Init / dispose the scene ---
  useEffect(() => {
    if (!containerRef.current) return;
    const manager = new TopologySceneManager(containerRef.current);
    manager.init();
    sceneRef.current = manager;
    return () => {
      clearMeasureVisuals();
      manager.dispose();
      sceneRef.current = null;
    };
  }, [clearMeasureVisuals]);

  // --- Rebuild the relief surface when data or processing options change ---
  useEffect(() => {
    const mgr = sceneRef.current;
    if (!mgr || !cscan.stats) return;
    setIsRebuilding(true);
    const timer = setTimeout(() => {
      try {
        const geometry = buildTopologySurface(cscan, surfaceOptions);
        mgr.setSurfaceGeometry(geometry);
        const pos = geometry.getAttribute('position');
        let minY = 0;
        for (let i = 0; i < pos.count; i++) {
          const y = pos.getY(i);
          if (y < minY) minY = y;
        }
        mgr.setPlateGeometry(buildPlateBody(geometry, minY));
      } catch {
        // Tiny grids can fail to triangulate; keep the previous surface.
      }
      clearMeasureVisuals();
      setIsRebuilding(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [cscan, surfaceOptions, clearMeasureVisuals]);

  // --- Tool → cursor ---
  useEffect(() => {
    const mgr = sceneRef.current;
    if (!mgr) return;
    mgr.getRenderer().domElement.style.cursor = activeTool === 'measure' ? 'crosshair' : 'grab';
  }, [activeTool]);

  // --- Draw measurement markers when the measurement changes ---
  useEffect(() => {
    const mgr = sceneRef.current;
    if (!mgr) return;
    const scene = mgr.getScene();
    clearMeasureVisuals();

    const points = [measurement.pointA, measurement.pointB].filter(
      (p): p is MeasurementPoint => p != null,
    );
    const positions: THREE.Vector3[] = [];
    for (const pt of points) {
      const col = findNearestIndex(cscan.xAxis, pt.scanMm);
      const row = findNearestIndex(cscan.yAxis, pt.indexMm);
      const y = clampDisplayDisplacement(
        cscan.data[row]?.[col] ?? null,
        nominal,
        surfaceOptions.exaggeration,
        surfaceOptions.displacementClampUpper,
      );
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(2, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0x00ff88 }),
      );
      sphere.position.set(cscan.xAxis[col], y, cscan.yAxis[row]);
      scene.add(sphere);
      measureSpheresRef.current.push(sphere);
      positions.push(sphere.position.clone());
    }
    if (positions.length === 2) {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(positions),
        new THREE.LineDashedMaterial({ color: 0x00ff88, dashSize: 4, gapSize: 2 }),
      );
      line.computeLineDistances();
      scene.add(line);
      measureLineRef.current = line;
    }
    mgr.requestRender();
  }, [
    measurement,
    cscan,
    nominal,
    surfaceOptions.exaggeration,
    surfaceOptions.displacementClampUpper,
    clearMeasureVisuals,
  ]);

  // --- Mouse handlers (attached once, read latest via refs) ---
  useEffect(() => {
    const mgr = sceneRef.current;
    if (!mgr) return;
    const canvas = mgr.getRenderer().domElement;

    const resolve = (e: MouseEvent) => {
      const cs = cscanRef.current;
      const hit = raycastSurface(e.clientX, e.clientY);
      if (!hit) return null;
      const flatCol = findNearestIndex(cs.xAxis, hit.point.x);
      const flatRow = findNearestIndex(cs.yAxis, hit.point.z);
      const { gridRow, gridCol } = resolveGridFromHit(hit, cs, flatCol, flatRow);
      return {
        scanMm: cs.xAxis[gridCol],
        indexMm: cs.yAxis[gridRow],
        thickness: cs.data[gridRow]?.[gridCol] ?? null,
      };
    };

    const handleMove = (e: MouseEvent) => {
      const r = resolve(e);
      onHoverRef.current(r ? { ...r, screenX: e.clientX, screenY: e.clientY } : null);
    };
    const handleLeave = () => onHoverRef.current(null);
    const handleClick = (e: MouseEvent) => {
      if (toolRef.current !== 'measure') return;
      const r = resolve(e);
      if (r) onMeasureRef.current(r);
    };

    canvas.addEventListener('mousemove', handleMove);
    canvas.addEventListener('mouseleave', handleLeave);
    canvas.addEventListener('click', handleClick);
    return () => {
      canvas.removeEventListener('mousemove', handleMove);
      canvas.removeEventListener('mouseleave', handleLeave);
      canvas.removeEventListener('click', handleClick);
    };
  }, [raycastSurface]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      {isRebuilding && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(255,255,255,0.6)',
            fontSize: '0.8rem',
            pointerEvents: 'none',
          }}
        >
          Building relief surface&hellip;
        </div>
      )}
    </div>
  );
}
