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
import { resolveBodyFrame, type SurfaceFrame } from './body-frame';
import {
  buildMeridianProfile,
  arcFromAxial,
  axialFromArc,
  displayRadiusAtArc,
  type MeridianProfile,
} from './dome-arc';
import { buildDrapeGrid, type DrapeCell } from './surface-drape';

const DEG2RAD = Math.PI / 180;

// ---------------------------------------------------------------------------
// Shell Surface Point Calculator
// ---------------------------------------------------------------------------

/**
 * Compute a 3D point on the vessel shell surface at a given axial position
 * (mm from left tangent line) and circumferential angle (radians).
 *
 * Thin delegate to the shared {@link SurfaceFrame} so the forward (build) path
 * can never drift from the inverse (drag) path. The frame's `surfacePoint`
 * takes DEGREES; this function keeps its historic radians contract for all
 * existing callers and converts at the boundary.
 */
export function shellPoint(
  posMm: number,
  angleRad: number,
  vesselState: VesselState,
  surfaceOffset: number
): THREE.Vector3 {
  return resolveBodyFrame(vesselState).surfacePoint(
    posMm,
    (angleRad * 180) / Math.PI,
    surfaceOffset
  );
}

/**
 * Body-aware surface point used by the rectangle (annotation/coverage) builders.
 * Identical to {@link shellPoint} but placed through a pre-resolved
 * {@link SurfaceFrame}, so a `bodyId`-set annotation renders on its appendage
 * (cylinder + dished closure) while a main-shell annotation is byte-identical to
 * the legacy path (the main frame reproduces `shellPoint` exactly). Keeps the
 * historic radians contract and converts to the frame's degrees at the boundary.
 */
function framePoint(
  frame: SurfaceFrame,
  posMm: number,
  angleRad: number,
  surfaceOffset: number
): THREE.Vector3 {
  return frame.surfacePoint(posMm, (angleRad * 180) / Math.PI, surfaceOffset);
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
    ? (SEVERITY_COLORS[config.severityLevel] ?? config.color)
    : config.color;
}

// ---------------------------------------------------------------------------
// Meridian arc-space footprint (shared by outline + fill)
// ---------------------------------------------------------------------------
//
// Both the outline and the fill sample the rectangle in continuous
// meridian-arc coordinates (s, theta) instead of (axial pos, constant angular
// span). On the cylinder `s === axial pos` and `halfSpanRad` is constant, so
// the output is byte-identical (to float32) to the legacy constant-span
// formula. On a dome end, `s` follows the true surface arc and the angular
// span honours the local radius at every station, so the stored mm footprint
// is preserved past the tangent lines (matching the dome-scan fix's spirit).

interface RectArcFootprint {
  profile: MeridianProfile;
  /** tan-tan length in mm */
  L: number;
  /** meridian-arc extent, clamped at the left/right apex arcs */
  sLo: number;
  sHi: number;
  /** centre circumferential angle in radians */
  centerAngle: number;
  /** half the stored circumferential height in mm */
  halfH: number;
}

/** Clamp a meridian-arc coordinate to the valid [-apex, L + apex] domain. */
function clampArc(s: number, profile: MeridianProfile, L: number): number {
  return Math.max(-profile.apexArc, Math.min(L + profile.apexArc, s));
}

/** Resolve the shared arc-space footprint for a rectangle annotation. */
function rectArcFootprint(config: AnnotationShapeConfig, frame: SurfaceFrame): RectArcFootprint {
  const R = frame.radius;
  const D = frame.headDepth;
  const L = frame.axialLength;
  const profile = buildMeridianProfile(R, D);
  const s0 = arcFromAxial(profile, L, config.pos);
  const halfW = config.width / 2;
  return {
    profile,
    L,
    sLo: clampArc(s0 - halfW, profile, L),
    sHi: clampArc(s0 + halfW, profile, L),
    centerAngle: (config.angle * Math.PI) / 180,
    halfH: config.height / 2,
  };
}

