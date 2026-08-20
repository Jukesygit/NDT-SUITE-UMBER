---
tags:
  - handover
  - agent
date: "2026-08-20"
status: active
---

# Agent Handoff: Scope-planning suite implementation (layers · comparison · client sharing)

## Task

Implement the three locked wayfinder specs (map [Jukesygit/NDT-SUITE-UMBER#6](https://github.com/Jukesygit/NDT-SUITE-UMBER/issues/6), all decisions final — do **not** re-litigate them):

1. `docs/plans/2026-08-13-layers-system-design.md` — **DONE** (Phase 1)
2. `docs/plans/2026-08-17-coverage-comparison-design.md` — **~75% done** (Phases 1–3; projects surfaces partial)
3. `docs/plans/2026-08-17-client-sharing-design.md` — **viewer done; everything else NOT started** (Phase 4)

Work runs on branch **`feature/scope-planning-suite`** (branched off `feature/appendage-bodies` after phase 2).

## Context Read

- `AGENTS.md`, `.claude/CLAUDE.md` (orchestration policy — **subagents are opus-only, sonnet is banned in this repo**; subagents NEVER run git state-changing commands; every implementation prompt states files-in-scope + verification command)
- [[agent-memory/Project Brief]], [[agent-memory/Module Map]] (updated during this work — CoveragePanel.tsx reference was stale, now corrected)
- The three specs above — they carry verified `file:line` anchors and hard invariants
- `dev-docs/design-system.md` before ANY UI work

## Files Touched (by commit)

- `b2ee1e0` — the three specs.
- `86dffbb` **Phase 1** (19 files): layers system (`engine/layer-visibility.ts` NEW + reducer/ThreeViewport/OutlinerPanel/VesselModeler/palette) + comparison engine (`coverage-calculator.ts` boot-dome split + `computeRegionAchievedAreas`; `types.ts` `CoverageTargets`→`{shell,dome?}` + rect `technique/techniqueOther/note` + `COVERAGE_TECHNIQUES`; serialization spec fields + `normalizeCoverageTargets`).
- `c6fff2d` **Phase 2** (23 files): `ReadOnlyViewport.tsx` + `engine/readonly-{scene,sync,hover,hover-probe}.ts` (transitive import graph verified free of editor/auth/supabase); `engine/coverage-comparison.ts` (THE row source: rows/bands/rollup; **`scopedPct` is THE target** via `targetPctOf` — `rbaPct` is informational); `sidebar/CoverageTargetsEditor.tsx` (the ONE target-edit surface — editing was MOVED out of `ScanCoverageStatsSection`, now display-only), `sidebar/CoverageRectMetaFields.tsx`, `stats/CoverageComparisonSection.tsx` + `ui.showStatsComparison`.
- `4c7f8df` **Phase 3 WIP**: docx report "Coverage vs Scope" section (**complete**: `engine/coverage-scope-report.ts` + `report-generator.ts`, omits itself when nothing targeted, print-safe Met/Near/Short words); projects groundwork (**compiles, tested, NOT yet consumed by any UI**): `engine/texture-hydration.ts`, `src/hooks/queries/useLinkedVesselModel.ts`, `src/components/projects/vessel-planning-summary.ts` (+ tests), small edits to `useVesselPersistence.ts` / `useVesselModelMutations.ts`.

## What Changed

See commit messages — they are the detailed ledger. Design rulings made during implementation (binding):

- `AppendageCoverageTotals.totalMm2/achievedMm2` are **shell-only legacy aliases**; new consumers use `shell*`/`dome*` fields. Retire the aliases when `CoverageStatsSection.tsx` is next reworked.
- Palette: layer commands except the coverage master are `searchOnly` (default-list regression fix); anything added to the palette must consider the 30-item cap.
- Hiding a boot now hides its mounted entities (subtree rule — intended per layers design decision 2).
- `ReadOnlyViewport` omits CSS2D weld labels + the annotation summary table (deliberate; documented in-file).

## Validation

- Phases 1+2 gates: `npm run build` clean; full suite **1596 passed / 3 skipped** (phase 1) and modeler suite **978 passed** (phase 2); `npm run lint` 0 errors both times.
- WIP commit `4c7f8df`: `npm run typecheck` clean; its 20 new tests pass; **full build/test gate NOT yet run over it** — run the gate before building further.
- Known pre-existing local flake: `src/components/CscanVisualizer/hooks/__tests__/useLayoutMode.test.ts` hangs/crashes its worker locally — unrelated, ignore.

## Open Questions

None on design — every decision is locked in the specs + map. Operational only:

- **Supabase region cutover gates ALL Phase-4 backend deployment** (see memory note `project_supabase-region-migration`). Write migrations/functions as repo code; apply/deploy ONLY to the eu-west-2 target project after cutover, per its runbook.
- GitLab `glab` token was expired throughout; the wayfinder map + tickets live on **GitHub** (`Jukesygit/NDT-SUITE-UMBER` #6–#20) as a recorded exception.

## Next Agent Should Start Here

Ordered, with scope fences (delegate each to an **opus** agent; strict grep-first / offset+limit≤150 reads on the huge files):

1. **Finish Phase 3 — projects surfaces** (`docs/plans/2026-08-17-coverage-comparison-design.md` §Surfaces 1+3). Consume the existing groundwork (`useLinkedVesselModel`, `texture-hydration.ts`, `vessel-planning-summary.ts` — audit each first, they're new and uncommitted-history): (a) Coverage tab feature component on `InspectionDetailPage` — lazy `ReadOnlyViewport` (three.js must NOT enter the projects chunk until the tab opens), layer toggles, per-feature table w/ rect expand, rollup, row-click framing via `canonicalPose`/`frame-entity`; (b) `VesselCard` planning strip (model ✓ · targets N/M · achieved %) + **"Plan scope"** action (open linked model in modeler; else create+link+open — reuse the mechanism `useVesselPersistence` exposes). Design-system classes only; React Query only.
2. **Phase 3 gate**: `npm run build` + `npm run test` + `npm run lint`, then commit.
3. **Phase 4a — client-sharing backend as CODE ONLY** (`docs/plans/2026-08-17-client-sharing-design.md` §Security model): migration `client_shares` (+view-audit table, private `client-shares` bucket + storage policies) and edge function `serve-client-share`. Non-negotiable scars: RLS via existing `get_my_role()`-style helpers (never profile self-subqueries); no anon grants anywhere; indistinguishable 404 for missing/revoked/expired; adversarial SQL self-review. Top-of-migration comment = deploy checklist gated on the cutover. NO `db push`/`functions deploy`/`link`.
4. **Phase 4b — sharing frontend**: bundle builder (serialized model + baked heatmap PNGs + **decimated grids** + stats from `computeComparisonRows` + bookmarks + layer selection; NO rect notes, NO PII — hard-coded), "Share with client" dialog on `ProjectDetailPage` (layer picker defaults, expiry 30/90/365/none default 90, optional passcode), public `/share/:token` route as its OWN lazy chunk (must never import `VesselModeler.tsx`/auth — verify the module graph like Phase 2 did), passcode gate, vessels-cards landing → full-bleed viewer + published-layers-only toggles + hover thickness from grids + stats table, uniform "link no longer active" state.
5. **Final sweep**: re-run all three specs' verification-plan checklists; runtime-verify in the dev app (`/verify` skill has the auth workaround + Playwright recipe); amend the comparison spec with the `scopedPct`-is-target ruling; note the React *project* print report still lacks a coverage page (needs modelConfig→VesselState plumbing — deliberate follow-up, not in the specs' scope); collapse the `formatPct`/`formatDelta` duplication between `CoverageComparisonSection.tsx` and `coverage-scope-report.ts`; update Module Map + Engineering Log + this handoff's status.
