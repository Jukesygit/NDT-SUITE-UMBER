---
tags:
  - handover
  - agent
date: "2026-08-06"
status: active
---

# Agent Handoff: Boot-parity feedback batch + perf pair CLOSED → next is T3 UX batch

## Task

- Session arc: owner's five-item feedback batch on the boot/appendage work (design `docs/plans/2026-08-05-boot-parity-feedback-batch-design.md`), followed by two perf regressions the batch introduced. **All landed and verified. Nothing in-flight.**

## Context Read

- `AGENTS.md`
- [[agent-memory/Project Brief]]
- [[agent-memory/Module Map]] (updated this session — read the Vessel Modeler section, esp. the R1/R2/R5 entries and the PERF RULE)
- [[../Engineering Log]] top entry (batch handover)
- `docs/plans/2026-08-05-boot-parity-feedback-batch-design.md` (the batch design)
- `docs/plans/2026-07-30-vessel-modeler-ux-roadmap.md` (the roadmap this all lives under)

## What Changed (all on `feature/appendage-bodies`, all committed, newest first)

- `50def17` **orbit-stutter fix** — 14cd5d3's settle effect was unguarded + dep'd on churning `rebuildScene` identity → full scene rebuild per pointermove when orbiting a vessel with scans. Now: pure `footprintFingerprint()` guard (texture-manager), effect deps = settled snapshot only, callbacks via refs.
- `a10c649`/`8549aeb` docs close-outs.
- `14cd5d3` **drag-perf fix (settle-on-release)** — heavy derived work (heatmap footprint cache-suffix, coverage stat sweeps) reads `src/hooks/useSettledValue.ts` (250ms trailing debounce, tested trailing-edge guarantee) instead of live per-frame state; footprint cache key quantized 1mm/0.5°; wall-loss was already self-debounced (not a culprit); `getAllSurfaceMeshes` memoized per vesselGroup.
- `c098a15` **R2 cursor-first mounting** — drags/draws/drops raycast ALL bodies, nearest wins with 6mm seam hysteresis (`engine/body-crossing.ts`, incumbent in interaction-manager `dragBodyId`); Mount-on selects → read-only `MountedOnChip`; one undo reverses pos+body; excluded from crossing: dome scans/gizmos, textures, saddles, pipe-part drops.
- `2bab5fc` **R4 Topo viewport mode** — 3D/2D/Topo button stack; `ReliefViewportPane.tsx` overlay toolbar; `ReliefViewModal.tsx` deleted; viewMode transient (never serialized).
- `9124a86` **R3 "Boot" terminology** — user-facing strings only; identifiers + `section_type 'appendage:<id>'` unchanged; persisted names keep saved values.
- `50771d1` **R5 vertical 2D fix** — FlattenedView never read `orientation`; `makeDevelopedFrame()` (geometry-projection.ts) is THE single (axial,circ)↔canvas mapping; vertical = pure transpose portrait; horizontal byte-identical (85 goldens untouched).
- `050e0a1` **R1 nozzle-bore stat cutouts** — `engine/nozzle-footprint.ts`; opening = penetrating stub OD (mirrors createFlangedNozzle); radial exact / non-radial projected ellipse; per-body incl. boots; live memo-dep gap fixed.

## Validation

- Every commit gated individually: tsc 0 errors + targeted vitest + eslint 0 errors.
- Full batch gate after R2: `npm run build` ✓, full suite **1433 passed | 3 skipped**, zero failures (the standing 1 "error" is the known `useLayoutMode.test.ts` OOM worker flake — compare counts, not exit codes).
- Latest targeted state after `50def17`: VesselModeler+workers+hooks **841 passed | 3 skipped**.
- Owner has NOT yet confirmed perf feels good after `50def17` — ask before assuming closed-closed.

## Open Questions / Deferred (decided-deferred, not forgotten)

- **T3 UX batch is NEXT** (approved): C12 view cube + camera bookmarks, C13 entity outliner, C14 command palette, C15 clip planes. A3 undo labels/history dropdown rides along. Base is the decomposed VesselModeler (T2-D, 13 hooks + `engine/vessel-reducer.ts`).
- R1 deferrals: head/dome-mounted nozzle footprints; boot-composite VISUAL heatmap holes (`buildFootprintExcludeMask` returns undefined for boots — stats fully handled).
- R2 deferrals: pipe-part palette drop stays main-shell-only; confirmed composites have no gizmo → cross-body remount requires re-entering orientation (owner may want a "move to…" affordance — was offered, no answer yet).
- Pre-existing render-loop inefficiencies (NOT regressions; next dial if perf complaints persist): `scene-manager.ts` `updateNozzleLabelOcclusion` 3× traverse + Vector3 allocs/frame; `updateWeldLabelPositions` Matrix4/frame.
- Parked user decisions: standalone `/topology` page deprecation; B6 CML layer.
- Minor punch: T2-B optional texture-getter cleanup.

## Binding rules a fresh session must not violate (scars, all regression-tested)

- ONE `containsCell` predicate (junction-footprint mechanism) drives stats AND visuals — never re-derive.
- All (pos,angle)↔world via `resolveBodyFrame` (body-frame.ts); ±90 datum conversions ONLY in `engine/vessel-coords.ts`; FlattenedView axis mapping ONLY via `makeDevelopedFrame()`.
- `bodyId === undefined` = main shell, byte-identical legacy paths; serialization fields declared only in `vessel-serialization-spec.ts`.
- History semantics sacred (coalesce keys, `HISTORY_BREAK`, skip-tagged rehydration); `vesselCallbacks` = fresh object per render, never memoize.
- structural-hash: never re-add visual params (opacity/colorScale/range) — they bake into textures.
- **PERF RULE (new this session):** heavy derived work reads SETTLED state (`useSettledValue`), never live per-frame `vesselState`; any effect that can call `rebuildScene` must be hash/fingerprint-guarded and must not list churning callbacks in deps.
- Orchestration: Fable designs/delegates (opus complex, sonnet mechanical), agents report-don't-commit, orchestrator verifies with own evidence then commits file-scoped; agents must NOT run the full suite.

## Next Agent Should Start Here

1. Ask the owner whether viewer perf now feels acceptable after `50def17`; if not, the label-pass inefficiencies above are the next target.
2. Otherwise begin **T3**: write the design doc (`docs/plans/2026-08-0X-t3-ux-batch-design.md`) covering C12/C13/C14/C15 (+A3), then phase and delegate per the orchestration policy. Roadmap context in `docs/plans/2026-07-30-vessel-modeler-ux-roadmap.md`.
