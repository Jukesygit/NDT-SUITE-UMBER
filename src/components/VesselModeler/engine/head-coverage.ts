// =============================================================================
// Vessel Modeler - Dome Head Coverage Raster
// =============================================================================
// Overlap-aware covered area (mm^2) on the dished HEADS, measured the way a
// coverage rect is actually DRAWN there: as a rigid geodesic drape
// (engine/surface-drape.ts), never as an axial-pos x fixed-equator-angle box.
//
// Project rule: stats sampling must always mirror the overlay projection. The
// box model under-counts a head-touching rect twice over — it reads the rect's
// meridian overhang past the tangent line as AXIAL z (where the ellipsoid cell
// integrand clamps to ~zero area), and it holds the rect's angular span at its
// EQUATOR value instead of the physical lateral height the drape keeps as the
// local radius shrinks toward the pole.
//
// Model:
//   - Raster in (s, theta). `s` = meridian arc from the tangent line, 0..apexArc
//     (dome-arc.ts). RASTER_ROWS rows of equal arc height dsCell = apexArc/rows;
//     per row nTheta = max(8, ceil(2*pi*r(s_mid)/dsCell)), so cells stay roughly
//     square in physical mm all the way to the pole.
//   - Cell area is EXACT for a surface of revolution in the meridian-arc metric
//     (ds^2 = dm^2 + r^2 dtheta^2): dA = r(s_mid) * dtheta * ds. A fully marked
//     row therefore sums to the true band area int(2*pi*r ds).
//   - Membership by splatting the vertices of the SAME buildDrapeGrid the visual
//     uses, at a resolution fine enough that no raster cell is skipped. A marked
//     cell counts once, so overlapping rects union for free (overlap-aware).
//   - Pole crossing / antipodal reflection is inherited from buildDrapeGrid:
//     vertices come back as plain (pos, angleDeg) surface coordinates.
//   - Cylinder vertices (0 <= s <= L) are skipped here — the cylinder portion of
//     a straddling rect IS its unwrapped box, and coverage-calculator.ts feeds
//     that to the one compressed sweep so the seam is never double-counted.
//
// Pure and THREE-free (worker-safe): imports only dome-arc + surface-drape.
// Head-mounted nozzle/junction cutouts are NOT subtracted — no footprint
// predicate exists for head cells anywhere in the codebase (deferred).
// =============================================================================

import {
  arcFromAxial,
  buildMeridianProfile,
  displayRadiusAtArc,
  type MeridianProfile,
} from './dome-arc';
import { buildDrapeGrid, type DrapeCell } from './surface-drape';

/** Raster rows along the meridian arc (tangent line -> apex). */
const RASTER_ROWS = 96;
/** Floor on theta cells per row so near-pole rows keep a usable resolution. */
const MIN_THETA_CELLS = 8;
/** Hard cap on drape segments per axis — bounds cost for full-wrap rects. */
const MAX_DRAPE_SEGMENTS = 512;
/** Floor on drape segments per axis (buildDrapeGrid needs rows >= 2, even). */
const MIN_DRAPE_SEGMENTS = 2;

/** The subset of a coverage rect this raster needs (structural, so both
 *  `CoverageRectConfig` and `AnnotationShapeConfig` pass unchanged). */
export interface HeadCoverageRect {
  /** Centre axial position, mm from the left tangent line. */
  pos: number;
  /** Centre circumferential angle, degrees. */
  angle: number;
  /** Extent along the meridian arc, mm. */
  width: number;
  /** Extent around the circumference, mm. */
  height: number;
}

export interface HeadCoverageParams {
  /** Body radius (mm). */
  R: number;
  /** Head depth (mm); <= 0 means a flat/open closure with no head to cover. */
  D: number;
  /** Tan-tan / cylinder length (mm). */
  L: number;
  /** Head-touching rects (main-shell routing decided by the caller). */
  rects: readonly HeadCoverageRect[];
}

/** Covered area per head, in mm^2. */
export interface HeadCoverage {
  left: number;
  right: number;
}

