import type { WeldConfig } from '../types';

export interface Pt {
  x: number;
  y: number;
}

export interface WeldGeometry {
  /** groove outline as a closed polygon (part coords, y down from surface) */
  groove: Pt[];
  /** left / right fusion lines, top to bottom */
  fusionLeft: Pt[];
  fusionRight: Pt[];
  /** cap bead outline(s), drawn above surface / below backwall */
  caps: Pt[][];
  /** half-width of the groove at the scan surface */
  topHalfWidth: number;
  /** overall half-extent including cap */
  capHalfWidth: number;
}

const DEG = Math.PI / 180;

/**
 * Weld cross-section geometry. x is measured from the weld centreline,
 * y from the scan surface downward (0 = surface, t = backwall).
 */
export function weldGeometry(weld: WeldConfig, thickness: number): WeldGeometry {
  const tan = Math.tan(weld.bevelAngle * DEG);
  const g2 = weld.rootGap / 2;
  // root face can exceed a thin plate's thickness in state (fields are
  // independently clamped); a groove taller than the plate is meaningless
  const rf = Math.min(Math.max(weld.rootFace, 0), thickness);

  if (weld.type === 'single-v') {
    const topHalf = g2 + (thickness - rf) * tan;
    // fusion line, surface -> root
    const fusionRight: Pt[] = [
      { x: topHalf, y: 0 },
      { x: g2, y: thickness - rf },
      { x: g2, y: thickness },
    ];
    const fusionLeft = fusionRight.map((p) => ({ x: -p.x, y: p.y }));
    const groove = [...fusionLeft, ...[...fusionRight].reverse()];
    const capHalf = topHalf + weld.capExtra;
    const caps = [capBead(-capHalf, capHalf, 0, -weld.capHeight)];
    return { groove, fusionLeft, fusionRight, caps, topHalfWidth: topHalf, capHalfWidth: capHalf };
  }

  // double-v: bevels open to both surfaces, root face centred at mid-thickness
  const legHeight = (thickness - rf) / 2;
  const half = g2 + legHeight * tan;
  const yRootTop = legHeight;
  const yRootBot = thickness - legHeight;
  const fusionRight: Pt[] = [
    { x: half, y: 0 },
    { x: g2, y: yRootTop },
    { x: g2, y: yRootBot },
    { x: half, y: thickness },
  ];
  const fusionLeft = fusionRight.map((p) => ({ x: -p.x, y: p.y }));
  const groove = [...fusionLeft, ...[...fusionRight].reverse()];
  const capHalf = half + weld.capExtra;
  const caps = [
    capBead(-capHalf, capHalf, 0, -weld.capHeight),
    capBead(-capHalf, capHalf, thickness, thickness + weld.capHeight),
  ];
  return { groove, fusionLeft, fusionRight, caps, topHalfWidth: half, capHalfWidth: capHalf };
}

/** Rounded cap bead approximated with a flattened arc (polyline). */
function capBead(x0: number, x1: number, yBase: number, yPeak: number): Pt[] {
  const pts: Pt[] = [{ x: x0, y: yBase }];
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const x = x0 + (x1 - x0) * u;
    const y = yBase + (yPeak - yBase) * Math.sin(Math.PI * u);
    pts.push({ x, y });
  }
  pts.push({ x: x1, y: yBase });
  return pts;
}

export interface TeeGeometry {
  /** top and bottom fillet triangles (part coords) */
  fillets: Pt[][];
  /** upstanding chord plate outline */
  chord: Pt[];
  /** joint interface (root line) at x = 0, surface to backwall */
  rootLine: Pt[];
  /** HAZ band subpaths in the branch plate */
  haz: Pt[][];
  /** weld toe position on the scan surface (negative x) */
  toeX: number;
  /** how far the chord extends above/below the branch, for drawing */
  chordExtent: number;
}

/**
 * External-fillet T-joint: the scanned (branch) plate occupies x <= 0 and
 * butts into a vertical chord plate at x = 0; fillet welds fill both
 * outside corners. The probe scans the branch from side A.
 */
export function teeGeometry(weld: WeldConfig, thickness: number): TeeGeometry {
  const leg = Math.max(weld.filletLeg, 0.5);
  const tc = Math.max(weld.chordThickness, 2);
  const ext = Math.max(30, leg + 15);
  const h = weld.hazWidth;
  return {
    fillets: [
      [
        { x: -leg, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: -leg },
      ],
      [
        { x: -leg, y: thickness },
        { x: 0, y: thickness },
        { x: 0, y: thickness + leg },
      ],
    ],
    chord: [
      { x: 0, y: -ext },
      { x: tc, y: -ext },
      { x: tc, y: thickness + ext },
      { x: 0, y: thickness + ext },
    ],
    rootLine: [
      { x: 0, y: 0 },
      { x: 0, y: thickness },
    ],
    haz: [
      // along the joint face
      rectPts(-h, 0, 0, thickness),
      // under the fillet toes, top and bottom
      rectPts(-leg - h, 0, 0, Math.min(h, thickness)),
      rectPts(-leg - h, 0, Math.max(thickness - h, 0), thickness),
    ],
    toeX: -leg,
    chordExtent: ext,
  };
}

function rectPts(x0: number, x1: number, y0: number, y1: number): Pt[] {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

/** Fusion line offset outward by `w` — a simple HAZ band approximation. */
export function hazBand(fusion: Pt[], w: number, side: 1 | -1): Pt[] {
  const offset = fusion.map((p) => ({ x: p.x + side * w, y: p.y }));
  return [...fusion, ...[...offset].reverse()];
}

export function toPath(pts: Pt[], close = true): string {
  const d = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(' ');
  return close ? d + ' Z' : d;
}
