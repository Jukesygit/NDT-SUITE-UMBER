---
tags:
  - handover
  - agent
  - vessel-modeler
date: "2026-06-22"
status: active
---

# Agent Handoff: Nozzle Reinforcing Pad Won't Conform to the Shell

## Task

Make the nozzle **reinforcing pad ("repad")** seat flush against the vessel shell.
It currently renders as a near-flat disc that stands proud of the curved shell
(user screenshot, 2026-06-22 — most visible on side / ~3-o'clock nozzles on the
horizontal cylinder). The pad is **opt-in** (off by default): enable it on a
nozzle via the **Nozzles → Reinforcing Pad** toggle in the sidebar to reproduce.

## Where the code is

- **Geometry:** [`engine/nozzle-geometry.ts`](../../src/components/VesselModeler/engine/nozzle-geometry.ts)
  - `buildConformingRepad(repadRadius, repadThickness, bendRadius, material)` — builds the pad.
  - `createFlangedNozzle(...)` — the `showRepad` block calls it. The pad is built
    in the nozzle's **local +Y frame**, origin = shell contact point.
- **Placement / orientation:** [`engine/vessel-geometry.ts`](../../src/components/VesselModeler/engine/vessel-geometry.ts)
  nozzle loop (~431–571): computes the surface `normal`, sets `nozzleGroup.position`
  on the shell, and orients with `quaternion = setFromUnitVectors(+Y, normal)` (~566).
  `createFlangedNozzle(n, RADIUS, mat)` is called at ~434 (`RADIUS` = vessel inner radius, mm).
- **Test guard:** [`__tests__/nozzle-geometry.test.ts`](../../src/components/VesselModeler/engine/__tests__/nozzle-geometry.test.ts)
  → "bends the pad rim down to the shell radius".

## What's already been tried (do NOT repeat)

1. `SphereGeometry` cap with **sphere radius = pad radius** → a tight dome/bulge. Never conformed.
2. `LatheGeometry` surface-of-revolution → inverted/inconsistent normals (closed,
   non-monotonic profile) → rendered wrong (dark/flat).
3. **Current:** `CylinderGeometry` disc displaced per-vertex by the **spherical**
   sagitta `R − √(R² − ρ²)` (ρ = distance from nozzle axis), normals recomputed.
   Geometry + normals are correct, but it conforms to a **sphere**, not the
   **cylinder** → still stands off.

## Root cause (diagnosis)

The pad is bent **spherically** (equal curvature in every direction). The shell
is a **cylinder**: curved circumferentially, **straight axially**. A spherical
pad over-curves in the axial direction and, on a large vessel, the curvature is
so gentle it reads as flat — so the edges don't hug the shell. A real repad is a
plate **rolled to the shell radius** = a **cylindrical segment** (curved one
axis, straight the other).

## Recommended fix

Bend the pad **cylindrically about the vessel axis** (curved circumferentially,
straight axially) instead of spherically.

Key insight to make this general — the pad needs to know, in its **local** frame,
which in-plane direction is the cylinder's "straight" axis:

- For a **horizontal-vessel cylinder** nozzle, `setFromUnitVectors(+Y, normal)`
  with `normal = (0, sinθ, cosθ)` is a **pure rotation about world X** (the vessel
  axis): rotation axis = `+Y × normal = (cosθ, 0, 0)`. So **local X → world X**.
  ⇒ bending the pad about **local X** (straight along local X, curved in local Z)
  conforms **exactly** for horizontal cylinder nozzles. Try this first — it likely
  fixes the screenshot case immediately.
- **General solution:** have the caller compute the cylinder axis in the nozzle's
  local frame and pass it down:
  `localStraight = worldCylinderAxis.applyQuaternion(quaternion.clone().invert())`,
  then drop the component along +Y (the normal) and normalize → a 2D bend
  direction `d = (dx, dz)` in the local XZ plane. In `buildConformingRepad`,
  displace each vertex by `sag(w)` where `w = x*dz − z*dx` (signed perpendicular
  distance from the bend axis); leave the along-axis coordinate flat.
  `worldCylinderAxis` = world **X** for horizontal vessels, world **Y** for
  vertical (see `isVertical` in vessel-geometry).
- **Fallback:** for ellipsoidal **head/dome** nozzles there is no single straight
  axis — pass `null` and keep the current spherical `sag(ρ)`.

### Plumbing note

`createFlangedNozzle` is called (~434) **before** the quaternion is computed
(~566). To pass `localStraight`, either reorder so the normal/quaternion are
computed first, or compute `localStraight` directly from `normal` + the world
cylinder axis (no quaternion needed: project the axis onto the tangent plane and
express it in local coords).

## Confirmed NOT the problem

- **Placement** is correct: the nozzle origin sits exactly on the shell
  (`r_local * SCALE`, and the shell outer radius is `RADIUS * SCALE`). The pad's
  bottom-centre is at local y=0 on that surface. The issue is the **bend
  shape/axis**, not where the pad is.
- **Normals** are correct in the current build (recomputed from a primitive).

## Constraints

- Pad is **opt-in / off by default** — do not re-enable by default.
- Must not regress **dome/head** nozzles or **vertical** vessels (use the
  spherical fallback there).
- TDD per repo rules. Keep existing tests green and **add** a cylindrical-conformance
  test: e.g. on a horizontal cylinder nozzle the pad's **axial** edge stays at
  y ≈ 0 (on the tangent plane) while the **circumferential** edge drops by the
  sagitta. Verify with `npx vitest run src/components/VesselModeler/engine/__tests__/nozzle-geometry.test.ts`,
  then `npm run typecheck`.

## Reference

- Design doc: [2026-06-22-saddle-nozzle-reinforcement-pads-design.md](2026-06-22-saddle-nozzle-reinforcement-pads-design.md).
- Saddle wear plate (sibling feature, already conforms by construction — uses an
  extruded arc in `engine/saddle-geometry.ts`) is a useful reference for how a
  cylinder-conforming plate is built directly in world-aligned coordinates.
