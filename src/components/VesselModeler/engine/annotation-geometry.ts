// =============================================================================
// Vessel Modeler - Annotation Shape Geometry
// =============================================================================
// Creates shell-conforming outline shapes (circles and rectangles) for
// annotations on the vessel surface. Uses the same vertex math as
// texture-manager.ts but produces line geometry (outlines) instead of
// textured quads.
// =============================================================================

import * as THREE from 'three';
import type { AnnotationShapeConfig, RulerConfig, VesselState } from '../types';
import { SCALE } from './materials';

// ---------------------------------------------------------------------------
// Shell Surface Point Calculator
// ---------------------------------------------------------------------------

/**
 * Compute a 3D point on the vessel shell surface at a given axial position
 * (mm from left tangent line) and circumferential angle (radians).
 */
export function shellPoint(
  posMm: number,
  angleRad: number,
  vesselState: VesselState,
  surfaceOffset: number,
): THREE.Vector3 {
  const RADIUS = vesselState.id / 2;
  const TAN_TAN = vesselState.length;
  const HEAD_DEPTH = vesselState.id / (2 * vesselState.headRatio);
  const isVertical = vesselState.orientation === 'vertical';
  const posGlobal = (posMm - TAN_TAN / 2) * SCALE;

  let rLocal: number;

  if (posMm < 0) {
    // Left head (ellipsoidal)
    const ratio = Math.min(0.99, Math.abs(posMm / HEAD_DEPTH));
    rLocal = RADIUS * Math.sqrt(1 - ratio * ratio);
  } else if (posMm > TAN_TAN) {
    // Right head (ellipsoidal)
    const ratio = Math.min(0.99, Math.abs((posMm - TAN_TAN) / HEAD_DEPTH));
    rLocal = RADIUS * Math.sqrt(1 - ratio * ratio);
  } else {
    // Cylindrical shell
    rLocal = RADIUS;
  }

  const r = (rLocal + surfaceOffset) * SCALE;

  if (isVertical) {
    return new THREE.Vector3(
      r * Math.cos(angleRad),
      posGlobal,
      r * Math.sin(angleRad),
    );
  } else {
    return new THREE.Vector3(
      posGlobal,
      r * Math.sin(angleRad),
      r * Math.cos(angleRad),
    );
  }
}

// ---------------------------------------------------------------------------
// Severity Color Lookup
// ---------------------------------------------------------------------------

const SEVERITY_COLORS: Record<string, string> = {
  red: '#ff3333',
  yellow: '#ffaa00',
  green: '#33cc33',
};

/** Resolve outline color: severity level overrides the user-chosen color. */
function resolveOutlineColor(config: AnnotationShapeConfig): string {
  return config.severityLevel
    ? SEVERITY_COLORS[config.severityLevel] ?? config.color
    : config.color;
}

// ---------------------------------------------------------------------------
// Circle Outline
// ---------------------------------------------------------------------------

function createCircleOutline(
  config: AnnotationShapeConfig,
  vesselState: VesselState,
  surfaceOffset: number,
): THREE.Line {
  const circumference = Math.PI * vesselState.id;
  const centerAngle = (config.angle * Math.PI) / 180;
  const radiusMm = config.width / 2;
  const segments = 64;

  const points: THREE.Vector3[] = [];

  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const axialOffset = radiusMm * Math.cos(theta);
    const circumOffset = radiusMm * Math.sin(theta);
    const angularOffset = (circumOffset / circumference) * Math.PI * 2;

    points.push(shellPoint(
      config.pos + axialOffset,
      centerAngle + angularOffset,
      vesselState,
      surfaceOffset,
    ));
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: new THREE.Color(resolveOutlineColor(config)),
    linewidth: 1, // WebGL limitation: linewidth > 1 only works on some backends
  });

  return new THREE.Line(geometry, material);
}

// ---------------------------------------------------------------------------
// Rectangle Outline
// ---------------------------------------------------------------------------

