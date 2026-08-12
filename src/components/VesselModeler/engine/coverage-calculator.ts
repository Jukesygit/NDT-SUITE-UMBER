// =============================================================================
// Vessel Modeler - Coverage Calculator
// =============================================================================
// Pure math module for computing overlap-aware shell coverage.
// Uses coordinate compression to handle arbitrary rectangle overlaps
// and numerical integration for true ellipsoidal surface area on dome regions.
//
// Geometry routing (must mirror how the rect is DRAWN — see head-coverage.ts):
//   - pure-cylinder rects (whole meridian-arc extent within [0, L]) keep the
//     legacy compressed box sweep, byte-identical;
//   - head-touching rects are drawn as rigid geodesic drapes, so their cylinder
//     part enters the same sweep clamped to [0, L] and their HEAD part is
//     measured on the drape raster in head-coverage.ts.
// The routing predicate itself is imported (scan-sampling.ts `rectIsPureCylinder`),
// never re-derived here.
// =============================================================================

import type { CoverageRectConfig, VesselState } from '../types';
import { computeHeadCoveredAreas } from './head-coverage';
import { buildAllFootprints, type JunctionFootprint } from './junction-footprint';
import {
  buildAppendageNozzleFootprints,
  buildMainShellNozzleFootprints,
} from './nozzle-footprint';
import { rectIsPureCylinder } from './scan-sampling';

/**
 * Main-shell cutout footprints: appendage junctions PLUS unmappable nozzle bores
 * (design R1), or [] when the vessel has neither. Guards the undefined/empty case
 * so vessels with no appendages and no shell nozzles never build a footprint and
 * stay byte-identical (design §9.4 shared predicate). Both consumers below —
 * region totals and the coverage sweep — use this one array so stats and visuals
 * always agree.
 */
function footprintsFor(vesselState: VesselState): JunctionFootprint[] {
  const appendageFps =
    vesselState.appendages && vesselState.appendages.length > 0
      ? buildAllFootprints(vesselState)
      : [];
  const nozzleFps = buildMainShellNozzleFootprints(vesselState);
  return nozzleFps.length > 0 ? [...appendageFps, ...nozzleFps] : appendageFps;
}

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

/**
 * Unwrap coverage rects into 2D (pos, angle) rectangles for a body whose
 * developed circumference is `circumference` (mm). Splits rects straddling the
 * 0/360 seam into two. Shared by the main shell (circumference = π·id) and the
 * per-appendage covered-area sweep (circumference = 2π·radius).
 */
