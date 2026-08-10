---
tags:
  - plan
  - vessel-modeler
  - annotations
  - dome
date: "2026-07-24"
status: approved-design
---

# Annotation Dome-End Mapping - Design & Implementation Plan

## Problem

Annotations (`AnnotationShapeConfig`, the vessel-surface scan/restriction rectangles)
"act strangely" when drawn on or dragged onto dome ends. Dome *scans* were fixed with a
Jacobian-correct tangent-plane projection (`engine/dome-scan-geometry.ts`), but
annotations still use the legacy shell-only math. The user wants annotations to map onto
dome ends with the same physical-mm fidelity as dome scans, **and** to be seamless: an
annotation must be draggable from shell to dome and may straddle the tangent line.

## Root cause (verified in source)

1. `engine/annotation-geometry.ts` (`createRectOutline` L62-108, `createRectFill`
   L118-178) converts circumferential `height` (mm) to an angular half-span using the
   **fixed equatorial circumference** `Math.PI * vesselState.id`. On a dome the local
   radius shrinks toward the apex, so the rendered physical height no longer equals the
   stored mm height.
2. `width` is applied as **axial mm** (`config.pos ± width/2`). On the dome, axial mm is
   not surface arc mm - near the apex the meridian turns perpendicular to the vessel
   axis, so equal axial steps sweep large surface arcs, and past the 0.99 ratio clamp in
   `body-frame.ts` `radiusAt` (L89-99) the rect detaches/hovers over the apex.
3. The draw gesture (`interaction-manager.ts` pointer-up, ~L826-874) derives
   `width` from the raw axial delta and `height` from the angular delta at equatorial
   circumference, so even the *stored* values are wrong when the gesture happens on a
   dome.

Drag itself already reaches the dome: the annotation drag branch clamps `pos` to
`[-headDepth, length + headDepth]` and the dome head meshes carry `userData.isShell =
true`, so raycast + `toLocal` work there. Only the footprint math is wrong.

## Approaches considered

- **A. Per-annotation tangent-plane projection (copy dome-scan math).** Physically
  correct inside a dome, but `domePhiThetaFromPoint` returns `null` on the shell side of
  the tangent line by design - it cannot represent a rectangle straddling the boundary,
  and it would force a second storage schema (phi/theta) with migration. Rejected.
- **B. Reparametrize stored `pos` to meridian arc length.** Clean math but breaks every
  persisted annotation and diverges from all other features (nozzles, welds, textures)
  that store axial mm. Rejected.
- **C. (Chosen) Keep the stored schema; fix render/gesture math with a unified meridian
  arc-length parametrization (s, theta).** `s` = arc length along the meridian
  (identical to axial `pos` on the cylinder; continues along the ellipse meridian past
  the tangent lines). `width` = extent in `s` (true surface mm along the meridian);
  `height` = true circumferential mm, honoured at every station via the local radius.
  On the cylinder this reduces exactly to today's math (zero regression); on the dome it
  preserves the true mm footprint (same spirit as the dome-scan fix); and because it is
  one continuous coordinate system the rectangle crosses the tangent line seamlessly.

## Math spec (new pure module `engine/dome-arc.ts`)

All functions are pure, Three-free, parameterized by `radius R`, `headDepth D`,
`tanTanLength L` (so they can later serve appendage dished closures too).

Meridian on a head, parameterized by phi in [0, pi/2] (0 = tangent line, pi/2 = apex):

```
axial-past-TL u(phi) = D * sin(phi)
local radius  r(phi) = R * cos(phi)
ds/dphi              = sqrt( (D*cos(phi))^2 + (R*sin(phi))^2 )
```

Build a cumulative arc-length table (>= 128 samples, Simpson or trapezoid; monotone) per
(R, D) pair; total quarter-meridian arc = `domeArcLength(R, D)`.

Exports (suggested):

- `buildMeridianProfile(R, D)` -> cached profile object.
- `arcFromAxial(profile, L, posMm)` -> s. Identity for `0 <= pos <= L`; for `pos < 0`
  returns `-arc(|pos|)`; for `pos > L` returns `L + arc(pos - L)`. Axial overshoot past
  the apex (|axial-past-TL| > D) clamps to the apex arc.
