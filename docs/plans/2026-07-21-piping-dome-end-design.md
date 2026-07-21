# Piping Dome End Part — Design

**Date:** 2026-07-21
**Status:** Implementing
**Area:** Vessel Modeler (piping tool)

## Problem

The piping tool's parts library (Straight, Elbow, Reducer, Flange, Cap) has no
way to terminate a pipe run with a domed head. The existing Cap renders a flat
disc (its `'dished'` hemisphere style exists in the geometry builder but is
unreachable from the UI). Users modelling drums, bullets, and dead-legs need a
proper dished end — the same 2:1 semi-ellipsoidal profile the vessel's own
heads use.

## Goal

A new **Dome End** part in the piping library. It terminates the run (like
Cap), renders as a semi-ellipsoidal head with an adjustable head ratio
(diameter : 2×depth), and defaults to 2:1 to match the vessel's `headRatio`
convention. Available everywhere parts are added: sidebar library grid,
quick-add button rows, and the 3D connection-point popup — for both
vessel-attached and free pipes.

## Why a new segment type, not a Cap style

The user asked for a distinct part ("new connector type"), and a ratio slider
hanging off Cap would overload one part with two unrelated shapes. Cap stays
the quick flat closure; Dome End is the engineered head. The unreachable
`'dished'` cap style is left as-is (still buildable from saved data).

## Data model

[types.ts](../../src/components/VesselModeler/types.ts):

- `PipeSegmentType` union gains `'dome'`.
- `PipeSegment` gains:

```ts
/** Head ratio D/2h for dome ends (2.0 = 2:1 semi-ellipsoidal, 1.0 = hemi) */
headRatio?: number;
```

- New exported helper — single source of truth for "this part ends the run"
  (replaces three scattered `type === 'cap'` checks):

```ts
export function isTerminalSegment(type: PipeSegmentType): boolean {
  return type === 'cap' || type === 'dome';
}
```

Optional field, additive union member — existing saved models are unaffected.

## Geometry

[pipeline-geometry.ts](../../src/components/VesselModeler/engine/pipeline-geometry.ts):

New `buildDomeMesh(frame, segment, pipeDiameter, material)`:

- Outer shell: `SphereGeometry(r, 32, 16, 0, 2π, 0, π/2)` (upper hemisphere,
  pole on +Y) scaled `(1, 1/headRatio, 1)` — depth = r/ratio along the pipe
  axis. `BufferGeometry.scale()` runs through `applyMatrix4`, which fixes
  normals for non-uniform scale.
- Inner shell: same at `r − wall` (`WALL_RATIO`), `scale(1, 1, -1)` winding
  flip so it reads as wall thickness from the open side — same outer+inner
  merge pattern as the elbow.
- Positioned at `frame.origin`, oriented `(0,1,0) → frame.direction`
  (same quaternion pattern as straight/reducer).
- `userData = { type: 'pipeSegment', segmentId }` for selection, like all parts.

Chain behaviour:

- `advanceFrame`: `'dome'` joins the `'cap'` case — terminal, frame unchanged.
- `buildPipelineGroup`: `case 'dome'` builds the mesh; the end-of-chain
  connection ring is suppressed via `isTerminalSegment(lastSegment.type)`.
- `getConnectionPoints`: skips pipelines whose last segment satisfies
  `isTerminalSegment` (was `=== 'cap'`).

## Defaults

`createDefaultSegment` in
[VesselModeler.tsx](../../src/components/VesselModeler/VesselModeler.tsx):
`case 'dome': return { ...base, headRatio: 2.0 }`.

## UI

- [PipingSection.tsx](../../src/components/VesselModeler/sidebar/PipingSection.tsx):
  `{ type: 'dome', label: 'Dome End' }` added to `SEGMENT_TYPES` (feeds the
  library grid and both quick-add button rows). `segmentLabel` renders
  `Dome End 2:1` (ratio formatted, trailing `.0` dropped). Both selected-segment
  edit forms (vessel-attached + free pipe) gain a `SliderRow` — Head Ratio,
  1.0–3.0, step 0.1, default 2.0.
- [PipePartPopup.tsx](../../src/components/VesselModeler/sidebar/PipePartPopup.tsx):
  same entry added to `PARTS`.
- Drag-and-drop comes free: the library grid serialises `{ type }` into
  `application/x-pipe-part`, which the viewport passes straight to
  `addSegment`/`addPipeline`.

## Persistence

Export/snapshot paths pass `vesselState.pipelines` through whole — no change.
**But both cloud-import maps whitelist segment fields explicitly**
([VesselModeler.tsx:622](../../src/components/VesselModeler/VesselModeler.tsx#L622)
and [:2234](../../src/components/VesselModeler/VesselModeler.tsx#L2234)):
`headRatio: s.headRatio` must be added to both, or saved ratios silently
revert to the default on load. No DB or schema migration — pipelines are JSON
passthrough in the vessel-model service.

## Tests

New `engine/__tests__/pipeline-geometry.test.ts` (pure geometry, no jsdom):

- `advanceFrame` on `'dome'` returns the input frame unchanged (terminal).
- `buildPipelineGroup` with a dome-terminated chain contains a dome mesh and
  **no** connection-point ring; an uncapped chain still gets its ring.
- `getConnectionPoints` yields no endpoint for a dome-terminated pipeline.
- `buildDomeMesh` bounding box: depth ≈ r/ratio along the axis, full diameter
  across (verifies the squash is applied on the correct axis).
- `isTerminalSegment` truth table.

## Out of scope / non-goals

- Straight-flange (skirt) length on the head, torispherical knuckle profiles.
- Scan overlays / coverage on pipe dome ends (vessel dome scans are separate).
- Implementing the declared-but-unbuilt `'tee'` / `'valve'` types.
- Flattened view (pipes are not projected there).
