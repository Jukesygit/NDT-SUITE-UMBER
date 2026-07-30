# Appendage Bodies — Phase 3 Implementation Plan (Cutout + Per-Body Stats)

**Date:** 2026-07-24
**Design:** `docs/plans/2026-07-21-secondary-appendage-body-design.md` §9 (review decisions §16: EXACT intersection curve; wall-loss = combined bins + per-body selector)
**Branch:** `feature/appendage-bodies` (Phase 2 verified, commit pending on the parallel dome-arc session committing first)
**Gate:** areas reconcile — cutout-adjusted main cylinder + footprint area = uncut cylinder area (exact); per-body wall-loss/coverage correct; interim P2-T3 filters replaced by real per-body handling; full gates green.

## Sequencing

T1 (footprint math, NEW FILES ONLY — may run before the Phase 2 commit lands) → T2 (cutout plug-ins) → T3 (per-body stats + UI) → V. T2/T3 wait for the Phase 2 commit to avoid deepening the shared-file interleave.

### P3-T1 (opus) — `engine/junction-footprint.ts` (pure math, new files only)
- **Files:** NEW `engine/junction-footprint.ts`, NEW `engine/__tests__/junction-footprint.test.ts`. NO existing file edits.
- **Content:** exact perpendicular cylinder-on-cylinder intersection for appendage (radius r, mount at (mountPos, mountAngle)) on shell (radius R), expressed in main-shell developed coordinates:
  `buildJunctionFootprint(shellRadius, appendage) → { containsCell(posMm, angleDeg): boolean; areaMm2: number; boundary: {pos, angle}[] }`
  plus `buildAllFootprints(state)` for the appendages array. Parameterize the boundary exactly (x = r·sinθ along the shell axis, circumferential arc via asin(r·cosθ/R) mapped to degrees around mountAngle); areaMm2 = true excluded SHELL surface area by numeric integration over the parameter (the shell-area element, not the flat projection). Handle the angle wrap (footprint crossing 0°/360°) and r → R degeneracy (clamp r ≤ 0.999·R like appendage-geometry's penetration calc).
- **Tests:** areaMm2 vs independent numeric ground truth (fine Monte-Carlo or grid quadrature written IN the test) for r/R ∈ {0.1, 0.3, 0.5} within 0.1%; containsCell consistent with boundary polyline (points just inside/outside); wrap-around mountAngle near 0°; area → π·r²·(1+small) behavior as r/R → 0; two disjoint appendages don't interact (buildAllFootprints).

### P3-T2 (opus, after Phase 2 commit) — cutout exclusion plug-ins
- **Files:** `engine/coverage-calculator.ts` (subtract per-appendage footprint area from the cylinder total in computeRegionTotalAreas; exclude footprint cells in the computeCoverage sweep), `src/workers/wall-loss-compute.ts` (footprint cells contribute zero area in cellAreaOnVessel/regionCellArea for main-shell composites), `engine/heatmap-texture.ts` (alpha=0 stamp for main-shell composite pixels inside a footprint) + the caller passing footprints in `engine/texture-manager.ts`, tests for each (area reconciliation: uncut = cut + Σfootprints exactly; a scan overlaying a cutout loses exactly the overlap from validArea).
- **Constraint:** stats and visuals must agree — the same containsCell predicate drives both the alpha mask and the validArea/coverage exclusions (design §9.4).

### P3-T3 (opus, after T2) — per-body stats + UI
- **Files:** `src/workers/wall-loss-compute.ts` + `src/hooks/useWallLossWorker.ts` (WallLossRequest gains bodies[] keyed by bodyId; composites grouped; one compute per body; bins merged; occlusion bodyId-scoped; REMOVE the P2 interim filter), `engine/coverage-calculator.ts` (per-body invocation wrapper), `types.ts` (CoverageTargets.appendages?: Record<appendageId, CoverageTargetEntry> — additive), `stats/ScanCoverageStatsSection.tsx` (per-appendage rows, achieved from appendage-scan validArea; REMOVE interim filter), `stats/CoverageStatsSection.tsx` (per-appendage rows), `stats/WallLossStatsSection.tsx` (body selector: Combined / Main / per appendage), `src/utils/coverage-calc.ts` (project-level scope % appendage-aware), FlattenedViewport + annotation-stats/heatmap interim filters stay (flattened is Phase 4; annotation sampling on appendages is out of v1 scope — replace comment wording to say so), serialization round-trip for extended CoverageTargets, tests.
- **Constraint:** legacy CoverageTargets JSON loads unchanged (`?? DEFAULT_TARGETS` pattern); wall-loss bins for a main-only model byte-identical to Phase 2 behavior.

### P3-V (sonnet) — full gates vs baseline (typecheck clean; 901+/3 skipped, one pre-existing OOM; lint 0 errors; prettier clean on changed set). Report-only.

## Integration review (Fable)
Area-reconciliation test green; interim filters gone where superseded and re-worded where retained; a bottom-sump fixture shows: main cylinder total reduced by footprint, appendage row present in coverage + scan-coverage, wall-loss selector shows per-body bins; commit gate (after the Phase 2 commit unblocks).
