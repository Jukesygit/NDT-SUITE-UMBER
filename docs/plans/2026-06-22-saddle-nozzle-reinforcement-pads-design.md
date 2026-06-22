---
tags:
  - plans/vessel-modeler
  - geometry
  - saddles
  - nozzles
---

# Vessel Modeler: Reinforcement Pads for Saddles & Nozzles

**Date:** 2026-06-22
**Status:** Designed

## Problem

The 3D vessel modeller renders saddle supports and flanged nozzles, but the
support/penetration detailing is incomplete versus real fabrication:

1. **Saddles have no wear plate.** Real support saddles almost always carry a
   curved *wear / reinforcement plate* welded to the shell between the shell and
   the saddle cradle. It wraps a slightly larger arc than the saddle (extends
   past the saddle "horns" circumferentially) and overhangs the saddle axially.
   [`saddle-geometry.ts`](../../src/components/VesselModeler/engine/saddle-geometry.ts)
   builds the cradle, webs, and base plate with the cradle contacting the shell
   directly — there is no plate.

2. **The nozzle repad exists but is approximate and not independently
   controllable.**
   [`nozzle-geometry.ts`](../../src/components/VesselModeler/engine/nozzle-geometry.ts)
   (lines 61–83) builds a reinforcing pad as a *flattened sphere-cap* (a slight
   dome, sphere radius = pad radius) rather than a true flat plate conforming to
   the cylindrical shell. It is also bound to the weld neck under a single field
   (`hideRepad`), which the sidebar labels "Weld Neck" — turning it off removes
   **both** the pad and the neck. There is no way to show a repad without the
   weld neck, or to size the pad.

## Goal

- Add a configurable **saddle wear plate** between shell and cradle.
- Rework the **nozzle reinforcing pad** into a true conforming plate with its
  own independent toggle and dimensions, decoupled from the weld neck.

## Decisions (from brainstorming)

- Scope: **both** — saddle wear plate *and* improved nozzle repad.
- Saddle wear plate: **full control** — per-saddle on/off, thickness,
  circumferential arc overhang (°), axial overhang (mm).
- Nozzle pad: **toggle + diameter + thickness**, with its own independent on/off.
- Nozzle pad geometry: **flat plate bent to the local shell radius** (not a
  flatter sphere-cap). On dome ends the cylinder radius is used as the bend
  radius (accepted approximation).

## Design

### 1. Data model ([`types.ts`](../../src/components/VesselModeler/types.ts))

`SaddleConfig` — add:

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `wearPlate` | `boolean?` | legacy/undefined → **off** | Existing saved models render unchanged; the "Add Saddle Support" button sets `true` so new saddles are realistic. |
| `wearPlateThickness` | `number?` | 12 (mm) | |
| `wearPlateArcOverhang` | `number?` | 6 (° beyond each saddle horn) | |
| `wearPlateAxialOverhang` | `number?` | 50 (mm each side) | |

`NozzleConfig` — split the overloaded `hideRepad` and add pad dims:

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `showRepad` | `boolean?` | new nozzles → `true` | Independent pad visibility. |
| `showWeldNeck` | `boolean?` | new nozzles → `true` | Independent weld-neck visibility. |
| `repadOD` | `number?` | 1.8 × pipe OD | |
| `repadThickness` | `number?` | 10 (mm) | |

**Migration:** on load, if `showRepad`/`showWeldNeck` are absent, derive both
from the legacy field: `showWeldNeck = showRepad = !hideRepad`. `hideRepad` is
kept for back-compat reads; new writes emit the new flags (and continue to emit
`hideRepad` so older clients still behave).

### 2. Geometry

#### Saddle wear plate ([`saddle-geometry.ts`](../../src/components/VesselModeler/engine/saddle-geometry.ts))

- Generalize the existing `buildCradleGeometry` extrude-arc routine into a
  helper parameterized by `(innerRadius, thickness, arc, depth)`. The cradle
  keeps calling it; the wear plate calls it with:
  - inner radius = shell radius `r`; outer = `r + wearPlateThickness`
  - arc = `CRADLE_ARC + 2 × wearPlateArcOverhang`
  - depth = `(saddleDepth + 2 × wearPlateAxialOverhang) × SCALE`
- **Cradle contact shift:** when the plate is present, the cradle and all of its
  web math reference a `contactRadius = r + wearPlateThickness` instead of `r`,
  so the cradle sits *on* the plate — physically correct and avoids z-fighting.
  A single `contactRadius` value threaded through the existing web/edge
  calculations (`cradleEdgeY`, `webZ`, `cradleBottomY`, `midCradleY`).
