# T3 UX Batch — Design: Undo Labels (A3), View Cube & Bookmarks (C12), Outliner (C13), Command Palette (C14), Clip Planes (C15)

**Date:** 2026-08-06
**Status:** Design — Tranche 3 of `2026-07-30-vessel-modeler-ux-roadmap.md` (approved backlog)
**Base:** decomposed VesselModeler (T2-D: `engine/vessel-reducer.ts` + 13 concern hooks), boot-parity batch R1–R5 landed, perf pair (`14cd5d3`/`50def17`) confirmed good by owner 2026-08-06.

## Verified current state (all file:line checked this session)

- **Camera stack:** `PerspectiveCamera(45°)` at initial pose `(15,8,15)` → target `(0,0,0)`, `OrbitControls` with damping 0.1 (`engine/scene-manager.ts:55-86`); `resetCamera()` exists (`scene-manager.ts:614`); render loop `animate()` at `scene-manager.ts:651` with an `onBeforeRender(camera, controls)` hook. `ThreeViewportHandle` exposes `getCamera()/getControls()/getRenderer()` (`ThreeViewport.tsx:123-126`); `VesselModeler.tsx:185` holds `viewportRef`.
- **Pose flight engine exists:** `engine/camera-animation.ts` — `animateCamera(camera, controls, pos, lookAt, duration)` + `updateCameraAnimation` (ease-in-out cubic, called from the render loop), `computeInspectionCameraTarget` (surface-normal framing that fills ~70 % of viewport). Inspection mode already snapshots poses as `{ position: [x,y,z], target: [x,y,z] }` in `ui.savedCameraState` (`vessel-reducer.ts:84-89`, `hooks/useInspectionMode.ts:68-69`).
- **Canonical-view precedent:** `engine/report-image-capture.ts` `getOverviewViews(cardinalRotation)` (`:77-92`) builds Side/End/Top/Isometric directions honouring `visuals.cardinalRotation`, fits camera to bounds, captures, restores original pose (`:133-188`).
- **History:** `engine/vessel-history.ts` — `past/future: VesselState[]` snapshots, **no label field**; `HistoryMeta = { key?, at }`; coalesce same-key < 1 s, cap 50. All vessel mutations funnel through `UPDATE_VESSEL_FN` + `historyFor(entity, id, updates)` (`vessel-reducer.ts:171-174` — the single key-mint site). Undo/redo buttons at `VesselModeler.tsx:1081-1096`; keyboard handler (Esc, Ctrl+Z/Y, text-input guard) at `:588-624`.
- **Visibility:** `visible?: boolean` exists on **annotations, inspection images, appendages, pipelines only** (`types.ts:390/436/673/1156`). Sidebar Eye/EyeOff toggle precedent: `sidebar/AnnotationSection.tsx:266`, `sidebar/InspectionImageSection.tsx:221`; toggle actions `hooks/useAnnotationActions.ts:260`, `hooks/useOverlayActions.ts:202`. Appendage `visible` is **excluded from structural-hash** (cosmetic) and applied by a **tier-2 in-place effect** (`ThreeViewport.tsx:1509-1520` sets `group.visible` on `buildResultRef` appendage groups). Nozzles/welds/lugs/saddles/rulers/coverageRects hash **wholesale** (`engine/structural-hash.ts:30-49`) — a new optional field on those types would enter the hash.
- **Layer toggles:** `visuals.showNozzleLabels` / `showWeldLabels` (`types.ts:606-608`) — labels only, no geometry-layer toggles.
- **Top-level persistence precedent:** `labelsTidied`, `annotationTablePosition` serialize as top-level `VesselState` fields (`engine/vessel-serialization.ts:205-206` save, `:313-315` load). Attachable-array fields are spec-declared ONLY (`vessel-serialization-spec.ts`).
- **Renderer:** `WebGLRenderer({ antialias, preserveDrawingBuffer })`, shadows PCFSoft, ACES tone mapping (`scene-manager.ts:63-72`). **`localClippingEnabled` is never set.** Materials centralised in `engine/materials.ts` (shell `DoubleSide` `:35` — interior already renders; most others `FrontSide`), with additional creation sites in nozzle/vessel/dome-scan/annotation geometry + `texture-manager.ts` (~21 files, 62 `new THREE.*Material` calls).
- **Toolbar:** actions cluster + `vm-toolbar-segmented` 3D/2D/Topo at `VesselModeler.tsx:1074-1120`; dropdown precedent `StatsDropdown` (`:1134`), overlay-toolbar precedent `ReliefViewportPane.tsx`.

