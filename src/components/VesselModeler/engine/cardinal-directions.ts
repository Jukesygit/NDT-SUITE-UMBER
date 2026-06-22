// Cardinal-direction naming for horizontal-vessel dome heads.
//
// A horizontal vessel's two heads face the world ±X axis:
//   head 'right' → +X   (vessel-geometry.ts: topHead.position.x = +L/2)
//   head 'left'  → −X   (vessel-geometry.ts: bottomHead.position.x = -L/2)
//
// The scene's cardinal overlay (scene-manager.ts setCardinalDirectionsVisible)
// places labels at heading 0 as N = −Z, S = +Z, E = +X, W = −X, then rotates
// the whole label group about +Y by `cardinalRotation`. Reading which label
// lands on each head at the four 90° snaps gives the tables below — at heading 0
// this is exact (E sits on +X, W on −X); other headings snap to the nearest 90°.

export type Cardinal = 'North' | 'East' | 'South' | 'West';

// Indexed by snapped quarter-turn: [0°, 90°, 180°, 270°].
const RIGHT_HEAD: readonly Cardinal[] = ['East', 'South', 'West', 'North'];
const LEFT_HEAD: readonly Cardinal[] = ['West', 'North', 'East', 'South'];

/**
 * The cardinal direction a horizontal-vessel head faces, given the scene's
 * North Heading (`cardinalRotation`, degrees). The heading is snapped to the
 * nearest 90° and normalized into [0, 360).
 */
export function cardinalForHead(head: 'left' | 'right', rotationDeg: number): Cardinal {
  const i = ((Math.round(rotationDeg / 90) % 4) + 4) % 4;
  return head === 'right' ? RIGHT_HEAD[i] : LEFT_HEAD[i];
}
