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

### Re-verified 2026-08-20 (takeover session — NO code changes)

This session read the specs + memory layer, re-ran the gate, and wrote this update. It wrote no source code, so the claims above stand on the previous session's work; what follows is an independent re-run of the gate on a second machine.

- `npm run build` — clean (`built in 1m 31s`).
- `npm run lint` — **0 errors**, 400 warnings (all pre-existing and repo-wide: `no-explicit-any`, `max-lines`).
- `npx vitest run` — **122 files, 1785 passed / 3 skipped**, exit 0, with `useLayoutMode.test.ts` excluded exactly as CI excludes it. Run it that way (`--exclude '**/node_modules/**' --exclude '**/dist/**' --exclude '**/.claude/**' --exclude '**/useLayoutMode.test.ts'`, or set `CI=1`): a plain `npx vitest run` HANGS on that file rather than failing, so an unqualified run looks like an infinite test suite, not a flake.
- `npm run verify:share-chunk` — OK against the fresh `dist/`; share page's static closure is 23 chunks, no auth or editor code.
- Still **NOT performed:** browser runtime verification, any SQL execution, any deployment. Open item 1 below is untouched.

## Session 2026-08-20 (second machine): open items 1 + 2 CLOSED

**Item 1 — runtime verification: DONE, and it caught a real bug.** The `/verify` skill lives on the other machine; the recipe was rebuilt from scratch here: temp public `/verify-scope` route (same pattern as `/share/:token`), a fixture page that seeds `queryClient.setQueryData(['linkedVesselModel', VID], {record, vesselState})` so BOTH the Coverage section and the planning strip render from one local `VesselState` with zero Supabase/auth, driven by `playwright-core` (npm-installed `--no-save`, NOT in package.json) + headless Edge (`channel:'msedge'` — no browser download). Route + page created, driven, and reverted; drive scripts + screenshots persist in the session scratchpad. Results: 10/10 scenarios PASS, zero console errors — lazy chunk gate holds (no CoverageScopePanel/ReadOnlyViewport module request before expand), strip numbers === section rollup === engine-computed expectations, layer toggles restore pixel-exact, hover label works.
  - **Bug found and FIXED: closure-row framing.** Every head/dome row put the camera INBOARD above the barrel (featureless-shell view, head occluded) — a cap's bounding sphere is centred barely past its tangent plane, so the world-fixed iso direction never cleared the vessel. `coverage-feature-framing.ts` cap rows now compose their pose outboard along the OWNING frame's axis (boot domes via `resolveBodyFrame` — never the world/main axis), iso azimuth kept, elevation clamped 25°–65° (a 45°-mounted boot has iso ⊥ its axis), cap bounds carry ~15% shell margin, and the distance is `fitDistance × CAP_FIT_FACTOR (1.4)` because a cap sphere is nearly tight where the shared 0.7 fill factor assumes loose (was cropping ~25% of the head). Shell rows byte-identical. Re-driven visually: heads/domes now dominate the frame (90%/93%/66% subject coverage vs featureless before). 20 unit tests pin all of it.
  - **"Dome-scan overlay doesn't render" was a false alarm** — retested with a real 10×10 thickness grid on the left head and the post-fix pose: the overlay renders and toggles exactly (9.65% pixel swing, 0.000% after restore). The earlier 0.000% readings came from poses that never had the head in frame.
  - Cosmetic observations, deliberately NOT fixed: a bottom-mounted boot dome framed from below reads dark (key light is above); the CSS2D annotation flyout can overflow the small panel viewport (clipped at canvas edge).