## Scope & order

Five independent-commit phases, each with its own gate. Dependency edges: C14 consumes C12's framing engine and C13's entity enumeration; everything else independent.

1. **A3 — labeled undo + history dropdown**
2. **C12 — view cube, canonical views, camera bookmarks (+ report capture feed)**
3. **C13 — entity outliner + uniform visibility**
4. **C14 — command palette / entity search**
5. **C15 — clip planes**

Out of scope (deliberate): draggable 3D clip-plane gizmo (v1 = presets + slider), per-nozzle view buttons scattered in sidebar rows (reachable via palette), section capping/CSG at clip plane, SidebarPanel context refactor.

---

## A3 — Labeled undo entries + history dropdown

The 2026-07-29 undo design reserved labels; `HistoryMeta` today carries only `key`/`at`.

**History core** (`engine/vessel-history.ts` — pure, keep all invariants):
- `past/future` become `HistoryEntry[] = { vessel: VesselState; label: string; at: number }[]`. `undoStep`/`redoStep` move whole entries; when undoing, the popped entry's `label` names the change being reverted (its `vessel` is the pre-change snapshot of exactly that change), and the entry pushed to `future` carries the same label (redo announces the same change).
- `HistoryMeta` gains `label?: string`. Coalescing keeps the **first** label of the group (a drag storm stays "Move nozzle N2") and refreshes `lastAt` as today. Missing label falls back to a humanised key (`nozzle:3:angle,pos` → "Edit nozzle").
- New pure `undoTo(history, current, index)` — repeated `undoStep` folded into one state transition; reducer gains `UNDO_TO { index }` (and `REDO_TO` symmetric) so a dropdown jump is a single dispatch/render. `withRestoredVessel` semantics unchanged.

**Label derivation** (dispatcher-side, single site): extend `historyFor(entity, id, updates)` → `historyFor(entity, id, updates, displayName?)` returning `{ key, at, label }`. Verb table: `pos`/`angle`/`mountPos`/`mountAngle`/`endPos` ⇒ "Move"; anything else ⇒ "Edit"; label = `"<Verb> <entity> <displayName ?? id>"`. Add/delete call sites in the D1 CRUD hooks pass explicit discrete labels ("Add nozzle N7", "Delete weld W3") via `HistoryControl.label`. Hooks changes are mechanical once the table is fixed here.

**UI** (`VesselModeler.tsx` actions cluster): undo/redo button `title`s become "Undo: {next label}" / "Redo: {next label}"; new `HistoryDropdown` (StatsDropdown pattern) between the redo button and the segmented toggle — lists past entries newest-first (label + relative time), click = `UNDO_TO`; redo entries shown above a divider. Keep component < 150 lines.

**Guards:** reducer stays pure (timestamps/labels minted dispatcher-side); skip-tagged rehydration dispatches never mint labels; `SET_VESSEL` still clears history.

**Tests:** vessel-history unit tests extended (label retention through coalesce, undoTo N-step equivalence, cap behaviour); reducer test for UNDO_TO transient-slice reset.

---

## C12 — View cube + canonical views + camera bookmarks

**Engine** — new pure `engine/canonical-views.ts`:
- `canonicalPose(viewId, vesselState, bounds): { position, target }` for `'iso' | 'n' | 'e' | 's' | 'w' | 'top' | 'bottom' | 'tdc'` — direction math mirrors `getOverviewViews` (honours `visuals.cardinalRotation` and `orientation`), fit distance factored from `report-image-capture.ts`'s bounds-fit (extract a shared `fitDistance(bounds, camera)` helper there rather than duplicating; capture output must stay byte-identical).
- `nozzleNormalPose(nozzle, vesselState)` — camera along the nozzle axis outward, framing the flange (distance from flange OD, `computeInspectionCameraTarget`-style). Consumed by C14's "Frame N7".

