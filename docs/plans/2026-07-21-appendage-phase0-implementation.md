# Appendage Bodies — Phase 0 Implementation Plan (Foundations)

**Date:** 2026-07-21
**Design:** `docs/plans/2026-07-21-secondary-appendage-body-design.md` (approved)
**Branch:** `feature/appendage-bodies` (from master)
**Gate:** typecheck + full test suite + lint green; zero visual/behavioral diff on existing models; no commits until user reviews the phase.

Phase 0 contains no appendage features. It removes the five duplication hazards the research sweep identified so Phases 1–4 write each piece of appendage logic exactly once.

## Task cards

Orchestration per `.claude/CLAUDE.md` policy: implementation = Opus agents, verification = Sonnet. T1→T2 are sequential; T3, T4, T5 run in parallel with them (disjoint file sets).

### T1 (opus) — `engine/body-frame.ts` + SurfaceFrame
- **Files:** NEW `src/components/VesselModeler/engine/body-frame.ts`, NEW `src/components/VesselModeler/engine/__tests__/body-frame.test.ts`
- **Constraint served:** design §6 — single source for all (pos, angle) ↔ world math.
- **Content:** `SurfaceFrame` interface (`radius`, `axialLength`, `headDepth`, `kind`, `surfacePoint`, `surfaceNormal`, `toLocal`), `resolveBodyFrame(state, bodyId?)`. Main-shell frame must reproduce `shellPoint()` (annotation-geometry.ts:22) and the vessel-geometry nozzle mount math (L436–533) exactly, both orientations. Appendage frame implemented now (mount point + `setFromUnitVectors((0,1,0), normal)` quaternion + datum 0° = main +axis projection) even though no consumer exists yet — tests only.
- **Tests:** equivalence grid vs legacy `shellPoint` (pos × angle × orientation), `toLocal(surfacePoint(p,a)) ≈ (p,a)` round-trip for main + appendage frames, appendage datum convention cases (bottom sump: 0° faces right tangent).
- **Verify:** `npm run typecheck`, `npx vitest run src/components/VesselModeler/engine/__tests__/body-frame.test.ts`

### T2 (opus, after T1) — migrate consumers onto SurfaceFrame
- **Files:** `engine/texture-manager.ts` (collapse the 4 near-identical vertex loops at ~L207–713 into one frame-driven helper), `engine/vessel-geometry.ts` (nozzle mount L436–533 → frame), `engine/interaction-manager.ts` (4 inline world→(pos,angle) inversions at L522–524, L697–712, L764–769, L831–834 → `frame.toLocal`), `engine/annotation-geometry.ts` (`shellPoint` delegates to frame), `engine/scan-gizmo-geometry.ts` (`getVesselCenter` L144–152 → frame).
- **Constraint served:** design §4 C1 — appendage math must exist once.
- **Rule:** behavior-preserving refactor only; existing tests must pass unmodified; selection borders must stay geometrically identical to their base meshes.
- **Verify:** `npm run typecheck`, `npm run test`, plus T1's equivalence suite still green.

### T3 (opus) — collapse wall-loss duplication
- **Files:** `src/workers/wall-loss-compute.ts` (canonical), `src/components/VesselModeler/engine/wall-loss-distribution.ts` (reduce to re-export/thin wrapper or delete + update its test to target the canonical module).
- **Constraint served:** design §4 C3 — per-body/cutout logic must not be written twice.
- **Rule:** worker bundle must stay DOM-free; existing wall-loss test expectations unchanged.
- **Verify:** `npm run typecheck`, `npm run test`

### T4 (opus) — serializer field-spec consolidation + dome save bug
- **Files:** `src/components/VesselModeler/VesselModeler.tsx` (saveProject L1683–1811, buildSaveConfig L1814–1923, load mappers L540–719 and L2152–2340), NEW shared field-spec module (e.g. `src/components/VesselModeler/engine/vessel-serialization.ts`), NEW round-trip test.
- **Constraint served:** design §4 C4 / §11 — one field-spec consumed by both save paths and both load mappers, so `appendages[]`/`bodyId` land once in Phase 1.
- **Includes bug fix:** `saveProject()` currently omits `domeScanComposites` → local save/reload loses dome overlays. Cloud path (`buildSaveConfig`) is correct; mirror it, hydrating through `normalizeDomeScanComposite` on load.
- **Rule:** serialized output for existing fields must remain byte-compatible (key order may change only if nothing consumes ordering); round-trip test saves→loads→deep-equals both paths.
- **Verify:** `npm run typecheck`, `npm run test`

### T5 (opus) — split PipingSection.tsx
- **Files:** `src/components/VesselModeler/sidebar/PipingSection.tsx` (756 lines → coordinator + `piping/ConnectionPointList.tsx` + `piping/FreePipelineList.tsx` + shared piping types/helpers as needed), `sidebar/index.ts`.
- **Constraint served:** design §4 C10 — file must be sane before Phase 2 adds appendage connection points.
- **Rule:** pure extraction, no behavior change, props/callbacks unchanged from SidebarPanel's perspective; each new file < 300 lines.
- **Verify:** `npm run typecheck`, `npm run lint`, `npm run test`

### V (sonnet) — phase verification
- Run `npm run typecheck`, `npm run test`, `npm run lint` on the combined tree; report pass/fail with failure excerpts. No fixes — report only.

## Integration review (Fable)

Diff review against this plan; check: no cross-task file collisions, no behavior drift flags from V, structuralHash untouched, no new files > 300 lines. Then present Phase 0 results to user for commit approval before Phase 1.