- The plate mesh is added to the saddle group with the same material;
  `userData.type` stays `'saddle'` so selection/drag is unaffected.

#### Nozzle repad ([`nozzle-geometry.ts`](../../src/components/VesselModeler/engine/nozzle-geometry.ts))

- Replace the flattened sphere-cap with a **thin disc bent to the shell
  radius**: build a disc of radius `repadOD/2` and thickness `repadThickness`
  (a `CylinderGeometry` with radial + height segments), then displace each
  vertex along local −Y by `shellRadius − √(shellRadius² − ρ²)` where ρ is the
  vertex distance from the nozzle axis. Over the small pad footprint this reads
  as a flat plate gently hugging the shell, with ~uniform thickness.
- Pad renders when `showRepad`; weld neck / tapered stub when `showWeldNeck`.
  The stub-radius taper and `weldNeckLength` logic currently keyed off
  `hideRepad` is rewired to `showWeldNeck`.
- Bend radius uses the passed `shellRadius` (cylinder radius) for all nozzles;
  dome-end nozzles approximate, as accepted.

### 3. Sidebar UI

- **[`SaddleSection.tsx`](../../src/components/VesselModeler/sidebar/SaddleSection.tsx):**
  in the per-saddle edit block add a "Wear Plate" On/Off toggle (existing
  `vm-toggle-group` pattern). When on, reveal `SliderRow`s for Thickness (mm),
  Arc Overhang (°), Axial Overhang (mm). "Add Saddle Support" sets
  `wearPlate: true`.
- **[`NozzleSection.tsx`](../../src/components/VesselModeler/sidebar/NozzleSection.tsx):**
  split the single "Weld Neck" toggle into two — **Reinforcing Pad** On/Off and
  **Weld Neck** On/Off — wired to `showRepad` / `showWeldNeck`. When the pad is
  on, reveal Pad OD (mm) and Pad Thickness (mm) inputs (`repadOD` /
  `repadThickness`).

### 4. Persistence (critical — known round-trip gap)

Vessel parts are serialized by **explicit field lists** in several mappers in
[`VesselModeler.tsx`](../../src/components/VesselModeler/VesselModeler.tsx). New
fields must be added to all of them or they silently fail to reach the cloud
(the same class of bug that affected dome scans):

- Nozzle mappers: load (~552), saves (~1702, ~1831) → add `showRepad`,
  `showWeldNeck`, `repadOD`, `repadThickness` (keep emitting `hideRepad`).
- Saddle mappers: loads (~561, ~2166), saves (~1711, ~1841) → add the four
  `wearPlate*` fields.
- Drawing-import saddle map (~2365, pos-only) left as-is — defaults apply.
- Verify [`vessel-model-service.ts`](../../src/services/vessel-model-service.ts)
  does not narrow part fields before persistence.

### 5. Testing (TDD)

- Extend
  [`saddle-geometry.test.ts`](../../src/components/VesselModeler/engine/__tests__/saddle-geometry.test.ts):
  wear plate mesh present when on / absent when off; plate arc and axial spans
  exceed the cradle's; cradle contact radius shifts outward by the plate
  thickness when present.
- New nozzle-geometry test: pad present only when `showRepad`; weld neck
  independent of the pad; pad bottom vertices lie ≈ on the shell sphere of
  radius `shellRadius`; legacy `hideRepad:true` migrates to both flags off.
- Persistence round-trip assertion (save → load preserves the new saddle and
  nozzle fields), following the dome-scan round-trip test pattern.

## Out of Scope (YAGNI)

- Flattened 2D view wear-plate rendering.
- Report / GLTF export of the pads.
- Per-pad materials or colours (pads inherit the shell/part material).

## Touch List

- `src/components/VesselModeler/types.ts`
- `src/components/VesselModeler/engine/saddle-geometry.ts`
- `src/components/VesselModeler/engine/nozzle-geometry.ts`
- `src/components/VesselModeler/sidebar/SaddleSection.tsx`
- `src/components/VesselModeler/sidebar/NozzleSection.tsx`
- `src/components/VesselModeler/VesselModeler.tsx` (serialization mappers)
- `src/components/VesselModeler/engine/__tests__/saddle-geometry.test.ts`
- `src/components/VesselModeler/engine/__tests__/nozzle-geometry.test.ts` (new)
