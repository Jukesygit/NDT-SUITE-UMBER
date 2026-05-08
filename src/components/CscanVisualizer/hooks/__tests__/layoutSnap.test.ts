import { describe, it, expect } from 'vitest';
import { findSnap, type SnapResult } from '../layoutSnap';
import type { ScanPosition, ScanExtents } from '../useLayoutMode';

describe('findSnap', () => {
  // Scan A: 10mm wide, 4mm tall
  const extentsA: ScanExtents = { width: 10, height: 4, minX: 0, maxX: 10, minY: 0, maxY: 4 };
  // Scan B: 10mm wide, 4mm tall, positioned at x=20, y=0
  const extentsB: ScanExtents = { width: 10, height: 4, minX: 0, maxX: 10, minY: 0, maxY: 4 };

  const otherScans: Array<{ id: string; position: ScanPosition; extents: ScanExtents }> = [
    { id: 'b', position: { x: 20, y: 0 }, extents: extentsB },
  ];

  it('snaps right-to-left when within tolerance', () => {
    // Drag A so its right edge (x + 10 = 17) is near B's left edge (20)
    // Distance = 3mm, within 10mm tolerance
    const result = findSnap('a', { x: 7, y: 0 }, extentsA, otherScans, false);
    expect(result).not.toBeNull();
    expect(result!.snappedPosition.x).toBe(10); // right edge = 20 = B's left
  });

  it('does not snap when beyond tolerance', () => {
    // Drag A to x=-5, right edge = 5, distance to B's left = 15mm > 10mm
    const result = findSnap('a', { x: -5, y: 0 }, extentsA, otherScans, false);
    expect(result).toBeNull();
  });

  it('does not snap when shift key is held', () => {
    const result = findSnap('a', { x: 7, y: 0 }, extentsA, otherScans, true);
    expect(result).toBeNull();
  });

  it('does not snap horizontally when no vertical overlap', () => {
    // Move A to y=100, no vertical overlap with B at y=0
    const result = findSnap('a', { x: 7, y: 100 }, extentsA, otherScans, false);
    expect(result).toBeNull();
  });

  it('snaps vertically (bottom-to-top)', () => {
    // B at x=0, y=10. Drag A so bottom edge (y + 4 = 8) is near B's top (10)
    const vertScans = [{ id: 'b', position: { x: 0, y: 10 }, extents: extentsB }];
    const result = findSnap('a', { x: 0, y: 4 }, extentsA, vertScans, false);
    expect(result).not.toBeNull();
    expect(result!.snappedPosition.y).toBe(6); // bottom = 10 = B's top
  });

  it('picks closest snap when multiple edges are near', () => {
    // B at x=11 (left edge 11, right edge 21)
    // Drag A to x=0 → right edge = 10, distance to B left = 1mm
    const closeScans = [{ id: 'b', position: { x: 11, y: 0 }, extents: extentsB }];
    const result = findSnap('a', { x: 0, y: 0 }, extentsA, closeScans, false);
    expect(result).not.toBeNull();
    expect(result!.snappedPosition.x).toBe(1); // right edge = 11 = B's left
  });
});