- `axialFromArc(profile, L, sMm)` -> posMm (inverse via table interpolation; clamps at
  the apex arc on both ends).
- `displayRadiusAtArc(profile, L, sMm)` -> the radius the renderer will actually use.
  MUST reproduce `body-frame.ts` `radiusAt` semantics exactly, including the 0.99 ratio
  clamp: `R * sqrt(1 - min(0.99, |u|/D)^2)` with `u = axial-past-TL(s)`. This keeps the
  circumferential span math in exact agreement with where `shellPoint` will place the
  vertices (no flare mismatch at the near-apex clamp).

## Geometry spec (`engine/annotation-geometry.ts`)

`createRectOutline` and `createRectFill` (and therefore the invisible hit mesh) switch
from `(axial pos, constant angular half-span)` sampling to `(s, per-station angular
half-span)` sampling:

```
s0        = arcFromAxial(pos)
s range   = [s0 - width/2, s0 + width/2]      (clamped at both apex arcs)
at each sampled station s:
  axial   = axialFromArc(s)
  r       = displayRadiusAtArc(s)
  halfSpanRad(s) = min( (height/2) / r , PI )   // cap: never self-overlap
  vertex  = shellPoint(axial, centerAngleRad +/- offset, ...)  // unchanged placement fn
```

- Outline: 4 edges, 32 segments each, but the "top"/"bottom" edges are now curves in
  (s, theta) - theta = centerAngle -/+ halfSpanRad(s) varies with s (constant physical
  offset from the centre meridian). On the cylinder `halfSpanRad` is constant, so output
  is identical to the legacy formula.
