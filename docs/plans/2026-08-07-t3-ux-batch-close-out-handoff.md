---
tags:
  - handover
  - agent
date: "2026-08-07"
status: active
---

# Agent Handoff: T3 UX batch CLOSED — all five phases landed and runtime-verified

## Task

- Session arc: owner confirmed viewer perf good after `50def17` → T3 UX batch designed (`2026-08-06-t3-ux-batch-design.md`) and fully implemented per the roadmap. Mid-arc the owner reported the view cube invisible — root-caused and fixed. **Nothing in-flight.**

## What Changed (all on `feature/appendage-bodies`, newest first)

- (C15 commit) **clip planes** — pure `engine/clip-planes.ts` (one world-space plane per mode, normal = KEPT half, verified against three.js shader source); `scene-manager.setClippingPlanes` scene-wide + `reapplyClippingPlanes()` at the END of `rebuildScene` (fresh materials); ThreeViewport effect deps `[clipConfig, orientation]` ONLY (vessel via ref); persistent highlight materials synced explicitly (tier-2 swap-ins are unreachable by scene traverse); `ui.clip` transient; `ClipPlanesControl` dropdown. Runtime-verified: vessel visibly cut, helper renders, zero console errors.
- (C14 commit) **command palette + view-cube positioning fix** — `engine/palette-registry.ts` (ranked filter), `engine/frame-entity.ts` (poses via `resolveBodyFrame` uniformly; `framingDistanceForCamera` extracted from camera-animation, inspection byte-identical; dome = sanctioned head-apex fallback), `CommandPalette.tsx` Ctrl+K/P. FIX: view cube was top-LEFT **under the absolute 340px `.vm-sidebar` overlay** — moved top-RIGHT below the actions cluster; outliner made sidebar-aware (`left: sidebarOpen ? 354 : 14`). Root-caused via Playwright `elementFromPoint`.
- `509bd62` **C13b outliner** — pure `outliner-tree.ts` + `OutlinerPanel.tsx` (NOT via SidebarPanel), Eye toggles through new `onToggle<Type>Visible` D1-hook callbacks, `ui.outlinerOpen` + `TOGGLE_OUTLINER`.
- `d9f5046` **C13a uniform visibility** — `visible?` on all entity types; structural-hash strips it via `{...x, visible: undefined}` spread projections (legacy byte-identity regression-tested); build-time + tier-2 in-place application; hidden excluded from raycast (`isEntityVisible`, `getAllSurfaceMeshes` filters on return) but NEVER from stats. Annotations/images deliberately stay on the rebuild path (their `visible` gates separately-built CSS2D labels).
- `8685357` **C12 view cube / canonical views / bookmarks** — `engine/canonical-views.ts` (+ shared `fitDistance`, `nozzleNormalPose`); CSS-3D `ViewCube.tsx` (rAF ref-writes, no per-frame React state); `VesselState.cameraBookmarks` top-level field on BOTH paths (absent ⇒ byte-identical), CRUD undoable, feeds `captureVesselOverviews`.
- `2e4bd39` **A3 labeled undo** — `HistoryEntry {vessel,label,at}`; coalescing keeps FIRST label; folded `UNDO_TO`/`REDO_TO`; labels minted dispatcher-side in `historyFor` ("Boot" display word; coalesce key keeps the raw entity token); `HistoryDropdown.tsx`. T3 design doc rode along.

## Validation

- Every phase gated individually (tsc 0 / targeted vitest / eslint 0 errors); phases reviewed by the orchestrator against the design before commit.
- **Final batch gate: `npm run build` ✓, full suite 1549 passed | 3 skipped** (the 1 "error" = standing `useLayoutMode.test.ts` OOM flake — compare counts).
- C14 fix + C15 runtime-verified in headless Edge (verify skill: temp `/verify-modeler` route — **reverted**, do not look for it): cube visible/clickable top-right, face click flies to exact canonical pose, outliner clear of sidebar both states, GPU cut + helper confirmed by screenshot + pixel sampling.

## Binding rules added this arc (on top of the 2026-08-06 handoff's list, all still in force)

- **VIEWPORT-OVERLAY RULE:** `.vm-sidebar` overlays the viewport's LEFT 340px — viewport-anchored UI must never sit at `left` without a sidebar-aware offset (354/14 precedent); view cube lives top-RIGHT.
- `historyFor`'s coalesce key keeps the RAW entity token; only the label maps `appendage`→"Boot".
- `ui.outlinerOpen` / `ui.paletteOpen` / `ui.clip` are transient — never serialized, never in history.
- Clip planes: effect deps stay `[clipConfig, orientation]`; re-application happens at rebuildScene end only; never `needsUpdate` in the traversal.
- Ops: Explore/research subagents crashed on context overflow 4/4 in this environment; implementation agents succeed when the prompt mandates Grep-first + ≤400-line Read chunks. Keep doing that.

## Open / Deferred

- T3 deferrals: annotations/images `visible` → tier-2 unification (needs CSS2D label lifecycle design); CSS2D labels don't clip; clipped geometry still raycastable during drags; per-nozzle view buttons in sidebar rows (palette covers it).
- Earlier deferrals unchanged: R1 head/dome-mounted nozzle footprints + boot-composite visual holes; R2 pipe-part drops main-shell-only; scene-manager label-pass inefficiencies (next perf dial).
- Parked user decisions: standalone `/topology` deprecation; B6 CML layer.

## Next Agent Should Start Here

1. T3 is closed — the roadmap has no next approved tranche. The open user decisions (/topology deprecation, B6 CML) gate what comes next; ask the owner.
2. If the owner wants polish first: the T3 deferral list above is ordered by value (annotations/images tier-2 unification first).