**View cube** — new `ViewCube.tsx` overlay in the 3D viewport corner (ReliefViewportPane overlay positioning precedent): a CSS-3D mini-cube whose rotation syncs from the camera each frame via `scene-manager`'s `onBeforeRender` (ThreeViewport already chains it — compose, don't replace) writing a `transform` to a ref'd DOM node — **no React state per frame** (PERF RULE). Faces/edges labelled N/E/S/W/Top plus an Iso home button; click → `animateCamera` to `canonicalPose`. Rendered only in `viewMode === '3d'`.

**Bookmarks** — document state, persisted:
- `VesselState.cameraBookmarks?: { id: string; name: string; position: [number,number,number]; target: [number,number,number] }[]` — top-level field following the `annotationTablePosition` precedent on **both** save/load paths (`vessel-serialization.ts` — top-level fields live there, not in the attachable specs). Ids minted store-side (`bm-<n>`, nozzle-id pattern).
- Living in the vessel slice makes add/rename/delete undoable for free (discrete entries, "Add bookmark …"); undo/redo does NOT move the camera (`withRestoredVessel` untouched).
- UI: `BookmarksDropdown` (StatsDropdown pattern) in the actions cluster — "Save current view", list (click = `animateCamera` recall, inline rename via InlineEditField, delete).
- **Report feed:** `captureVesselOverviews` (`report-image-capture.ts`) gains an optional `bookmarks` param — after the four standard views it captures each bookmark pose through the same save/restore path, labelled by bookmark name. `useReportGeneration` threads `vesselState.cameraBookmarks` in. No bookmarks ⇒ output byte-identical to today.

**Tests:** canonical-pose math (all ids × orientations × cardinalRotation), nozzle-normal pose, bookmark serialization round-trip (both paths), report capture with/without bookmarks.

---

## C13 — Entity outliner + uniform visibility

**Uniform `visible?: boolean`** extended to: nozzles, welds, liftingLugs, saddles, textures, rulers, coverageRects, scanComposites, domeScanComposites (annotations/images/appendages/pipelines already have it). Semantics: **visual only** — hidden entities keep contributing to coverage/wall-loss/stats exactly as today (inspection-data-integrity rule: display must never change measurement truth). Hidden entities are excluded from raycast/drag candidates in `interaction-manager` (verify THREE raycast behaviour against invisible groups and enforce explicitly — do not assume the raycaster skips them).

**Structural-hash discipline** (`engine/structural-hash.ts`): wholesale-hashed collections (nozzles, welds, lugs, saddles, rulers, coverageRects) switch to mapped projections that spread the item and set `visible: undefined, locked: undefined` — `JSON.stringify` omits `undefined` values and spread preserves key order, so legacy states hash **byte-identically** (goldens must stay green; add explicit regression asserting old-vs-new hash equality on a visible-less fixture). Scan/dome composite hash projections simply don't add the new field.

**Application** — mirror the appendage tier-2 mechanism (`ThreeViewport.tsx:1509-1520`): one effect dep'd on the entity arrays walks the built scene (by existing `userData` conventions: `type` + `nozzleIdx`/ids) setting `group.visible`. Build-time initial state set in the geometry builders (appendage-geometry `:195` precedent). Heatmap overlays (scan/dome) hide via their mesh groups — textures stay baked; no texture-manager cache involvement, no structural rebuild.

**Serialization:** add `{ key: 'visible' }` (+ `locked` where missing) to the affected specs in `vessel-serialization-spec.ts` — the only legal place.

**Outliner panel** — new `OutlinerPanel.tsx` rendered by `VesselModeler` directly (NOT through SidebarPanel — avoids growing the 85-prop interface; it takes `vesselState`, `selection`, and a narrow callback object). Collapsible floating panel on the viewport's left edge (UnifiedStatsPanel overlay precedent), toggled from the actions cluster; open-state in `ui.outlinerOpen` (transient, never serialized). Tree: body group ("Vessel", each boot by name) → category → rows (display name, Eye toggle, lock badge). Row click dispatches the matching `SELECT_*`; Eye toggles route through the D1 hooks (new `onToggle<X>Visible` callbacks following `useAnnotationActions.ts:260`, each a coalesce-keyed history entry "Show/Hide …"). Body grouping keys off `bodyId` (undefined ⇒ main shell). Keep the component split: `OutlinerPanel` + `outliner-tree.ts` pure tree-builder (unit-tested).

