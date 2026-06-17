// =============================================================================
// Dome Scan Orientation Gizmo Geometry
// =============================================================================
// Builds a 3D gizmo on the dome surface showing the scan datum origin,
// circumferential scan direction (green arrow), and longitudinal index
// direction (orange arrow). Mirrors the shell scan gizmo pattern from
// scan-gizmo-geometry.ts but uses dome polar coordinates.
// =============================================================================

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

import type { DomeScanConfig, VesselState } from '../types';
import { domeLocalFromPhiTheta, PHI_EPSILON } from './dome-scan-geometry';
import { SCALE } from './materials';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RIBBON_HALF_WIDTH = 0.04;
const SURFACE_OFFSET_MM = 20;
const CONE_RADIUS = 0.08;
const CONE_HEIGHT = 0.2;
const ORIGIN_RADIUS = 0.08;
const CIRC_ARC_DEG = 90;
const CIRC_SEGMENTS = 24;
const LONG_ARC_DEG = 30;
const LONG_SEGMENTS = 12;

const COLOR_CIRC = 0x00ff88;
const COLOR_LONG = 0xff6633;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function domeWorldPoint(
  phiDeg: number,
  thetaDeg: number,
  radius: number,
  headDepth: number,
  tangentLineMm: number,
  tanTan: number,
  headSign: number,
  isVertical: boolean,
  surfaceOffsetMm: number,
): THREE.Vector3 {
  const local = domeLocalFromPhiTheta(phiDeg, thetaDeg, radius, headDepth);
  const rScaled = (local.rLocalMm + surfaceOffsetMm) * SCALE;
  const axialPosMm = tangentLineMm + headSign * local.axialMm;
  const axialGlobal = (axialPosMm - tanTan / 2) * SCALE;

  if (isVertical) {
    return new THREE.Vector3(
      rScaled * Math.cos(local.thetaRad),
      axialGlobal,
      rScaled * Math.sin(local.thetaRad),
    );
  }
  return new THREE.Vector3(
    axialGlobal,
    rScaled * Math.sin(local.thetaRad),
    rScaled * Math.cos(local.thetaRad),
  );
}

function orientCone(cone: THREE.Mesh, direction: THREE.Vector3): void {
  const up = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion().setFromUnitVectors(up, direction.clone().normalize());
  cone.quaternion.copy(quat);
}

