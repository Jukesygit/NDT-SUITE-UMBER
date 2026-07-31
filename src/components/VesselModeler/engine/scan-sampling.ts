// =============================================================================
// Vessel Modeler - Surface Scan Sampling (shell + dome, body-aware)
// =============================================================================
// The single shared sampler behind annotation thickness stats AND the
// annotation mini-heatmap. Given a point on the vessel surface `(pos, angle)`
// it returns the thickness the overlay draws there, resolving the region:
//   - cylinder (0 <= pos <= L)  -> cylindrical scan composites (legacy math)
//   - head     (pos < 0 | > L)  -> dome scan composites via the SAME
//                                   tangent-plane grid the overlay renders
//                                   (engine/dome-tangent.ts).
// An annotation footprint that touches a head is sampled along the SAME rigid
// geodesic drape (engine/surface-drape.ts) its geometry is drawn with, so the
// stats/heatmap agree with the visible shape; a footprint straddling the
// tangent line samples each cell in exactly one region, so the seam is never
// double-counted. Composites are matched by body (undefined = main shell), so
// appendage scans no longer need the interim `!bodyId` exclusion.
//
// Pure / Three-free (worker-safe): no THREE import, only the pure dome-arc /
// surface-drape / dome-tangent helpers.
// =============================================================================

import type {
  AnnotationShapeConfig,
  DomeScanConfig,
  ScanCompositeConfig,
  VesselState,
} from '../types';
import { buildMeridianProfile, arcFromAxial } from './dome-arc';
import { buildDrapeGrid, type DrapeCell } from './surface-drape';
import { buildDomeTangentBasis, surfaceToTangentOffsets } from './dome-tangent';

/** Sample spacing (mm) for the footprint grids — matches the legacy stats grid. */
const STEP_MM = 2;
/** Drape sampling grid bounds (head-touching footprints). Rows are forced even. */
const DRAPE_MIN_SEGMENTS = 8;
const DRAPE_MAX_SEGMENTS = 96;

