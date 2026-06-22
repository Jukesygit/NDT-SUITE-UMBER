# Attachment Angle Snap — Design

**Date:** 2026-06-19
**Status:** Implementing
**Area:** Vessel Modeler (3D placement interaction)

## Problem

Dragging an attachment onto the shell is fiddly: a nozzle the user wants at 90°
(top dead centre) frequently lands at 91° or 89°. There is no way to constrain
drag placement to clean angular stops.

## Goal

A viewport control that, when enabled, snaps the **circumferential angle** of a
dragged attachment to the nearest chosen increment (e.g. 91° → 90°). The control
sits in the top-right HUD and carries a slider to choose the increment.

## Scope (confirmed with user)

- **Snaps:** nozzles, lifting lugs.
- **Does NOT snap:** saddles (supports), welds, textures, annotations, coverage
  rects, inspection images. These drag freely as before.
- **Angle only.** Axial (along-length) position stays continuous.
- **Session-only.** Snap state is viewport UI state, not persisted to the model
  or cloud (mirrors `scanTooltipFollow`).
- **Increment via preset slider:** 1°, 5°, 10°, 15°, 30°, 45°, 90° — all clean
  divisors of 360, so there is no discontinuity at the 0°/360° seam.

## Mechanism

`InteractionManager.onPointerMove()`
([interaction-manager.ts](../../src/components/VesselModeler/engine/interaction-manager.ts))
is the single chokepoint: for each drag type it derives the surface angle `deg`
from the raycast hit and fires a move callback. Snapping there gives **live**
feedback (the part clicks to each stop while dragging) and a clean final drop.

## Changes

### 1. Engine — `interaction-manager.ts`

- Export a pure, unit-testable helper:
  ```ts
  export function snapAngleToIncrement(deg: number, increment: number): number;
  ```
  Returns `deg` unchanged when `increment <= 0`; otherwise rounds to the nearest
  multiple and normalises to `[0, 360)`.
- Add two public mutable fields (set from React, exactly like the existing
  `nozzlesLocked` flags): `angleSnapEnabled = false`, `angleSnapDeg = 5`.
- Private `snapAngle(deg)` applies the helper only when `angleSnapEnabled`.
- Apply `snapAngle()` to the `deg` passed to **`onNozzleMoved`** and
  **`onLugMoved`** only. The shared nozzle/texture/lug/annotation block snaps the
  nozzle and lug branches; texture and annotation branches keep raw `deg`. The
  coverage-rect, inspection-image, weld, and saddle paths are untouched.

### 2. Bridge — `ThreeViewport.tsx`

- New props `angleSnapEnabled: boolean`, `angleSnapDeg: number`.
- Pushed onto the manager inside the existing lock-sync `useEffect` (and added to
  its dependency array).

### 3. State + UI — `VesselModeler.tsx`

- `UIState` gains `snapEnabled: boolean` and `snapDeg: number`
  (defaults `false` / `5`).
- Actions `TOGGLE_SNAP` and `SET_SNAP_DEG` with matching reducer cases.
- New component `SnapControl.tsx` (keeps the large VesselModeler from growing),
  modelled on `StatsDropdown`: a `vm-popout-trigger` button (Magnet icon, shows
  `Snap · {deg}°` and `--active` styling when on) opening a `vm-popout-panel`
  with an enable toggle and a preset slider. Rendered in the existing
  `vm-popout-menu-right` HUD, before the Cursor/Fixed toggle.
- Pass `angleSnapEnabled={ui.snapEnabled}` / `angleSnapDeg={ui.snapDeg}` to
  `ThreeViewport`.

### 4. CSS — `vessel-modeler.css`

- Minimal additions for the snap panel layout (reuses `vm-popout-panel`,
  `vm-popout-trigger`, `vm-slider`, `vm-popout-trigger--active`).

### 5. Test

- Unit test for `snapAngleToIncrement` (nearest-multiple rounding, 360 wrap,
  pass-through when increment ≤ 0, mid-point rounding).

## Out of scope / non-goals

- No axial position snap.
- No persistence to model/cloud.
- Sidebar numeric angle inputs are unaffected (snap is drag-only).
- Pipelines are not part of the shell drag-angle mechanism and are unaffected.
