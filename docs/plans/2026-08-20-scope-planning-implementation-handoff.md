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
2. `docs/plans/2026-08-17-coverage-comparison-design.md` — **DONE** (Phases 1–3; see its Amendment section for the implementation rulings)
3. `docs/plans/2026-08-17-client-sharing-design.md` — **code complete, NOTHING DEPLOYED** (Phase 4; see its Amendment section)

Work runs on branch **`feature/scope-planning-suite`** (branched off `feature/appendage-bodies` after phase 2).

## Context Read

- `AGENTS.md`, `.claude/CLAUDE.md`, [[agent-memory/Project Brief]], [[agent-memory/Module Map]], [[Engineering Log]]
- The three specs above — they carry verified `file:line` anchors, hard invariants, and now an Amendment section each recording what implementation settled.
- `dev-docs/design-system.md` before ANY UI work. The projects area uses its own `pj-` system in `src/pages/projects/projects.css`; match it there rather than the glass classes.

## Commits

- `b2ee1e0` — the three specs.
- `86dffbb` **Phase 1** — layers system + comparison engine.
- `c6fff2d` **Phase 2** — `ReadOnlyViewport` + comparison UI in the modeler.
- `4c7f8df` **Phase 3 WIP** — docx "Coverage vs Scope" section + projects groundwork.
- `43a0fa1` **Phase 3 complete** — projects Coverage section + vessel-row planning strip.
- *(this session)* **Phase 4a + 4b** — client sharing, backend as code + full frontend.

## Status: what is done

**Phase 3 — projects surfaces.** `VesselOverviewPage` gains a collapsed-by-default "Coverage vs Scope" section whose `lazy()` IS the chunk boundary (three.js loads only when someone expands it); project vessel ROWS gain a planning strip + "Plan scope". New pure engine modules, all unit-tested: `coverage-feature-framing.ts`, `coverage-rect-features.ts`, `layer-presence.ts`. The `formatPct`/`formatDelta` duplication is collapsed into `coverage-comparison.ts`.

**Phase 4a — client-sharing backend, as CODE ONLY.** `supabase/migrations/20260820120000_client_shares.sql` + `supabase/functions/serve-client-share/`. The ordered deploy checklist is the migration's top comment.

**Phase 4b — sharing frontend.** Bundle format + builder, publish dialog on `ProjectDetailPage`, and the public `/share/:token` page with passcode gate, vessel cards, full-bleed viewer, published-layer toggles, bookmark shortcuts, hover thickness and the stats table.

## Verification actually performed

- `npm run build` clean; `npm run lint` **0 errors**; `npx tsc --noEmit` clean.
- Full suite green apart from the documented pre-existing flake: `src/components/CscanVisualizer/hooks/__tests__/useLayoutMode.test.ts` crashes its fork worker (reproduced in isolation, unrelated to this work; already excluded in CI).
- Chunk isolation verified against `dist/`: `ProjectDetailPage` and `VesselOverviewPage` chunks reach no 3D chunk; the share page's static closure reaches no auth/editor code (`npm run verify:share-chunk`, added this session).
- **NOT performed:** any runtime verification in a browser, and any execution of the SQL. There is no Docker/Postgres in this environment, so the migration is *reviewed, not proven*. Nothing was deployed.

## Open items for the next session

1. **Runtime-verify the Phase 3 surfaces in the dev app** (the `/verify` skill has the auth workaround + Playwright recipe): expand the Coverage section on a vessel with a linked model, click rows to frame features, toggle layers, and confirm the strip numbers match the section.
2. **Publish-time vessel screenshots** are not implemented. `ShareManifestVessel.screenshotPath` exists and the viewer honours it; the landing page falls back to typographic cards. Adding capture later needs no format change.
3. **Deploy Phase 4, in this order, ONLY after the Supabase region cutover** (memory note `project_supabase-region-migration`): follow the migration's checklist, then smoke-test that nonexistent / revoked / expired tokens return byte-identical responses, then exercise a real publish end-to-end. The publish→serve path has never run against a live database.
4. **Two coverage vocabularies now coexist** on the vessel page: the new target-percentage model (Coverage section, strip, report) and the old rect-area scope number that `ScopeProgressCard` / `ScopeSection` still read from `utils/coverage-calc.ts`. Reconciling them is a product call, not a bug fix.
5. **Dead code:** `src/components/projects/VesselCard.tsx` and `ProjectVesselsTab.tsx` are imported by nothing. Left untouched deliberately; deleting them is a separate call.
6. **The React project print report still has no coverage page** — only the modeler's generated .docx does. Needs modelConfig→VesselState plumbing; outside the specs' scope.
7. **`AppendageCoverageTotals.totalMm2/achievedMm2` are shell-only legacy aliases.** Retire them when `CoverageStatsSection.tsx` is next reworked.

## Things that will bite you

- Anything on a **projects page** that statically imports `coverage-comparison` drags three.js into the projects chunk — rollup groups the engine modules together. Derive through `hooks/queries/useVesselPlanningSummary.ts`, which dynamic-imports the engine inside its queryFn.
- A **dynamic `import()` in the share page** makes Vite hang its preload helper off the supabase-vendor chunk, pulling supabase-js into a logged-out page. Its imports are static for that reason; `npm run verify:share-chunk` catches a regression.
- `surfacePoint(pos, 0, -radius)` is an axis point **only inside the cylinder**. At a closure station the profile radius shrinks and the offset overshoots past the axis — `coverage-feature-framing.ts` steps along the frame's own axis instead.
- The **read-only hover probe fires every animation frame.** Diff the readout through a ref before touching React state, or the whole panel re-renders at 60 Hz.
- `docs/plans/*` Amendment sections are binding rulings, not notes. Read them before changing anything they name.