/**
 * Angular half-span (radians) that renders the stored circumferential height at
 * meridian station `s`. Uses the SAME display radius the renderer places
 * vertices at (incl. body-frame's pole-reaching clamp), and caps at PI so the
 * band can never self-overlap near the apex.
 *
 * At/near the pole the display radius is 0; the guard returns PI directly so the
 * band wraps the full ring there (any rect reaching the pole covers the whole
 * polar cap) and avoids the 0/0 NaN when the stored height is also 0.
 */
function halfSpanRad(fp: RectArcFootprint, s: number): number {
  const r = displayRadiusAtArc(fp.profile, fp.L, s);
  if (r <= 1e-9) return Math.PI;
  return Math.min(fp.halfH / r, Math.PI);
}

/** Place a vertex at meridian station `s` and circumferential angle `theta`. */
function arcPoint(
  fp: RectArcFootprint,
  s: number,
  theta: number,
  frame: SurfaceFrame,
  surfaceOffset: number
): THREE.Vector3 {
  return framePoint(frame, axialFromArc(fp.profile, fp.L, s), theta, surfaceOffset);
}

// ---------------------------------------------------------------------------
// Adaptive segment density (sagitta-bounded)
// ---------------------------------------------------------------------------

/** Minimum segment count — keeps small-span fixtures byte-identical to legacy. */
const MIN_SEGMENTS = 32;
/** Maximum segment count — bounds vertex cost for very large bands. */
const MAX_SEGMENTS = 256;

/**
 * Smallest segment count whose chord stays within HALF the hover offset of the
 * true surface arc, so the midpoint of every segment stays above the shell and
 * never clips into the vessel body.
 *
 * The sagitta — the largest gap between a chord and the arc it subtends — for one
 * of `n` equal segments spanning `spanRad` on a circle of radius `radiusMm` is
 * `radiusMm * (1 - cos(spanRad / (2n)))`. Requiring that gap to stay
 * `<= offsetMm / 2` (half the offset, so a rect hovering `offsetMm` above the wall
 * keeps head-room even at a segment's midpoint) yields the smallest admissible
 * `n`, clamped to [MIN_SEGMENTS, MAX_SEGMENTS]. The MIN clamp reproduces the
 * legacy fixed-32 sampling for small spans (goldens stay byte-identical); the MAX
 * clamp caps cost for full-circumference bands.
 */
function adaptiveSegments(radiusMm: number, spanRad: number, offsetMm: number): number {
  if (!(spanRad > 0) || !(radiusMm > 0) || !(offsetMm > 0)) return MIN_SEGMENTS;
  const maxSagitta = offsetMm / 2;
  for (let n = MIN_SEGMENTS; n < MAX_SEGMENTS; n++) {
    if (radiusMm * (1 - Math.cos(spanRad / (2 * n))) <= maxSagitta) return n;
  }
  return MAX_SEGMENTS;
}

// ---------------------------------------------------------------------------
// Pure-cylinder vs drape routing
// ---------------------------------------------------------------------------
//
// A rect whose whole meridian-arc extent lies within [0, L] is a pure cylinder
// rect: it takes the legacy constant-span arc path (byte-identical goldens). Any
// rect that touches a head is draped as a rigid geodesic stencil
// (surface-drape.ts) so it keeps its shape and can cross the pole.

/** True when both meridian-arc extents of the rect lie on the cylinder [0, L]. */
function rectIsPureCylinder(config: AnnotationShapeConfig, frame: SurfaceFrame): boolean {
  const R = frame.radius;
  const D = frame.headDepth;
  const L = frame.axialLength;
  // A flat/open closure (D = 0) has no curved head to drape on, so any rect stays
  // pure cylinder. Keeps main-shell behaviour unchanged (a 2:1 head always has D>0).
  if (!(D > 0)) return true;
  const profile = buildMeridianProfile(R, D);
  const s0 = arcFromAxial(profile, L, config.pos);
  const halfW = config.width / 2;
  return s0 - halfW >= 0 && s0 + halfW <= L;
}

