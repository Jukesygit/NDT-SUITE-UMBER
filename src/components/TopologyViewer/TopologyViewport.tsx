import { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import type { CscanData } from '../CscanVisualizer/types';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type {
  SurfaceOptions,
  TopologyTool,
  HoverInfo,
  CrossSectionData,
  MeasurementPoint,
  MeasurementState,
  TopologyAnnotation,
} from './types';
import { TopologySceneManager } from './engine/topology-scene';
import { buildTopologySurface, buildPlateBody, buildCylindricalShell, clampDisplayDisplacement } from './engine/topology-surface';
import { extractCrossSection } from './engine/topology-cross-section';
import { interpolateColor, getColorscale } from '../../utils/colorscales';
import { RandomMatrixSpinner } from '../MatrixSpinners';

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

/**
 * Resolve grid row/col from a raycast hit. Uses the face's vertex indices
 * when geometry userData is available (works in both flat and cylinder mode),
 * falling back to the flat-mode nearest-axis lookup.
 */
function resolveGridFromHit(
  hit: THREE.Intersection,
  cs: CscanData,
  flatCol: number,
  flatRow: number,
): { gridRow: number; gridCol: number } {
  const geo = (hit.object as THREE.Mesh).geometry;
  const ud = geo?.userData as {
    cols?: number;
    xAxis?: number[];
    yAxis?: number[];
  } | undefined;
  const idx = geo?.getIndex();
  if (hit.faceIndex != null && idx && ud?.cols && ud.xAxis && ud.yAxis) {
    const cols = ud.cols;
    const triBase = hit.faceIndex * 3;
    const v0 = idx.getX(triBase);
    const decimatedRow = Math.floor(v0 / cols);
    const decimatedCol = v0 % cols;
    const scanMm = ud.xAxis[decimatedCol];
    const indexMm = ud.yAxis[decimatedRow];
    return {
      gridRow: findNearestIndex(cs.yAxis, indexMm),
      gridCol: findNearestIndex(cs.xAxis, scanMm),
    };
  }
  return { gridRow: flatRow, gridCol: flatCol };
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
  lightAzimuth: number;
  lightElevation: number;
  onSceneReady: (manager: TopologySceneManager) => void;
  annotations: TopologyAnnotation[];
  onAddAnnotation: (annotation: TopologyAnnotation) => void;
  onUpdateAnnotation: (id: string, updates: Partial<TopologyAnnotation>) => void;
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
  lightAzimuth,
  lightElevation,
  onSceneReady,
  annotations,
  onAddAnnotation,
  onUpdateAnnotation,
}: TopologyViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneManagerRef = useRef<TopologySceneManager | null>(null);
  const [isRebuilding, setIsRebuilding] = useState(false);

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
  const onAddAnnotationRef = useRef(onAddAnnotation);
  onAddAnnotationRef.current = onAddAnnotation;
  const onUpdateAnnotationRef = useRef(onUpdateAnnotation);
  onUpdateAnnotationRef.current = onUpdateAnnotation;

  const annotationGroupsRef = useRef<THREE.Group[]>([]);

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

    sceneManagerRef.current?.requestRender();
  }, []);

  // ------------------------------------------------------------------
  // Raycast the surface mesh under the cursor, returning XZ world coords
  // ------------------------------------------------------------------
  const raycastSurface = useCallback(
    (clientX: number, clientY: number): THREE.Intersection | null => {
      const mgr = sceneManagerRef.current;
      if (!mgr) return null;
      const mesh = mgr.getSurfaceMesh();
      if (!mesh) return null;

      const mat = mesh.material as THREE.Material;
      const prevSide = mat.side;
      mat.side = THREE.DoubleSide;

      const canvas = mgr.getRenderer().domElement;
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = toNDC(clientX, clientY, rect);
      raycasterRef.current.setFromCamera(mouseRef.current, mgr.getCamera());

      const hits = raycasterRef.current.intersectObject(mesh);
      mat.side = prevSide;
      return hits.length > 0 ? hits[0] : null;
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
    onSceneReady(manager);

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

    setIsRebuilding(true);

    const timer = setTimeout(() => {
      try {
        const geometry = buildTopologySurface(cscanData, surfaceOptions);
        mgr.setSurfaceGeometry(geometry);

        if (surfaceOptions.viewMode === 'cylinder' && surfaceOptions.pipeDiameter) {
          const pos = geometry.getAttribute('position');
          let maxR = 0;
          for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const y = pos.getY(i);
            const r = Math.sqrt(x * x + y * y);
            if (r > maxR) maxR = r;
          }
          const outerR = Math.max(surfaceOptions.pipeDiameter / 2, maxR + nominalThickness);
          const shell = buildCylindricalShell(geometry, outerR);
          mgr.setPlateGeometry(shell);

          const surfaceMesh = mgr.getSurfaceMesh();
          if (surfaceMesh) (surfaceMesh.material as THREE.MeshStandardMaterial).side = THREE.FrontSide;
        } else {
          const pos = geometry.getAttribute('position');
          let minY = 0;
          for (let i = 0; i < pos.count; i++) {
            const y = pos.getY(i);
            if (y < minY) minY = y;
          }
          const plate = buildPlateBody(geometry, minY);
          mgr.setPlateGeometry(plate);
        }
      } catch {
        // Surface build may fail for tiny grids; silently ignore
      }

      clearHelperObjects();
      setIsRebuilding(false);
    }, 0);

    return () => clearTimeout(timer);
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
    } else if (activeTool === 'annotate') {
      controls.enabled = true;
      canvas.style.cursor = 'crosshair';
    }

    // Reset drag state when tool changes away from crossSection
    if (activeTool !== 'crossSection') {
      crossDragRef.current = null;
    }
  }, [activeTool]);

  // ------------------------------------------------------------------
  // Reposition the key light when azimuth/elevation change
  // ------------------------------------------------------------------
  useEffect(() => {
    sceneManagerRef.current?.setLightAngles(lightAzimuth, lightElevation);
  }, [lightAzimuth, lightElevation]);

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

    mgr.requestRender();
  }, [measurementState, nominalThickness, surfaceOptions.exaggeration]);

  // ------------------------------------------------------------------
  // Render annotation visuals (rebuilds on annotations or options change)
  // ------------------------------------------------------------------
  useEffect(() => {
    const mgr = sceneManagerRef.current;
    const cs = cscanDataRef.current;
    if (!mgr || !cs) return;
    const scene = mgr.getScene();

    // Clear previous annotation groups
    for (const grp of annotationGroupsRef.current) {
      scene.remove(grp);
      grp.traverse((obj) => {
        if (obj instanceof CSS2DObject) {
          obj.element.remove();
        } else if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          (obj.material as THREE.Material).dispose();
        } else if (obj instanceof THREE.Line) {
          obj.geometry.dispose();
          (obj.material as THREE.Material).dispose();
        }
      });
    }
    annotationGroupsRef.current = [];

    const scale = getColorscale(surfaceOptions.colorScale);
    const cMin = surfaceOptions.rangeMin ?? cs.stats?.min ?? 0;
    const cMax = surfaceOptions.rangeMax ?? cs.stats?.max ?? 1;
    const cRange = cMax === cMin ? 1 : cMax - cMin;

    for (const ann of annotations) {
      let surfacePos: THREE.Vector3;
      if (ann.surfacePoint) {
        surfacePos = new THREE.Vector3(...ann.surfacePoint);
      } else {
        const value = cs.data[ann.row]?.[ann.col];
        const y = clampDisplayDisplacement(
          value ?? null,
          nominalThickness,
          surfaceOptions.exaggeration,
          surfaceOptions.displacementClampUpper,
        );
        surfacePos = new THREE.Vector3(ann.scanMm, y, ann.indexMm);
      }

      const group = new THREE.Group();

      // Dot at surface
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(1.5, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0x00ccff }),
      );
      dot.position.copy(surfacePos);
      group.add(dot);

      // Label position: default offset above, or stored drag offset
      const labelPos = surfacePos.clone();
      if (ann.labelOffset) {
        labelPos.x += ann.labelOffset[0];
        labelPos.y += ann.labelOffset[1];
        labelPos.z += ann.labelOffset[2];
      } else {
        labelPos.y += 15;
      }

      // Leader line
      const leaderLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([surfacePos, labelPos]),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }),
      );
      group.add(leaderLine);

      // Thickness color from colorscale
      let thickHtml: string;
      if (ann.thickness != null) {
        const t = (ann.thickness - cMin) / cRange;
        let [cr, cg, cb] = interpolateColor(t, scale, surfaceOptions.reverseScale);
        const lum = (cr * 0.299 + cg * 0.587 + cb * 0.114) / 255;
        if (lum < 0.35) {
          const boost = 0.35 / Math.max(lum, 0.01);
          cr = Math.min(255, Math.round(cr * boost));
          cg = Math.min(255, Math.round(cg * boost));
          cb = Math.min(255, Math.round(cb * boost));
        }
        thickHtml = `<span style="color:rgb(${cr},${cg},${cb});font-weight:700">${ann.thickness.toFixed(2)} mm</span>`;
      } else {
        thickHtml = '<span style="color:#ff6666;font-weight:700">ND</span>';
      }

      // CSS2D label
      const el = document.createElement('div');
      el.style.cssText = `
        background: rgba(20, 25, 35, 0.88);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 6px;
        padding: 4px 8px;
        font-family: var(--font-mono, monospace);
        font-size: 11px;
        color: rgba(255, 255, 255, 0.85);
        white-space: nowrap;
        cursor: grab;
        pointer-events: auto;
        user-select: none;
      `;
      el.innerHTML = `${thickHtml}<br><span style="opacity:0.6;font-size:10px">S ${ann.scanMm.toFixed(1)} &middot; I ${ann.indexMm.toFixed(1)}</span>`;

      const cssObj = new CSS2DObject(el);
      cssObj.position.copy(labelPos);
      group.add(cssObj);

      // Drag handler — moves label in a camera-facing plane
      const annId = ann.id;
      let dragging = false;
      const dragPlane = new THREE.Plane();
      const dragStart3D = new THREE.Vector3();
      const labelStart = new THREE.Vector3();
      const intersection = new THREE.Vector3();

      const onPointerDown = (e: PointerEvent) => {
        e.stopPropagation();
        dragging = true;
        el.style.cursor = 'grabbing';
        el.setPointerCapture(e.pointerId);
        mgr.getControls().enabled = false;

        const cam = mgr.getCamera();
        dragPlane.setFromNormalAndCoplanarPoint(
          cam.getWorldDirection(new THREE.Vector3()).negate(),
          labelPos,
        );
        labelStart.copy(labelPos);

        const canvas = mgr.getRenderer().domElement;
        const rect = canvas.getBoundingClientRect();
        const ndc = toNDC(e.clientX, e.clientY, rect);
        raycasterRef.current.setFromCamera(ndc, cam);
        raycasterRef.current.ray.intersectPlane(dragPlane, dragStart3D);
      };

      const onPointerMove = (e: PointerEvent) => {
        if (!dragging) return;
        const cam = mgr.getCamera();
        const canvas = mgr.getRenderer().domElement;
        const rect = canvas.getBoundingClientRect();
        const ndc = toNDC(e.clientX, e.clientY, rect);
        raycasterRef.current.setFromCamera(ndc, cam);
        if (!raycasterRef.current.ray.intersectPlane(dragPlane, intersection)) return;

        const delta = intersection.clone().sub(dragStart3D);
        const newPos = labelStart.clone().add(delta);
        cssObj.position.copy(newPos);
        labelPos.copy(newPos);

        // Update leader line endpoint
        const posAttr = leaderLine.geometry.getAttribute('position') as THREE.BufferAttribute;
        posAttr.setXYZ(1, newPos.x, newPos.y, newPos.z);
        posAttr.needsUpdate = true;

        mgr.requestRender();
      };

      const onPointerUp = (e: PointerEvent) => {
        if (!dragging) return;
        dragging = false;
        el.style.cursor = 'grab';
        el.releasePointerCapture(e.pointerId);
        mgr.getControls().enabled = true;

        const offset: [number, number, number] = [
          labelPos.x - surfacePos.x,
          labelPos.y - surfacePos.y,
          labelPos.z - surfacePos.z,
        ];
        onUpdateAnnotationRef.current(annId, { labelOffset: offset });
      };

      el.addEventListener('pointerdown', onPointerDown);
      el.addEventListener('pointermove', onPointerMove);
      el.addEventListener('pointerup', onPointerUp);

      scene.add(group);
      annotationGroupsRef.current.push(group);
    }

    mgr.requestRender();
  }, [annotations, surfaceOptions, nominalThickness]);

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

      const hit = raycastSurface(e.clientX, e.clientY);
      if (!hit) {
        onHoverRef.current(null);
        return;
      }

      const col = findNearestIndex(cs.xAxis, hit.point.x);
      const row = findNearestIndex(cs.yAxis, hit.point.z);
      const { gridRow, gridCol } = resolveGridFromHit(hit, cs, col, row);
      const thickness = cs.data[gridRow]?.[gridCol] ?? null;

      onHoverRef.current({
        thickness,
        scanMm: cs.xAxis[gridCol],
        indexMm: cs.yAxis[gridRow],
        screenX: e.clientX,
        screenY: e.clientY,
        row: gridRow,
        col: gridCol,
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

      const hit = raycastSurface(e.clientX, e.clientY);
      if (!hit) return;

      crossDragRef.current = {
        startScanMm: hit.point.x,
        startIndexMm: hit.point.z,
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

      const hit = raycastSurface(e.clientX, e.clientY);
      crossDragRef.current = null;
      mgr.getControls().enabled = true;

      if (!hit) return;

      const endScanMm = hit.point.x;
      const endIndexMm = hit.point.z;

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
      mgr.requestRender();
    };

    // ----- Measurement / Annotation (click) -----
    const handleClick = (e: MouseEvent) => {
      const tool = activeToolRef.current;
      if (tool !== 'measure' && tool !== 'annotate') return;
      const cs = cscanDataRef.current;
      if (!cs) return;

      const hit = raycastSurface(e.clientX, e.clientY);
      if (!hit) return;

      const flatCol = findNearestIndex(cs.xAxis, hit.point.x);
      const flatRow = findNearestIndex(cs.yAxis, hit.point.z);
      const { gridRow, gridCol } = resolveGridFromHit(hit, cs, flatCol, flatRow);
      const thickness = cs.data[gridRow]?.[gridCol] ?? null;

      if (tool === 'measure') {
        onMeasurementPointRef.current({
          scanMm: cs.xAxis[gridCol],
          indexMm: cs.yAxis[gridRow],
          thickness,
        });
      } else {
        onAddAnnotationRef.current({
          id: crypto.randomUUID(),
          row: gridRow,
          col: gridCol,
          scanMm: cs.xAxis[gridCol],
          indexMm: cs.yAxis[gridRow],
          thickness,
          label: thickness != null ? `${thickness.toFixed(2)} mm` : 'ND',
          surfacePoint: [hit.point.x, hit.point.y, hit.point.z],
        });
      }
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
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div
        ref={containerRef}
        style={{ position: 'relative', width: '100%', height: '100%' }}
      />
      {isRebuilding && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.3)',
          pointerEvents: 'none',
        }}>
          <RandomMatrixSpinner size={120} />
        </div>
      )}
    </div>
  );
}
