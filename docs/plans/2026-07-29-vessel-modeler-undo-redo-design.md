# Vessel Modeler Undo/Redo — Design

**Date:** 2026-07-29
**Status:** IMPLEMENTED 2026-07-29 (all 3 phases, same day). Uncommitted on
`feature/appendage-bodies` alongside parallel-session work. New files:
`engine/vessel-history.ts` (+ tests), `useTextureRehydration.ts`; edits confined
to `VesselModeler.tsx`. Verified: 12/12 history unit tests, typecheck clean,
build clean, lint 0 errors, plus a headless-Edge Playwright drive
(9 scenarios PASS: initial disabled state, per-keystroke coalescing to a single
undo step, Ctrl+Z/Ctrl+Y, toolbar buttons, structural add-nozzle undo,
text-input guard, redundant mode-toggle no-op, undoable mode switch with
toggle re-sync). Implementation additions beyond this design: mode-toggle
guard + `modelMode`↔`vesselShape` sync effect in `handleSetModelMode` (a
redundant toggle click previously recorded a spurious entry; undo across a
mode switch previously desynced the sidebar toggle). The Phase 3 in-place
mutation audit came back clean — no offenders, structural sharing is safe.
**Scope:** `src/components/VesselModeler/` — document-state undo/redo for the 3D modeler

## Problem

The Vessel Modeler has no undo/redo. Any edit (moving a nozzle, deleting a scan
composite, resizing an annotation) is irreversible short of reloading a saved
file. For an editing tool of this density that is a constant data-loss hazard.

## What the investigation found (facts, with evidence)

1. **Single reducer choke point.** All modeler state flows through one
   `useReducer(vesselReducer, INITIAL_STATE)` (`VesselModeler.tsx:493`). State is
   `{ vessel, selection, locks, drawMode, previews, ui }` (`VesselModeler.tsx:223`).
2. **Document vs transient state is already separated.** Only four action types
   touch the document slice `state.vessel`: `SET_VESSEL`, `UPDATE_VESSEL_FN`,
   `UPDATE_THICKNESS_THRESHOLDS`, `TOGGLE_LABELS_TIDIED`
   (`VesselModeler.tsx:280-336, 429-433, 461-473`). Everything else (selection,
   locks, draw modes, previews, ui) is transient and should not be undoable.
3. **The reducer is immutable** (spread-based updates throughout). Consecutive
   states share unchanged sub-objects by reference — history snapshots are O(1)
   to record and cheap to hold, even though `ScanCompositeConfig.data` embeds
   full thickness matrices (`types.ts:222`) and textures/inspection
   images/reference drawings embed base64 `imageData` (`types.ts:191,395,580`).
4. **Drags dispatch per pointermove.** `onNozzleMoved` / `onSaddleMoved` /
   `onTextureMoved` / `onLugMoved` call `updateNozzle(...)` etc. on every move;
   `onDragEnd` is currently a no-op (`VesselModeler.tsx:2025-2039`). The
   interaction manager fires `onDragEnd` reliably on pointerup
   (`engine/interaction-manager.ts:985`, listener on `window`). Naive
   record-every-dispatch history would push dozens of entries per drag —
   **coalescing is mandatory**.
5. **THREE.Texture objects live outside the reducer** in `textureObjectsRef`
   keyed by texture id (`VesselModeler.tsx:549`) and are disposed on delete
   (`VesselModeler.tsx:1156`). But the load path already rebuilds them from
   `TextureConfig.imageData` via `loadTextureFromData`
   (`VesselModeler.tsx:2336-2350`) — so undo of a texture delete can be
   reconciled the same way.
6. **Id counters are monotonic refs** (`nextAnnotationIdRef` etc.,
   `VesselModeler.tsx:554-557`). They only grow, so undo/redo can never cause id
   collisions; no rollback needed.
7. **No autosave, no immediate cloud deletes.** Saves are explicit (local JSON
   via `serializeVesselState`, `VesselModeler.tsx:2052`; cloud via picker).
   Undo therefore only has to manage in-memory state; cloud sync happens at the
   next explicit save.
8. **Load paths** dispatch `SET_VESSEL` at `VesselModeler.tsx:667` and `:2414` —
   natural document boundaries.
9. **Keyboard handling** already has a window `keydown` effect (Escape handling,
   `VesselModeler.tsx:2668-2680`); `ScreenshotMode` has its own handler
   (`ScreenshotMode.tsx:322`).

## Rejected alternative: command pattern

A command/inverse-operation system (each action knows how to undo itself) was
rejected: it requires an inverse for every mutation across nozzles, appendages,
piping, scans, annotations, rulers, welds, lugs, saddles, textures — a large
surface with high regression risk in a module carrying byte-identical
serialization guarantees. Because the reducer is already immutable with
structural sharing, snapshot (memento) history gives the same result for a
fraction of the code and risk.

## Design: snapshot history over the vessel slice

### 1. Pure history module — `engine/vessel-history.ts` (new)

Keeps `VesselModeler.tsx` (already ~2700 lines) from growing; unit-testable in
isolation.

```ts
export interface VesselHistoryState {
  past: VesselState[];      // oldest → newest pre-change snapshots
  future: VesselState[];    // redo stack
  lastKey: string | null;   // coalescing group of the most recent record
  lastAt: number;           // timestamp of the most recent record
}

export interface HistoryMeta {
  key?: string;  // coalescing group, e.g. 'drag:nozzle:3', 'field:diameter'
  at: number;    // Date.now() captured by the DISPATCHER (keeps reducer pure)
}

export const MAX_HISTORY = 50;
export const COALESCE_WINDOW_MS = 1000;

// record(history, prevVessel, meta): push prevVessel unless coalesced
// undo(history, current) / redo(history, current): swap through the stacks
// breakGroup(history): reset lastKey (gesture boundary)
// clear(): fresh history (document boundary)
```

