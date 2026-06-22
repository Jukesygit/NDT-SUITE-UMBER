# Horizontal Dome Cardinal Naming — Design

Date: 2026-06-22
Area: Vessel Modeler — Scan Coverage stats

## Goal

In the **Scan Coverage stats panel**, name the two dome rows by the cardinal
direction each head faces when the vessel is **horizontal**, instead of the
generic "Left Dome" / "Right Dome". Vertical vessels are unchanged
("Top Dome" / "Bottom Dome").

## Why

For horizontal vessels the two heads point along the world ±X axis. The modeler
already has a **Cardinal Directions** feature (Visuals settings): an N/S/E/W
floor overlay with a "North Heading" rotation (`cardinalRotation`). Re-using
that heading to name the domes makes the stats panel match the orientation the
user has already established in the scene.

## Scope (confirmed with user)

- **Only** the Scan Coverage stats panel
  (`stats/ScanCoverageStatsSection.tsx`). Not the sidebar head selector, not the
  report, not the 3D in-scene labels.
- **Horizontal vessels only.** Vertical keeps "Top Dome" / "Bottom Dome".
- **Always on** for horizontal vessels — driven purely by `cardinalRotation`,
  regardless of whether the floor labels (`showCardinalDirections`) are visible.
- **Full-word** names: "East Dome" / "West Dome" (etc.).

## The mapping

Horizontal heads face the world X axis:
- `head: 'right'` → **+X** (`vessel-geometry.ts`, `topHead.position.x = +L/2`)
- `head: 'left'`  → **−X** (`bottomHead.position.x = -L/2`)

The scene (`scene-manager.ts setCardinalDirectionsVisible`) places labels at
heading 0 as: **N = −Z, S = +Z, E = +X, W = −X**, then rotates the whole label
group about **+Y** by `cardinalRotation`. Reading which label lands on each head:

| North Heading | Right head (+X) | Left head (−X) |
| ------------- | --------------- | -------------- |
| 0°            | East            | West           |
| 90°           | South           | North          |
| 180°          | West            | East           |
| 270°          | North           | South          |

At heading 0 this is exact and needs no rotation math — the scene literally
places **E** at +X and **W** at −X. Off-axis headings snap to the nearest 90°.

## Implementation

### 1. New pure helper — `engine/cardinal-directions.ts`

```ts
export type Cardinal = 'North' | 'East' | 'South' | 'West';

const RIGHT_HEAD: readonly Cardinal[] = ['East', 'South', 'West', 'North'];
const LEFT_HEAD:  readonly Cardinal[] = ['West', 'North', 'East', 'South'];

export function cardinalForHead(head: 'left' | 'right', rotationDeg: number): Cardinal {
  const i = (((Math.round(rotationDeg / 90) % 4) + 4) % 4);
  return head === 'right' ? RIGHT_HEAD[i] : LEFT_HEAD[i];
}
```

Doc comment ties the convention to `scene-manager.ts`.

### 2. Wire into `stats/ScanCoverageStatsSection.tsx`

```ts
const rot = vesselState.visuals?.cardinalRotation ?? 0;
// ...
{ key: 'leftHead',  label: isVertical ? 'Top Dome'    : `${cardinalForHead('left',  rot)} Dome`, show: !isPipe },
{ key: 'rightHead', label: isVertical ? 'Bottom Dome' : `${cardinalForHead('right', rot)} Dome`, show: !isPipe },
```

`vesselState.visuals.cardinalRotation` is already reachable (no prop threading).

### 3. Tests — `engine/__tests__/cardinal-directions.test.ts`

- The four snaps (0/90/180/270) for both heads match the table above.
- Left and right heads are always opposite.
- Wraparound: 360°, 359°→East (right), negative headings.
- Rounding: 44°→East, 46°→South (right head).

## Data integrity

This is a **display label only**. The persisted `head: 'left' | 'right'` and the
per-head area attribution in `achievedMm2` are untouched, so measurement truth is
preserved (see [[feedback_inspection-data-integrity]]).
