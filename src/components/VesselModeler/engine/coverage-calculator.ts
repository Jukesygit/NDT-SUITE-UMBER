// =============================================================================
// Vessel Modeler - Coverage Calculator
// =============================================================================
// Pure math module for computing overlap-aware shell coverage.
// Uses coordinate compression to handle arbitrary rectangle overlaps
// and numerical integration for true ellipsoidal surface area on dome regions.
// =============================================================================

import type { CoverageRectConfig, VesselState } from '../types';

// ---------------------------------------------------------------------------
// Result Interface
// ---------------------------------------------------------------------------

export interface RegionCoverage {
  covered: number;   // m²
  total: number;     // m²
  percent: number;   // 0-100
}

export interface CoverageResult {
  leftHead: RegionCoverage;
  cylinder: RegionCoverage;
  rightHead: RegionCoverage;
  total: RegionCoverage;
}

// ---------------------------------------------------------------------------
// Unwrapped Rectangle (2D pos/angle space)
// ---------------------------------------------------------------------------

interface UnwrappedRect {
  posMin: number;
  posMax: number;
  angleMin: number;
  angleMax: number;
}

// ---------------------------------------------------------------------------
// Convert coverage rects to unwrapped 2D rectangles
// ---------------------------------------------------------------------------

function toUnwrappedRects(rects: CoverageRectConfig[], vesselState: VesselState): UnwrappedRect[] {
  const circumference = Math.PI * vesselState.id;
  const result: UnwrappedRect[] = [];

  for (const r of rects) {
    const halfW = r.width / 2;
    const halfH = r.height / 2;
    const angularHalfSpan = (halfH / circumference) * 360;

    const posMin = r.pos - halfW;
    const posMax = r.pos + halfW;
    const angleMin = r.angle - angularHalfSpan;
    const angleMax = r.angle + angularHalfSpan;

    // Handle wrapping around 0/360 boundary
    if (angleMin < 0) {
      // Split into two: [angleMin+360, 360) and [0, angleMax]
      result.push({ posMin, posMax, angleMin: angleMin + 360, angleMax: 360 });
      result.push({ posMin, posMax, angleMin: 0, angleMax });
    } else if (angleMax > 360) {
      // Split into two: [angleMin, 360) and [0, angleMax-360]
      result.push({ posMin, posMax, angleMin, angleMax: 360 });
      result.push({ posMin, posMax, angleMin: 0, angleMax: angleMax - 360 });
    } else {
      result.push({ posMin, posMax, angleMin, angleMax });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Surface Area Element Calculations
// ---------------------------------------------------------------------------

const NUM_SUBSTEPS = 16;

/**
 * Compute the true surface area of a cell on the ellipsoidal head.
 * Uses numerical integration: dA = r(z) * sqrt(1 + (dr/dz)²) * dθ * dz
 * where r(z) = R * sqrt(1 - (z/D)²) and D = HEAD_DEPTH.
 */
function ellipsoidCellArea(
  posMin: number,
  posMax: number,
  angleMinDeg: number,
  angleMaxDeg: number,
  radius: number,
  headDepth: number,
  isLeftHead: boolean,
  tanTan: number,
): number {
  const dTheta = ((angleMaxDeg - angleMinDeg) / 360) * 2 * Math.PI;
  if (dTheta <= 0) return 0;

  const dz = (posMax - posMin) / NUM_SUBSTEPS;
  let area = 0;

  for (let i = 0; i < NUM_SUBSTEPS; i++) {
    const pos = posMin + (i + 0.5) * dz;
    // Convert pos to local z coordinate on the head
    const zLocal = isLeftHead ? -pos : pos - tanTan;
    const ratio = Math.min(0.999, Math.abs(zLocal / headDepth));

    const rLocal = radius * Math.sqrt(1 - ratio * ratio);
    // dr/dz for ellipsoid: dr/dz = -R * z / (D² * sqrt(1 - (z/D)²))
    const drdz = (radius * ratio) / (headDepth * Math.sqrt(1 - ratio * ratio));
    const integrand = rLocal * Math.sqrt(1 + drdz * drdz);
    area += integrand * dTheta * Math.abs(dz);
  }

  return area;
}

/**
 * Compute the surface area of a cell on the cylindrical shell.
 * dA = R * dθ * dPos (cylinder unrolls flat).
 */
function cylinderCellArea(
  posMin: number,
  posMax: number,
  angleMinDeg: number,
  angleMaxDeg: number,
  radius: number,
): number {
  const dTheta = ((angleMaxDeg - angleMinDeg) / 360) * 2 * Math.PI;
  const dPos = posMax - posMin;
  return radius * dTheta * dPos;
}

// ---------------------------------------------------------------------------
// Region Total Areas
// ---------------------------------------------------------------------------

function computeRegionTotalAreas(vesselState: VesselState): { leftHead: number; cylinder: number; rightHead: number } {
  const R = vesselState.id / 2;
  const D = vesselState.id / (2 * vesselState.headRatio);

  // Ellipsoidal head surface area (numerical integration for one head)
  // Integrate from z=0 to z=D: 2πR * r(z) * sqrt(1 + (dr/dz)²) dz
  const steps = 200;
  const dz = D / steps;
  let headArea = 0;
  for (let i = 0; i < steps; i++) {
    const z = (i + 0.5) * dz;
    const ratio = z / D;
    if (ratio >= 0.999) continue;
    const rLocal = R * Math.sqrt(1 - ratio * ratio);
    const drdz = (R * ratio) / (D * Math.sqrt(1 - ratio * ratio));
    headArea += rLocal * Math.sqrt(1 + drdz * drdz) * 2 * Math.PI * dz;
  }

  const cylinderArea = 2 * Math.PI * R * vesselState.length;

  return {
    leftHead: headArea,
    cylinder: cylinderArea,
    rightHead: headArea, // symmetric
  };
}

// ---------------------------------------------------------------------------
// Main: computeCoverage
// ---------------------------------------------------------------------------

export function computeCoverage(
  rects: CoverageRectConfig[],
  vesselState: VesselState,
): CoverageResult {
  const regionAreas = computeRegionTotalAreas(vesselState);
  const emptyRegion = (total: number): RegionCoverage => ({
    covered: 0,
    total: total / 1e6, // mm² → m²
    percent: 0,
  });

  if (rects.length === 0) {
    return {
      leftHead: emptyRegion(regionAreas.leftHead),
      cylinder: emptyRegion(regionAreas.cylinder),
      rightHead: emptyRegion(regionAreas.rightHead),
      total: emptyRegion(regionAreas.leftHead + regionAreas.cylinder + regionAreas.rightHead),
    };
  }

  const R = vesselState.id / 2;
  const D = vesselState.id / (2 * vesselState.headRatio);
  const TAN_TAN = vesselState.length;

  const unwrapped = toUnwrappedRects(rects, vesselState);

  // Collect unique coordinates for coordinate compression
  const posSet = new Set<number>();
  const angleSet = new Set<number>();

  // Insert region boundaries
  posSet.add(-D);
  posSet.add(0);
  posSet.add(TAN_TAN);
  posSet.add(TAN_TAN + D);
  angleSet.add(0);
  angleSet.add(360);

  for (const ur of unwrapped) {
    posSet.add(Math.max(-D, ur.posMin));
    posSet.add(Math.min(TAN_TAN + D, ur.posMax));
    angleSet.add(Math.max(0, ur.angleMin));
    angleSet.add(Math.min(360, ur.angleMax));
  }

  const posCoords = Array.from(posSet).sort((a, b) => a - b);
  const angleCoords = Array.from(angleSet).sort((a, b) => a - b);

  // Sweep compressed grid
  let leftHeadCovered = 0;
  let cylinderCovered = 0;
  let rightHeadCovered = 0;

  for (let pi = 0; pi < posCoords.length - 1; pi++) {
    const pMin = posCoords[pi];
    const pMax = posCoords[pi + 1];
    if (pMax <= pMin) continue;

    for (let ai = 0; ai < angleCoords.length - 1; ai++) {
      const aMin = angleCoords[ai];
      const aMax = angleCoords[ai + 1];
      if (aMax <= aMin) continue;

      // Check if any unwrapped rect covers this cell
      const covered = unwrapped.some(ur =>
        ur.posMin <= pMin && ur.posMax >= pMax &&
        ur.angleMin <= aMin && ur.angleMax >= aMax
      );
      if (!covered) continue;

      // Compute true surface area for this cell
      let cellArea: number;
      const midPos = (pMin + pMax) / 2;

      if (midPos < 0) {
        // Left head
        cellArea = ellipsoidCellArea(pMin, pMax, aMin, aMax, R, D, true, TAN_TAN);
        leftHeadCovered += cellArea;
      } else if (midPos > TAN_TAN) {
        // Right head
        cellArea = ellipsoidCellArea(pMin, pMax, aMin, aMax, R, D, false, TAN_TAN);
        rightHeadCovered += cellArea;
      } else {
        // Cylinder
        cellArea = cylinderCellArea(pMin, pMax, aMin, aMax, R);
        cylinderCovered += cellArea;
      }
    }
  }

  const makeRegion = (covered: number, total: number): RegionCoverage => ({
    covered: covered / 1e6,
    total: total / 1e6,
    percent: total > 0 ? (covered / total) * 100 : 0,
  });

  const totalCovered = leftHeadCovered + cylinderCovered + rightHeadCovered;
  const totalArea = regionAreas.leftHead + regionAreas.cylinder + regionAreas.rightHead;

  return {
    leftHead: makeRegion(leftHeadCovered, regionAreas.leftHead),
    cylinder: makeRegion(cylinderCovered, regionAreas.cylinder),
    rightHead: makeRegion(rightHeadCovered, regionAreas.rightHead),
    total: makeRegion(totalCovered, totalArea),
  };
}
