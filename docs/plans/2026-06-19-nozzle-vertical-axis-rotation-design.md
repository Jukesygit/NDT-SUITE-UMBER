# Nozzle Vertical-Axis Rotation — Design

**Date:** 2026-06-19
**Status:** Implementing
**Area:** Vessel Modeler (nozzle orientation)

## Problem

A nozzle placed on a **dome end** of a horizontal vessel cannot be made to
protrude straight out of the end. Setting its orientation to `horizontal`
projects it sideways (±Z, perpendicular to the vessel's long axis) exactly as if
it were on the cylindrical shell — so a dome nozzle points *across* the vessel
instead of *out* of the dome.

The vessel's long axis is **X** (horizontal vessel), so "protruding directly
from the dome end" means pointing along **±X**, which is a 90° rotation about the
world vertical (Y) axis away from the current sideways `horizontal` direction.

## Goal

A repeatable **rotate button** on the nozzle controls. Each click yaws the nozzle
another 90° about the world vertical axis, cycling 0° → 90° → 180° → 270° → 0°.
The user keeps clicking until the nozzle points where they want (e.g. straight
out the dome end). The rotation layers on top of the existing `orientationMode`.

## Why a repeatable rotate, not a new mode

Considered (and rejected) a dedicated `axial` orientation mode and a fixed
"rotate 90°" toggle. The user wants to *cycle*: click to step the direction
around the vertical axis and stop when it looks right. A single accumulating
field models this directly and stays predictable on every base mode.

## Data model

New optional field on `NozzleConfig` ([types.ts](../../src/components/VesselModeler/types.ts)):

```ts
/** Extra rotation about the world vertical axis, in degrees (0/90/180/270).
 *  Applied on top of orientationMode. Lets a dome-end nozzle point straight
 *  out the end instead of sideways. */
azimuthRotation?: number;
```

Optional, defaults to `0` — existing nozzles and saved models are unaffected.

## Mechanism

### Pure helper — `nozzle-geometry.ts`

```ts
export function rotateNormalAboutVertical(
  normal: THREE.Vector3,
  deg: number,
): THREE.Vector3;
```

Rotates `normal` about the world +Y axis by `deg` (mutates and returns it).
A no-op when `deg` normalises to 0. Shared by the engine and the unit test so
there is one implementation of the rotation.

### Engine — `vessel-geometry.ts`

In the nozzle loop, after the `orientationMode` block finalises `normal` and
**before** the alignment quaternion is built
([vessel-geometry.ts](../../src/components/VesselModeler/engine/vessel-geometry.ts)),
rotate the normal:

```ts
rotateNormalAboutVertical(normal, n.azimuthRotation ?? 0);
```

This is the single chokepoint where the nozzle's protrusion direction is
finalised, so the yaw composes with any base mode:

- `horizontal` dome nozzle (normal = ±Z): one step → ±X (axial, out the end).
- `vertical-up` / `vertical-down` (normal = ±Y): no-op (parallel to yaw axis).
- `radial`: tilts around vertical (allowed; user's choice).

The nozzle base stays pinned to its surface point — only the direction rotates.
Cosmetic note: the curved repad won't perfectly hug the dome once yawed; this is
a visualisation tool, not a stress model, so that is acceptable.

## UI

Both sidebars that render the Orientation toggle gain one control row directly
beneath it:

- [NozzleSection.tsx](../../src/components/VesselModeler/sidebar/NozzleSection.tsx) (flanged nozzles)
- [PipingSection.tsx](../../src/components/VesselModeler/sidebar/PipingSection.tsx) (plain-pipe stubs)

```
Rotate (vert. axis)
[ ↻ 90° ]   ← each click: azimuthRotation = (current + 90) % 360
```

A single repeatable button (lucide `RotateCw` icon) showing the live value
(`↻ 0°` at rest), wrapping to 0° after 270°. The scene rebuilds on each click via
the existing `onUpdateNozzle`, so the nozzle steps around in real time. Always
visible for predictability; simply a no-op on the vertical modes.

## Persistence

`azimuthRotation` is added to the four nozzle-mapping sites in
[VesselModeler.tsx](../../src/components/VesselModeler/VesselModeler.tsx)
(the cloud→state import map plus the export/snapshot maps), each gaining
`azimuthRotation: n.azimuthRotation`. The vessel-model service stores the
nozzles array as JSON passthrough, so there is **no DB or schema migration**.

## Test

Unit test for `rotateNormalAboutVertical` (real `THREE.Vector3`, matching
existing engine tests):

- +Z → +X at 90°
- +Z → −X at 270°
- +Z → −Z at 180°
- unchanged at 0°
- a Y-parallel vector unchanged at any angle

## Out of scope / non-goals

- Lifting lugs (no orientation field).
- Report generator (does not read nozzle orientation).
- Non-90° increments / free azimuth entry.
- Auto-resolving the "outward" direction — the user cycles manually by design.