/** Normalise an angle into the 0–360 range. */
export function normAngle(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Look up a thickness value in a cylindrical composite's data grid for a given
 * vessel surface point expressed as (posMm, angleDeg).
 *
 * Returns the thickness value, or undefined if the point is outside the
 * composite's footprint or the data cell is null.
 */
export function sampleComposite(
  composite: ScanCompositeConfig,
  posMm: number,
  angleDeg: number,
  circumference: number,
): number | undefined {
  const { data, xAxis, yAxis, indexStartMm, datumAngleDeg, scanDirection, indexDirection } =
    composite;

  if (data.length === 0 || data[0].length === 0) return undefined;
  if (yAxis.length === 0 || xAxis.length === 0) return undefined;

  // --- Index (longitudinal) axis ---
  const indexRangeMm = yAxis[yAxis.length - 1] - yAxis[0];
  let indexOffset: number;
  if (indexDirection === 'forward') {
    indexOffset = posMm - indexStartMm;
  } else {
    indexOffset = indexStartMm - posMm;
  }
  if (indexOffset < 0 || indexOffset > indexRangeMm) return undefined;

  // --- Scan (circumferential) axis ---
  const scanStartMm = xAxis[0];
  const scanEndMm = xAxis[xAxis.length - 1];
  const scanRangeMm = scanEndMm - scanStartMm;

  const datumInAnnConvention = normAngle(datumAngleDeg + 90);
  let scanOffsetDeg: number;
  if (scanDirection === 'cw') {
    scanOffsetDeg = ((datumInAnnConvention - angleDeg) % 360 + 360) % 360;
  } else {
    scanOffsetDeg = ((angleDeg - datumInAnnConvention) % 360 + 360) % 360;
  }
  const scanOffsetMm = (scanOffsetDeg / 360) * circumference;
  if (scanOffsetMm < scanStartMm || scanOffsetMm > scanEndMm) return undefined;

  const rowFrac = indexRangeMm > 0 ? (indexOffset / indexRangeMm) * (data.length - 1) : 0;
  const colFrac = scanRangeMm > 0 ? ((scanOffsetMm - scanStartMm) / scanRangeMm) * (data[0].length - 1) : 0;

  const row = Math.round(rowFrac);
  const col = Math.round(colFrac);

  if (row < 0 || row >= data.length || col < 0 || col >= data[0].length) return undefined;

  const value = data[row][col];
  return value ?? undefined;
}

// ---------------------------------------------------------------------------
// Dome scan sampling
// ---------------------------------------------------------------------------

/** Vessel head dimensions the dome sampler needs (all mm). */
export interface HeadDims {
  /** Body radius. */
  R: number;
  /** Head depth (ellipsoid semi-axis toward the apex). */
  D: number;
  /** Tan-tan (cylinder) length. */
  L: number;
}

/**
 * Look up a thickness value in a DOME scan composite for a vessel surface point
 * `(posMm, angleDeg)` on the head.
 *
 * Inverts the overlay's tangent-plane projection (engine/dome-tangent.ts) to
 * the scan grid's normalized `(u, v)`, then resolves the data cell EXACTLY the
 * way the dome-scan hover does (`col = floor(uv.x·cols)`,
 * `row = floor((1 − uv.y)·rows)`, with the scan/index direction flips), so a
 * sampled value lands on the same cell the overlay paints at that point. Returns
 * undefined when the point is outside the scan footprint or the cell is null.
 */
export function sampleDomeComposite(
  config: DomeScanConfig,
  posMm: number,
  angleDeg: number,
  dims: HeadDims,
): number | undefined {
  const { data, xAxis, yAxis, scanDirection, indexDirection } = config;
  if (data.length === 0 || data[0].length === 0) return undefined;
  if (xAxis.length < 2 || yAxis.length < 2) return undefined;

  const numRows = data.length; // index axis (yAxis)
  const numCols = data[0].length; // scan axis (xAxis)
  const scanRangeMm = Math.abs(xAxis[xAxis.length - 1] - xAxis[0]);
  const indexRangeMm = Math.abs(yAxis[yAxis.length - 1] - yAxis[0]);
  if (scanRangeMm <= 0 || indexRangeMm <= 0) return undefined;

  // An appendage end closure ('end') is the 'right'-head analog (apex outward,
  // tangent line at the cylinder length), so the caller passes the appendage's
  // R/D/L in `dims` and (posMm, angleDeg) in the appendage frame, and the sampler
  // inverts through the same 'right' projection the overlay geometry draws with.
  const head: 'left' | 'right' = config.head === 'left' ? 'left' : 'right';
  const basis = buildDomeTangentBasis(dims.R, dims.D, config.centerPhi, config.centerTheta);
  const offsets = surfaceToTangentOffsets(basis, dims.R, dims.D, dims.L, head, posMm, angleDeg);
  if (!offsets) return undefined;

  // Grid parameter (0..1) from the centre-referenced tangent offsets.
  const u = offsets.scanMm / scanRangeMm + 0.5;
  const v = offsets.indexMm / indexRangeMm + 0.5;
  if (u < 0 || u > 1 || v < 0 || v > 1) return undefined;

  // UV as the overlay assigns it, then the hover's floor-to-cell (mirror of
  // interaction-manager.ts dome-scan hover).
  const uvX = scanDirection === 'ccw' ? u : 1 - u;
  const uvY = indexDirection === 'inward' ? v : 1 - v;
  let col = Math.floor(uvX * numCols);
  let row = Math.floor((1 - uvY) * numRows);
  if (col < 0) col = 0;
  else if (col >= numCols) col = numCols - 1;
  if (row < 0) row = 0;
  else if (row >= numRows) row = numRows - 1;

  const value = data[row][col];
  return value ?? undefined;
}

// ---------------------------------------------------------------------------
// Region-aware point sampler
// ---------------------------------------------------------------------------

/** True when the composite's body matches the sampler's body (undefined = main shell). */
function bodyMatches(compBodyId: string | undefined, body: string | undefined): boolean {
  return (compBodyId ?? undefined) === (body ?? undefined);
}

/** Topmost confirmed, body-matched cylindrical composite value at (pos, angle). */
function sampleShellRegion(
  vesselState: VesselState,
  posMm: number,
  angleDeg: number,
  body: string | undefined,
  circumference: number,
): number | undefined {
  const composites = vesselState.scanComposites;
  // Reverse order: last (topmost) composite wins, matching the render/stack order.
  for (let i = composites.length - 1; i >= 0; i--) {
    const comp = composites[i];
    if (!comp.orientationConfirmed) continue;
    if (!bodyMatches(comp.bodyId, body)) continue;
    const val = sampleComposite(comp, posMm, angleDeg, circumference);
    if (val !== undefined) return val;
  }
  return undefined;
}

/** Topmost confirmed dome composite value at a head point (main shell only). */
function sampleDomeRegion(
  vesselState: VesselState,
  posMm: number,
  angleDeg: number,
  body: string | undefined,
  dims: HeadDims,
): number | undefined {
  // Dome scans are main-shell only (DomeScanConfig carries no bodyId yet — that
  // is a Tranche 1c follow-up); an appendage-bodied annotation never matches one.
  if (body !== undefined) return undefined;
  const domes = vesselState.domeScanComposites;
  if (!domes || domes.length === 0) return undefined;
  const head: 'left' | 'right' = posMm < 0 ? 'left' : 'right';
  for (let i = domes.length - 1; i >= 0; i--) {
    const dome = domes[i];
    if (!dome.orientationConfirmed) continue;
    if (dome.head !== head) continue;
    const val = sampleDomeComposite(dome, posMm, angleDeg, dims);
    if (val !== undefined) return val;
  }
  return undefined;
}

/**
 * Region-aware sample: cylinder points sample cylindrical composites, head
 * points sample dome composites — each point belongs to exactly one region, so
 * a footprint straddling the tangent line is never double-counted. Composites
 * are matched by `body` (undefined = main shell).
 */
export function sampleSurfacePoint(
  vesselState: VesselState,
  posMm: number,
  angleDeg: number,
  body: string | undefined,
): number | undefined {
  const L = vesselState.length;
  if (posMm >= 0 && posMm <= L) {
    return sampleShellRegion(vesselState, posMm, angleDeg, body, Math.PI * vesselState.id);
  }
  const R = vesselState.id / 2;
  const D = vesselState.id / (2 * vesselState.headRatio);
  return sampleDomeRegion(vesselState, posMm, angleDeg, body, { R, D, L });
}

// ---------------------------------------------------------------------------
// Annotation footprint sampling (shared by stats + heatmap)
// ---------------------------------------------------------------------------

/** One sampled reading within an annotation footprint. */
export interface FootprintSample {
  pos: number;
  angle: number;
  value: number;
}

/**
 * True when the annotation's whole meridian-arc extent lies on the cylinder
 * [0, L]. Mirrors annotation-geometry.ts `rectIsPureCylinder`, so stats/heatmap
 * route to the legacy box vs the rigid drape EXACTLY where the geometry does.
 */
export function rectIsPureCylinder(ann: AnnotationShapeConfig, vesselState: VesselState): boolean {
  const R = vesselState.id / 2;
  const D = vesselState.id / (2 * vesselState.headRatio);
  const L = vesselState.length;
  const profile = buildMeridianProfile(R, D);
  const s0 = arcFromAxial(profile, L, ann.pos);
  const halfW = ann.width / 2;
  return s0 - halfW >= 0 && s0 + halfW <= L;
}

/** Adaptive drape sampling resolution (~STEP_MM spacing), rows forced even. */
function drapeSampleResolution(widthMm: number, heightMm: number): { cols: number; rows: number } {
  const clamp = (n: number) => Math.max(DRAPE_MIN_SEGMENTS, Math.min(DRAPE_MAX_SEGMENTS, n));
  const cols = clamp(Math.round(widthMm / STEP_MM));
  let rows = clamp(Math.round(heightMm / STEP_MM));
  if (rows % 2 !== 0) rows = Math.min(DRAPE_MAX_SEGMENTS, rows + 1);
  return { cols, rows };
}

/** A sampled rigid-drape grid over a head-touching annotation footprint. */
export interface DrapeSampleGrid {
  /** Sampled thickness per grid vertex `[col][row]` (undefined = no data). */
  values: (number | undefined)[][];
  /** Surface coordinates per grid vertex `[col][row]` (mirrors the drawn drape). */
  cells: DrapeCell[][];
  cols: number;
  rows: number;
}

/**
 * Sample a head-touching annotation along the SAME rigid geodesic drape its
 * geometry is rendered with (surface-drape.ts). Each grid vertex is sampled
 * region-aware, so cylinder vertices read cylindrical composites and head
 * vertices read dome composites — the seam is sampled once per vertex.
 */
export function sampleAnnotationDrapeGrid(
  ann: AnnotationShapeConfig,
  vesselState: VesselState,
  body?: string,
): DrapeSampleGrid {
  const R = vesselState.id / 2;
  const D = vesselState.id / (2 * vesselState.headRatio);
  const L = vesselState.length;
  const { cols, rows } = drapeSampleResolution(ann.width, ann.height);
  const { grid } = buildDrapeGrid({
    R,
    D,
    L,
    pos: ann.pos,
    angleDeg: ann.angle,
    widthMm: ann.width,
    heightMm: ann.height,
    cols,
    rows,
  });

  const values: (number | undefined)[][] = new Array(cols + 1);
  for (let c = 0; c <= cols; c++) {
    values[c] = new Array(rows + 1);
    for (let r = 0; r <= rows; r++) {
      const cell = grid[c][r];
      values[c][r] = sampleSurfacePoint(vesselState, cell.pos, cell.angleDeg, body);
    }
  }
  return { values, cells: grid, cols, rows };
}

/** Legacy axial×circumferential box grid (pure-cylinder footprint). */
function sampleCylinderBox(
  ann: AnnotationShapeConfig,
  vesselState: VesselState,
  body: string | undefined,
): FootprintSample[] {
  const circumference = Math.PI * vesselState.id;
  const halfWidthMm = ann.width / 2;
  const halfHeightMm = ann.height / 2;
  const halfHeightDeg = (halfHeightMm / circumference) * 360;

  const axialStart = ann.pos - halfWidthMm;
  const axialEnd = ann.pos + halfWidthMm;
  const angleStart = ann.angle - halfHeightDeg;
  const angleEnd = ann.angle + halfHeightDeg;

  const degPerMm = 360 / circumference;
  const angleDegStep = STEP_MM * degPerMm;

  const out: FootprintSample[] = [];
  for (let axial = axialStart; axial <= axialEnd; axial += STEP_MM) {
    for (let angle = angleStart; angle <= angleEnd; angle += angleDegStep) {
      const sampleAngle = normAngle(angle);
      const val = sampleShellRegion(vesselState, axial, sampleAngle, body, circumference);
      if (val !== undefined) out.push({ pos: axial, angle: sampleAngle, value: val });
    }
  }
  return out;
}

/**
 * Sample every reading under an annotation footprint. Pure-cylinder rects use
 * the legacy axial×circumferential box (byte-identical to the pre-dome stats
 * grid); head-touching rects use the rigid drape grid so the samples follow the
 * drawn shape onto the dome. Both consumers (stats + heatmap) sample through
 * this, so their numbers derive from the same cell set.
 */
export function sampleAnnotationFootprint(
  ann: AnnotationShapeConfig,
  vesselState: VesselState,
  body?: string,
): FootprintSample[] {
  if (rectIsPureCylinder(ann, vesselState)) {
    return sampleCylinderBox(ann, vesselState, body);
  }
  const { values, cells, cols, rows } = sampleAnnotationDrapeGrid(ann, vesselState, body);
  const out: FootprintSample[] = [];
  for (let c = 0; c <= cols; c++) {
    for (let r = 0; r <= rows; r++) {
      const val = values[c][r];
      if (val !== undefined) {
        const cell = cells[c][r];
        out.push({ pos: cell.pos, angle: cell.angleDeg, value: val });
      }
    }
  }
  return out;
}
