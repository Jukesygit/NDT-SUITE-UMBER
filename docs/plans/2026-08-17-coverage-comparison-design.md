# Coverage Comparison Design (Scope Planning: Targets vs Achieved)

- **Date:** 2026-08-17
- **Status:** Design locked (wayfinder tickets [#8](https://github.com/Jukesygit/NDT-SUITE-UMBER/issues/8), [#11](https://github.com/Jukesygit/NDT-SUITE-UMBER/issues/11), [#12](https://github.com/Jukesygit/NDT-SUITE-UMBER/issues/12), [#13](https://github.com/Jukesygit/NDT-SUITE-UMBER/issues/13), map [#6](https://github.com/Jukesygit/NDT-SUITE-UMBER/issues/6)); implementation not started.
- **Companion spec:** `docs/plans/2026-08-13-layers-system-design.md` (layers vocabulary + `ReadOnlyViewport` layer contract).

## The model (pivot locked in #12)

Coverage rects are **where/how guidance** — a sketch of scanning intent carrying `technique` + `note`. They are *not* measured against scans. The **plan is a target percentage per feature instance** ("40% of the shell", "20% of the left dome end"), and the comparison is **target % vs achieved %** per feature, where achieved = scanned valid area / feature area. The per-rect intersection metric (audited in #9) is a *future drill-down*, not part of this design — see Appendix.

Feature instances: main shell · left head · right head · each boot's shell · each dished boot's closure dome.

## Data model

### Targets — extend the existing `CoverageTargets` (types.ts:646-654)

The type already exists: `{ leftHead, cylinder, rightHead, appendages?: Record<appendageId, CoverageTargetEntry> }`. **Keep the persisted vocabulary** (additive-only convention — no renames, no migration). One extension: appendage values become `{ shell: CoverageTargetEntry; dome?: CoverageTargetEntry }` — `dome` present only when `endClosure === 'dished'`; head keys absent (not zero) for pipe-shaped vessels. Absent target = **untracked** feature.

### Rect metadata (locked in #8)

Three optional fields on `CoverageRectConfig`, declared only in `vessel-serialization-spec.ts` (absent ⇒ byte-identical saves, `bodyId` precedent):
- `technique`: enum — `paut-corrosion-mapping | ut-0 | shear-wave | tofd | mpi | dpi | ect | visual | rt | other`
- `techniqueOther`: free text (only with `technique: 'other'`)
- `note`: free text, inspector-facing instruction

Labels: "PAUT corrosion mapping", "UT thickness (0°)", "Shear-wave UT", "TOFD", "MPI", "DPI", "ECT", "Visual", "RT", "Other".

## Achieved-stat plumbing (verified 2026-08-17; two work items + one option)

Current state (file:line from the region-granularity audit):
- `computeRegionTotalAreas` → `{ leftHead, cylinder, rightHead }` (`engine/coverage-calculator.ts:339,365-369`), cutout-adjusted cylinder.
- Main heads' achieved **already separately attributed** via `DomeScanConfig.head: 'left'|'right'|'end'` — but in a component memo (`stats/ScanCoverageStatsSection.tsx:154-172`), not the engine.
- Boot shells' achieved: `computeAppendageCoverageTotals` (`coverage-calculator.ts:314-329`), lateral shell only.
- **Boot closure-dome achieved is orphaned:** `coverage-calculator.ts` never reads `domeScanComposites`; appendage dome scans (`head:'end'` + `bodyId`) land in no bucket, and boot `totalMm2` excludes the dome area.

**Work item 1 — boot dome split.** `computeAppendageCoverageTotals` gains a loop over `domeScanComposites` filtered on `ds.bodyId === a.id`, and its output splits into `shellTotalMm2/shellAchievedMm2` + `domeTotalMm2/domeAchievedMm2` (dome total from `diameter` + `endClosure.headRatio`, same integration as the main-head area).

**Work item 2 — engine lift.** Move the main-region achieved memo into `engine/coverage-calculator.ts` as `computeRegionAchievedAreas(state): { leftHead, cylinder, rightHead }` so the Coverage tab, the modeler stats section, the vessel-card strip, and snapshot bundles share one source.

**Optional refinement (not required):** route head-touching shell composites' achieved area across the tangent line using `rectIsPureCylinder` (`coverage-calculator.ts:411-412` — already routes *covered* area this way). Until then, shell scans draping past the tangent credit `cylinder`.

**Guard:** `head === 'end'` is a third enum member — every left/right split must keep the `bodyId` guard (`ScanCoverageStatsSection.tsx:166` precedent) or `'end'` scans misfile as right-head.

## Amendment (2026-08-20, implementation ruling — binding)

**`scopedPct` is THE comparison target.** `CoverageTargetEntry` carries two numbers: `rbaPct` (the risk-based-assessment recommendation) and `scopedPct` (the committed scope). Achieved is measured against `scopedPct` and never against `rbaPct` — the RBA figure *informs* the scope and is otherwise informational. `targetPctOf()` in `engine/coverage-comparison.ts` is the ONE place that decides this; no surface may pick a target for itself.

Also settled during implementation:
- Surfaces §1 and §3 named `InspectionDetailPage` and `VesselCard`. The live components are **`VesselOverviewPage`** and **`ProjectVesselList`**; `VesselCard.tsx` / `ProjectVesselsTab.tsx` are dead code imported by nothing. The section and the strip landed on the live surfaces.
- `formatCoveragePct` / `formatCoverageDelta` live in `coverage-comparison.ts` and are re-exported by `coverage-scope-report.ts`. Every surface formats through them; none re-declares them.
- The React *project* print report still has no coverage page — only the modeler's generated .docx does. It needs modelConfig→VesselState plumbing and is a deliberate follow-up, outside this spec's scope.
- `ScopeProgressCard` / `ScopeSection` still read the OLD rect-area scope number from `utils/coverage-calc.ts`, not the target-percentage model. Two coverage vocabularies now coexist on the vessel page; reconciling them is a separate call.

## Status semantics (locked in #12)

- **Green** — achieved ≥ target. **Amber** — within 5 percentage points below. **Red** — short by more than 5 points. Fixed values, no configuration.
- **Untracked** (no target): dimmed row, dash, excluded from all rollups.
- Vessel rollup: area-weighted achieved vs area-weighted target over *targeted* features only, plus "N of M targeted features short".

## Surfaces

### 1. Coverage tab — `InspectionDetailPage` (`/projects/:projectId/vessels/:vesselId`)

- **Embedded `ReadOnlyViewport`** (#13 contract: `{vesselState, textureObjects, layers, initialPose?, onHover?}`) with planned coverage + achieved heatmap layers on by default, layer toggles exposed (layers-system vocabulary).
- **Per-feature table:** Feature · Target % · Achieved % · Delta · Status. Row expand lists the feature's rects (name · technique · note) as guidance context. Row click frames the feature in 3D (frame-entity/canonical-pose machinery); hover highlights without moving the camera.
- **Rollup header** as above.
- Loads the linked vessel model; empty states: no linked model → pointer to "Plan scope"; model but no targets → all-untracked hint.

### 2. Modeler — coverage-comparison stats section + target editing

- New `CoverageComparisonSection` in `UnifiedStatsPanel` (compact target/achieved/status rows, same engine source). No separate "review mode" machinery; a palette command jumps to the section. Layers give planned-only/achieved-only viewing.
- **Target editing lives in `CoveragePanel`:** per-feature target % inputs (main shell, each head, per-boot shell/dome when dished). Technique dropdown + note textarea on the selected rect (in the coverage sidebar section).

### 3. Projects layout (locked in #11)

- **Vessel cards on `ProjectDetailPage`** gain a planning-status strip: model linked ✓/– · targets set N/M · achieved % (dash when untracked). Same engine numbers as the tab — one source.
- **"Plan scope" primary action** per card: opens the linked model in the modeler; if none, creates a blank default-geometry model, links it, opens it.
- Projects *list* page unchanged; no new routes; no project-level aggregate beyond the strips (can ride later).

## Invariants

- Targets and rect metadata are **spec-declared optional fields**: absent ⇒ byte-identical legacy saves.
- Stats never filtered by visibility (layers are visual only).
- Heavy sweeps read settled snapshots (existing debounce rules); the card strip and tab read persisted/derived stats, never live drag state.
- Targets are technique-agnostic; achieved is technique-blind (locked — revisit only if composites ever carry a technique).

## Generated reports (amendment, ticket #20)

The vessel report gains a **"Coverage vs Scope" section**: the same per-feature table (Feature · Target % · Achieved % · Status) plus the vessel rollup, print-styled, fed by the same engine functions as the Coverage tab (`computeRegionAchievedAreas` + appendage shell/dome totals — one source, three surfaces plus paper). Untracked features render dimmed with a dash, consistent with the tab. Report generation reads persisted/settled stats like every other consumer.

## Out of scope

Per-rect achieved % (see Appendix) · technique-split targets · configurable status bands · per-project target overrides · projects-list-page changes · mid-job live progress.

## Appendix — future drill-down: per-rect achieved %

#9's audit route stands documented for a later "did scans land inside the guidance rects" drill-down: `computeRectAchievedPercent` via the canonical `rectIsPureCylinder`, cylinder branch = hits/attempted × rect area (needs attempted-count exposure in `sampleCylinderBox`), head branch = drape-grid cells with area weighting borrowed from `rasterArea`. Also flagged there: a duplicate non-exported `rectIsPureCylinder` in `annotation-geometry.ts:202` (drift risk) — route any implementation through the `scan-sampling.ts` canonical.

## Verification plan (implementation gate)

- `npm run build`, `npm run test`, `npm run lint`.
- Behavioral: boot dome scan → its achieved lands in that boot's dome bucket and nowhere else; `'end'` dome scans never credit a main head; untracked features excluded from rollups; card strip, Coverage tab, and modeler section show identical numbers for the same vessel; save with targets set → reload → byte-identical round-trip; legacy saves without targets load with all features untracked.
