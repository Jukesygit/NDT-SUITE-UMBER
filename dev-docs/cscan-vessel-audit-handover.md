# C-Scan & Vessel Modeler Audit — Implementation Handover

## What's Done (Batch 1)

All on branch `feature/interactive-scan-on-vessel`, uncommitted.

### 1. Shared Colorscale Module (Issue 3.3) — COMPLETE
- Created `src/utils/colorscales.ts` — single source of truth for all colorscale definitions + interpolation
- Updated `src/components/CscanVisualizer/utils/streamedExport.ts` — removed ~100 lines of local scales + interpolation, imports from shared module
- Updated `src/components/VesselModeler/engine/heatmap-texture.ts` — removed ~70 lines of divergent scales + interpolation, imports from shared module
- **Fixed:** Jet colorscale was 6-stop in streamedExport vs 7-stop in heatmap-texture. Both now use the Plotly-sourced 6-stop definition

### 2. Removed Composite Fallback (Issue 2.3) — COMPLETE
- `src/components/CscanVisualizer/utils/workerManager.ts` — deleted `processFilesMainThread()`, throws clear error if Worker unavailable
- `src/components/CscanVisualizer/CscanVisualizer.tsx` — removed `createComposite` import, replaced both fallback blocks with error messages
- `fileParser.ts::createComposite()` is now dead code (tree-shaken). Can be deleted later

### 3. ErrorBoundary Around ThreeViewport (Issue 3.5) — COMPLETE
- `src/components/VesselModeler/VesselModeler.tsx` — ThreeViewport wrapped in `<ErrorBoundary>` with contextual fallback UI (dark theme, reload button)

---

## What Remains

### Issue 3.6 — Stop Inlining Thickness Data in Vessel Config

**Problem:** When a scan composite is imported, the full `(number|null)[][]` matrix (~8MB for 1000x1000) is stored in `vesselState.scanComposites[].data`. When the vessel is saved, this entire matrix is serialized into the `vessel_models.config` JSONB column — duplicating data already in Supabase Storage.

**Files to modify:**