/**
 * Adaptive drape-grid resolution: `cols` stations along the meridian (width),
 * `rows` lateral samples along the circumference (height). Both are sagitta-
 * bounded so a large head-touching band never dips below the surface between
 * samples. `rows` is forced even because {@link buildDrapeGrid} centres each
 * column on an even row count.
 *
 * - rows: circumferential sag bounded at the body radius `R`.
 * - cols: meridian sag bounded at the meridian's TIGHTEST bend — the minimum
 *   curvature radius of the ellipse meridian, `D^2 / R`, at the tangent line. A
 *   flat/open head (`D = 0`) has no meridian curvature, so cols stays at the floor.
 */
function drapeGridResolution(
  frame: SurfaceFrame,
  widthMm: number,
  heightMm: number,
  offsetMm: number
): { cols: number; rows: number } {
  const R = frame.radius;
  const D = frame.headDepth;

  let rows = adaptiveSegments(R + offsetMm, heightMm / R, offsetMm);
  if (rows % 2 !== 0) rows = Math.min(MAX_SEGMENTS, rows + 1); // buildDrapeGrid requires an even row count

  let cols = MIN_SEGMENTS;
  if (D > 0) {
    const minCurveR = (D * D) / R; // tightest meridian bend (at the tangent line)
    cols = Math.max(
      MIN_SEGMENTS,
      adaptiveSegments(minCurveR + offsetMm, widthMm / minCurveR, offsetMm)
    );
  }

  return { cols, rows };
}

/** Build the rigid drape grid (surface coordinates) for a head-touching rect. */
function drapeGridFor(
  config: AnnotationShapeConfig,
  frame: SurfaceFrame,
  offsetMm: number
): DrapeCell[][] {
  const R = frame.radius;
  const D = frame.headDepth;
  const L = frame.axialLength;
  const { cols, rows } = drapeGridResolution(frame, config.width, config.height, offsetMm);
  return buildDrapeGrid({
    R,
    D,
    L,
    pos: config.pos,
    angleDeg: config.angle,
    widthMm: config.width,
    heightMm: config.height,
    cols,
    rows,
  }).grid;
}

/** Place a drape cell on the shell via the shared body frame. */
function drapePoint(cell: DrapeCell, frame: SurfaceFrame, surfaceOffset: number): THREE.Vector3 {
  return framePoint(frame, cell.pos, cell.angleDeg * DEG2RAD, surfaceOffset);
}

// ---------------------------------------------------------------------------
// Rectangle Outline
// ---------------------------------------------------------------------------

/**
 * Legacy constant-span outline points (pure cylinder). On the cylinder
 * `halfSpanRad` is constant and `s === axial`, so this is byte-identical to the
 * pre-dome formula (locked by the golden regression test).
 */
