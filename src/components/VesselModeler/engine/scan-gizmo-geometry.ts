// =============================================================================
// Vessel Modeler - Scan Orientation Gizmo Geometry
// =============================================================================
// Builds a 3D gizmo on the vessel surface showing the scan datum origin,
// circumferential scan direction (green arrow), and longitudinal index
// direction (orange arrow). Uses lightweight ribbon meshes (flat strips)
// instead of TubeGeometry for fast GPU-friendly rebuilds.
// =============================================================================

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { ScanCompositeConfig, VesselState } from '../types';
import { shellPoint } from './annotation-geometry';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ORIGIN_RADIUS = 0.08;
const RIBBON_HALF_WIDTH = 0.04;        // half-width of the flat ribbon strip
const ARROW_COLOR_CIRC = 0x00ff88;     // green - circumferential (scan)
const ARROW_COLOR_LONG = 0xff6633;     // orange - longitudinal (index)
const SURFACE_OFFSET = 20;             // mm above shell
const CIRC_ARC_DEG = 150;             // nearly half the vessel circumference
const CIRC_SEGMENTS = 24;
const LONG_SEGMENTS = 12;
const CONE_RADIUS = 0.08;
const CONE_HEIGHT = 0.2;

// ---------------------------------------------------------------------------
// Helper: orient a cone mesh so its tip points along a direction
// ---------------------------------------------------------------------------

function orientCone(
  cone: THREE.Mesh,
  position: THREE.Vector3,
  direction: THREE.Vector3,
): void {
  cone.position.copy(position);
  const up = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion().setFromUnitVectors(up, direction.clone().normalize());
  cone.quaternion.copy(quat);
}

// ---------------------------------------------------------------------------
// Helper: build a ribbon (flat strip) mesh from a point array
// ---------------------------------------------------------------------------
// Creates a flat band that always faces outward from the vessel surface.
// Much cheaper than TubeGeometry - just 2 triangles per segment.
// ---------------------------------------------------------------------------

function buildRibbonArrow(
  points: THREE.Vector3[],
  color: number,
  userData: Record<string, unknown>,
  vesselCenter: THREE.Vector3,
): THREE.Group {
  const group = new THREE.Group();

  if (points.length < 2) return group;

  // Build ribbon vertices: for each point, expand sideways perpendicular
  // to both the path tangent and the outward-from-vessel direction.
  const vertices: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];

    // Tangent: forward difference, backward at end
    const tangent = new THREE.Vector3();
    if (i < points.length - 1) {
      tangent.subVectors(points[i + 1], pt);
    } else {
      tangent.subVectors(pt, points[i - 1]);
    }
    tangent.normalize();

    // Outward: from vessel center toward this point (radial direction)
    const outward = new THREE.Vector3().subVectors(pt, vesselCenter).normalize();

    // Side vector: perpendicular to both tangent and outward
    const side = new THREE.Vector3().crossVectors(tangent, outward).normalize();

    // Two vertices: left and right of center line
    vertices.push(
      pt.x + side.x * RIBBON_HALF_WIDTH, pt.y + side.y * RIBBON_HALF_WIDTH, pt.z + side.z * RIBBON_HALF_WIDTH,
      pt.x - side.x * RIBBON_HALF_WIDTH, pt.y - side.y * RIBBON_HALF_WIDTH, pt.z - side.z * RIBBON_HALF_WIDTH,
    );

    // Two triangles per quad (connecting this pair to the next)
    if (i < points.length - 1) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();

  const mat = new THREE.MeshBasicMaterial({
    color,
    side: THREE.DoubleSide,
    depthTest: false,
    transparent: true,
    opacity: 0.9,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.renderOrder = 999;
  group.add(mesh);

  // Arrowhead cone at the tip
  const tip = points[points.length - 1];
  const prev = points[points.length - 2];
  const direction = new THREE.Vector3().subVectors(tip, prev).normalize();

  const coneGeom = new THREE.ConeGeometry(CONE_RADIUS, CONE_HEIGHT, 8);
  const coneMat = new THREE.MeshBasicMaterial({
    color,
    depthTest: false,
    transparent: true,
    opacity: 0.9,
  });
  const cone = new THREE.Mesh(coneGeom, coneMat);
  cone.renderOrder = 999;
  orientCone(cone, tip, direction);
  group.add(cone);

  // Tag all children for raycasting
  group.traverse((child) => {
    child.userData = { ...child.userData, ...userData };
  });

  return group;
}

// ---------------------------------------------------------------------------
// Compute vessel center for outward direction
// ---------------------------------------------------------------------------

function getVesselCenter(vesselState: VesselState, posMm: number): THREE.Vector3 {
  const SCALE = 0.001;
  const posGlobal = (posMm - vesselState.length / 2) * SCALE;
  if (vesselState.orientation === 'vertical') {
    return new THREE.Vector3(0, posGlobal, 0);
  } else {
    return new THREE.Vector3(posGlobal, 0, 0);
  }
}

// ---------------------------------------------------------------------------
// Build circumferential arrow (scan direction)
// ---------------------------------------------------------------------------

function buildCircumferentialArrow(
  composite: ScanCompositeConfig,
  vesselState: VesselState,
): THREE.Group {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= CIRC_SEGMENTS; i++) {
    const t = i / CIRC_SEGMENTS;
    const offsetDeg = t * CIRC_ARC_DEG;
    // +90 converts user-facing 0°=TDC to internal 0°=3-o'clock
    const angleDeg = composite.scanDirection === 'cw'
      ? (composite.datumAngleDeg + 90) - offsetDeg
      : (composite.datumAngleDeg + 90) + offsetDeg;
    const angleRad = (angleDeg * Math.PI) / 180;
    points.push(shellPoint(composite.indexStartMm, angleRad, vesselState, SURFACE_OFFSET));
  }

  const center = getVesselCenter(vesselState, composite.indexStartMm);
  return buildRibbonArrow(points, ARROW_COLOR_CIRC, {
    type: 'scanGizmoArrowCirc',
    compositeId: composite.id,
  }, center);
}