// ---------------------------------------------------------------------------
// Raster
// ---------------------------------------------------------------------------

interface HeadRaster {
  /** Row height in meridian arc mm. */
  dsCell: number;
  /** Local radius at each row's mid-arc (mm). */
  rowRadius: Float64Array;
  /** Theta cell count per row. */
  rowCells: Uint32Array;
  /** Marked flags per row, `marks[row][thetaIndex]`. */
  marks: Uint8Array[];
}

function norm360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Build the empty (s, theta) raster for ONE head. Radius is sampled through
 * `displayRadiusAtArc` — the same clamp body-frame's `radiusAt` uses — so the
 * band areas agree with where the renderer actually places vertices.
 */
function buildRaster(R: number, D: number, L: number): HeadRaster | null {
  const profile = buildMeridianProfile(R, D);
  if (!(profile.apexArc > 0)) return null;

  const dsCell = profile.apexArc / RASTER_ROWS;
  const rowRadius = new Float64Array(RASTER_ROWS);
  const rowCells = new Uint32Array(RASTER_ROWS);
  const marks: Uint8Array[] = new Array(RASTER_ROWS);

  for (let i = 0; i < RASTER_ROWS; i++) {
    // Sample on the right head; the meridian profile is identical on both.
    const r = displayRadiusAtArc(profile, L, L + (i + 0.5) * dsCell);
    const n = Math.max(MIN_THETA_CELLS, Math.ceil((2 * Math.PI * r) / dsCell));
    rowRadius[i] = r;
    rowCells[i] = n;
    marks[i] = new Uint8Array(n);
  }

  return { dsCell, rowRadius, rowCells, marks };
}

/** Sum the marked cells of a raster: dA = r(s_mid) * dtheta * ds (exact). */
function rasterArea(raster: HeadRaster): number {
  let area = 0;
  for (let i = 0; i < RASTER_ROWS; i++) {
    const n = raster.rowCells[i];
    const row = raster.marks[i];
    let marked = 0;
    for (let j = 0; j < n; j++) if (row[j] === 1) marked++;
    if (marked === 0) continue;
    area += marked * raster.rowRadius[i] * ((2 * Math.PI) / n) * raster.dsCell;
  }
  return area;
}

/** Mark the cell holding head-arc coordinate `sHead` at angle `angleDeg`. */
function mark(raster: HeadRaster, sHead: number, angleDeg: number): void {
  const row = Math.min(RASTER_ROWS - 1, Math.max(0, Math.floor(sHead / raster.dsCell)));
  const n = raster.rowCells[row];
  const col = Math.min(n - 1, Math.max(0, Math.floor((norm360(angleDeg) / 360) * n)));
  raster.marks[row][col] = 1;
}

// ---------------------------------------------------------------------------
// Drape splatting
// ---------------------------------------------------------------------------

/**
 * Segment count giving a vertex spacing of at most `dsCell/2` over `extentMm`,
 * capped so a full-wrap rect cannot explode the vertex budget. `even` forces the
 * even row count {@link buildDrapeGrid} requires (it centres each column).
 */
function drapeSegments(extentMm: number, dsCell: number, even: boolean): number {
  let n = Math.ceil((2 * Math.max(extentMm, 0)) / dsCell);
  if (!Number.isFinite(n) || n < MIN_DRAPE_SEGMENTS) n = MIN_DRAPE_SEGMENTS;
  if (n > MAX_DRAPE_SEGMENTS) n = MAX_DRAPE_SEGMENTS;
  if (even && n % 2 !== 0) n = Math.min(MAX_DRAPE_SEGMENTS, n + 1);
  return n;
}

/** Shared state for one splat pass (both head rasters + the sub-step budget). */
interface SplatContext {
  profile: MeridianProfile;
  L: number;
  left: HeadRaster;
  right: HeadRaster;
  /** Max marked-track gap in physical mm (half a raster cell). */
  stepMm: number;
}

