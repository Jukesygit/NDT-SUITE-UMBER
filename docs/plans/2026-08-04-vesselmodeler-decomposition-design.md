# VesselModeler.tsx Decomposition (T2-D) — Design

**Date:** 2026-08-04 · **Baseline:** `4ff0538`, 4,356 lines · **Review ref:** 2026-07-12 §4.3 · **Roadmap:** Tranche 2 final item.

## Diagnosis (from the structural scout)

The component already has a sound spine: one six-slice reducer (`vessel`/`selection`/`locks`/`drawMode`/`previews`/`ui` + history stack) and only 5 effects. The 4.3k lines are almost entirely: (a) ~40 per-entity CRUD callbacks funneling through the `UPDATE_VESSEL_FN` escape hatch with `historyFor` coalescing keys, (b) the 265-line `vesselCallbacks` object consumed solely by ThreeViewport, (c) ~350 lines of drag/drop handlers, (d) cloud save/load + picker state (6 useState, serialize surface already centralized), (e) report/inspection-mode/drawing-apply blocks. SidebarPanel (~85 props) and the sidebar sections are already split.

**Therefore: decompose by extracting hooks along concern seams. No component splits, no state redesign, no new abstractions.** Pure relocation with zero behavior change, phased so every phase is independently landable and gate-verified.

## Target shape

```
VesselModeler.tsx (< ~900 lines: reducer wiring, hook composition, JSX)
engine/vessel-reducer.ts          ← reducer + action types moved out (pure already)
hooks/useNozzleActions.ts         ┐
hooks/useAppendageActions.ts      │
hooks/usePipingActions.ts         │  D1: entity CRUD hooks — each takes
hooks/useAttachableActions.ts     │  {dispatch, historyFor, counters...} and
hooks/useAnnotationActions.ts     │  returns the exact same callbacks
hooks/useOverlayActions.ts        │  (lug/weld/saddle → Attachable;
hooks/useScanActions.ts           ┘   texture/coverage/ruler/inspectionImage → Overlay)
hooks/useVesselPersistence.ts     ← D2: save/load/picker/GLB/linked-model bootstrap
hooks/useViewportCallbacks.ts     ← D3: vesselCallbacks assembly (composes D1 outputs)
hooks/useViewportDnD.ts           ← D3: drag/drop handlers
hooks/useInspectionMode.ts        ← D4: enter/exit/cycle + stat overlay state
hooks/useReportGeneration.ts      ← D4: report + captureReportAssets
```

## Phases (each = one opus task, one commit, full gate)

- **D1 — reducer move + entity CRUD hooks.** Move the reducer/actions to `engine/vessel-reducer.ts` (pure file, unit-testable; VesselModeler re-imports). Extract the seven action-hook files. Callback bodies move VERBATIM — same `historyFor` keys, same `Omit<...,'id'>` signatures, same dependency arrays (adjusted only for the new closure scope). ~1,400 lines out.
- **D2 — persistence hook.** `useVesselPersistence` absorbs the 6 picker/save useState, `saveProject`/`buildSaveConfig`/`saveToProject`/`saveAsNewToProject`/`loadProject`/`applyModelConfig`/`exportGLB`, the `linkedModel` bootstrap effect, and `vesselModelIdRef`. Serialize/deserialize call sites stay the only ones (spec rule).
- **D3 — viewport callbacks + DnD.** `useViewportCallbacks` builds the ThreeViewport callback object by composing D1 hooks + selection/preview dispatchers (object identity/memoization semantics preserved — ThreeViewport must not re-render more than today); `useViewportDnD` takes the drop handlers. ~600 lines out.
- **D4 — inspection mode + report.** Remaining named blocks; the component ends as wiring + JSX.

## Binding constraints (every phase)

1. **Zero behavior change.** No existing test expectation may be modified. The undo/history suites, serialization round-trips, and all modeler suites pass untouched. Any diff in coalescing keys, dispatch order, or callback identity churn is a defect.
2. History semantics are sacred: `historyFor` key derivation, `HISTORY_BREAK` on drag end, `skip`-tagged rehydration dispatches, `SET_VESSEL` clearing — all preserved verbatim (memory: vessel-undo-redo).
3. Hooks receive dependencies explicitly (no context introduction — SidebarPanel's 85-prop interface is untouched; a context refactor is T3-scoped future work, recorded not attempted).
4. New files ≤300 lines each where achievable; no `console.log`; no opportunistic refactors inside moved bodies.
5. Gate per phase: `npm run typecheck` (0 errors) · modeler suites (engine, component, FlattenedView, workers — all pass, zero modified expectations) · eslint touched files (0 errors) · phases D2+D4 also run `npm run build`. Orchestrator runs the full suite at D4.

## Out of scope

SidebarPanel prop-count reduction (context/provider design — T3), reducer slice redesign, any new features, CoveragePanel/StatusBar internals.
