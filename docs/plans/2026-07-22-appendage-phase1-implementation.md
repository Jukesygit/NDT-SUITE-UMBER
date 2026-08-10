# Appendage Bodies — Phase 1 Implementation Plan (Appendage Core)

**Date:** 2026-07-22
**Design:** `docs/plans/2026-07-21-secondary-appendage-body-design.md` (approved; §6 Phase 0 notes are BINDING)
**Branch:** `feature/appendage-bodies` (Phase 0 committed: `49742f9`)
**Gate:** appendage renders, saves, reloads on both persistence paths; existing models untouched; full gates green vs Phase 0 baseline.

Phase 1 delivers the appendage entity end-to-end WITHOUT attachables (bodyId threading on nozzles/scans is Phase 2) and WITHOUT the cutout (Phase 3): types + state, 3D geometry, sidebar CRUD, serialization.

## Task cards (T1 → then T2 ∥ T3 → V)

### P1-T1 (opus) — state plumbing
- **Files:** `types.ts` (AppendageConfig per design §5, `appendages: AppendageConfig[]` on VesselState, `appendages: []` in DEFAULT_VESSEL_STATE, `onAppendageSelected`/`onAppendageMoved` on VesselCallbacks), `engine/body-frame.ts` (replace the defensive `state.appendages` cast with the real typed read; keep `AppendageFrameParams` compatible), NEW `engine/appendage-config.ts` (`normalizeAppendage()` mirroring `normalizeDomeScanComposite`, `createAppendage()` defaults + stable unique id `app-<n>`), `engine/vessel-serialization-spec.ts` + `engine/vessel-serialization.ts` (appendages entry, identical on both paths, hydrated through normalizeAppendage — callers in VesselModeler.tsx must need NO edits), `ThreeViewport.tsx` (structuralHash gains STRUCTURAL fields only: id, mountPos, mountAngle, diameter, length, endClosure, headRatio, flangeJoint.show — never name/visible/locked/nominalThickness; export structuralHash for testability), extend serialization round-trip tests + NEW structuralHash test.
- **Constraint served:** design §5, §11, C6; single insertion point proven by Phase 0.
- **Do NOT touch:** VesselModeler.tsx (T3 owns it), vessel-geometry.ts (T2 owns it).

### P1-T2 (opus, after T1) — 3D geometry
- **Files:** NEW `engine/appendage-geometry.ts` (buildAppendageGroup: open-ended cylinder + end closure [dished ellipsoid patch per main-head technique with appendage diameter/headRatio, flat disc, or open] + optional girth-flange ring pair at the mount + interpenetration seat into the shell), `engine/vessel-geometry.ts` (loop `state.appendages` in buildVesselScene; add groups to vesselGroup; `BuildSceneResult.appendageMeshes`), minimal ThreeViewport pass-through if BuildSceneResult consumers require it, NEW `engine/__tests__/appendage-geometry.test.ts`.
- **BINDING (design §6 Phase 0 notes):** the mesh's roll about the mount axis MUST derive from the frame datum — align cylinder angle-0 to `frame.surfaceNormal(pos, 0)` from `resolveBodyFrame`/`buildAppendageFrame`; never a raw shortest-arc quaternion. Acceptance test: mesh vertex at local angle 0 coincides with `frame.surfacePoint(pos, 0)` within 1e-6 world units, both vessel orientations, mountAngle ∈ {0, 90, 270}.
- **Tagging:** every appendage mesh gets `userData.bodyId`; the cylinder additionally `userData.isShell = true`.
- **Visuals:** shell material/opacity follows vessel visuals; appendage respects `visible`/`locked`.

### P1-T3 (opus, after T1) — sidebar CRUD
- **Files:** NEW `sidebar/AppendageSection.tsx` (mirror NozzleSection pattern: list + selection + inline edit form: name, mountPos, mountAngle, diameter, length, endClosure select, headRatio when dished, flangeJoint toggle, nominalThickness; add via `createAppendage()`; delete), `sidebar/index.ts` export, `SidebarPanel.tsx` (Attachments group wiring), `VesselModeler.tsx` (SELECT_APPENDAGE reducer action + selectedAppendageIndex, addAppendage/updateAppendage/removeAppendage handlers, callbacks literal: onAppendageSelected selects; onAppendageMoved updates mountPos/mountAngle — drag itself is Phase 2).
- **Constraint served:** design §12; selection by index, cross-references only ever by stable `AppendageConfig.id`.
- **Note:** deletion needs no attachable cascade in Phase 1 (nothing can reference an appendage yet); leave a `// Phase 2:` comment where the cascade will go.
- **UI style:** existing `vm-*` classes only; every new file < 300 lines.

### P1-V (sonnet) — verification
- Full `npm run typecheck`, `npx vitest run`, `npm run lint`; compare vs Phase 0 baseline (823+ passed / 3 skipped / 1 pre-existing OOM unhandled error / lint warnings-only). Report-only.

## Integration review (Fable)
Mesh-frame alignment test present and green; structuralHash cosmetic-exclusion test green; round-trip includes appendages on both paths; no new >300-line files (body-frame.ts's accepted 327 aside); Prettier run on all new/changed files before handoff.