/**
 * Splat one drape column into whichever head raster each sample lands on. The
 * column is walked as a POLYLINE: consecutive samples are joined by sub-steps
 * fine enough that the marked track has no gaps at raster resolution. That is
 * the same quad strip the drawn mesh fills between those vertices (chord sagitta
 * over one step is a small fraction of a millimetre), and it is what keeps the
 * raster hole-free once the segment cap bites on a full-wrap rect.
 */
function splatColumn(
  column: readonly DrapeCell[],
  ctx: SplatContext,
): void {
  const { profile, L, left, right, stepMm } = ctx;
  let prevS: number | null = null;
  let prevAngle = 0;

  for (const cell of column) {
    const s = arcFromAxial(profile, L, cell.pos);
    const angle = cell.angleDeg;

    if (prevS !== null) {
      // Shortest-way angular delta, so the 0/360 seam never fabricates a sweep.
      const dAngle = ((angle - prevAngle + 540) % 360) - 180;
      const dS = s - prevS;
      // Sub-step by the larger of the arc travel in s and in theta (using the
      // equator radius as the upper bound on r, so this never under-samples).
      const travel = Math.max(Math.abs(dS), (Math.abs(dAngle) / 360) * 2 * Math.PI * profile.R);
      const sub = Math.min(256, Math.max(1, Math.ceil(travel / stepMm)));
      for (let k = 1; k < sub; k++) {
        const t = k / sub;
        splatPoint(prevS + dS * t, prevAngle + dAngle * t, L, left, right);
      }
    }

    splatPoint(s, angle, L, left, right);
    prevS = s;
    prevAngle = angle;
  }
}

/** Route one (s, angle) surface sample to the head raster that owns it. */
function splatPoint(
  s: number,
  angleDeg: number,
  L: number,
  left: HeadRaster,
  right: HeadRaster,
): void {
  if (s < 0) mark(left, -s, angleDeg);
  else if (s > L) mark(right, s - L, angleDeg);
  // 0 <= s <= L is the cylinder: owned by the compressed box sweep.
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Overlap-aware covered area (mm^2) on each head from the given head-touching
 * rects. One raster per head, fed every rect, so overlaps union rather than
 * double-count. Both heads are filled from a SINGLE drape build per rect (the
 * drape is the expensive part; splitting it per head would double the cost for
 * an identical result).
 *
 * Returns zeros for a flat/open closure (D <= 0) or when no rects are supplied.
 */
export function computeHeadCoveredAreas(params: HeadCoverageParams): HeadCoverage {
  const { R, D, L, rects } = params;
  if (!(R > 0) || !(D > 0) || rects.length === 0) return { left: 0, right: 0 };

  const left = buildRaster(R, D, L);
  const right = buildRaster(R, D, L);
  if (!left || !right) return { left: 0, right: 0 };

  const profile = buildMeridianProfile(R, D);
  const dsCell = left.dsCell;
  const ctx = { profile, L, left, right, stepMm: dsCell / 2 };

  for (const rect of rects) {
    const cols = drapeSegments(rect.width, dsCell, false);
    const rows = drapeSegments(rect.height, dsCell, true);
    const { grid } = buildDrapeGrid({
      R,
      D,
      L,
      pos: rect.pos,
      angleDeg: rect.angle,
      widthMm: rect.width,
      heightMm: rect.height,
      cols,
      rows,
    });
    for (const column of grid) splatColumn(column, ctx);
  }

  return { left: rasterArea(left), right: rasterArea(right) };
}

/**
 * Total head surface area (mm^2) of ONE head as this raster measures it — the
 * arc-parametrized band sum int(2*pi*r ds). Exposed for tests: it is the raster's
 * own oracle for "fully covered", independent of the axial-parametrized integral
 * in `computeRegionTotalAreas` (the two agree to ~0.2%).
 */
export function headRasterTotalArea(R: number, D: number, L: number): number {
  const raster = buildRaster(R, D, L);
  if (!raster) return 0;
  let area = 0;
  for (let i = 0; i < RASTER_ROWS; i++) {
    area += 2 * Math.PI * raster.rowRadius[i] * raster.dsCell;
  }
  return area;
}
