# Boot Parity Feedback Batch — Design (user review 2026-08-05)

Five items from the owner's hands-on review of the appendage/boot work. Baseline `b18983d` (post T2-D4).

## R1 — Nozzle-bore cutouts in stats (live)

Nozzle bores are unscannable: their footprint subtracts from shell area totals and is excluded from coverage/wall-loss sweeps, live — the exact mechanism `junction-footprint.ts` established for boot junctions (design 2026-07-21 §9.4: ONE `containsCell` predicate drives stats AND visuals).

- Scope v1: nozzles mounted on cylindrical shells (main + boot bodies). Radial nozzles use the exact perpendicular cylinder-cylinder intersection already in `junction-footprint.ts` (parameterize by nozzle bore radius); non-radial orientation modes approximate with the projected bore ellipse — document the approximation. Head/dome-mounted nozzles: deferred follow-up (head region totals are computed separately; needs spherical-cap math).
- Consumers: `coverage-calculator.ts` totals + sweep, `wall-loss-compute.ts` cell exclusion (per body — a boot nozzle excludes from that boot's compute), heatmap `excludeMask` (visual hole for consistency). Stats sections' memo deps include nozzles already via vesselState — verify live update.
- Zero-nozzle models byte-identical; existing boot-junction tests untouched.

## R2 — Cursor-first mounting (kill the "Mount on" dropdowns)

The model behaves as ONE continuous surface set. Rules:

- **Drag:** attachable drags raycast ALL body surfaces (main shell + heads + every boot cylinder/closure); nearest hit wins; crossing a junction live-reassigns `bodyId` and converts (pos, angle) through the two `resolveBodyFrame`s so the item tracks the cursor with no jump. Applies to: nozzles, lugs, welds, annotations, coverage rects, scan gizmos.
- **Create:** draw/drop targets the surface under the cursor (replaces T2-B's selected-entity `activeBodyId` rule for draw; drops likewise).
- **Sidebar:** Mount-on `<select>`s removed from Weld/Lug/Coverage/Annotation/Nozzle sections; replaced by a read-only "On: Boot 1" chip. Dome-scan import modal keeps its target choice (import has no cursor context).
- Undo: a cross-body drag is still one gesture — `HISTORY_BREAK` on drag end unchanged; bodyId change rides the same coalesced drag entry.
- Guardrails: hysteresis at the junction seam (don't flap when the cursor rides the boundary — reuse the resolveDrapeDrag hysteresis pattern); dome scans and dome-mounted things do NOT cross (their config is head-specific).

## R3 — Terminology: "Boot"

All user-facing strings: sidebar section title, buttons, empty states, default names ("Boot 1"), stats rows/selector, 2D labels, import labels, tooltips. Style union labels (sump/boot/riser) stay as style names. Code identifiers (`AppendageConfig`, `appendage-*.ts`, `bodyId`, `section_type appendage:<id>`) are UNCHANGED — serialization and cloud values must not move.

## R4 — Relief becomes the "Topo" viewport mode

- `ui.viewMode` gains `'topo'` (currently 3d/2d toggle); the viewport button stack becomes 3D / 2D / Topo.
- Topo takes over the main viewport pane (like 2D): renders `ReliefViewport` for the ACTIVE composite — the selected scan composite, else the first confirmed one; sidebar selection switches the surface live. Controls (denoise/gap-fill/exaggeration/measure) render as a compact overlay toolbar, not a modal.
- The ScanCompositeSection "Relief view" button and modal chrome are removed; `ReliefViewport` (the THREE pane) is reused as-is; `ReliefViewModal` retires.
- No composite in state → Topo button disabled with tooltip.

## R5 — Vertical-vessel 2D orientation bug (diagnose first)

Owner screenshot: vertical vessel, portrait developed view (axial on Y, 0–9500 mm; circumference on X, 0–4800 mm); scan strips render as full-width horizontal bands (reading as circumferential rings) when the physical strips run longitudinally. The view is 90° mismatched between geometry mapping and strip/heatmap mapping for vertical vessels.

- Invariant to restore: **strips render along the axis they were scanned**; nozzle/feature positions and the heatmap must agree in one frame. Determine where vertical orientation enters FlattenedView (projection? render transform? report export path?) and whether geometry or heatmap is the rotated one; fix at the single projection source (`geometry-projection.ts` conventions per Decision Log 2026-06-22/23 — no manual ±90 anywhere).
- Regression tests: vertical-vessel fixture asserting strip direction + a nozzle's developed position consistent with its 3D angle/pos; horizontal vessels byte-identical.

## Sequencing

Wave A (parallel, disjoint): R1 (engine stats) + R5 (FlattenedView). Wave B: R3 rename (fast, broad strings). Wave C: R4 (viewport mode), then R2 (largest — interaction). Full gate after C.
