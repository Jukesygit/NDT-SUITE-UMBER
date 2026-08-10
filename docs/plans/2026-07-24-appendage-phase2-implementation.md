# Appendage Bodies — Phase 2 Implementation Plan (Attachables on Appendages)

**Date:** 2026-07-24
**Design:** `docs/plans/2026-07-21-secondary-appendage-body-design.md` (§5 bodyId rules, §8 scan overlays, §12 UI; §6 Phase 0 notes BINDING)
**Branch:** `feature/appendage-bodies` (Phase 0 `49742f9`, Phase 1 `14ff36a`)
**Gate:** a scan composite maps onto an appendage end-to-end (import → body pick → gizmo confirm → hover readout); a nozzle mounts on an appendage and takes a pipeline; existing single-body models byte-identical; full gates green vs baseline.

Phase 2 threads `bodyId` through nozzles and scan composites. Stats/cutout stay Phase 3 — so this phase MUST also add defensive filters keeping appendage scans OUT of the stats/flattened consumers until Phase 3 wires them properly (inspection-data-integrity rule: no silently wrong numbers in the interim).

## Task cards (T1 ∥ T3, then T2 after T1, then V)

### P2-T1 (opus) — nozzles + pipelines on appendages
- **Files:** `types.ts` (NozzleConfig.bodyId?: string), `engine/vessel-geometry.ts` (nozzle loop: `bodyId` → `resolveBodyFrame`; appendage nozzles use `frame.surfacePoint`/`surfaceNormal` with pos clamped to the cylinder span [0, length] — no head-region branch for appendages in v1; main-shell nozzles keep the EXACT legacy inline path incl. the 1.0 head cap), `engine/interaction-manager.ts` (nozzle drag raycasts only meshes whose `userData.bodyId` matches the dragged nozzle's body — main = meshes without bodyId; convert via that body's `frame.toLocal`), `sidebar/NozzleSection.tsx` (mount-on body picker: Main vessel + each appendage by name, storing the stable appendage id), `engine/vessel-serialization-spec.ts` (bodyId on nozzle spec, both paths), `VesselModeler.tsx` removeAppendage cascade (delete nozzles with that bodyId + their pipelines via the existing removeNozzle index-shift logic — reuse it, do not reimplement), tests (serialization round-trip incl. nozzle bodyId; a vessel-geometry-level test that an appendage nozzle's world position sits on the appendage surface via frame equivalence).
- **Constraint:** `bodyId === undefined` → byte-identical legacy behavior. `Pipeline.nozzleIndex` semantics untouched (flat array; appendage nozzles join it transparently — PipingSection labels may append the body name, minimal change inside sidebar/piping/ files).

### P2-T2 (opus, after T1) — scan composites on appendages
- **Files:** `types.ts` (ScanCompositeConfig.bodyId?: string), `engine/texture-manager.ts` (createScanCompositePlane + its border resolve `resolveBodyFrame(state, composite.bodyId)` — buildSurfaceGrid is already frame-driven; appendage composites clamp to the cylinder span), `engine/scan-gizmo-geometry.ts` (gizmo builds on the composite's body frame), `engine/interaction-manager.ts` (scanGizmo drag raycast scoped to the composite's body meshes; hover unchanged — UV/userData-based), `engine/vessel-geometry.ts` (scan-composite + gizmo loops pass composite.bodyId through), scan sidebar section (body picker on unconfirmed composites, next to the existing orientation controls — find via Grep 'orientationConfirmed' in sidebar/), `engine/vessel-serialization.ts`/`-spec.ts` (bodyId both paths; cloud `section_type` = `appendage:<appendageId>` for appendage scans, mirroring the dome_left/dome_right derived-field pattern), tests (round-trip; a texture-manager-level test that an appendage composite's mesh vertices lie on the appendage frame surface within tolerance).
- **Constraint:** datum/orientation-confirm UX identical to main-shell scans; `useGlobalOrigin` and coordinateOrigin remain main-shell concepts (appendage scans ignore them in v1 — note in code).

### P2-T3 (sonnet, parallel with T1) — defensive stats exclusion (interim, removed in Phase 3)
- **Files:** `src/hooks/useWallLossWorker.ts` (filter `!c.bodyId` composites out of WallLossRequest), `stats/ScanCoverageStatsSection.tsx` (exclude bodyId composites from achieved-area bucketing), `FlattenedView/FlattenedViewport.tsx` (renderHeatmap + findThicknessAt skip bodyId composites), `engine/annotation-stats.ts` + `engine/annotation-heatmap.ts` (samplers skip bodyId composites).
- **Rule:** each filter gets the same one-line comment: `// Phase 3: appendage-body scans get per-body stats; excluded here so numbers stay correct in the interim (design §9).` No other logic changes. Tiny test where a suite already exists for the file; otherwise typecheck+lint suffice.

### P2-V (sonnet) — full gates vs baseline (typecheck clean; vitest 847+/3 skipped with the one pre-existing OOM error; lint 0 errors/≈362 warnings; prettier check on changed files). Report-only.

## Integration review (Fable)
Appendage-nozzle position test green; appendage-scan mesh-on-frame test green; defensive filters present in all five consumers; serialization round-trips include both new bodyId fields; no regression in existing suites; commit gate.