function cylinderOutlinePoints(
  config: AnnotationShapeConfig,
  frame: SurfaceFrame,
  surfaceOffset: number
): THREE.Vector3[] {
  const fp = rectArcFootprint(config, frame);
  const { centerAngle, sLo, sHi } = fp;
  const span = sHi - sLo;
  const R = frame.radius;
  // Meridian (axial) edges carry no curvature on the cylinder, so a fixed 32 is
  // always within offset. The circumferential sweeps do curve: their segment
  // count adapts to the angular span so the chord never sags below the surface
  // (striped-band fix). On the cylinder the span is constant across s, so the
  // right and left sweeps share one adaptive count.
  const axialSegs = 32;
  const circSegs = adaptiveSegments(R + surfaceOffset, 2 * halfSpanRad(fp, sHi), surfaceOffset);

  const points: THREE.Vector3[] = [];

  // Bottom edge: sLo -> sHi at theta = centerAngle - halfSpan(s) (per station)
  for (let i = 0; i <= axialSegs; i++) {
    const s = sLo + (i / axialSegs) * span;
    points.push(arcPoint(fp, s, centerAngle - halfSpanRad(fp, s), frame, surfaceOffset));
  }
  // Right edge: circumferential sweep at station sHi
  {
    const hs = halfSpanRad(fp, sHi);
    for (let i = 1; i <= circSegs; i++) {
      const ang = centerAngle - hs + (i / circSegs) * hs * 2;
      points.push(arcPoint(fp, sHi, ang, frame, surfaceOffset));
    }
  }
  // Top edge: sHi -> sLo at theta = centerAngle + halfSpan(s) (per station)
  for (let i = 1; i <= axialSegs; i++) {
    const s = sHi - (i / axialSegs) * span;
    points.push(arcPoint(fp, s, centerAngle + halfSpanRad(fp, s), frame, surfaceOffset));
  }
  // Left edge: circumferential sweep at station sLo
  {
    const hs = halfSpanRad(fp, sLo);
    for (let i = 1; i < circSegs; i++) {
      const ang = centerAngle + hs - (i / circSegs) * hs * 2;
      points.push(arcPoint(fp, sLo, ang, frame, surfaceOffset));
    }
  }

  return points;
}

/**
 * Rigid-drape outline points: the perimeter of the drape grid, ordered
 * bottom -> right -> top -> left (matching the legacy edge order) so downstream
 * consumers see the same layout. The perimeter length follows the drape grid's
 * adaptive resolution (2*(cols + rows) points), so it is 128 only when the grid
 * is the minimum 32x32; consumers must not assume a fixed count.
 */
function drapeOutlinePoints(
  config: AnnotationShapeConfig,
  frame: SurfaceFrame,
  surfaceOffset: number
): THREE.Vector3[] {
  const grid = drapeGridFor(config, frame, surfaceOffset);
  const cols = grid.length - 1;
  const rows = grid[0].length - 1;
  const points: THREE.Vector3[] = [];
  const at = (c: number, r: number) => drapePoint(grid[c][r], frame, surfaceOffset);

  for (let c = 0; c <= cols; c++) points.push(at(c, 0)); // bottom (row 0)
  for (let r = 1; r <= rows; r++) points.push(at(cols, r)); // right (col cols)
  for (let c = cols - 1; c >= 0; c--) points.push(at(c, rows)); // top (row rows)
  for (let r = rows - 1; r >= 1; r--) points.push(at(0, r)); // left (col 0)

  return points;
}