1. **`src/components/VesselModeler/types.ts`** — `ScanCompositeConfig` (line ~168)
   - Split into two concepts:
     - `ScanCompositeConfig` (what's in vesselState at runtime): keeps `data`, `xAxis`, `yAxis` for rendering
     - `ScanCompositeRef` (what's serialized to DB): only `cloudId`, `name`, `indexStartMm`, `scanDirection`, `indexDirection`, `colorScale`, `rangeMin`, `rangeMax`, `opacity`

2. **`src/components/VesselModeler/VesselModeler.tsx`**
   - `saveProject()` (line ~675, serialization at ~737-752): Strip `data`, `xAxis`, `yAxis`, `stats` from scanComposites before saving. Only serialize placement params + `cloudId`
   - `loadProject()`: After loading config, re-fetch thickness data for each `cloudId` via `getScanComposite()`. Show loading state while fetching
   - `handleImportComposite()` (line ~394): No change needed — runtime state still holds full data

3. **`src/services/vessel-model-service.ts`** — No changes needed, `config` is just JSONB

**Verification:** Save a vessel with 3 composites, check that `vessel_models.config` JSON doesn't contain `data` arrays. Load the vessel back, confirm composites render correctly.

---

### Issue 2.2 — Input Validation for Vessel Dimensions

**Problem:** No runtime validation on programmatic state mutations (import from drawing, load from DB). `headRatio=0` causes division by zero at `state.id / (2 * state.headRatio)`.

**Files to modify:**

1. **`src/components/VesselModeler/engine/vessel-geometry.ts`** — Add guard at line ~355:
   ```typescript
   const HEAD_DEPTH = state.headRatio > 0 ? state.id / (2 * state.headRatio) : 0;
   ```
   Same guard at line ~64. Also in `texture-manager.ts` lines ~72, ~214, ~422.

2. **`src/components/VesselModeler/VesselModeler.tsx`** — Add a `validateVesselState()` function called on:
   - `loadProject()` after deserializing config
   - `handleDrawingImport()` after receiving Gemini extraction result
   - Clamp: `id` to [100, 20000], `length` to [100, 50000], `headRatio` to [1.5, 4.0]
   - Clamp nozzle `pos` to [-HEAD_DEPTH, length + HEAD_DEPTH], `angle` to [0, 360)

3. **`src/components/VesselModeler/SidebarPanel.tsx`** — Already has HTML min/max on sliders and headRatio is a dropdown. No UI changes needed. But nozzle pos/angle inputs (lines ~520-540) should have min/max attributes added.

**Verification:** Load a vessel model JSON with `headRatio: 0` — should be clamped to 1.5. Enter negative nozzle pos — should be clamped.

---

### Issue 2.1 — Split Rebuild into Structural/Visual/Overlay Tiers

**Problem:** Every state change (selection, preview, drag) triggers full geometry disposal + recreation in `ThreeViewport.tsx`. This is the #1 performance bottleneck.

**Current flow:**
- `ThreeViewport.tsx:380-382` — useEffect with 14 dependencies calls `rebuildScene()`
- `rebuildScene()` (lines 177-377) — disposes old vesselGroup, calls `buildVesselScene()`, adds all annotations/welds/rulers/previews, updates interaction manager mesh references

**Implementation approach:**

1. **Create `structuralStateHash(vesselState)`** — a hash/version of geometry-affecting properties only:
   ```typescript
   function structuralHash(s: VesselState): string {
     return JSON.stringify({
       id: s.id, length: s.length, headRatio: s.headRatio, orientation: s.orientation,
       nozzles: s.nozzles, liftingLugs: s.liftingLugs, saddles: s.saddles,
       textures: s.textures.map(t => ({ id: t.id, pos: t.pos, angle: t.angle, scaleX: t.scaleX, scaleY: t.scaleY, rotation: t.rotation, flipH: t.flipH, flipV: t.flipV })),
       welds: s.welds, annotations: s.annotations, rulers: s.rulers,
       coverageRects: s.coverageRects, inspectionImages: s.inspectionImages,
       scanComposites: s.scanComposites.map(sc => ({ id: sc.id, indexStartMm: sc.indexStartMm, scanDirection: sc.scanDirection, indexDirection: sc.indexDirection })),
     });
   }
   ```

2. **Split the useEffect into three:**

   **Tier 1 — Structural rebuild** (geometry changes):
   ```typescript
   const structuralRef = useRef('');
   useEffect(() => {
     const hash = structuralHash(vesselState);
     if (hash === structuralRef.current) return;
     structuralRef.current = hash;
     rebuildScene(); // full rebuild
   }, [vesselState, textureObjects]);
   ```

   **Tier 2 — Visual update** (selection/highlight swap):
   ```typescript
   useEffect(() => {
     updateSelectionHighlights(selectedNozzleIndex, selectedLugIndex, ...);
   }, [selectedNozzleIndex, selectedLugIndex, selectedSaddleIndex, selectedTextureId, selectedAnnotationId, selectedWeldIndex, selectedInspectionImageId, selectedScanCompositeId]);
   ```
   Where `updateSelectionHighlights()` traverses existing meshes and swaps material references — no geometry disposal.

   **Tier 3 — Overlay update** (preview shapes):
   ```typescript
   useEffect(() => {
     updatePreviews(previewAnnotation, previewCoverageRect, previewRuler);
   }, [previewAnnotation, previewCoverageRect, previewRuler]);
   ```
   Where `updatePreviews()` removes old preview group and adds new one — without touching the main vessel geometry.

3. **`updateSelectionHighlights()` implementation:**
   - Keep references to mesh arrays (already stored: `result.nozzleMeshes`, etc.)
   - For each entity type, iterate meshes and set `.material` based on whether its index matches the selected index
   - This is O(n) material swaps, no geometry allocation

4. **`updatePreviews()` implementation:**
   - Maintain a `previewGroupRef` — a persistent THREE.Group
   - On each call: dispose children of preview group, add new preview shapes
   - Never dispose the main vesselGroup

5. **Drag optimization:**
   - During drag, `onNozzleMoved` updates vesselState which changes the structural hash
   - This still triggers Tier 1 rebuild (correct — geometry changed)
   - **Further optimization (optional):** During active drag, defer rebuild to `requestAnimationFrame` and batch multiple moves. Set a `isDraggingRef` flag in InteractionManager, and in the structural useEffect, use `requestAnimationFrame` to coalesce updates

**Files to modify:**
- `src/components/VesselModeler/ThreeViewport.tsx` — Major refactor of lines 177-382
- `src/components/VesselModeler/engine/vessel-geometry.ts` — May need to expose per-entity material update helpers
- `src/components/VesselModeler/engine/materials.ts` — No changes

**Verification:**
1. Open vessel with 10 nozzles, 20 annotations, 3 scan composites
2. Click different nozzles rapidly — should be instant (no geometry rebuild)
3. Draw preview annotations — smooth, no stutter
4. Drag a nozzle — should rebuild but not flicker
5. Open Chrome DevTools Performance tab, record during drag — check for GC pauses and frame drops

---

### Issue 2.4 — Split SidebarPanel into Sub-Components

**Problem:** `SidebarPanel.tsx` is 2,019 lines with 11 functional sections.

**Current sections (extract each to its own file):**

| Section | Lines | Extract To |
|---------|-------|-----------|
| SliderRow + helper components | 164-256 | `src/components/VesselModeler/sidebar/SliderRow.tsx` |
| DimensionsSection | 258-312 | `sidebar/DimensionsSection.tsx` |
| VisualsSection | 314-469 | `sidebar/VisualsSection.tsx` |
| NozzleSection | 471-612 | `sidebar/NozzleSection.tsx` |
| LiftingLugSection | 614-761 | `sidebar/LiftingLugSection.tsx` |
| WeldSection | 763-920 | `sidebar/WeldSection.tsx` |
| SaddleSection | 922-995 | `sidebar/SaddleSection.tsx` |
| ImageOverlaySubSection | 997-1152 | `sidebar/ImageOverlaySection.tsx` |
| ScanCompositeSubSection | 1154-1365 | `sidebar/ScanCompositeSection.tsx` |
| AnnotationSection | 1367-1689 | `sidebar/AnnotationSection.tsx` |
| CoverageSection | 1691-1867 | `sidebar/CoverageSection.tsx` |
| InspectionImageSection | 1869-2019 | `sidebar/InspectionImageSection.tsx` |

**Approach:**
- Create `src/components/VesselModeler/sidebar/` directory
- Extract each section as a standalone component receiving only its needed props
- SidebarPanel.tsx becomes ~100-line orchestrator with accordion/tab logic
- Keep `SidebarPanelProps` interface, pass subsets to each section
- Move `loadTextureFromFile`, `NPS_PIPE_SIZES`, `LIFTING_LUG_SIZES` lookup tables into `sidebar/constants.ts`

**Verification:** Build passes. All sidebar sections render and function identically. No prop drilling issues.

---

### Issue 3.4 — Consolidate VesselModeler State into useReducer

**Problem:** VesselModeler.tsx has 30+ individual `useState` calls. Every state change re-renders the entire tree. Adding new entity types requires modifying 10+ places.

**Current state variables (VesselModeler.tsx lines 39-90):**
- `vesselState` — core vessel config
- `selectedNozzleIndex`, `selectedSaddleIndex`, `selectedTextureId`, `selectedLugIndex`, `selectedAnnotationId`, `selectedRulerId`, `selectedWeldIndex` — 7 selection states
- `selectedCoverageRectId`, `selectedInspectionImageId`, `selectedScanCompositeId` — 3 more selections
- `drawMode`, `coverageDrawMode`, `rulerDrawMode` — 3 draw modes
- `previewAnnotation`, `previewCoverageRect`, `previewRuler` — 3 previews
- `nozzlesLocked`, `saddlesLocked`, `texturesLocked`, `lugsLocked`, `weldsLocked` — 5 lock flags
- `hoverData`, `sidebarOpen`, `showDrawingImport`, `showScreenshotMode`, `viewingInspectionImageId`, `showCoveragePanel`, `showSaveDialog`, `showLoadDialog` — 8 UI states

**Approach:**
```typescript
interface VesselModelerState {
  vessel: VesselState;
  selection: {
    nozzleIndex: number;
    saddleIndex: number;
    textureId: number;
    lugIndex: number;
    annotationId: number;
    rulerId: number;
    weldIndex: number;
    coverageRectId: number;
    inspectionImageId: number;
    scanCompositeId: string;
  };
  locks: { nozzles: boolean; saddles: boolean; textures: boolean; lugs: boolean; welds: boolean };
  drawMode: { annotation: AnnotationShapeType | null; coverage: boolean; ruler: boolean };
  previews: { annotation: AnnotationShapeConfig | null; coverageRect: CoverageRectConfig | null; ruler: RulerConfig | null };
  ui: { sidebarOpen: boolean; hoverData: HoverData | null; /* etc */ };
}

type VesselAction =
  | { type: 'SET_VESSEL'; vessel: VesselState }
  | { type: 'UPDATE_VESSEL'; updates: Partial<VesselState> }
  | { type: 'SELECT_NOZZLE'; index: number }
  | { type: 'MOVE_NOZZLE'; index: number; pos: number; angle: number }
  | { type: 'DESELECT_ALL' }
  // ... etc
```

**Benefits:**
- Enables undo/redo (keep action history stack)
- Single dispatch function instead of 30+ setters passed as props
- Cleaner callback definitions

**Verification:** All interactions work identically. State changes are batched correctly. No regressions.

---

### Issue 3.2 — Single-Pass Raycasting

**Problem:** 9 separate `raycaster.intersectObjects()` calls in `onPointerDown`, each testing every triangle in its mesh set.

**File:** `src/components/VesselModeler/engine/interaction-manager.ts`, `onPointerDown()` (lines 200-409)

**Approach:**
1. Collect all interactable meshes into a single array
2. Single `raycaster.intersectObjects(allInteractables, true)` call
3. Sort results by distance (closest first)
4. Walk results, check `userData.type` for priority:
   ```typescript
   const PRIORITY: Record<string, number> = {
     annotation: 1, coverageRect: 2, inspectionImage: 3,
     texture: 4, nozzle: 5, liftingLug: 6, weld: 7, saddle: 8, scanComposite: 9,
   };
   ```
5. First hit that passes lock checks wins
6. Extract the parent walk-up logic into a helper: `findEntityParent(obj, 'nozzleIdx')`

**Verification:** Click accuracy unchanged. Priority order preserved (test: texture overlapping nozzle — texture wins). Performance: measure raycast time with 50+ objects.

---

### Issue 3.1 — Fix Heatmap Texture Caching

**Problem:** `clearHeatmapCache(id)` is called on every composite property update (line ~435 in VesselModeler.tsx) BEFORE the rebuild. The cache is always empty when `createScanCompositePlane()` runs.

**File:** `src/components/VesselModeler/engine/texture-manager.ts` (lines 348-420)

**Current cache key:** `composite.id` (string) — doesn't account for colorscale/range/opacity changes.

**Approach:**
1. Change cache key to include visual parameters:
   ```typescript
   const cacheKey = `${composite.id}_${composite.colorScale}_${composite.rangeMin}_${composite.rangeMax}_${composite.opacity}`;
   ```
2. In VesselModeler.tsx `handleUpdateScanComposite` (line ~435): **Remove** the `clearHeatmapCache(id)` call. The new cache key handles invalidation automatically — if colorscale changes, the key changes, old entry gets naturally replaced.
3. Keep `clearHeatmapCache(id)` only in `handleRemoveScanComposite` (cleanup) and `loadProject` (fresh start).
4. Add cache size limit (e.g., 10 entries) with LRU eviction to prevent memory growth.

**Verification:** Change composite colorscale — new texture generated (different cache key). Change it back — cache hit (instant). Remove composite — texture disposed.

---

## Implementation Order

1. **Issue 3.6** (data duplication) — Standalone, reduces save payload size
2. **Issue 2.2** (validation) — Standalone, prevents edge-case crashes
3. **Issue 2.1** (rebuild tiers) — Biggest perf win, depends on nothing above
4. **Issue 2.4** (SidebarPanel split) — Cleanup, easier after rebuild refactor
5. **Issue 3.4** (useReducer) — Best done after sidebar split
6. **Issue 3.2** (raycasting) — Standalone optimization
7. **Issue 3.1** (heatmap cache) — Standalone, but synergizes with rebuild tiers (fewer rebuilds = fewer cache misses)

## Build Verification

After each change: `npx tsc --noEmit` (zero errors currently).
After all changes: `npm run build` for full production build check.
