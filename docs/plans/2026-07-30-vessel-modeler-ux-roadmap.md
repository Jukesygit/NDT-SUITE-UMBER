# Vessel Modeler — UX & Capability Roadmap

**Date:** 2026-07-30
**Status:** Approved backlog, sequencing proposed — awaiting T0 go-ahead
**Origin:** Ideation review (2026-07-29/30) against the modeler's trajectory and the verified findings of `2026-07-12-tools-projects-comprehensive-review.md`. The user triaged the ideation list; this doc anchors the approved items and their order.

## Verified current-state findings (2026-07-30, working tree)

1. **Dome-aware annotation stats/heatmap ("A1") is NOT implemented** — contrary to belief. Only annotation *geometry* drapes onto heads (`engine/surface-drape.ts` via `annotation-geometry.ts`). The sampling side is still pure-cylinder: `annotation-stats.ts` → `scan-sampling.ts` (linear index/scan-offset → row/col, no `dome-arc`, never reads `domeScanComposites`, filters `!bodyId`); `annotation-heatmap.ts` still carries its own duplicate sampler ("mirrors annotation-stats.ts") that was never migrated to `scan-sampling.ts`. The 2026-07-24 follow-up remains open.
2. **Appendage bodies: Phase 2 done (uncommitted), Phase 3 stalled after T1.** Scans + nozzles mount on appendages end-to-end (bodyId plumbing, pickers, body-scoped drag, serialization `section_type='appendage:<id>'`). But `engine/junction-footprint.ts` (untracked) has **zero non-test callers** — no shell-area reduction or overlay clipping happens; four interim exclusion markers ("Phase 3: … excluded here so numbers stay correct in the interim") remain in `ScanCoverageStatsSection`, `annotation-stats`, `annotation-heatmap`, `FlattenedViewport` (×2); wall-loss/coverage `.filter(!bodyId)`. Missing entirely: per-body stats, flattened-view appendage rendering, welds/annotations/lugs on appendages, dome scans on appendage ends, stable nozzle ids.
3. **Branch state:** `feature/appendage-bodies` holds ~108 uncommitted changed files interleaving at least four workstreams (undo/redo, appendage Phase 2 + 3-T1, competency-attribution UI, C-scan work). Only Phases 0–1 (`49742f9`, `14ff36a`) are committed.

## Tranche 0 — branch hygiene (blocker for everything)

Commit the working tree in logically attributed chunks (undo/redo, appendage Phase 2 + footprint T1, attribution UI, remainder) **after confirming no parallel session is still writing**. No implementation tranche starts on top of a 108-file uncommitted interleave.

## Tranche 1 — appendage bodies up to speed (approved: "A2")

- **1a. Finish Phase 3** per `2026-07-24-appendage-phase3-implementation.md`: wire `junction-footprint.ts` into the coverage calculator and wall-loss compute (exclude junction openings from main-shell area), clip main-shell overlays at the footprint, per-body stats sections, remove the four interim exclusion filters, render appendages + their scans in the flattened view.
- **1b. Unified surface sampler** — one rework makes annotation stats/heatmap sampling **dome-aware AND body-aware** (this folds in ideation item A1). Migrate `annotation-heatmap.ts` onto `scan-sampling.ts` (kill the comment-synced duplicate), then extend the shared sampler to resolve (bodyId, region: shell|dome) through `body-frame.ts`/`dome-arc.ts`. Same files as 1a's marker removal — do together.
- **1c. Phase 4 attachable parity** (design addendum first): welds, annotations, and lifting lugs mountable on appendage bodies; dome scans on appendage end closures (`DomeScanConfig.bodyId` + head addressing). These were §17 "explicitly not v1" follow-ups in the appendage design.
- **Deferred, deliberately:** real CSG junction (interpenetration + flange-ring visual technique suffices); stable nozzle ids move to Tranche 2.

## Tranche 2 — foundations (approved: "F26")

Per review §4.3/§4.5, done *before* new UI features land in the god component:

- `engine/vessel-coords.ts` — single source for datum→vessel angle (+90), circumferential mm, CW/CCW handedness; fold in the two partial helpers; property tests (roundtrip, wrap continuity, cw/ccw symmetry); forbid literal `+ 90` on datum angles.
- **VesselModeler.tsx decomposition** along the existing `sidebar/` seams; migrate `updateVessel` closures toward semantic slice actions (undo/redo already proved the reducer seam).
- **Structural-hash fix** (review §4.4): move scan/dome `opacity`, `colorScale`, `rangeMin/Max` out of `structuralHash` to Tier-2 in-place updates — kills the slider rebuild storm.
- **Stable nozzle ids** replacing `Pipeline.nozzleIndex` + index-shift cascade (ride-along; the cascade code wants it).

## Tranche 3 — UX batch (approved: "A3", "C12–C15")

Each gets a short design note; they fan out well once Tranche 2 lands:

- **A3** — labeled undo entries ("Undo: Move nozzle N2") + history dropdown (the undo design reserved the `label` field).
- **C12** — view cube + canonical views (N/E/S/W, TDC) + per-nozzle normal views + **persisted camera bookmarks** that feed report captures.
- **C13** — entity outliner (shell → nozzles → scans → annotations → appendages) with visibility toggles and click-to-select.
- **C14** — command palette / entity search ("N7" → select + frame).
- **C15** — section/clip planes (shows off the exact junction math; helps access planning).

## Parallel track — TopologyViewer (approved: "F27", mode undecided)

Standalone page, own CSV upload, zero project/cloud persistence. **Recommendation: absorb** as a modeler visualization mode ("relief view" of a composite — useful for pit morphology) rather than wiring persistence into a dead-end page; aligns with the review's surface-consolidation theme. Decision pending.

## Pending decision — CML placement layer ("B6")

Explained 2026-07-30. High strategic value (the review's declared market wedge) but rides on the asset → CML → reading-history domain model (review Part 3 / Phase 2 pivot). Candidate Tranche 4 or its own initiative. In/out: user to decide.

## Explicitly not in scope (mission guard, review §4.6)

Internals (trays/baffles), point-cloud import, general CAD breadth. Any geometry addition must justify itself in inspection terms (as repads/CUI and appendages/boot-corrosion did).

## Delegation notes (orchestration policy)

Implementation → opus agents; research/verification runs → sonnet agents; design docs precede 1c and each C-item; every tranche ends with the build/test/lint verification gate.