export function createRectOutline(
  config: AnnotationShapeConfig,
  vesselState: VesselState,
  surfaceOffset: number
): THREE.LineLoop {
  // Resolve the mounted body (undefined = main shell, byte-identical). Every
  // dim + placement below flows through this frame, so an appendage annotation
  // renders on its cylinder / dished closure with no other change.
  const frame = resolveBodyFrame(vesselState, config.bodyId);
  const points = rectIsPureCylinder(config, frame)
    ? cylinderOutlinePoints(config, frame, surfaceOffset)
    : drapeOutlinePoints(config, frame, surfaceOffset);

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
/**
 * Legacy constant-span fill vertices (pure cylinder). Byte-identical to the
 * pre-dome formula on the cylinder (locked by the golden fill test): the min-32
 * clamp keeps small rects at a 32x32 grid, while wide circumferential bands add
 * angular rows so the mesh never sags below the surface. Returns the grid
 * dimensions so the caller builds a matching index buffer.
 */
function cylinderFillVertices(
  config: AnnotationShapeConfig,
  frame: SurfaceFrame,
  surfaceOffset: number
): { vertices: number[]; cols: number; rows: number } {
  const fp = rectArcFootprint(config, frame);
  const { centerAngle, sLo, sHi } = fp;
  const span = sHi - sLo;
  const R = frame.radius;
  // Meridian columns carry no curvature axially -> fixed 32. Circumferential
  // rows adapt to the angular span so mid-row chords stay above the surface.
  const segX = 32;
  const segY = adaptiveSegments(R + surfaceOffset, 2 * halfSpanRad(fp, sHi), surfaceOffset);

  // Per-column (meridian) station data: axial position + local angular span.
  const axialByCol: number[] = new Array(segX + 1);
  const halfSpanByCol: number[] = new Array(segX + 1);
  for (let ix = 0; ix <= segX; ix++) {
    const s = sLo + (ix / segX) * span;
    axialByCol[ix] = axialFromArc(fp.profile, fp.L, s);
    halfSpanByCol[ix] = halfSpanRad(fp, s);
  }

  const vertices: number[] = [];
  for (let iy = 0; iy <= segY; iy++) {
    const v = iy / segY;
    for (let ix = 0; ix <= segX; ix++) {
      const hs = halfSpanByCol[ix];
      const angOffset = -hs + v * hs * 2;
      const pt = framePoint(frame, axialByCol[ix], centerAngle + angOffset, surfaceOffset - 0.5);
      vertices.push(pt.x, pt.y, pt.z);
    }
  }
  return { vertices, cols: segX, rows: segY };
}

/**
 * Rigid-drape fill vertices (head-touching rect): the drape grid as a mesh.
 * Returns the grid dimensions so the caller builds a matching index buffer (the
 * grid resolution is adaptive, not a fixed 32x32).
 */
function drapeFillVertices(
  config: AnnotationShapeConfig,
  frame: SurfaceFrame,
  surfaceOffset: number
): { vertices: number[]; cols: number; rows: number } {
  const grid = drapeGridFor(config, frame, surfaceOffset);
  const cols = grid.length - 1;
  const rows = grid[0].length - 1;
  const vertices: number[] = [];
  // Row-major (iy outer, ix inner) so the index layout matches the legacy path.
  for (let iy = 0; iy <= rows; iy++) {
    for (let ix = 0; ix <= cols; ix++) {
      const pt = drapePoint(grid[ix][iy], frame, surfaceOffset - 0.5);
      vertices.push(pt.x, pt.y, pt.z);
    }
  }
  return { vertices, cols, rows };
}

export function createRectFill(
  config: AnnotationShapeConfig,
  vesselState: VesselState,
  surfaceOffset: number
): THREE.Mesh {
  // Resolve the mounted body (undefined = main shell, byte-identical).
  const frame = resolveBodyFrame(vesselState, config.bodyId);
  // Both paths return a row-major grid (iy outer, ix inner) with `cols + 1`
  // columns per row; the index buffer below is built from the SAME cols/rows so
  // the triangulation always matches the vertex grid (no mismatched buffer).
  const { vertices, cols, rows } = rectIsPureCylinder(config, frame)
    ? cylinderFillVertices(config, frame, surfaceOffset)
    : drapeFillVertices(config, frame, surfaceOffset);

  const indices: number[] = [];
  for (let iy = 0; iy < rows; iy++) {
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
  isSelected: boolean
): THREE.Group {
  const group = new THREE.Group();
  const surfaceOffset = 3; // mm above shell (above textures at 2mm)

  // Outline (all annotations are rectangular)
  const outline = createRectOutline(config, vesselState, surfaceOffset);
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
export function computeRulerDistance(config: RulerConfig, vesselState: VesselState): number {
  const segments = 64;
  const surfaceOffset = 3;
  let totalDist = 0;

  let prev = shellPoint(
    config.startPos,
    (config.startAngle * Math.PI) / 180,
    vesselState,
    surfaceOffset
  );
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
export function createRulerLine(config: RulerConfig, vesselState: VesselState): THREE.Group {
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
  // C13: initial per-entity visibility; live toggles handled by ThreeViewport Tier-2.
  group.visible = config.visible !== false;
  return group;
}
