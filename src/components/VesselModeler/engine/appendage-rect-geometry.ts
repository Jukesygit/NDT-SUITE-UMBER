// =============================================================================
// Vessel Modeler - Appendage Coverage-Rect Geometry
// =============================================================================
// Overlay geometry for a coverage rect mounted on an appendage body (bodyId set).
// An appendage is a pure cylinder for overlays in v1 (no end-closure drape,
// design §9.2), so the rect is a simple curved patch sampled straight from the
// body's SurfaceFrame: `pos` is mm along the appendage axis (clamped to the
// cylinder span), `angle` is degrees in the appendage datum, and `height` is
// circumferential mm mapped to an angular span at the appendage radius.
//
// This deliberately does NOT reuse annotation-geometry's createRectOutline /
// createRectFill: those resolve the main shell + dome drape from `vesselState`
// and are owned by the 4B annotation-on-appendage work. Sampling the frame here
// keeps the appendage path self-contained and byte-independent of that module.
// Main-shell rects (bodyId undefined) never reach here.
// =============================================================================

import * as THREE from 'three';
import type { CoverageRectConfig, VesselState } from '../types';
import { resolveBodyFrame, type SurfaceFrame } from './body-frame';

/** Resolved patch extent on the appendage cylinder (mm axial, deg circ). */
interface RectPatch {
  frame: SurfaceFrame;
  posLo: number;
  posHi: number;
  angLo: number;
  angHi: number;
  /** Circumferential segments (curve around the cylinder) and axial segments. */
  segAng: number;
  segAx: number;
}

function resolvePatch(rect: CoverageRectConfig, vesselState: VesselState): RectPatch {
  const frame = resolveBodyFrame(vesselState, rect.bodyId);
  const { radius, axialLength } = frame;
  const circumference = 2 * Math.PI * radius;

  const halfW = rect.width / 2;
  const angHalfSpan = circumference > 0 ? (rect.height / 2 / circumference) * 360 : 0;

  const posLo = Math.max(0, Math.min(axialLength, rect.pos - halfW));
  const posHi = Math.max(0, Math.min(axialLength, rect.pos + halfW));
  const angLo = rect.angle - angHalfSpan;
  const angHi = rect.angle + angHalfSpan;

  // ~5° per circumferential segment so the outline/fill hugs the cylinder; axial
  // edges are straight so a single axial segment suffices.
  const segAng = Math.max(2, Math.ceil(Math.abs(angHi - angLo) / 5));
  const segAx = Math.max(1, Math.ceil(Math.abs(posHi - posLo) / 400));

  return { frame, posLo, posHi, angLo, angHi, segAng, segAx };
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Curved outline (LineLoop) of an appendage coverage rect, sampled around the
 * cylinder. `surfaceOffset` is the radial standoff in mm above the shell.
 */
export function createAppendageRectOutline(
  rect: CoverageRectConfig,
  vesselState: VesselState,
  surfaceOffset: number,
): THREE.LineLoop {
  const { frame, posLo, posHi, angLo, angHi, segAng, segAx } = resolvePatch(rect, vesselState);
  const pts: THREE.Vector3[] = [];

  // Perimeter walk; corners are shared, so each subsequent edge skips its first
  // point, and the final edge also skips its last (LineLoop closes to the start).
  for (let i = 0; i <= segAng; i++) {
    pts.push(frame.surfacePoint(posLo, lerp(angLo, angHi, i / segAng), surfaceOffset));
  }
  for (let i = 1; i <= segAx; i++) {
    pts.push(frame.surfacePoint(lerp(posLo, posHi, i / segAx), angHi, surfaceOffset));
  }
  for (let i = 1; i <= segAng; i++) {
    pts.push(frame.surfacePoint(posHi, lerp(angHi, angLo, i / segAng), surfaceOffset));
  }
  for (let i = 1; i < segAx; i++) {
    pts.push(frame.surfacePoint(lerp(posHi, posLo, i / segAx), angLo, surfaceOffset));
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(pts);
  const material = new THREE.LineBasicMaterial({ color: new THREE.Color(rect.color), linewidth: 1 });
  return new THREE.LineLoop(geometry, material);
}

/**
 * Semi-transparent fill (Mesh) of an appendage coverage rect. Sits just below the
 * outline standoff so the two never z-fight. Used for the visible fill and the
 * (opacity 0) raycast hit mesh, matching the main-shell coverage rect pattern.
 */
export function createAppendageRectFill(
  rect: CoverageRectConfig,
  vesselState: VesselState,
  surfaceOffset: number,
): THREE.Mesh {
  const { frame, posLo, posHi, angLo, angHi, segAng, segAx } = resolvePatch(rect, vesselState);
  const offset = surfaceOffset - 0.5;

  const vertices: number[] = [];
  for (let iy = 0; iy <= segAng; iy++) {
    const ang = lerp(angLo, angHi, iy / segAng);
    for (let ix = 0; ix <= segAx; ix++) {
      const pos = lerp(posLo, posHi, ix / segAx);
      const p = frame.surfacePoint(pos, ang, offset);
      vertices.push(p.x, p.y, p.z);
    }
  }

  const indices: number[] = [];
  const cols = segAx;
  for (let iy = 0; iy < segAng; iy++) {
    for (let ix = 0; ix < cols; ix++) {
      const a = ix + (cols + 1) * iy;
      const b = ix + (cols + 1) * (iy + 1);
      const c = ix + 1 + (cols + 1) * (iy + 1);
      const d = ix + 1 + (cols + 1) * iy;
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(rect.color),
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  return new THREE.Mesh(geometry, material);
}