**Tests:** hash byte-identity regression, spec round-trips, tree-builder grouping (bodies/categories/bodyId routing), toggle-action history keys.

---

## C14 — Command palette / entity search

- **Registry** — pure `engine/palette-registry.ts`: `buildPaletteItems(state): PaletteItem[]` where `PaletteItem = { id, kind: 'entity' | 'command', label, keywords, action }` with `action` a serializable descriptor (`{ select: {...} } | { view: 'n' } | { toggle: 'snap' } | …`). Entities from every collection (name + id + body name as keywords); commands: canonical views, bookmarks, view-mode switches, snap/tidy/stats/outliner toggles, undo/redo. Substring + subsequence match, entities ranked above commands on ties. Unit-tested pure.
- **Framing** — selecting an entity dispatches its `SELECT_*` **and** flies the camera: new pure `engine/frame-entity.ts` `frameEntityPose(entityRef, vesselState)` — world anchor via the existing single-source math (`resolveBodyFrame` for body-mounted, `shellPoint` for surface items, dome math via `dome-tangent.ts` for dome scans, nozzle poses via C12's `nozzleNormalPose`), distance from entity footprint (`computeInspectionCameraTarget` approach). Never hand-roll (pos,angle)→world here — body-frame.ts only.
- **Component** — `CommandPalette.tsx` centered overlay (own lightweight markup, vm styling; not the app Modal), opened by Ctrl+K (added to the existing keydown handler at `VesselModeler.tsx:588` with the existing text-input guard), `ui.paletteOpen` transient state. Keyboard: arrows/Enter/Esc. Executes descriptors via a small switch in VesselModeler that maps to dispatches / viewport calls.
- **Tests:** registry build over a populated fixture (all kinds present, keyword match, ranking), frame-entity poses per entity type incl. boot-mounted (body-frame routing).

---

## C15 — Clip planes

- **Engine** — pure `engine/clip-planes.ts`: `buildClipPlanes(cfg, vesselState): THREE.Plane[]` for `cfg = { enabled, mode: 'transverse' | 'longitudinal-h' | 'longitudinal-v', offsetMm, flip }` — single plane v1; transverse = normal along vessel axis positioned at axial mm (SCALE from materials.ts, orientation-aware), longitudinal pair = horizontal/vertical planes through/offset from the axis. Unit-tested constants/normals.
- **Application** — `scene-manager.ts` gains `setClippingPlanes(planes: THREE.Plane[])`: sets `renderer.localClippingEnabled = planes.length > 0` and traverses `scene` assigning `material.clippingPlanes` (+ `clipShadows`) on every mesh material incl. material arrays. Scene-wide planes make shared materials safe (all meshes clip identically). ThreeViewport calls it from an effect dep'd on the clip config **and re-applies after every structural rebuild** (new materials appear on rebuild — hook the call at the end of `rebuildScene`'s completion path, guarded so a no-plane state costs nothing; the settle-rebuild guard rules from `50def17` are untouched).
- **UI** — `ClipPlanesControl` dropdown in the actions cluster (StatsDropdown pattern): enable toggle, mode segmented, offset slider (range from vessel dims), flip. State in `ui.clip` (transient — never serialized, no history). Optional faint `THREE.PlaneHelper` toggle.
- **Known v1 limits (documented, accepted):** CSS2D labels don't clip; clipped-away geometry may still catch raycasts during drags (visibility-vs-raycast note from C13 applies — if C13's interaction filter lands first, reuse it only for `visible`, not for clipping); no cap/section-fill rendering.
- **Tests:** plane construction math (modes × orientations × flip × offset).

---

## Delegation & verification plan (orchestration policy)

Each phase = one opus implementation task (files in scope + constraint + verification command stated at dispatch), reviewed by Fable against this design, committed file-scoped by the orchestrator only after its gate: `npx tsc --noEmit` 0 errors, targeted vitest green, eslint 0 errors. Full-suite + `npm run build` gate after A3+C12 and again after C13–C15 (compare counts — the `useLayoutMode.test.ts` OOM flake is exit-code noise). Sonnet agents for mechanical verification runs only. Binding scars from the 2026-08-06 handoff apply throughout (ONE containsCell, vessel-coords/body-frame single sources, spec-only serialization, PERF RULE + trailing-rebuild guard, fresh `vesselCallbacks` object, no visual params in structural-hash).
