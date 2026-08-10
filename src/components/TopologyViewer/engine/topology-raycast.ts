import * as THREE from 'three';
import type { CscanData } from '../../CscanVisualizer/types';

// ---------------------------------------------------------------------------
// Pure raycast → grid resolution helpers.
//
// Extracted verbatim from TopologyViewport so the same click-to-grid math can
// be reused by other surfaces (e.g. the Vessel Modeler relief view) without
// forking. Behavior is byte-identical to the previous inline definitions.
// ---------------------------------------------------------------------------

/** Find the index in `axis` whose value is nearest to `value`. */
export function findNearestIndex(axis: number[], value: number): number {
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
export function toNDC(clientX: number, clientY: number, rect: DOMRect): THREE.Vector2 {
  return new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1
  );
}

/**
 * Resolve grid row/col from a raycast hit. Uses the face's vertex indices
 * when geometry userData is available (works in both flat and cylinder mode),
 * falling back to the flat-mode nearest-axis lookup.
 */
export function resolveGridFromHit(
  hit: THREE.Intersection,
  cs: CscanData,
  flatCol: number,
  flatRow: number
): { gridRow: number; gridCol: number } {
  const geo = (hit.object as THREE.Mesh).geometry;
  const ud = geo?.userData as
    | {
        cols?: number;
        xAxis?: number[];
        yAxis?: number[];
      }
    | undefined;
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