// ---------------------------------------------------------------------------
// Build longitudinal arrow (index direction)
// ---------------------------------------------------------------------------

function buildLongitudinalArrow(
  composite: ScanCompositeConfig,
  vesselState: VesselState,
): THREE.Group {
  const datumRad = ((composite.datumAngleDeg + 90) * Math.PI) / 180;
  const arrowLengthMm = Math.min(3000, vesselState.length * 0.4);

  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= LONG_SEGMENTS; i++) {
    const t = i / LONG_SEGMENTS;
    const posMm = composite.indexDirection === 'forward'
      ? Math.min(composite.indexStartMm + t * arrowLengthMm, vesselState.length)
      : Math.max(composite.indexStartMm - t * arrowLengthMm, 0);
    points.push(shellPoint(posMm, datumRad, vesselState, SURFACE_OFFSET));
  }

  const center = getVesselCenter(vesselState, composite.indexStartMm);
  return buildRibbonArrow(points, ARROW_COLOR_LONG, {
    type: 'scanGizmoArrowLong',
    compositeId: composite.id,
  }, center);
}

// ---------------------------------------------------------------------------
// Public: build the full scan orientation gizmo
// ---------------------------------------------------------------------------

export function buildScanOrientationGizmo(
  composite: ScanCompositeConfig,
  vesselState: VesselState,
): { group: THREE.Group; originMesh: THREE.Mesh } {
  const group = new THREE.Group();
  const datumRad = ((composite.datumAngleDeg + 90) * Math.PI) / 180;

  // --- Origin sphere (draggable handle) ---
  const originPos = shellPoint(composite.indexStartMm, datumRad, vesselState, SURFACE_OFFSET);
  const sphereGeom = new THREE.SphereGeometry(ORIGIN_RADIUS, 12, 8);
  const sphereMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    depthTest: false,
    transparent: true,
  });
  const originMesh = new THREE.Mesh(sphereGeom, sphereMat);
  originMesh.position.copy(originPos);
  originMesh.renderOrder = 1000;
  originMesh.userData = {
    type: 'scanGizmo',
    compositeId: composite.id,
  };
  group.add(originMesh);

  // --- CSS2D label showing datum angle and position ---
  const labelEl = document.createElement('div');
  labelEl.style.cssText = 'font-size:14px;font-weight:700;color:#fff;background:rgba(0,0,0,0.8);padding:5px 10px;border-radius:4px;white-space:nowrap;pointer-events:none;border:1px solid rgba(255,255,255,0.2);';
  labelEl.textContent = `${Math.round(composite.datumAngleDeg)}\u00B0 \u00B7 ${Math.round(composite.indexStartMm)} mm`;
  const label = new CSS2DObject(labelEl);
  label.position.copy(originPos);
  group.add(label);

  // --- Circumferential arrow (scan direction) ---
  group.add(buildCircumferentialArrow(composite, vesselState));

  // --- Longitudinal arrow (index direction) ---
  group.add(buildLongitudinalArrow(composite, vesselState));

  return { group, originMesh };
}