Coalescing rule (pure): if `meta.key` is set, equals `lastKey`, and
`meta.at - lastAt < COALESCE_WINDOW_MS`, do **not** push (the entry recorded at
gesture start already holds the pre-gesture state); just refresh `lastAt`.
Timestamps come from action creators, never `Date.now()` inside the reducer —
StrictMode-safe.

### 2. Reducer integration — `VesselModeler.tsx`

- Add `history: VesselHistoryState` to `VesselModelerState`.
- Extend the four vessel-mutating actions with optional
  `history?: HistoryMeta & { skip?: boolean }`. No metadata ⇒ discrete commit
  (push previous vessel, clear future). `skip: true` for mutations that must
  not create an undo step (if any emerge).
- New actions:
  - `UNDO` / `REDO` — swap vessel with the top of past/future. Also reset
    `selection` to `DESELECTED` and cancel draw modes/previews (stale
    index/id safety — e.g. `selection.nozzleIndex` pointing past the end of a
    shorter restored array). Locks and ui are untouched.
  - `HISTORY_BREAK` — resets `lastKey`; dispatched from `onDragEnd`
    (`VesselModeler.tsx:2037`) so two consecutive drags of the same object are
    two undo steps.
- `SET_VESSEL` (both load sites) clears history — undo never crosses a
  load/import boundary in v1.

### 3. Coalescing keys at the continuous sources

- Drag handlers (4 sites, `VesselModeler.tsx:2025-2036`):
  `key: 'drag:nozzle:<idx>'`, `'drag:saddle:<idx>'`, `'drag:texture:<id>'`,
  `'drag:lug:<idx>'`. Annotation-table move/resize (`:2040-2048`) likewise.
- Sidebar sliders / number inputs that fire per keystroke or per input event:
  the update-helper wrappers in `VesselModeler.tsx` accept an optional history
  key per call site (`'field:<name>'`). Call sites that are plain
  clicks/discrete edits pass nothing and get one entry per action — correct by
  default.

### 4. Side-effect reconciliation (the one genuinely non-trivial part)

- **Textures:** an effect watching `vessel.textures` rebuilds any config whose
  id is missing from `textureObjectsRef` using the existing
  `loadTextureFromData` (exactly what the load path does at
  `VesselModeler.tsx:2336-2350`). Deletion keeps disposing eagerly.
- **Geometry / scan overlays / labels:** already derived from state via the
  structural-hash rebuild pipeline — undo works with zero extra code.
- **In-place mutation audit (implementation gate):** structural sharing is only
  safe if nothing ever mutates `scanComposites[].data`, axis arrays, or other
  nested arrays in place after they enter state. One targeted audit pass during
  implementation; any offender gets converted to copy-on-write.

### 5. UI

- **Keyboard:** Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y in the existing keydown effect
  (`VesselModeler.tsx:2668`). Guards: skip when `e.target` is an
  input/textarea/contenteditable (native text undo wins); inactive while
  ScreenshotMode is open.
- **Toolbar:** undo/redo buttons beside the existing locks/actions menus,
  disabled when the respective stack is empty, tooltips showing the shortcut.
  Use existing `btn` classes per `dev-docs/design-system.md`.

### 6. Tests (Vitest)

- `engine/__tests__/vessel-history.test.ts`: push / undo / redo / future-clear
  on new edit / coalesce within window / break on `HISTORY_BREAK` / cap at
  `MAX_HISTORY`.
- Reducer-level tests (extract `vesselReducer` or test via dispatch): a 30-move
  drag storm with one key yields exactly one undo entry; UNDO restores the
  prior vessel and resets selection; `SET_VESSEL` clears history.
- Serialization untouched: history state is never serialized —
  `vessel-serialization-spec.ts` is not modified (byte-identical guarantees
  hold by construction).

## Memory budget

50 entries × structural sharing ⇒ only the slices actually changed per step are
retained. Worst realistic case is repeated large texture/scan imports inside one
session; each import holds one extra reference to data that already lives in
state. If profiling ever shows pressure, drop `MAX_HISTORY` — no design change.

## Out of scope (v1)

- Undoing camera, selection, view mode, locks, stats toggles (transient).
- Undo across load boundaries; cross-session/persisted history.
- Cloud-side undo (deleting a cloud-saved scan record is only actioned at
  explicit save time anyway).
- Per-entry labels ("Undo: Move nozzle N2") — cheap later addition via a
  `label` field on entries.

## Phasing

1. **Phase 1 — core:** `vessel-history.ts` + reducer wiring + UNDO/REDO +
   keyboard + toolbar buttons. Every vessel edit undoable (drags produce
   many steps until Phase 2). Tests for the pure module + reducer.
2. **Phase 2 — gestures:** history metadata on drag/slider paths,
   `HISTORY_BREAK` on `onDragEnd`, coalesce tests.
3. **Phase 3 — reconciliation & audit:** texture rebuild effect, in-place
   mutation audit of scan/annotation arrays, edge-case QA (undo texture
   delete, undo scan delete, undo appendage delete-cascade).

Estimated blast radius: 1 new engine module + 1 new test file, edits confined to
`VesselModeler.tsx` (reducer + a handful of handler sites) and the toolbar.
No serialization, engine-geometry, or service changes.
