# Layers System Design (Outliner → Layers)

- **Date:** 2026-08-13
- **Status:** Design locked (wayfinder ticket [#7](https://github.com/Jukesygit/NDT-SUITE-UMBER/issues/7), map [#6](https://github.com/Jukesygit/NDT-SUITE-UMBER/issues/6)); implementation not started.
- **Verified against code:** three fact-check audits (keyboard, visibility machinery, toolbar/palette surfaces) — all clear; findings folded in below.

## Goal

One-click bulk visibility for entity classes in the vessel modeler — "hide all coverage", "show only achieved scan data" — by repurposing the existing Outliner into a **Layers** panel, plus a dedicated coverage-layer master toggle. The layer vocabulary doubles as the visibility contract the future read-only viewer (projects-area comparison section, client snapshot page) will consume.

## Decisions (locked in #7)

1. **Layer visibility is a transient view overlay, not a model edit.** State lives in the reducer's transient `ui` slice (`ui.layers`), the same family as `outlinerOpen` / `paletteOpen` / `clip`: never serialized, never in undo history, resets each session. Per-entity `visible?` flags are untouched and keep working underneath.
2. **Layers are per body-category.** Keyed `` `${bodyKey}/${categoryKey}` `` (bodyKey `'main'` or appendage id — `MAIN_BODY_KEY` convention from `outliner-tree.ts`). Each body's category header gets its own eye governing exactly its subtree. The 12 outliner categories are the layer vocabulary: `nozzles, welds, lugs, saddles, scans, domeScans, annotations, coverage, images, rulers, pipelines, textures`.
3. **Effective visibility** = `entity.visible !== false` **∧** `layerVisible(bodyKey/category)` **∧** `bodyVisible`, composed by writing into `Object3D.visible` — never by filtering state.
4. **Surface package:** panel renamed **"Layers"**; coverage master eye button in the viewport's **top-right** actions cluster; hotkey **Shift+C**; command-palette entries "Toggle *(category)* layer" for all 12 categories. Toolbar stays coverage-only; the master flips every `*/coverage` key (any-visible → hide all, else show all).

## Data model

```ts
// ui slice (transient — the SET_CLIP family)
ui: {
  ...
  /** Layer visibility overlay. Key `${bodyKey}/${categoryKey}`; ABSENT ⇒ visible. */
  layers: Record<string, boolean>;
}
```

- Absent key ⇒ visible (mirrors `visible !== false` semantics; keeps the map sparse and the default state empty).
- New action `SET_LAYERS` with **partial-merge identity discipline** copied from `SET_CLIP` (`engine/vessel-reducer.ts:410-415`): object identity changes only when a key actually flips — this is load-bearing for the tier-2 effect deps (see below). Records no history entry; skipped by serialization by construction (`ui` is a sibling of the `vessel` slice).

## Implementation plan (file anchors from the verification audits)

### Reducer — `engine/vessel-reducer.ts`
- Add `layers: {}` to the `ui` initial state; add `SET_LAYERS` beside `SET_CLIP` (`:410-415`), same partial-merge + "Transient UI only" comment.

### Visibility composition — `ThreeViewport.tsx`
- **Two writers must both apply layers** (miss the second and boots ignore layers):
  - the generic C13 tier-2 effect `applyByUserData` (`:1555-1600`; the one visibility-computing line is `:1567`) — extend the computed value with the entity's `bodyKey/category` layer lookup, and append the (identity-stable) `layers` map to the dep array (`:1590-1599`). Never add `rebuildScene`/`updatePreviews` to those deps (orbit-stutter scar).
  - the separate appendage effect (`:1538-1545`).
- **First paint:** seed layer state via the existing post-rebuild seeding convention (near `:242`) or run the tier-2 pass once after `rebuildScene` — do not thread layers into the geometry builders.
- **No raycast changes:** `isEntityVisible` (`engine/interaction-manager.ts:1404-1411`) walks composed `Object3D.visible` up the parent chain, so pickability and `getAllSurfaceMeshes` filtering inherit layer state for free. Do **not** add a layers parameter — wrong seam.
- **Known caveat (accepted):** `annotations` and `images` are deliberately excluded from tier-2 (separate CSS2D leader labels) — their layer toggles ride the rebuild path, exactly like their per-entity eyes today. Acceptable at click frequency. Unifying label lifecycle is a future optimization, out of scope.

### Panel — `OutlinerPanel.tsx` + `outliner-tree.ts`
- Rename: title string `OutlinerPanel.tsx:68`, toolbar `title=`/label `VesselModeler.tsx:1508,1511`, icon `ListTree` → `Layers`. CSS classes (`vm-outliner__*`), component/type names, and `TOGGLE_OUTLINER` stay — internal identifiers don't churn.
- Category headers gain an eye button (same `vm-btn-icon vm-outliner__eye` pattern rows use) driving `SET_LAYERS` for `` `${body.key}/${cat.key}` ``. `outliner-tree.ts` categories carry the resolved layer state so the eye renders lit/dim; rows inside a hidden layer render dimmed (reuse `is-hidden` styling) but keep their individual eyes functional.

### Toolbar master + hotkey — `VesselModeler.tsx`
- Button: insert after the Outliner toggle (`:1512`), before `<StatsDropdown` (`:1513`), `vm-popout-trigger` class pattern; lit when any `*/coverage` layer is visible; **top-right cluster only** (viewport-overlay rule: never anchor left without a sidebar-aware offset).
- Hotkey: extend the existing window-level `handleKeyDown` (`:901-941`), inserting the `Shift+C` branch after the input-focus guard (`:913-921` — `HTMLInputElement || HTMLTextAreaElement || HTMLSelectElement || isContentEditable`). No conflicts: nothing in the modeler claims `C` in any form.
- **Wording:** `coverage` also names a draw mode — every tooltip/label says coverage **layer** ("Toggle coverage layer").

### Command palette — `engine/palette-registry.ts`
- Append 13 entries (12 categories + coverage master) to the `TOGGLES` data array (`:276-284`, one loop builds them); extend the typed `PaletteToggle` union (`:21-27`); wire the new cases in `handlePaletteAction`. Category commands toggle across all bodies of that category (palette has no body context); the panel is the per-body surface.

### Read-only viewer contract (forward-looking)
- Export the category-key vocabulary (a `LayerKey` type + the category list) from one module (`outliner-tree.ts` is the natural home). The future `ReadOnlyViewport` takes `layers: Record<string, boolean>` with identical semantics; the client page's publish-time layer picker maps onto the same keys.

## Invariants (do not break)

- **Stats are never filtered by visibility** — layers write only into `Object3D.visible`; stats/coverage/wall-loss never read it (`structural-hash.ts:43-45`, `ThreeViewport.tsx:1551-1552`).
- **No rebuild storms** — `ui` is structurally unreachable from `engine/structural-hash.ts` (field-lists `VesselState` only); keep it that way.
- **Byte-identity** — `ui.layers` never appears in serialization; saving with layers toggled produces byte-identical output to saving without.
- **History** — `SET_LAYERS` records no history entry; undo/redo never replays layer state.

## Out of scope

Per-layer opacity, saved layer presets / persistence across sessions, per-body palette commands, CSS2D label-lifecycle unification, B6 CML layer.

## Verification plan (implementation gate)

- `npm run build`, `npm run test`, `npm run lint`.
- Behavioral: toggling the coverage layer hides all coverage rects on all bodies while `CoverageStatsSection` numbers stay identical; a boot's scans layer toggles independently of the shell's; undo stack is unchanged by any layer interaction; save → toggle layers → save produces byte-identical files; hidden-layer entities are not raycast-pickable; Shift+C does nothing while a sidebar input has focus; annotation/image layer toggles rebuild without errors and re-show labels correctly.