export function createRectOutline(
  config: AnnotationShapeConfig,
  vesselState: VesselState,
  surfaceOffset: number,
): THREE.LineLoop {
  const circumference = Math.PI * vesselState.id;
  const centerAngle = (config.angle * Math.PI) / 180;
  const halfW = config.width / 2;
  const halfH = config.height / 2;
  const angularHalfH = (halfH / circumference) * Math.PI * 2;
  const segmentsPerEdge = 32;

  const points: THREE.Vector3[] = [];

  // Bottom edge: left-to-right at angle - angularHalfH
  for (let i = 0; i <= segmentsPerEdge; i++) {
    const t = i / segmentsPerEdge;
    const pos = config.pos - halfW + t * config.width;
    points.push(shellPoint(pos, centerAngle - angularHalfH, vesselState, surfaceOffset));
  }
  // Right edge: bottom-to-top at pos + halfW
  for (let i = 1; i <= segmentsPerEdge; i++) {
    const t = i / segmentsPerEdge;
    const ang = centerAngle - angularHalfH + t * angularHalfH * 2;
    points.push(shellPoint(config.pos + halfW, ang, vesselState, surfaceOffset));
  }
  // Top edge: right-to-left at angle + angularHalfH
  for (let i = 1; i <= segmentsPerEdge; i++) {
    const t = i / segmentsPerEdge;
    const pos = config.pos + halfW - t * config.width;
    points.push(shellPoint(pos, centerAngle + angularHalfH, vesselState, surfaceOffset));
  }
  // Left edge: top-to-bottom at pos - halfW
  for (let i = 1; i < segmentsPerEdge; i++) {
    const t = i / segmentsPerEdge;
    const ang = centerAngle + angularHalfH - t * angularHalfH * 2;
    points.push(shellPoint(config.pos - halfW, ang, vesselState, surfaceOffset));
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: new THREE.Color(resolveOutlineColor(config)),
    linewidth: 1,
  });

  return new THREE.LineLoop(geometry, material);
}

// ---------------------------------------------------------------------------
// Selection Fill Mesh
// ---------------------------------------------------------------------------

/**
 * Build a semi-transparent fill mesh for a rectangle area on the vessel shell.
 * Used for annotation selection highlights and coverage rect fills.
 */