- Fill/hit mesh: same 32x32 grid, per-row angular span = halfSpanRad(row's s).
- Vertex placement stays on `shellPoint` (which delegates to `SurfaceFrame`) - no new
  world-coordinate math, orientation handling stays single-sourced in `body-frame.ts`.

## Interaction spec (`engine/interaction-manager.ts`)

- **Draw gesture (create):** convert both endpoints to arc space:
  `s_start = arcFromAxial(startPos)`, `s_end = arcFromAxial(endPos)`;
  `width = |s_end - s_start|`, `centerPos = axialFromArc((s_start + s_end)/2)`.
  `height = angularDelta(rad) * displayRadiusAtArc(centerS)` (local radius, not
  equatorial). On the cylinder both reduce to the existing behaviour. Keep the existing
  `minSize = 20` mm floor.
- **Drag (move):** unchanged - raycast hit -> `toLocal` -> `(pos, angle)` already places
  the centre under the cursor on both shell and dome; keep the existing
  `[-headDepth, length + headDepth]` clamp.
- **Resize handles:** if annotation resize handles exist in the interaction manager,
  apply the same arc-space conversion to the resized width/height; if none exist, no
  action.
- Annotation drag intentionally does not `snapAngle()` - preserve that.

## Explicitly out of scope (recorded follow-ups)

- **Dome-aware thickness stats:** `engine/annotation-stats.ts` and
  `engine/annotation-heatmap.ts` sample only `vesselState.scanComposites` (shell) and
  use the equatorial-circumference conversion. An annotation on a dome scan still
  reports no stats. Follow-up feature; requires inverse tangent-plane sampling of
  `DomeScanConfig` grids.
- **Flattened (developed) 2D view:** draws neither annotations nor domes today; no
  change.
- **Appendage bodies:** annotations have no `bodyId` yet (appendage Phase 2 threads
  `bodyId` through features). The pure `dome-arc.ts` helpers take (R, D, L) parameters
  so appendage dished closures can reuse them later.

## Compatibility & risk

- Stored schema unchanged -> no serialization/migration work, old saves render better.
- Cylinder-region output must be **identical** to legacy (locked by tests below).
- `interaction-manager.ts` and `annotation-geometry.ts` are not touched by the in-flight
  appendage Phase 1 working-tree changes; avoid `VesselModeler.tsx` (modified, in
  flight) - the width/height computation happens before `onAnnotationCreated` fires, so
  no change should be needed there. Preserve all unrelated working-tree changes; do not
  commit.

## Test plan (Vitest, engine/__tests__/)

1. `dome-arc.test.ts` (write first - TDD):
   - Hemisphere (D = R): quarter arc = (pi/2)R within 1e-3 relative.
   - 2:1 head (D = R/2): arc strictly between D and (pi/2)R; monotone table.
   - Round-trip `axialFromArc(arcFromAxial(pos)) === pos` across shell and dome samples.
   - Shell identity: `arcFromAxial(pos) === pos` for `0 <= pos <= L`.
   - Apex clamping both ends; `displayRadiusAtArc` matches `radiusAt` formula including
     the 0.99 clamp.
2. `annotation-geometry.test.ts` (extend or add):
   - Shell regression: rect fully on cylinder -> vertex positions identical to legacy
     formula output (golden comparison against the old constant-span math).
   - Dome fidelity: rect centred on dome -> measured meridian edge arc length ~= width
     and mid-edge circumferential arc ~= height (tolerances ~2% for 32-segment
     sampling).
   - Straddle continuity: rect crossing the tangent line -> adjacent outline points have
     bounded spacing (no jumps), all vertices at finite radius.

## Addendum (2026-07-24, same day): apex reachability fix

User-reported after the initial fix landed: an untouchable circular region at the dome
centre that coverage/annotation rects cannot push into or touch, with the rect's far
edge orbiting it (scalloped bite).

**Root cause:** `body-frame.ts` `radiusAt` clamps the head ratio at 0.99, so every
surface parametrization bottoms out at `R*sqrt(1-0.99^2) ~= 0.1411*R` — a forbidden
disk (~212 mm radius on an ID-3000 vessel) at each apex. `dome-arc.ts`
`displayRadiusAtArc` deliberately mirrors the clamp, so the per-station span orbits the
same floor. Coverage rects render through the same `createRectOutline`/`createRectFill`
(ThreeViewport L458-470), so both features show the hole.

**Fix (chosen over an annotation-local bypass to preserve the single-source-of-truth
frame):**

- `body-frame.ts` `radiusAt`: clamp 0.99 -> 1.0 (true radius 0 at the pole). All frame
  consumers change only in the last 1% of head depth, where the old behaviour was a
  hovering 0.141R ring — strictly more correct now. Equivalence tests carry no
  assertions in that band (verified by grep before the change).
- `dome-arc.ts`: mirror constant -> 1.0 so span math stays in lock-step.
- `annotation-labels.ts` L403/406: same 0.99 -> 1.0 so label leader anchors track the
  now-reachable pole.
- `annotation-geometry.ts` `halfSpanRad`: guard `r <= epsilon` -> span = PI (avoids
  0/0 NaN; any rect reaching the pole wraps the full ring there, so a rect pushed into
  the centre covers the entire polar cap — the hole disappears).
- Untouched on purpose: `weld-geometry.ts` and `vessel-geometry.ts` keep their own
  legacy 0.99 copies (welds/nozzles at the exact apex are a non-goal; don't widen the
  blast radius while appendage Phase 2 is in flight in those files).
- Known accepted quirks: dragging across the exact pole momentarily reads angle 0
  (atan2(0,0)); a rect whose *centre* sits exactly on the apex renders with its far
  half clamped at the pole. Coverage-rect *creation* math (equatorial deltas) is a
  separate recorded follow-up.

## Addendum 2 (2026-07-24, later same day): rigid drape model + pole crossing

User feedback after the apex-reachability fix: drawing a rect on the dome yields a
C-shaped band, and dragging one toward the centre yields a "tag" whose far edge wraps
into a ring with a hole. Requirements: (1) the rectangle must KEEP ITS SHAPE on the
dome, including at the centre; (2) it must pass THROUGH/PAST the centre seamlessly.

**Why the current model morphs:** the (s, theta) construction offsets the lateral
edges along circles of latitude (`theta = centre +- halfH/r(s)`). Near the pole
r(s) -> 0, so the edges flare into arcs (the C) and cap at a full ring (the hole).
Latitude circles are not geodesics on a dome; a rigid stencil follows geodesics.

**New model — Fermi drape:**

- Centre meridian, extended THROUGH the pole: stations u in [-w/2, +w/2] of meridian
  arc from the rect centre; a station past the apex arc continues smoothly down the
  antipodal meridian (angle + 180). The cylinder<->head junction is tangent-continuous;
  the meridian through the pole is smooth — this is what makes pole crossing seamless.
- Lateral placement: from each station, walk +-v (up to h/2) along the surface in the
  direction perpendicular to the meridian using a projective surface walker (step along
  the tangent, re-project to the implicit surface, re-orthogonalize; small fixed steps).
  On the cylinder this walk IS the circumferential circle; on the head it approximates
  the true geodesic — a rigid rectangle draped over the dome, never a band or ring.
- Exactness guard: a rect that lies entirely on the cylinder (both s-extents within
  [0, L]) takes the EXISTING analytic path — the on-shell golden tests stay
  byte-identical. The walker runs only for head-touching rects.
- The pi-span cap and per-station flare from Addendum 1 are superseded for
  head-touching rects (they remain conceptually only as the walker's self-overlap
  tolerance: a rect larger than the cap may self-overlap; render DoubleSide, fine).

**Drag through the centre (interaction-manager, annotation/coverage drag only):**
raycast angle is unstable near the axis, so the drag keeps an angle reference:

- hit -> (pos_h, theta_h); r_hit = distance of hit from the vessel axis.
- Same side (|wrap(theta_h - theta_ref)| <= 90):
  r_hit >= 0.2*R -> adopt (pos_h, theta_h) (normal tracking);
  r_hit <  0.2*R -> adopt pos_h, HOLD theta_ref (no spin at the centre).
- Opposite side (cursor emerged past the pole): adopt (pos_h, theta_ref + 180) — the
  drape at (apex - delta, theta) tends to the same footprint as (apex - delta,
  theta+180) as delta -> 0, so the crossing is visually continuous.

**Gesture (draw) math:** unchanged from Addendum 1 (arc-space width, local-radius
height); the C-shape was a rendering artifact and disappears with the drape model.

**Tests:** on-shell golden unchanged; sphere sanity (R = D): lateral walker vs
analytic great-circle within tolerance; rigidity: corner-to-corner surface distances
of a pole-centred rect within a few % of stored w/h; pole-crossing continuity:
footprints for (apex-eps, theta) and (apex-eps, theta+180) mirror-match; no NaN
anywhere; straddle continuity retained.

## Addendum 3 (2026-07-28): sagitta-aware segment density (striped bands fix)

User-reported: full/large-circumference bands on the shell render striped - the fill
and outline dip below the vessel surface between samples and get clipped.

**Root cause:** fixed 32-segment sampling. A full wrap at R=1500 is ~11.25deg per
segment; the straight chord between adjacent vertices sags `R*(1-cos(theta/2))` ~= 7 mm
below the surface, exceeding the 2.5-3 mm hover offset -> the middle of every segment
is inside the shell (dash-per-segment striping). Small rects never exceed the offset.

**Fix (annotation-geometry.ts only; surface-drape.ts takes cols/rows as params):**
- `adaptiveSegments(radius, spanRad, offsetMm)`: smallest n with sagitta
  `radius*(1-cos(span/(2n))) <= offset/2`, clamped to [32, 256]. The min-32 clamp keeps
  every existing golden fixture (small spans) byte-identical.
- Cylinder path: circumferential outline sweeps + fill segY use it (span = 2*halfSpan
  at R). Drape path: rows from the height span at R; cols also guarded against the
  meridian's minimum curvature radius at the tangent line (`D^2/R`, the tightest bend)
  for very wide head-touching rects.
- Consumers must not assume 128 outline points / 33x33 fill - verify before merging.

## Verification commands

- `npm run typecheck`
- `npx vitest run src/components/VesselModeler/engine/__tests__/dome-arc.test.ts src/components/VesselModeler/engine/__tests__/annotation-geometry.test.ts` (plus any touched suites; full `vitest run` is a known local worker/OOM flake - use targeted runs)
- `npm run lint`
