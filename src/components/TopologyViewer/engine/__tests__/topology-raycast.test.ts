import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { findNearestIndex, resolveGridFromHit } from '../topology-raycast';
import type { CscanData } from '../../../CscanVisualizer/types';

describe('findNearestIndex', () => {
  const axis = [0, 10, 20, 30];

  it('returns the exact index on a direct hit', () => {
    expect(findNearestIndex(axis, 20)).toBe(2);
  });

  it('rounds to the nearest sample', () => {
    expect(findNearestIndex(axis, 12)).toBe(1); // 10 is 2 away, 20 is 8 away
    expect(findNearestIndex(axis, 16)).toBe(2); // 20 is 4 away, 10 is 6 away
  });

  it('clamps to the first sample below the range', () => {
    expect(findNearestIndex(axis, -100)).toBe(0);
  });

  it('clamps to the last sample above the range', () => {
    expect(findNearestIndex(axis, 999)).toBe(3);
  });

  it('keeps the first index on an exact tie (strict <)', () => {
    // 15 is equidistant from 10 (idx 1) and 20 (idx 2); first wins.
    expect(findNearestIndex(axis, 15)).toBe(1);
  });
});

/** Build a minimal indexed geometry carrying the surface builder's userData. */
function makeHit(
  cols: number,
  xAxis: number[],
  yAxis: number[],
  indexList: number[],
  faceIndex: number | null,
  attachUserData = true,
): THREE.Intersection {
  const geometry = new THREE.BufferGeometry();
  // Position buffer only needs to exist; resolveGridFromHit reads the index.
  const vertCount = Math.max(...indexList) + 1;
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(vertCount * 3), 3),
  );
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indexList), 1));
  if (attachUserData) geometry.userData = { rows: yAxis.length, cols, xAxis, yAxis };
  const mesh = new THREE.Mesh(geometry);
  return { object: mesh, faceIndex } as unknown as THREE.Intersection;
}

describe('resolveGridFromHit', () => {
  it('maps the hit face back to full-res grid indices via userData', () => {
    const cs = {
      xAxis: [0, 10, 20],
      yAxis: [0, 100, 200],
    } as unknown as CscanData;
    // cols=3, first vertex of face 0 is index 4 → row=1, col=1
    const hit = makeHit(3, [0, 10, 20], [0, 100, 200], [4, 3, 5], 0);
    expect(resolveGridFromHit(hit, cs, -1, -1)).toEqual({ gridRow: 1, gridCol: 1 });
  });

  it('remaps a decimated display mesh onto the full-res grid by nearest mm', () => {
    // Display mesh is decimated (2 cols spanning 0..20); the underlying grid is
    // full-res (4 cols). The hit's mm position must resolve to the nearest cell.
    const cs = {
      xAxis: [0, 10, 20, 30],
      yAxis: [0, 5, 10, 15],
    } as unknown as CscanData;
    // cols=2, face 0 first vertex = index 1 → decimatedRow=0, decimatedCol=1
    // → scanMm=20 (nearest full-res col 2), indexMm=0 (nearest full-res row 0)
    const hit = makeHit(2, [0, 20], [0, 15], [1, 0, 3], 0);
    expect(resolveGridFromHit(hit, cs, -1, -1)).toEqual({ gridRow: 0, gridCol: 2 });
  });

  it('falls back to the flat nearest-axis indices when faceIndex is null', () => {
    const cs = { xAxis: [0, 10], yAxis: [0, 10] } as unknown as CscanData;
    const hit = makeHit(2, [0, 10], [0, 10], [0, 1, 2], null);
    expect(resolveGridFromHit(hit, cs, 7, 9)).toEqual({ gridRow: 9, gridCol: 7 });
  });

  it('falls back when the geometry carries no grid userData', () => {
    const cs = { xAxis: [0, 10], yAxis: [0, 10] } as unknown as CscanData;
    const hit = makeHit(2, [0, 10], [0, 10], [0, 1, 2], 0, false);
    expect(resolveGridFromHit(hit, cs, 3, 4)).toEqual({ gridRow: 4, gridCol: 3 });
  });
});