**Item 2 — publish-time screenshots: IMPLEMENTED** (see the client-sharing design's rewritten Amendment bullet — four binding rulings). `vessel-screenshot-state.ts` (pure: capture renders ONLY `sanitizeVesselStateForShare` output — the PII invariant extends to pixels, jsdom-tested) + `vessel-screenshot.ts` (SceneManager + `buildReadOnlyScene` + `canonicalPose('iso')` against an offscreen 512×512 div — square because the landing tile is a 64px `object-fit:cover` square; ONE WebGL context reused per publish; three-bearing so DYNAMIC import only). Publish mutation captures per vessel best-effort (failure ⇒ typographic card + one `console.warn`, never a failed publish; upload-first-flip-last untouched). `ClientSharePage` fills the cards via the previously-unused `fetchShareBlobUrl`, sequentially, after first paint, object URLs revoked. `SHARE_VIEWER_INITIAL_LAYERS` is read by shared reference by both capture and viewer. Smoke-tested in real Edge: 512×512 non-blank PNGs, sanitized-path capture renders geometry correctly, zero console errors. Known benign quirk: annotation leader lines inflate the framing Box3, so captures with annotations published are slightly wider-framed than without.

## Open items for the next session
1. **Deploy Phase 4, in this order, ONLY after the Supabase region cutover** (memory note `project_supabase-region-migration`): follow the migration's checklist, then smoke-test that nonexistent / revoked / expired tokens return byte-identical responses, then exercise a real publish end-to-end. The publish→serve path has never run against a live database — and the new screenshot capture+fetch path has never run against the live edge function either (it is drive-verified in-browser only).
2. **Two coverage vocabularies now coexist** on the vessel page: the new target-percentage model (Coverage section, strip, report) and the old rect-area scope number that `ScopeProgressCard` / `ScopeSection` still read from `utils/coverage-calc.ts`. Reconciling them is a product call, not a bug fix.
3. **Dead code:** `src/components/projects/VesselCard.tsx` and `ProjectVesselsTab.tsx` are imported by nothing. Left untouched deliberately; deleting them is a separate call.
4. **The React project print report still has no coverage page** — only the modeler's generated .docx does. Needs modelConfig→VesselState plumbing; outside the specs' scope.
5. **`AppendageCoverageTotals.totalMm2/achievedMm2` are shell-only legacy aliases.** Retire them when `CoverageStatsSection.tsx` is next reworked.
6. Cosmetic, from the 2026-08-20 drive, all optional: bottom-mounted boot domes frame dark (fixed key light sits above); the CSS2D annotation flyout can clip at the small panel viewport's edge; card-capture framing varies slightly with which layers are published (annotation leader lines inflate the bounds).

*(The former item 8 — the stray Engineering Log entry — was committed separately as `a8259f6` this session.)*

## Things that will bite you

- **`npm install` before you trust a red build.** This working tree's `node_modules` was stale and `npm run build` failed with three errors that read as defects on this branch — `src/components/import/parseUtils.ts` TS2578 plus two in `src/test/mocks/companion-handlers.ts` (`msw` is a declared devDependency but was simply absent). All three vanished after `npm install`; none of them were real. Separately and genuinely: `parseUtils.ts` dynamic-imports `xlsx`, which commit `32dca90` ("resolve all high-severity npm audit vulnerabilities") deleted from `package.json`. That is pre-existing on master, nothing to do with this branch, and worth its own look.
- Anything on a **projects page** that statically imports `coverage-comparison` drags three.js into the projects chunk — rollup groups the engine modules together. Derive through `hooks/queries/useVesselPlanningSummary.ts`, which dynamic-imports the engine inside its queryFn.
- A **dynamic `import()` in the share page** makes Vite hang its preload helper off the supabase-vendor chunk, pulling supabase-js into a logged-out page. Its imports are static for that reason; `npm run verify:share-chunk` catches a regression.
- `surfacePoint(pos, 0, -radius)` is an axis point **only inside the cylinder**. At a closure station the profile radius shrinks and the offset overshoots past the axis — `coverage-feature-framing.ts` steps along the frame's own axis instead.
- The **read-only hover probe fires every animation frame.** Diff the readout through a ref before touching React state, or the whole panel re-renders at 60 Hz.
- `docs/plans/*` Amendment sections are binding rulings, not notes. Read them before changing anything they name.