function buildRibbonArrow(
  points: THREE.Vector3[],
  color: number,
  userDataType: string,
  compositeId: string,
): THREE.Group {
  const group = new THREE.Group();
  group.userData = { type: userDataType, compositeId };

  if (points.length < 2) return group;

  const vertices: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    let tangent: THREE.Vector3;
    if (i === 0) tangent = new THREE.Vector3().subVectors(points[1], points[0]).normalize();
    else if (i === points.length - 1) tangent = new THREE.Vector3().subVectors(points[i], points[i - 1]).normalize();
    else tangent = new THREE.Vector3().subVectors(points[i + 1], points[i - 1]).normalize();

    const up = p.clone().normalize();
    const side = new THREE.Vector3().crossVectors(tangent, up).normalize().multiplyScalar(RIBBON_HALF_WIDTH);

    const a = new THREE.Vector3().addVectors(p, side);
    const b = new THREE.Vector3().subVectors(p, side);

    vertices.push(a.x, a.y, a.z, b.x, b.y, b.z);

    if (i < points.length - 1) {
      const base = i * 2;
      indices.push(base, base + 2, base + 1);
      indices.push(base + 1, base + 2, base + 3);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshBasicMaterial({
    color,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });

  const ribbon = new THREE.Mesh(geometry, material);
  ribbon.renderOrder = 999;
  group.add(ribbon);

  // Cone arrowhead at the last point
  const lastPt = points[points.length - 1];
  const prevPt = points[points.length - 2];
  const dir = new THREE.Vector3().subVectors(lastPt, prevPt).normalize();

  const coneGeom = new THREE.ConeGeometry(CONE_RADIUS, CONE_HEIGHT, 8);
  const coneMat = new THREE.MeshBasicMaterial({ color, depthWrite: false });
  const cone = new THREE.Mesh(coneGeom, coneMat);
  cone.position.copy(lastPt);
  orientCone(cone, dir);
  cone.renderOrder = 999;
  group.add(cone);

  return group;
}

// ---------------------------------------------------------------------------
// Public: build dome scan orientation gizmo
// ---------------------------------------------------------------------------

export function buildDomeScanGizmo(
  config: DomeScanConfig,
  vesselState: VesselState,
): { group: THREE.Group; originMesh: THREE.Mesh } {
  const group = new THREE.Group();

  const RADIUS = vesselState.id / 2;
  const HEAD_DEPTH = RADIUS / (vesselState.headRatio || 2);
  const TAN_TAN = vesselState.length;
  const isVertical = vesselState.orientation === 'vertical';
  const headSign = config.head === 'right' ? 1 : -1;
  const tangentLineMm = config.head === 'right' ? TAN_TAN : 0;

  const centerPhi = Math.max(PHI_EPSILON, config.centerPhi);
  const centerTheta = config.centerTheta;

  // --- Origin sphere ---
  const originPos = domeWorldPoint(
    centerPhi, centerTheta, RADIUS, HEAD_DEPTH,
    tangentLineMm, TAN_TAN, headSign, isVertical, SURFACE_OFFSET_MM,
  );

  const originGeom = new THREE.SphereGeometry(ORIGIN_RADIUS, 16, 16);
  const originMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false });
  const originMesh = new THREE.Mesh(originGeom, originMat);
  originMesh.position.copy(originPos);
  originMesh.renderOrder = 1000;
  originMesh.userData = { type: 'domeGizmo', compositeId: config.id };
  group.add(originMesh);

  // --- CSS2D label ---
  try {
    const labelDiv = document.createElement('div');
    labelDiv.textContent = config.name || 'Dome Scan';
    labelDiv.style.cssText = 'color:#fff;font-size:11px;background:rgba(0,0,0,0.6);padding:2px 6px;border-radius:3px;pointer-events:none;white-space:nowrap;';
    const label = new CSS2DObject(labelDiv);
    label.position.set(0, ORIGIN_RADIUS * 2, 0);
    originMesh.add(label);
  } catch {
    // CSS2DObject not available in test environment — skip
  }

  // --- Circumferential arrow (constant-phi ring = scan direction) ---
  const circPoints: THREE.Vector3[] = [];
  for (let i = 0; i <= CIRC_SEGMENTS; i++) {
    const t = i / CIRC_SEGMENTS;
    const thetaOff = (t - 0.5) * CIRC_ARC_DEG;
    const theta = centerTheta + thetaOff;
    circPoints.push(domeWorldPoint(
      centerPhi, theta, RADIUS, HEAD_DEPTH,
      tangentLineMm, TAN_TAN, headSign, isVertical, SURFACE_OFFSET_MM,
    ));
  }

  const circArrow = buildRibbonArrow(circPoints, COLOR_CIRC, 'domeGizmoArrowCirc', config.id);
  group.add(circArrow);

  // --- Longitudinal arrow (meridian = index direction) ---
  const longPoints: THREE.Vector3[] = [];
  for (let i = 0; i <= LONG_SEGMENTS; i++) {
    const t = i / LONG_SEGMENTS;
    const phiOff = (t - 0.5) * LONG_ARC_DEG;
    const phi = Math.max(PHI_EPSILON, Math.min(90, centerPhi + phiOff));
    longPoints.push(domeWorldPoint(
      phi, centerTheta, RADIUS, HEAD_DEPTH,
      tangentLineMm, TAN_TAN, headSign, isVertical, SURFACE_OFFSET_MM,
    ));
  }

  const longArrow = buildRibbonArrow(longPoints, COLOR_LONG, 'domeGizmoArrowLong', config.id);
  group.add(longArrow);

  return { group, originMesh };
}