function unwrapRects(rects: CoverageRectConfig[], circumference: number): UnwrappedRect[] {
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

function toUnwrappedRects(rects: CoverageRectConfig[], vesselState: VesselState): UnwrappedRect[] {
  return unwrapRects(rects, Math.PI * vesselState.id);
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

/**
 * Compute the valid (non-null) scanned area of a thickness grid in mm².
 *
 * Counts valid data points and multiplies by the flat grid-cell area
 * (xSpacing × ySpacing) — the same convention as the C-scan distribution
 * engine and the companion's `validArea`. Used as a robust fallback for the
 * Scan Coverage "Achieved" column when a composite's persisted
 * `stats.validArea` is missing (common for dome scans whose stats were never
 * round-tripped with area metrics).
 */
export function validAreaFromGrid(
  data: (number | null)[][],
  xAxis: number[],
  yAxis: number[],
): number {
  if (!data || data.length === 0 || !data[0] || data[0].length === 0) return 0;

  const xSpacing = xAxis.length > 1 ? Math.abs(xAxis[1] - xAxis[0]) : 1;
  const ySpacing = yAxis.length > 1 ? Math.abs(yAxis[1] - yAxis[0]) : 1;
  const cellArea = xSpacing * ySpacing;
  if (cellArea <= 0) return 0;

  let validPoints = 0;
  for (const row of data) {
    for (const v of row) {
      if (v != null && !Number.isNaN(v)) validPoints += 1;
    }
  }
  return validPoints * cellArea;
}

/**
 * Valid scanned area of a composite in mm². Prefers the persisted
 * `stats.validArea` (already computed) and falls back to recomputing from the
 * data grid when it is missing/non-positive — the same pattern Scan Coverage
 * uses so dome/appendage scans that never carried validArea still register.
 */
export function compositeValidArea(c: {
  stats: { validArea?: number };
  data: (number | null)[][];
  xAxis: number[];
  yAxis: number[];
}): number {
  const persisted = c.stats.validArea;
  if (typeof persisted === 'number' && persisted > 0) return persisted;
  return validAreaFromGrid(c.data, c.xAxis, c.yAxis);
}

/** Per-appendage coverage totals (design §9). */
export interface AppendageCoverageTotals {
  appendageId: string;
  name: string;
  /** Coverable lateral cylinder area in mm² (2πr·L). No end-closure area and no
   *  cutout on the appendage side in v1 (design §9.2). */
  totalMm2: number;
  /** Achieved scanned area in mm² — Σ validArea of this body's scan composites. */
  achievedMm2: number;
  /** Covered (coverage-rect) area in mm² on this body's lateral cylinder —
   *  overlap-aware Σ of the rects whose `bodyId` matches (Phase 4 §4). */
  coveredMm2: number;
}

/**
 * Overlap-aware covered area (mm²) of coverage rects on a plain cylinder of the
 * given radius/length — the appendage lateral surface (design §9.2: no head
 * regions, no cutout on the appendage side in v1). `pos` clamps to [0, length];
 * `angle` wraps at 360. Reuses the same coordinate-compression sweep as the
 * main-shell cylinder branch so overlapping rects never double-count.
 */
export function computeAppendageCoveredArea(
  rects: CoverageRectConfig[],
  radius: number,
  length: number,
  footprints: JunctionFootprint[] = [],
): number {
  if (rects.length === 0 || radius <= 0 || length <= 0) return 0;

  const circumference = 2 * Math.PI * radius;
  const unwrapped = unwrapRects(rects, circumference);
  if (unwrapped.length === 0) return 0;

  // Coordinate compression over the cylinder span [0, length] × [0, 360].
  const posSet = new Set<number>([0, length]);
  const angleSet = new Set<number>([0, 360]);
  for (const ur of unwrapped) {
    posSet.add(Math.max(0, Math.min(length, ur.posMin)));
    posSet.add(Math.max(0, Math.min(length, ur.posMax)));
    angleSet.add(Math.max(0, ur.angleMin));
    angleSet.add(Math.min(360, ur.angleMax));
  }

  const posCoords = Array.from(posSet).sort((a, b) => a - b);
  const angleCoords = Array.from(angleSet).sort((a, b) => a - b);

  let covered = 0;
  for (let pi = 0; pi < posCoords.length - 1; pi++) {
    const pMin = posCoords[pi];
    const pMax = posCoords[pi + 1];
    if (pMax <= pMin) continue;

    for (let ai = 0; ai < angleCoords.length - 1; ai++) {
      const aMin = angleCoords[ai];
      const aMax = angleCoords[ai + 1];
      if (aMax <= aMin) continue;

      const isCovered = unwrapped.some(
        (ur) => ur.posMin <= pMin && ur.posMax >= pMax && ur.angleMin <= aMin && ur.angleMax >= aMax,
      );
      if (!isCovered) continue;

      // Skip cells inside a boot nozzle bore — unmappable opening, no surface
      // there (design R1). Same wrap-safe containsCell predicate as the boot
      // lateral-total subtraction below and the wall-loss worker.
      if (footprints.length > 0) {
        const midPos = (pMin + pMax) / 2;
        const midAngle = (aMin + aMax) / 2;
        if (footprints.some((fp) => fp.containsCell(midPos, midAngle))) continue;
      }

      covered += cylinderCellArea(pMin, pMax, aMin, aMax, radius);
    }
  }

  return covered;
}

/**
 * Per-body coverage wrapper: for every appendage, its coverable lateral area and
 * the achieved area from scans mounted on that body (design §9). The main shell
 * keeps flowing through {@link computeRegionTotalAreas} / {@link computeCoverage}.
 *
 * Dimensions come straight from `AppendageConfig` (radius = diameter/2, length),
 * which are exactly `resolveBodyFrame(state, id)`'s `radius` / `axialLength`; read
 * as scalars here so this pure module stays free of the THREE-backed frame.
 */
export function computeAppendageCoverageTotals(vesselState: VesselState): AppendageCoverageTotals[] {
  const appendages = vesselState.appendages ?? [];
  return appendages.map((a) => {
    const radius = a.diameter / 2;
    // Boot nozzle bores are unmappable openings on THIS boot's cylinder: subtract
    // their footprint area from the boot lateral total AND exclude those cells from
    // the covered sweep (design R1 — one predicate for stats + visuals). Empty for
    // boots with no nozzles → totalMm2 unchanged (byte-identical).
    const nozzleFps = buildAppendageNozzleFootprints(vesselState, a);
    const cutoutMm2 = nozzleFps.reduce((sum, fp) => sum + fp.areaMm2, 0);
    const totalMm2 = Math.max(0, 2 * Math.PI * radius * a.length - cutoutMm2);
    let achievedMm2 = 0;
    for (const sc of vesselState.scanComposites) {
      if (sc.bodyId !== a.id) continue;
      achievedMm2 += compositeValidArea(sc);
    }
    // Covered = coverage rects that target THIS body (Phase 4 §4). Overlap-aware
    // on the appendage's lateral cylinder; main-shell rects (bodyId undefined)
    // never contribute here, and these rects never contribute to the main shell.
    const bodyRects = vesselState.coverageRects.filter((r) => r.bodyId === a.id);
    const coveredMm2 = computeAppendageCoveredArea(bodyRects, radius, a.length, nozzleFps);
    return { appendageId: a.id, name: a.name, totalMm2, achievedMm2, coveredMm2 };
  });
}

export function computeRegionTotalAreas(vesselState: VesselState): { leftHead: number; cylinder: number; rightHead: number } {
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

  // Appendage cutout (design §9.1): each junction footprint removes real shell
  // surface, so subtract its exact excluded area from the cylinder total. With
  // no appendages this is a no-op, keeping legacy models byte-identical. The
  // reconciliation is exact: (cylinder − Σarea) + Σarea === uncut cylinder.
  const cutoutArea = footprintsFor(vesselState).reduce((sum, fp) => sum + fp.areaMm2, 0);

  return {
    leftHead: headArea,
    cylinder: cylinderArea - cutoutArea,
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
  // Only main-shell rects (bodyId undefined) count toward main-shell coverage;
  // appendage-targeted rects are measured per-body by computeAppendageCoverageTotals.
  // With no bodyId rects present this is the full list, so legacy models stay
  // byte-identical.
  const mainRects = rects.filter((r) => r.bodyId === undefined);

  const regionAreas = computeRegionTotalAreas(vesselState);
  const emptyRegion = (total: number): RegionCoverage => ({
    covered: 0,
    total: total / 1e6, // mm² → m²
    percent: 0,
  });

  if (mainRects.length === 0) {
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

  // Geometry routing. A rect whose whole meridian-arc extent lies on the
  // cylinder is DRAWN as a plain box (legacy path); anything touching a head is
  // DRAWN as a rigid geodesic drape (surface-drape.ts). Reuse the geometry's own
  // predicate — never a re-derived copy — so stats can never route differently
  // from the visual (project rule: sampling mirrors the overlay projection).
  const cylRects = mainRects.filter((r) => rectIsPureCylinder(r, vesselState));
  const headRects = mainRects.filter((r) => !rectIsPureCylinder(r, vesselState));

  // Between the tangent lines the drape IS the box, so head-touching rects join
  // the SAME compressed sweep with their boxes clamped to pos ∈ [0, L]: the Shell
  // number stays exact and overlap with pure-cylinder rects is resolved by the one
  // sweep. Their head area comes solely from the drape raster below, so the
  // tangent line is never double-counted. With no head-touching rects the list is
  // the legacy one, so pure-cylinder models stay byte-identical.
  const unwrapped = [
    ...toUnwrappedRects(cylRects, vesselState),
    ...toUnwrappedRects(headRects, vesselState)
      .map((ur) => ({
        ...ur,
        posMin: Math.max(0, Math.min(TAN_TAN, ur.posMin)),
        posMax: Math.max(0, Math.min(TAN_TAN, ur.posMax)),
      }))
      .filter((ur) => ur.posMax > ur.posMin),
  ];

  // Appendage cutout predicates (design §9.4): a covered cell whose centre lies
  // inside a junction footprint sits over the shell opening and is not coverable.
  // Same buildAllFootprints predicate as the wall-loss worker and heatmap mask.
  const footprints = footprintsFor(vesselState);

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

      // Skip cells inside an appendage cutout — no shell surface there. The
      // footprint predicate is wrap-safe, so angles are passed unnormalised.
      if (footprints.length > 0) {
        const midAngle = (aMin + aMax) / 2;
        if (footprints.some(fp => fp.containsCell(midPos, midAngle))) continue;
      }

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

  // Head contribution of the drape-routed rects, measured on the geodesic drape
  // the viewport actually draws (head-coverage.ts). The box sweep above cannot
  // reach a head any more — every box it saw was clamped to [0, L] — so this is
  // an addition, not a double count.
  if (headRects.length > 0) {
    const headCovered = computeHeadCoveredAreas({ R, D, L: TAN_TAN, rects: headRects });
    leftHeadCovered += headCovered.left;
    rightHeadCovered += headCovered.right;
  }

  // The raster sums the head band area in the meridian-arc metric while the
  // region total integrates it axially (skipping the last 0.1% of the apex), so a
  // fully covered head can land a fraction of a percent over its total. Clamp so
  // the UI never shows >100%; a no-op for every partially covered head.
  leftHeadCovered = Math.min(leftHeadCovered, regionAreas.leftHead);
  rightHeadCovered = Math.min(rightHeadCovered, regionAreas.rightHead);

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
