import type { ScanPosition, ScanExtents } from './useLayoutMode';

const SNAP_TOLERANCE = 10; // mm

export interface SnapCandidate {
  axis: 'x' | 'y';
  edge: 'left' | 'right' | 'top' | 'bottom';
  targetEdge: 'left' | 'right' | 'top' | 'bottom';
  targetId: string;
  distance: number;
  snapValue: number;
}

export interface SnapResult {
  snappedPosition: ScanPosition;
  guides: Array<{
    axis: 'x' | 'y';
    value: number;
    start: number;
    end: number;
    targetId: string;
  }>;
}

function rangesOverlap(aMin: number, aMax: number, bMin: number, bMax: number): boolean {
  return aMin < bMax && aMax > bMin;
}

export function findSnap(
  _draggedId: string,
  proposedPos: ScanPosition,
  draggedExtents: ScanExtents,
  otherScans: Array<{ id: string; position: ScanPosition; extents: ScanExtents }>,
  shiftHeld: boolean,
): SnapResult | null {
  if (shiftHeld) return null;

  const dLeft = proposedPos.x;
  const dRight = proposedPos.x + draggedExtents.width;
  const dTop = proposedPos.y;
  const dBottom = proposedPos.y + draggedExtents.height;

  const candidates: SnapCandidate[] = [];

  for (const other of otherScans) {
    const oLeft = other.position.x;
    const oRight = other.position.x + other.extents.width;
    const oTop = other.position.y;
    const oBottom = other.position.y + other.extents.height;

    const hOverlap = rangesOverlap(dTop, dBottom, oTop, oBottom);
    const vOverlap = rangesOverlap(dLeft, dRight, oLeft, oRight);

    if (hOverlap) {
      // right-to-left
      const d1 = Math.abs(dRight - oLeft);
      if (d1 <= SNAP_TOLERANCE) {
        candidates.push({
          axis: 'x',
          edge: 'right',
          targetEdge: 'left',
          targetId: other.id,
          distance: d1,
          snapValue: oLeft - draggedExtents.width,
        });
      }
      // left-to-right
      const d2 = Math.abs(dLeft - oRight);
      if (d2 <= SNAP_TOLERANCE) {
        candidates.push({
          axis: 'x',
          edge: 'left',
          targetEdge: 'right',
          targetId: other.id,
          distance: d2,
          snapValue: oRight,
        });
      }
      // left-to-left
      const d3 = Math.abs(dLeft - oLeft);
      if (d3 <= SNAP_TOLERANCE) {
        candidates.push({
          axis: 'x',
          edge: 'left',
          targetEdge: 'left',
          targetId: other.id,
          distance: d3,
          snapValue: oLeft,
        });
      }
      // right-to-right
      const d4 = Math.abs(dRight - oRight);
      if (d4 <= SNAP_TOLERANCE) {
        candidates.push({
          axis: 'x',
          edge: 'right',
          targetEdge: 'right',
          targetId: other.id,
          distance: d4,
          snapValue: oRight - draggedExtents.width,
        });
      }
    }

    if (vOverlap) {
      // bottom-to-top
      const d5 = Math.abs(dBottom - oTop);
      if (d5 <= SNAP_TOLERANCE) {
        candidates.push({
          axis: 'y',
          edge: 'bottom',
          targetEdge: 'top',
          targetId: other.id,
          distance: d5,
          snapValue: oTop - draggedExtents.height,
        });
      }
      // top-to-bottom
      const d6 = Math.abs(dTop - oBottom);
      if (d6 <= SNAP_TOLERANCE) {
        candidates.push({
          axis: 'y',
          edge: 'top',
          targetEdge: 'bottom',
          targetId: other.id,
          distance: d6,
          snapValue: oBottom,
        });
      }
      // top-to-top
      const d7 = Math.abs(dTop - oTop);
      if (d7 <= SNAP_TOLERANCE) {
        candidates.push({
          axis: 'y',
          edge: 'top',
          targetEdge: 'top',
          targetId: other.id,
          distance: d7,
          snapValue: oTop,
        });
      }
      // bottom-to-bottom
      const d8 = Math.abs(dBottom - oBottom);
      if (d8 <= SNAP_TOLERANCE) {
        candidates.push({
          axis: 'y',
          edge: 'bottom',
          targetEdge: 'bottom',
          targetId: other.id,
          distance: d8,
          snapValue: oBottom - draggedExtents.height,
        });
      }
    }
  }

  if (candidates.length === 0) return null;

  // Pick best X snap and best Y snap independently
  const xCandidates = candidates.filter((c) => c.axis === 'x');
  const yCandidates = candidates.filter((c) => c.axis === 'y');

  const bestX =
    xCandidates.length > 0
      ? xCandidates.reduce((a, b) => (a.distance < b.distance ? a : b))
      : null;
  const bestY =
    yCandidates.length > 0
      ? yCandidates.reduce((a, b) => (a.distance < b.distance ? a : b))
      : null;

  const snappedPosition: ScanPosition = {
    x: bestX ? bestX.snapValue : proposedPos.x,
    y: bestY ? bestY.snapValue : proposedPos.y,
  };

  const guides: SnapResult['guides'] = [];
  if (bestX) {
    const snapX =
      bestX.edge === 'right' ? snappedPosition.x + draggedExtents.width : snappedPosition.x;
    const target = otherScans.find((s) => s.id === bestX.targetId)!;
    const minY = Math.min(snappedPosition.y, target.position.y);
    const maxY = Math.max(
      snappedPosition.y + draggedExtents.height,
      target.position.y + target.extents.height,
    );
    guides.push({ axis: 'x', value: snapX, start: minY, end: maxY, targetId: bestX.targetId });
  }
  if (bestY) {
    const snapY =
      bestY.edge === 'bottom' ? snappedPosition.y + draggedExtents.height : snappedPosition.y;
    const target = otherScans.find((s) => s.id === bestY.targetId)!;
    const minX = Math.min(snappedPosition.x, target.position.x);
    const maxX = Math.max(
      snappedPosition.x + draggedExtents.width,
      target.position.x + target.extents.width,
    );
    guides.push({ axis: 'y', value: snapY, start: minX, end: maxX, targetId: bestY.targetId });
  }

  return { snappedPosition, guides };
}
