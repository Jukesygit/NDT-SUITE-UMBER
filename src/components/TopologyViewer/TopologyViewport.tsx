import { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import type { CscanData } from '../CscanVisualizer/types';
import type {
  SurfaceOptions,
  TopologyTool,
  HoverInfo,
  CrossSectionData,
  MeasurementPoint,
  MeasurementState,
} from './types';
import { TopologySceneManager } from './engine/topology-scene';
import { buildTopologySurface, buildPlateBody, clampDisplayDisplacement } from './engine/topology-surface';
import { extractCrossSection } from './engine/topology-cross-section';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Find the index in `axis` whose value is nearest to `value`. */
function findNearestIndex(axis: number[], value: number): number {
  let best = 0;
  let bestDist = Math.abs(axis[0] - value);
  for (let i = 1; i < axis.length; i++) {
    const d = Math.abs(axis[i] - value);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/** Normalize a pixel position relative to a canvas rect to [-1, 1] NDC. */
function toNDC(clientX: number, clientY: number, rect: DOMRect): THREE.Vector2 {
  return new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TopologyViewportProps {
  cscanData: CscanData | null;
  surfaceOptions: SurfaceOptions;
  activeTool: TopologyTool;
  isDecimated: boolean;
  onHover: (info: HoverInfo | null) => void;
  onCrossSection: (data: CrossSectionData) => void;
  onMeasurementPoint: (point: MeasurementPoint) => void;
  measurementState: MeasurementState | null;
  nominalThickness: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TopologyViewport({
  cscanData,
  surfaceOptions,
  activeTool,
  isDecimated: _isDecimated,
  onHover,
  onCrossSection,
  onMeasurementPoint,
  measurementState,
  nominalThickness,
}: TopologyViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneManagerRef = useRef<TopologySceneManager | null>(null);

  // Persistent raycaster + mouse vector (avoid per-frame allocation)
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());

  // Helper Three.js objects for cross-section line & measurement markers
  const crossSectionLineRef = useRef<THREE.Line | null>(null);
  const measureSpheresRef = useRef<THREE.Mesh[]>([]);
  const measureLineRef = useRef<THREE.Line | null>(null);

  // Cross-section drag state
  const crossDragRef = useRef<{
    startScanMm: number;
    startIndexMm: number;
    dragging: boolean;
  } | null>(null);

  // Refs to latest prop values so event handlers avoid stale closures
  const cscanDataRef = useRef(cscanData);
  cscanDataRef.current = cscanData;
  const activeToolRef = useRef(activeTool);
  activeToolRef.current = activeTool;
  const onHoverRef = useRef(onHover);
  onHoverRef.current = onHover;
  const onCrossSectionRef = useRef(onCrossSection);
  onCrossSectionRef.current = onCrossSection;
  const onMeasurementPointRef = useRef(onMeasurementPoint);
  onMeasurementPointRef.current = onMeasurementPoint;

  // ------------------------------------------------------------------
  // Cleanup helper: remove all helper visuals from the scene
  // ------------------------------------------------------------------
  const clearHelperObjects = useCallback(() => {
    const scene = sceneManagerRef.current?.getScene();
    if (!scene) return;

    if (crossSectionLineRef.current) {
      scene.remove(crossSectionLineRef.current);
      crossSectionLineRef.current.geometry.dispose();
      (crossSectionLineRef.current.material as THREE.Material).dispose();
      crossSectionLineRef.current = null;
    }

    for (const sphere of measureSpheresRef.current) {
      scene.remove(sphere);
      sphere.geometry.dispose();
      (sphere.material as THREE.Material).dispose();
    }
    measureSpheresRef.current = [];

    if (measureLineRef.current) {
      scene.remove(measureLineRef.current);
      measureLineRef.current.geometry.dispose();
      (measureLineRef.current.material as THREE.Material).dispose();
      measureLineRef.current = null;
    }
  }, []);

  // ------------------------------------------------------------------
  // Raycast the surface mesh under the cursor, returning XZ world coords
  // ------------------------------------------------------------------
  const raycastSurface = useCallback(
    (clientX: number, clientY: number): THREE.Vector3 | null => {
      const mgr = sceneManagerRef.current;
      if (!mgr) return null;
      const mesh = mgr.getSurfaceMesh();
      if (!mesh) return null;

      const canvas = mgr.getRenderer().domElement;
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = toNDC(clientX, clientY, rect);
      raycasterRef.current.setFromCamera(mouseRef.current, mgr.getCamera());

      const hits = raycasterRef.current.intersectObject(mesh);
      return hits.length > 0 ? hits[0].point : null;
    },
    [],
  );

  // ------------------------------------------------------------------
  // Init / dispose the scene manager
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current) return;

    const manager = new TopologySceneManager(containerRef.current);
    manager.init();
    sceneManagerRef.current = manager;

    return () => {
      clearHelperObjects();
      manager.dispose();
      sceneManagerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------------
  // Rebuild surface geometry when data or options change
  // ------------------------------------------------------------------
  useEffect(() => {
    const mgr = sceneManagerRef.current;
    if (!mgr || !cscanData || !cscanData.stats) return;

    try {
      const geometry = buildTopologySurface(cscanData, surfaceOptions);
      mgr.setSurfaceGeometry(geometry);

      const pos = geometry.getAttribute('position');
      let minY = 0;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        if (y < minY) minY = y;
      }
      const plate = buildPlateBody(geometry, minY);
      mgr.setPlateGeometry(plate);
    } catch {
      // Surface build may fail for tiny grids; silently ignore
    }

    // Clear helper visuals when data changes — they reference old geometry
    clearHelperObjects();
  }, [cscanData, surfaceOptions, clearHelperObjects]);

  // ------------------------------------------------------------------
  // Tool change: update controls enabled + cursor
  // ------------------------------------------------------------------
  useEffect(() => {
    const mgr = sceneManagerRef.current;
    if (!mgr) return;

    const controls = mgr.getControls();
    const canvas = mgr.getRenderer().domElement;

    if (activeTool === 'orbit') {
      controls.enabled = true;
      canvas.style.cursor = 'grab';
    } else if (activeTool === 'crossSection') {
      controls.enabled = true; // Disabled only during active drag
      canvas.style.cursor = 'crosshair';
    } else if (activeTool === 'measure') {
      controls.enabled = true;
      canvas.style.cursor = 'crosshair';
    }

    // Reset drag state when tool changes away from crossSection
    if (activeTool !== 'crossSection') {
      crossDragRef.current = null;
    }
  }, [activeTool]);

  // ------------------------------------------------------------------
  // Draw measurement markers when measurementState changes
  // ------------------------------------------------------------------
  useEffect(() => {
    const mgr = sceneManagerRef.current;
    const cs = cscanDataRef.current;
    if (!mgr || !cs) return;
    const scene = mgr.getScene();

    // Clear previous measurement visuals
    for (const sphere of measureSpheresRef.current) {
      scene.remove(sphere);
      sphere.geometry.dispose();
      (sphere.material as THREE.Material).dispose();
    }
    measureSpheresRef.current = [];

    if (measureLineRef.current) {
      scene.remove(measureLineRef.current);
      measureLineRef.current.geometry.dispose();
      (measureLineRef.current.material as THREE.Material).dispose();
      measureLineRef.current = null;
    }

    if (!measurementState) return;

    const { pointA, pointB } = measurementState;
    const sphereGeo = new THREE.SphereGeometry(2, 16, 16);
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });

    const addSphere = (pt: MeasurementPoint) => {
      const colIdx = findNearestIndex(cs.xAxis, pt.scanMm);
      const rowIdx = findNearestIndex(cs.yAxis, pt.indexMm);
      const value = cs.data[rowIdx]?.[colIdx];
      const y = clampDisplayDisplacement(
        value ?? null,
        nominalThickness,
        surfaceOptions.exaggeration,
        surfaceOptions.displacementClampUpper,
      );
      const sphere = new THREE.Mesh(sphereGeo.clone(), sphereMat.clone());
      sphere.position.set(cs.xAxis[colIdx], y, cs.yAxis[rowIdx]);
      scene.add(sphere);
      measureSpheresRef.current.push(sphere);
      return sphere.position.clone();
    };

    const positions: THREE.Vector3[] = [];
    if (pointA) positions.push(addSphere(pointA));
    if (pointB) positions.push(addSphere(pointB));

    // Dashed line between two points
    if (positions.length === 2) {
      const lineGeo = new THREE.BufferGeometry().setFromPoints(positions);
      const lineMat = new THREE.LineDashedMaterial({
        color: 0x00ff00,
        dashSize: 4,
        gapSize: 2,
      });
      const line = new THREE.Line(lineGeo, lineMat);
      line.computeLineDistances();
      scene.add(line);
      measureLineRef.current = line;
    }
  }, [measurementState, nominalThickness, surfaceOptions.exaggeration]);

  // ------------------------------------------------------------------
  // Mouse event handlers — attached once, read refs for current values
  // ------------------------------------------------------------------
  useEffect(() => {
    const mgr = sceneManagerRef.current;
    if (!mgr) return;
    const canvas = mgr.getRenderer().domElement;

    // ----- Hover (orbit tool) -----
    const handleMouseMove = (e: MouseEvent) => {
      const cs = cscanDataRef.current;
      if (!cs) return;
      if (activeToolRef.current !== 'orbit') return;

      const point = raycastSurface(e.clientX, e.clientY);
      if (!point) {
        onHoverRef.current(null);
        return;
      }

      // Map raycast XZ back to full-res grid indices
      const col = findNearestIndex(cs.xAxis, point.x);
      const row = findNearestIndex(cs.yAxis, point.z);
      const thickness = cs.data[row]?.[col] ?? null;

      onHoverRef.current({
        thickness,
        scanMm: cs.xAxis[col],
        indexMm: cs.yAxis[row],
        screenX: e.clientX,
        screenY: e.clientY,
        row,
        col,
      });
    };

    const handleMouseLeave = () => {
      onHoverRef.current(null);
    };

    // ----- Cross-section (mousedown → mouseup) -----
    const handleMouseDown = (e: MouseEvent) => {
      if (activeToolRef.current !== 'crossSection') return;
      const cs = cscanDataRef.current;
      if (!cs) return;

      const point = raycastSurface(e.clientX, e.clientY);
      if (!point) return;

      crossDragRef.current = {
        startScanMm: point.x,
        startIndexMm: point.z,
        dragging: true,
      };

      // Disable orbit controls during cross-section drag
      mgr.getControls().enabled = false;
    };

    const handleMouseUp = (e: MouseEvent) => {
      const drag = crossDragRef.current;
      if (!drag?.dragging) return;
      if (activeToolRef.current !== 'crossSection') {
        crossDragRef.current = null;
        return;
      }

      const cs = cscanDataRef.current;
      if (!cs) {
        crossDragRef.current = null;
        mgr.getControls().enabled = true;
        return;
      }

      const point = raycastSurface(e.clientX, e.clientY);
      crossDragRef.current = null;
      mgr.getControls().enabled = true;

      if (!point) return;

      const endScanMm = point.x;
      const endIndexMm = point.z;

      // Extract cross-section from FULL-RES data
      const csData = extractCrossSection(
        cs,
        drag.startScanMm,
        drag.startIndexMm,
        endScanMm,
        endIndexMm,
      );
      onCrossSectionRef.current(csData);

      // Draw cross-section line on the surface
      const scene = mgr.getScene();
      if (crossSectionLineRef.current) {
        scene.remove(crossSectionLineRef.current);
        crossSectionLineRef.current.geometry.dispose();
        (crossSectionLineRef.current.material as THREE.Material).dispose();
        crossSectionLineRef.current = null;
      }

      const linePoints = [
        new THREE.Vector3(drag.startScanMm, 0.5, drag.startIndexMm),
        new THREE.Vector3(endScanMm, 0.5, endIndexMm),
      ];
      const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
      const lineMat = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 2 });
      const line = new THREE.Line(lineGeo, lineMat);
      scene.add(line);
      crossSectionLineRef.current = line;
    };

    // ----- Measurement (click) -----
    const handleClick = (e: MouseEvent) => {
      if (activeToolRef.current !== 'measure') return;
      const cs = cscanDataRef.current;
      if (!cs) return;

      const point = raycastSurface(e.clientX, e.clientY);
      if (!point) return;

      // Map to full-res grid
      const col = findNearestIndex(cs.xAxis, point.x);
      const row = findNearestIndex(cs.yAxis, point.z);
      const thickness = cs.data[row]?.[col] ?? null;

      onMeasurementPointRef.current({
        scanMm: cs.xAxis[col],
        indexMm: cs.yAxis[row],
        thickness,
      });
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('click', handleClick);

    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('click', handleClick);
    };
  }, [raycastSurface]);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%' }}
    />
  );
}