export function createRectFill(
  config: AnnotationShapeConfig,
  vesselState: VesselState,
  surfaceOffset: number,
): THREE.Mesh {
  const circumference = Math.PI * vesselState.id;
  const centerAngle = (config.angle * Math.PI) / 180;

  const segX = 32;
  const segY = 32;
  const halfW = config.width / 2;
  const halfH = config.height / 2;
  const angularHalfH = (halfH / circumference) * Math.PI * 2;

  const vertices: number[] = [];
  const indices: number[] = [];

  for (let iy = 0; iy <= segY; iy++) {
    const v = iy / segY;
    const angOffset = -angularHalfH + v * angularHalfH * 2;

    for (let ix = 0; ix <= segX; ix++) {
      const u = ix / segX;
      const posOffset = -halfW + u * config.width;

      // For circles, skip vertices outside the radius
      if (config.type === 'circle') {
        const nx = posOffset / halfW;
        const ny = (angOffset / angularHalfH);
        if (nx * nx + ny * ny > 1) {
          // Place vertex at edge to keep index buffer valid
          const clampAngle = Math.atan2(angOffset / angularHalfH, posOffset / halfW);
          const clampPos = halfW * Math.cos(clampAngle);
          const clampAng = angularHalfH * Math.sin(clampAngle);
          const pt = shellPoint(
            config.pos + clampPos,
            centerAngle + clampAng,
            vesselState,
            surfaceOffset - 0.5,
          );
          vertices.push(pt.x, pt.y, pt.z);
        } else {
          const pt = shellPoint(
            config.pos + posOffset,
            centerAngle + angOffset,
            vesselState,
            surfaceOffset - 0.5,
          );
          vertices.push(pt.x, pt.y, pt.z);
        }
      } else {
        const pt = shellPoint(
          config.pos + posOffset,
          centerAngle + angOffset,
          vesselState,
          surfaceOffset - 0.5,
        );
        vertices.push(pt.x, pt.y, pt.z);
      }
    }
  }

  for (let iy = 0; iy < segY; iy++) {
    for (let ix = 0; ix < segX; ix++) {
      const a = ix + (segX + 1) * iy;
      const b = ix + (segX + 1) * (iy + 1);
      const c = ix + 1 + (segX + 1) * (iy + 1);
      const d = ix + 1 + (segX + 1) * iy;
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(config.color),
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  return new THREE.Mesh(geometry, material);
}

// ---------------------------------------------------------------------------
// Public Factory
// ---------------------------------------------------------------------------

/**
 * Create a THREE.Group containing the annotation shape outline and optional
 * selection fill. The group is tagged with userData for raycasting.
 */
export function createAnnotationShape(
  config: AnnotationShapeConfig,
  vesselState: VesselState,
  isSelected: boolean,
): THREE.Group {
  const group = new THREE.Group();
  const surfaceOffset = 3; // mm above shell (above textures at 2mm)

  // Outline
  const outline = config.type === 'circle'
    ? createCircleOutline(config, vesselState, surfaceOffset)
    : createRectOutline(config, vesselState, surfaceOffset);
  outline.userData = { type: 'annotation', annotationId: config.id };
  group.add(outline);

  // Selection fill
  if (isSelected) {
    const fill = createRectFill(config, vesselState, surfaceOffset);
    fill.userData = { type: 'annotation-fill', annotationId: config.id };
    group.add(fill);
  }

  // Invisible hit mesh for raycasting (outlines are hard to click)
  const hitMesh = createRectFill(config, vesselState, surfaceOffset);
  (hitMesh.material as THREE.MeshBasicMaterial).opacity = 0;
  hitMesh.userData = { type: 'annotation', annotationId: config.id };
  group.add(hitMesh);

  group.userData = { type: 'annotation', annotationId: config.id };
  return group;
}

// ---------------------------------------------------------------------------
// Ruler Line
// ---------------------------------------------------------------------------

/**
 * Compute the shell-surface distance between two points on the vessel,
 * following the surface path (not straight-line through air).
 */
export function computeRulerDistance(
  config: RulerConfig,
  vesselState: VesselState,
): number {
  const segments = 64;
  const surfaceOffset = 3;
  let totalDist = 0;

  let prev = shellPoint(config.startPos, (config.startAngle * Math.PI) / 180, vesselState, surfaceOffset);
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const pos = config.startPos + (config.endPos - config.startPos) * t;
    const angle = config.startAngle + (config.endAngle - config.startAngle) * t;
    const pt = shellPoint(pos, (angle * Math.PI) / 180, vesselState, surfaceOffset);
    totalDist += prev.distanceTo(pt);
    prev = pt;
  }

  // Convert from world units back to mm
  return totalDist / SCALE;
}

/**
 * Create a THREE.Group containing the ruler line with endpoint markers.
 */
export function createRulerLine(
  config: RulerConfig,
  vesselState: VesselState,
): THREE.Group {
  const group = new THREE.Group();
  const surfaceOffset = 3;
  const segments = 64;
  const color = new THREE.Color(config.color);

  // Main line
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const pos = config.startPos + (config.endPos - config.startPos) * t;
    const angle = config.startAngle + (config.endAngle - config.startAngle) * t;
    points.push(shellPoint(pos, (angle * Math.PI) / 180, vesselState, surfaceOffset));
  }

  const lineGeom = new THREE.BufferGeometry().setFromPoints(points);
  const lineMat = new THREE.LineBasicMaterial({ color, linewidth: 1 });
  const line = new THREE.Line(lineGeom, lineMat);
  line.userData = { type: 'ruler', rulerId: config.id };
  group.add(line);

  // Endpoint markers (small crosses perpendicular to the line direction)
  const markerSize = 8; // mm
  const circumference = Math.PI * vesselState.id;

  for (const endpoint of ['start', 'end'] as const) {
    const pos = endpoint === 'start' ? config.startPos : config.endPos;
    const angle = endpoint === 'start' ? config.startAngle : config.endAngle;
    const angleRad = (angle * Math.PI) / 180;

    // Perpendicular tick along circumference
    const tickHalf = (markerSize / circumference) * Math.PI * 2;
    const tickPoints = [
      shellPoint(pos, angleRad - tickHalf / 2, vesselState, surfaceOffset),
      shellPoint(pos, angleRad + tickHalf / 2, vesselState, surfaceOffset),
    ];
    const tickGeom = new THREE.BufferGeometry().setFromPoints(tickPoints);
    const tick = new THREE.Line(tickGeom, lineMat);
    group.add(tick);

    // Perpendicular tick along axis
    const axTickPoints = [
      shellPoint(pos - markerSize / 2, angleRad, vesselState, surfaceOffset),
      shellPoint(pos + markerSize / 2, angleRad, vesselState, surfaceOffset),
    ];
    const axTickGeom = new THREE.BufferGeometry().setFromPoints(axTickPoints);
    const axTick = new THREE.Line(axTickGeom, lineMat);
    group.add(axTick);
  }

  group.userData = { type: 'ruler', rulerId: config.id };
  return group;
}
