# Companion-Powered Scan Viewer — Build Plan

**Source:** `docs/plans/2026-04-16-companion-scan-viewer-design.md`
**Date:** 2026-04-16

## Overview

We're building an interactive Scan Viewer that replaces the CSV-based C-scan workflow. The companion app (Python, localhost) handles all NDE file processing and compositing. The webapp handles display, interaction, and cloud persistence. The work spans three phases: companion API endpoints, inspection panel integration (folder mapping + composite generation + save), and the full Scan Viewer page (heatmap + cursors + gate controls). Phase 1 is companion-side (Python). Phases 2-3 are webapp-side (React/TypeScript).

## Prerequisites

- Companion app codebase with existing endpoints (`/status`, `/files`, `/set-directory`, `/render-region`, `/render-ascan`, `/cscan-export`)
- Webapp running locally (`npm run dev`)
- Supabase project with `scan_composites` table and `scan-data` storage bucket already configured
- Existing service: `src/services/scan-composite-service.ts` — already stores binary Float32 blobs with gzip to Supabase Storage. Uses a NaN sentinel (`3.4028234663852886e+38`) for null values, not IEEE NaN. The new companion binary format uses IEEE NaN — we'll need to handle both at read time.
- Existing hook: `src/hooks/queries/useCompanionApp.ts` — port scanning (18923-18932), status polling, file listing
- Existing modeller import: `src/components/VesselModeler/VesselModeler.tsx:1113-1158` — `handleImportComposite()` calls `getScanComposite()` and reads `composite.thickness_data` as a 2D array

## Build Steps

---

### Phase 1: Companion App Enhancements

> These steps are all in the companion Python codebase. The webapp team can work on Phase 2 migrations and types in parallel once the endpoint contracts are agreed.

**Step 1. CORS middleware**
- **What:** Add CORS headers to all responses. Set `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET, POST, OPTIONS`, `Access-Control-Allow-Headers: Content-Type, Accept`. Handle `OPTIONS` preflight requests by returning 204 with these headers.
- **Why:** The webapp at `localhost:5173` (dev) or `matrixportal.io` (prod) is a different origin from the companion at `localhost:18925`. Without CORS, the browser blocks all requests. This is a day-one blocker.
- **Files touched:** Companion's HTTP server setup (Flask/FastAPI middleware or manual header injection)
- **Depends on:** Nothing — do this first

**Step 2. Update `GET /status` response**
- **What:** Add `apiVersion: 1` (integer) and `activeRequests: 0` (integer, count of in-flight processing requests) to the existing status response. Run the `/status` handler on a separate thread so it responds even during long composite generation.
- **Why:** The webapp needs version checking to prevent companion/webapp mismatches, and `activeRequests` to distinguish "busy" from "disconnected."
- **Files touched:** Companion's status endpoint handler
- **Depends on:** Step 1

**Step 3. `GET /folders` endpoint**
- **What:** New endpoint that scans the current base directory for subfolders containing `.nde` files. Returns `{ folders: [{ name: string, fileCount: number }], total: number }`. Accept optional query params: `query` (substring filter on folder name), `limit` (default 100), `offset` (default 0). `total` is the pre-pagination count.
- **Why:** The webapp needs to show available folders for section mapping. Pagination handles large directory trees (hundreds of subfolders).
- **Files touched:** New endpoint handler + folder scanning logic
- **Depends on:** Step 1

**Step 4. `POST /create-composite` endpoint (dual-format)**
- **What:** Accept JSON body `{ folders: string[], gateSettings: {...} }`. Read NDE files from the specified folders, generate a thickness composite using numpy. Support two response formats based on `Accept` header:
  - `application/octet-stream` (default): Structured binary body = `gzip(concat(float32_matrix, float32_xAxis, float32_yAxis))`. Headers: `X-Matrix-Width`, `X-Matrix-Height`, `X-Matrix-Dtype: float32`, `X-Stats` (JSON), `X-Source-Files` (JSON), `X-Warnings` (JSON, optional). Use IEEE NaN for null values.
  - `application/json`: Full JSON response with `data`, `xAxis`, `yAxis`, `stats`, `width`, `height`, `sourceFiles`, `warnings`. Use `null` for missing values.
- **Why:** Binary format is 10x smaller and faster to parse than JSON for large scans (10M points = ~15-25MB binary vs ~100MB JSON). JSON path exists for curl debugging. The structured binary body puts axes after the matrix to avoid HTTP header size limits.
- **Files touched:** New endpoint handler + composite generation logic (reuse existing numpy code)
- **Depends on:** Steps 1, 3 (needs folder scanning)

**Step 5. `POST /bscan-axial`, `POST /bscan-index`, `POST /ascan` endpoints**
- **What:** Three POST endpoints that accept JSON body `{ folders, scanMm, indexMm, width, height?, gateSettings }` and return binary PNG (`Content-Type: image/png`, `Cache-Control: no-store`). Use Pillow for fast rendering (not matplotlib). Include metadata in response headers: `X-Scan-Line-Mm`, `X-Index-Line-Mm`, `X-Render-Ms`. Target server-side render time: 5-15ms.
- **Why:** These power the interactive cursor views. POST avoids URL length limits for gateSettings. Pillow is 10-50x faster than matplotlib. `Cache-Control: no-store` prevents stale cached images.
- **Files touched:** Three new endpoint handlers + Pillow rendering functions
- **Depends on:** Steps 1, 4 (shares file loading infrastructure)

**Step 6. `POST /refresh-index` endpoint**
- **What:** Force-rescan the current directory for new/removed NDE files. Return `{ folders: [...], total: number, indexedAt: ISO8601 }`.
- **Why:** The companion caches its file index. Techs need to pick up newly added files mid-session.
- **Files touched:** New endpoint handler + cache invalidation
- **Depends on:** Step 3

**Step 7. Cooperative cancellation for `/create-composite`**
- **What:** The composite generation loop checks an abort flag between files. When the webapp sends an AbortController signal (connection closes), the companion sets the flag and stops processing. No partial state is persisted.
- **Why:** Composite generation for 100+ files takes 5-15s. Techs need to cancel if they picked the wrong folders.
- **Files touched:** Composite generation loop
- **Depends on:** Step 4

**Step 8. Latency benchmarking**
- **What:** Measure actual render latencies on target hardware (field laptop, i5-class CPU). Test: B-scan render end-to-end (companion → browser decode), composite generation for 50 and 100+ file folders, binary transfer for 1M and 10M point matrices.
- **Why:** The design doc targets 35-50ms end-to-end for image renders. If actual measurements exceed this, the webapp needs to adjust (lower-resolution images, different coalescing thresholds). Don't start Phase 3 heatmap work until these numbers are validated.
- **Files touched:** Test scripts (not production code)
- **Depends on:** Steps 4, 5

---

### Phase 2: Webapp — Inspection Panel Integration

> Phase 2 can start as soon as the endpoint contracts from Phase 1 are agreed — MSW mocks mean you don't need the companion running. Steps 9-12 (migrations, types, services) must be sequential. Steps 13-17 (hooks, UI) can largely run in parallel after the service layer is done.

**Step 9. Database migration: `section_folder_map` column**
- **What:** Create migration file `supabase/migrations/YYYYMMDDHHMMSS_add_section_folder_map.sql`. Add a JSONB column `section_folder_map` to `project_vessels` table with default `'{}'::jsonb`. Type: `Record<string, string[]>` — maps section type names to arrays of folder names.
- **Why:** Persists the folder-to-section mappings so they survive page refreshes and sessions.
- **Files touched:** `supabase/migrations/YYYYMMDDHHMMSS_add_section_folder_map.sql`
- **Depends on:** Nothing

**Step 10. Database migration: unique constraint + de-duplication**
- **What:** Create migration `supabase/migrations/YYYYMMDDHHMMSS_add_composite_unique_constraint.sql`. First, de-duplicate existing rows in `scan_composites`: for each `(project_vessel_id, section_type)` pair with multiple rows, keep only the most recent by `created_at` and delete the rest. Then add `UNIQUE(project_vessel_id, section_type) NULLS NOT DISTINCT`. Then add an UPDATE RLS policy: allow update if `auth.uid() = created_by` or user is org admin (check via `profiles` join).
- **Why:** The unique constraint enables atomic upsert (INSERT ... ON CONFLICT DO UPDATE), eliminating the data-loss window of delete-then-insert. De-duplication prevents migration failure on existing data.
- **Files touched:** `supabase/migrations/YYYYMMDDHHMMSS_add_composite_unique_constraint.sql`
- **Depends on:** Nothing (can run in parallel with Step 9)

**Step 11. Update types**
- **What:** In `src/types/inspection-project.ts`:
  - Add `sectionFolderMap?: Record<string, string[]>` to `UpdateVesselParams`
  - Add `section_folder_map?: Record<string, string[]>` to `ProjectVessel` type (the DB record type)
  
  Create new file `src/types/companion.ts`:
  - `CompositeData` type: `{ matrix: Float32Array, width: number, height: number, xAxis: Float32Array, yAxis: Float32Array, stats: CompositeStats, sourceFiles: SourceFile[], warnings: Warning[] }`
  - `CompositeStats` type (matches the zod schema from the design doc)
  - `SourceFile` type: `{ filename: string, minX: number, maxX: number, minY: number, maxY: number }`
  - `Warning` type: `{ filename: string, reason: string }`
  - `GateSettings` type: `{ gateMode: string, refRecovery: string, measRecovery: string, minAmplitudeRef: number, minAmplitudeMeas: number, thicknessMin: number | null, thicknessMax: number | null }`
  - `CompanionFolder` type: `{ name: string, fileCount: number }`
- **Why:** Centralizes all companion-related types. `CompositeData` uses `Float32Array` throughout — no nested JS arrays.
- **Files touched:** `src/types/inspection-project.ts`, `src/types/companion.ts` (new)
- **Depends on:** Nothing

**Step 12. Update `scan-composite-service.ts` for binary upsert**
- **What:** Three changes to `src/services/scan-composite-service.ts`:
  1. **Add `saveScanCompositeBinary(params)` function:** Accepts `{ binaryData: ArrayBuffer, stats, width, height, sourceFiles, name, organizationId, userId, projectVesselId?, sectionType? }`. Skips the Float32 encoding step (data is already binary). Compresses with gzip, uploads to `scan-data` bucket at `${organizationId}/${compositeId}.bin`, inserts/upserts metadata to DB. Uses `INSERT ... ON CONFLICT(project_vessel_id, section_type) DO UPDATE` for the upsert.
  2. **Update `getScanComposite()` return type:** Return `CompositeData` (Float32Array-based) instead of `ScanCompositeRecord` with `thickness_data: (number | null)[][]`. The function already downloads binary from storage and decodes — change it to return `Float32Array` views (using `subarray()`) instead of building a nested array. Handle both NaN sentinels: the existing `3.4028234663852886e+38` (old data) and IEEE NaN (new companion data).
  3. **Keep `saveScanComposite()` working:** Don't break the existing function — the CSV upload flow on `/cscan` still uses it. The new `saveScanCompositeBinary()` is an additional code path.
- **Why:** The binary path avoids the `Float32Array` → `(number | null)[][]` → `Float32Array` round-trip that would OOM on 10M-point scans. Keeping the old function maintains backward compatibility with the existing `/cscan` page.
- **Files touched:** `src/services/scan-composite-service.ts`
- **Depends on:** Steps 10, 11

**Step 13. Update `inspection-project-service.ts` for folder map**
- **What:** In `src/services/inspection-project-service.ts`, update `updateProjectVessel()` to include `section_folder_map` in the Supabase update payload when `params.sectionFolderMap` is provided.
- **Why:** Persists the folder-to-section pairings to the DB.
- **Files touched:** `src/services/inspection-project-service.ts`
- **Depends on:** Steps 9, 11

**Step 14. Binary response parser + zod validation**
- **What:** Create `src/services/companion-service.ts` with:
  - `COMPANION_BASE_URL` derived from the port (use the existing `useCompanionApp` port discovery)
  - `MIN_COMPANION_VERSION = 1`, `MAX_COMPANION_VERSION = 1`
  - `parseCompositeResponse(response: Response): Promise<CompositeData>` — parses the structured binary body (matrix + xAxis + yAxis by offset) and validates metadata headers with zod schemas (see design doc Data Validation section). Uses `Float32Array.subarray()` for zero-copy views.
  - `fetchCompanionFolders(port, query?, limit?, offset?)` — calls `GET /folders`
  - `fetchComposite(port, folders, gateSettings)` — calls `POST /create-composite` with `Accept: application/octet-stream`
  - `fetchBscanAxial(port, params)`, `fetchBscanIndex(port, params)`, `fetchAscan(port, params)` — POST image endpoints, return blob URLs
  - `refreshIndex(port)` — calls `POST /refresh-index`
  - Zod schemas: `CompositeStatsSchema`, `SourceFilesSchema`, `WarningsSchema` (as specified in design doc)
- **Why:** Centralizes all companion API communication. Validates responses before use to prevent silent corruption from companion bugs.
- **Files touched:** `src/services/companion-service.ts` (new)
- **Depends on:** Step 11

**Step 15. Companion query/mutation hooks**
- **What:** Create two files:
  
  `src/hooks/queries/useCompanionFolders.ts`:
  ```typescript
  export function useCompanionFolders(port: number | null, query?: string) {
    return useQuery({
      queryKey: ['companion-folders', port, query],
      queryFn: () => fetchCompanionFolders(port!, query),
      enabled: !!port,
      staleTime: 30_000,
    });
  }
  ```
  
  `src/hooks/mutations/useCompanionMutations.ts`:
  ```typescript
  export function useCompanionComposite() {
    return useMutation({
      mutationFn: (params: { port: number; folders: string[]; gateSettings: GateSettings }) =>
        fetchComposite(params.port, params.folders, params.gateSettings),
    });
  }
  ```
- **Why:** Follows the project's existing React Query patterns (`src/hooks/queries/` and `src/hooks/mutations/`).
- **Files touched:** `src/hooks/queries/useCompanionFolders.ts` (new), `src/hooks/mutations/useCompanionMutations.ts` (new)
- **Depends on:** Step 14

**Step 16. MSW companion mocks**
- **What:** Create `src/test/mocks/companion-handlers.ts` with MSW handlers for all companion endpoints. The `/create-composite` mock must return a binary `ArrayBuffer` with correct headers (not JSON) — this ensures tests exercise the production code path. Build a `mockBinaryCompositeBuffer` helper that creates a valid structured binary payload (Float32 matrix + xAxis + yAxis). Include mocks for `/status`, `/folders`, `/bscan-axial`, `/bscan-index`, `/ascan`, `/refresh-index`.
- **Why:** Enables testing all companion-dependent features without a running companion app. Binary mocks catch parsing bugs that JSON mocks would miss.
- **Files touched:** `src/test/mocks/companion-handlers.ts` (new)
- **Depends on:** Step 14

**Step 17. Section-folder pairing UI in ScopeSection**
- **What:** Modify `src/components/projects/inspection-detail/ScopeSection.tsx` to add folder pairing UI when the companion is connected:
  - Use `useCompanionApp()` to check connection status
  - Use `useCompanionFolders(port)` to fetch available folders
  - For each vessel section (the sections are already listed in this component), show a searchable multi-select dropdown of companion folders
  - Persist selections via `useUpdateProjectVessel()` mutation, updating `sectionFolderMap`
  - "Refresh folders" button that calls `refreshIndex()` + refetches the query
  - Show last-indexed timestamp from `POST /refresh-index` response
  - Validate stored folder mappings against current folder list — show warning badge on stale mappings
  - When companion is disconnected, show pairing UI as disabled with message: "Connect companion app to enable scan controls"
- **Why:** This is the entry point for the new workflow — techs map folders to sections before generating composites.
- **Files touched:** `src/components/projects/inspection-detail/ScopeSection.tsx`
- **Depends on:** Steps 13, 15

**Step 18. Generate composite + inline preview + save**
- **What:** Add to the ScopeSection (or a new child component `CompanionCompositePanel`):
  - "Generate Composite" button per section (visible when folders are mapped and companion is connected). Only enabled for editor+ roles.
  - On click: if section already has a composite, show ConfirmDialog ("This will replace..."). Then call `useCompanionComposite().mutate()`.
  - Show loading indicator with file count during generation (cancellable via AbortController).
  - On success: save to cloud via `saveScanCompositeBinary()` through a new `useSaveScanCompositeBinary()` mutation hook. This does atomic upsert.
  - Inline preview: small 200x100 canvas thumbnail rendered from the composite stats (min/max → color gradient) + stats text (min/max/mean thickness) + source file count + "Open in Viewer" button (links to `/projects/:projectId/vessels/:vesselId/viewer?section=Shell`).
  - After save, invalidate `['projectScanComposites']` and `['scanComposites']` query keys.
- **Why:** This completes the inspection panel integration — techs can generate, preview, and save composites without leaving the inspection detail page.
- **Files touched:** `src/components/projects/inspection-detail/ScopeSection.tsx` (or new child component), `src/hooks/mutations/useScanCompositeMutations.ts` (add `useSaveScanCompositeBinary`)
- **Depends on:** Steps 12, 15, 17

**Step 19. Update 3D modeller for binary format**
- **What:** Update `handleImportComposite` in `src/components/VesselModeler/VesselModeler.tsx` (lines 1113-1158). The `getScanComposite()` now returns `CompositeData` with `Float32Array` fields instead of `ScanCompositeRecord` with `thickness_data: (number | null)[][]`. Update the `ScanCompositeConfig` construction:
  - `data: composite.thickness_data` → `data: composite.matrix` (a `Float32Array`)
  - `xAxis: composite.x_axis` → `xAxis: Array.from(composite.xAxis)` (convert Float32Array to regular array if the modeller's type requires it)
  - `yAxis: composite.y_axis` → `yAxis: Array.from(composite.yAxis)`
  
  Check if `ScanCompositeConfig.data` type needs updating to accept `Float32Array | (number | null)[][]`. Update the modeller's heatmap rendering to handle `Float32Array` (check for NaN instead of null).
- **Why:** The `getScanComposite()` return type changed — the modeller must consume the new format.
- **Files touched:** `src/components/VesselModeler/VesselModeler.tsx`, possibly `ScanCompositeConfig` type definition
- **Depends on:** Step 12

**Step 20. Phase 2 tests**
- **What:** Write tests for:
  - `parseCompositeResponse()` — binary payload parsing, offset math, handles malformed data
  - `saveScanCompositeBinary()` — round-trip: save → fetch → verify data matches (using MSW + mock Supabase)
  - `useCompanionFolders` — fetches, handles search, handles disconnect
  - `useCompanionComposite` — generates composite, validates binary response, handles cancellation
  - Folder pairing UI — select/deselect folders, persist, stale mapping warning
- **Why:** The binary parsing path is where bugs will hide. Test it before building the viewer on top.
- **Files touched:** `src/test/` new test files
- **Depends on:** Steps 14-18

---

### Phase 3: Webapp — Scan Viewer Page

> Phase 3 builds on Phase 2's service layer and hooks. Steps 21-23 (route, page shell, reducer) are sequential. Steps 24-30 (components) can be built in parallel once the page shell exists. Steps 31-34 (integration) are sequential at the end.

**Step 21. Route setup**
- **What:** In `src/App.tsx`, add a new lazy-loaded route:
  ```typescript
  const ScanViewerPage = lazy(() => import('./pages/projects/ScanViewerPage'));
  ```
  Add route inside the existing projects section (after the vessel detail route, ~line 175):
  ```typescript
  <Route path="/projects/:projectId/vessels/:vesselId/viewer" element={
    <RequireTabVisible tabId="tools">
      <ErrorBoundary><ScanViewerPage /></ErrorBoundary>
    </RequireTabVisible>
  } />
  ```
- **Why:** Follows existing routing conventions. Same guards as the vessel detail route.
- **Files touched:** `src/App.tsx`
- **Depends on:** Nothing (can start as soon as Phase 2 types exist)

**Step 22. `ScanViewerPage` route shell**
- **What:** Create `src/pages/projects/ScanViewerPage.tsx` (< 150 lines). Uses `useParams()` for `projectId` and `vesselId`. Uses `useSearchParams()` for `section` query param. Contains a `useReducer` with `ScanViewerState` and `ScanViewerAction` types (as specified in design doc). Fetches vessel data via `useProjectVessel(vesselId)` and composites via `useProjectScanComposites([vesselId])`. Defaults `selectedSection` to the first section with a composite if `?section` is missing. Renders the layout grid with placeholder divs for each panel.
- **Why:** Establishes the state management foundation. All child components read state and dispatch actions — no prop drilling.
- **Files touched:** `src/pages/projects/ScanViewerPage.tsx` (new)
- **Depends on:** Step 21

**Step 23. `useCompanionImage` hook**
- **What:** Create `src/hooks/queries/useCompanionImage.ts`. This hook implements request coalescing:
  - Maintains one `AbortController` per image type (bscan-axial, bscan-index, ascan)
  - When params change (cursor position, gate settings): abort in-flight request, send new request immediately
  - On response: create blob URL via `URL.createObjectURL()`, revoke previous blob URL
  - Track consecutive slow responses (>100ms) — after 3, set `degraded: true` flag
  - Every 30s in degraded mode, attempt one probe request — re-enable if <50ms
  - On unmount: abort all in-flight requests, revoke all blob URLs
  - Returns: `{ blobUrl: string | null, isLoading: boolean, degraded: boolean }`
- **Why:** Request coalescing naturally adapts to companion speed without fixed throttle intervals. Blob URL lifecycle management prevents memory leaks.
- **Files touched:** `src/hooks/queries/useCompanionImage.ts` (new)
- **Depends on:** Step 14

**Step 24. Web Worker: `heatmap-renderer.worker.ts`**
- **What:** Create `src/workers/heatmap-renderer.worker.ts`. The worker accepts messages:
  ```typescript
  type WorkerMessage = {
    id: number;  // for stale-result detection
    matrix: Float32Array;  // transferred, not copied
    width: number;
    height: number;
    viewportWidth: number;
    viewportHeight: number;
    colormap: string;  // 'viridis' | 'jet' | 'plasma' | 'okabe-ito'
    visibleRegion?: { x0: number; y0: number; x1: number; y1: number };  // data coordinates
  };
  ```
  The worker:
  1. Builds a 256-entry colormap LUT (RGBA Uint8Array) from the named colormap
  2. Computes the visible data window (or full matrix if no region specified)
  3. Downsamples to viewport dimensions using NaN-aware average pooling: each output pixel = mean of valid (non-NaN) source pixels in bin. All-NaN bins → transparent.
  4. At 1:1 or zoomed-in: nearest-neighbor (direct value lookup, no interpolation)
  5. Writes result to an `ImageData` and transfers it back
  
  Returns `{ id: number, imageData: ImageData }` (ImageData is transferred).
- **Why:** The 80-100ms initial render for 10M points blocks the main thread. A Web Worker keeps the UI responsive. Transfer (not copy) of Float32Array and ImageData avoids doubling memory.
- **Files touched:** `src/workers/heatmap-renderer.worker.ts` (new), `vite.config.ts` (may need worker config)
- **Depends on:** Step 11 (types)

**Step 25. `useHeatmapRenderer` hook**
- **What:** Create `src/hooks/useHeatmapRenderer.ts`. Manages the singleton Web Worker:
  - Creates worker on first call, reuses across section switches
  - Terminates worker on cleanup (returned from hook)
  - Accepts: `{ matrix, width, height, viewportWidth, viewportHeight, colormap, visibleRegion }`
  - Sends message to worker with incrementing `id`
  - On worker response: if `id` matches latest request, call `onRender(imageData)` callback. Otherwise discard (stale result).
  - Returns: `{ requestRender: (params) => void, isRendering: boolean }`
- **Why:** Encapsulates Web Worker lifecycle. The `id`-based stale detection handles rapid section switches without race conditions.
- **Files touched:** `src/hooks/useHeatmapRenderer.ts` (new)
- **Depends on:** Step 24

**Step 26. `useZoomPan` hook**
- **What:** Create `src/hooks/useZoomPan.ts`. Manages zoom/pan state as absolute values:
  ```typescript
  type ZoomPanState = { zoom: number; centerX: number; centerY: number };
  ```
  - `onWheel`: adjust `zoom` (clamped to min/max), recompute `centerX`/`centerY` to zoom toward cursor
  - `onMouseDown` + `onMouseMove` + `onMouseUp`: drag to pan (update center)
  - Derives CSS transform string: `scale(${zoom}) translate(${tx}px, ${ty}px)`
  - Provides coordinate mapping: `pixelToData(px, py) → { scanMm, indexMm }` and `dataToPixel(scanMm, indexMm) → { px, py }`
  - Returns: `{ transform: string, zoom, pixelToData, dataToPixel, handlers: { onWheel, onMouseDown, ... } }`
  - Transform is computed from absolute state, not accumulated — prevents floating-point drift.
- **Why:** Separates zoom/pan logic from the heatmap component. CSS transforms are GPU-composited — zero JS cost per frame.
- **Files touched:** `src/hooks/useZoomPan.ts` (new)
- **Depends on:** Nothing

**Step 27. `CscanHeatmap` component**
- **What:** Create `src/components/projects/scan-viewer/CscanHeatmap.tsx` (~120 lines). Two stacked `<canvas>` elements in a container `<div>`:
  - Canvas 1 (heatmap): receives `ImageData` from `useHeatmapRenderer`, applies CSS transform from `useZoomPan`
  - Canvas 2 (overlay): draws crosshair cursors (2 lines), same CSS transform. Sized to match heatmap logical dimensions (not viewport) to save memory.
  - Mouse handlers on the container: click/drag to move crosshairs (dispatch `UPDATE_CURSOR`), wheel to zoom, drag to pan (when not on crosshair)
  - Keyboard: arrow keys nudge cursor by 1mm (dispatch `UPDATE_CURSOR`)
  - Coordinate readout: DOM element in top-right corner showing `Scan: X mm | Index: Y mm | Thickness: Z mm`. Updated via `ref.current.textContent` (direct DOM mutation, not React state) for zero-overhead during drag.
  - On colormap change: re-request render from worker with new colormap
  - On zoom settle (debounced 150ms): re-request render with `visibleRegion` for current viewport
- **Why:** Two-layer canvas separates fast updates (cursor: 0.1ms) from slow updates (heatmap: 2-100ms). DOM readout avoids React re-renders during drag.
- **Files touched:** `src/components/projects/scan-viewer/CscanHeatmap.tsx` (new)
- **Depends on:** Steps 25, 26

**Step 28. `HeatmapColorBar` and `HeatmapAxes` components**
- **What:**
  - `src/components/projects/scan-viewer/HeatmapColorBar.tsx` (~40 lines): DOM element showing a vertical gradient bar with tick labels (min/max thickness values). Uses a `<canvas>` for the gradient (256px tall, 20px wide) and DOM `<span>` elements for ticks. Responds to colormap and range changes.
  - `src/components/projects/scan-viewer/HeatmapAxes.tsx` (~50 lines): DOM-positioned axis labels around the heatmap. Shows scan axis (mm) on bottom, index axis (mm) on left. Updates positions when zoom/pan changes. Uses design system tokens for text styling.
- **Why:** DOM elements give crisp text rendering and accessibility. Canvas gradient is a one-time render.
- **Files touched:** `src/components/projects/scan-viewer/HeatmapColorBar.tsx` (new), `src/components/projects/scan-viewer/HeatmapAxes.tsx` (new)
- **Depends on:** Step 27 (needs zoom/pan state)

**Step 29. `BscanStrip` and `AscanWaveform` components**
- **What:**
  - `src/components/projects/scan-viewer/BscanStrip.tsx` (~60 lines): Receives `type` ('axial' | 'index'), cursor position, companion port, gate settings. Uses `useCompanionImage` hook. Renders `<img src={blobUrl} />`. Shows "Companion disconnected" overlay when companion is down. Wrapped in `ErrorBoundary` in parent.
  - `src/components/projects/scan-viewer/AscanWaveform.tsx` (~50 lines): Same pattern as BscanStrip but for A-scan. Uses `useCompanionImage` with type 'ascan'.
- **Why:** Simple `<img>` components — all rendering happens in the companion. The hook handles coalescing and lifecycle.
- **Files touched:** `src/components/projects/scan-viewer/BscanStrip.tsx` (new), `src/components/projects/scan-viewer/AscanWaveform.tsx` (new)
- **Depends on:** Step 23

**Step 30. Gate controls sidebar**
- **What:** Four files:
  - `src/components/projects/scan-viewer/GateControlsSidebar.tsx` (~80 lines): Collapsible sidebar container. Renders `GateInputGroup` x3, `MeasurementControls`, `FilterControls`. Read-only mode for viewer role (check via `useAuth()`).
  - `src/components/projects/scan-viewer/GateInputGroup.tsx` (~60 lines): Per-gate controls — threshold slider/input. Dispatches `UPDATE_GATE_SETTINGS` on change. Props: `gateName: 'I' | 'A' | 'B'`, `value`, `readOnly`.
  - `src/components/projects/scan-viewer/MeasurementControls.tsx` (~50 lines): Dropdowns for measurement mode (A-I, B-A), recovery mode (crossing only, peak fallback). Dispatches `UPDATE_GATE_SETTINGS`.
  - `src/components/projects/scan-viewer/FilterControls.tsx` (~50 lines): Amplitude filter inputs (min amplitude per gate), thickness min/max inputs. Dispatches `UPDATE_GATE_SETTINGS`.
- **Why:** Decomposed to stay under 300-line limit. Each sub-component owns its form inputs and dispatches to the parent reducer.
- **Files touched:** 4 new files in `src/components/projects/scan-viewer/`
- **Depends on:** Step 22 (needs reducer dispatch)

**Step 31. `SectionSelector` and `ScanViewerToolbar`**
- **What:**
  - `src/components/projects/scan-viewer/SectionSelector.tsx` (~40 lines): Dropdown in the page header. Lists vessel sections that have composites. Syncs with `?section=` query param via `useSearchParams`. Dispatches `SELECT_SECTION`.
  - `src/components/projects/scan-viewer/ScanViewerToolbar.tsx` (~60 lines): Bottom toolbar with:
    - "Re-generate" button (editor+, disabled if companion disconnected, cancellable)
    - "Save to Cloud" button (editor+)
    - Unsaved changes indicator (yellow dot when `gateSettings !== savedGateSettings`)
    - Color scale selector dropdown
    - "Try live mode" toggle (visible only in degraded mode)
- **Why:** Keeps the page shell thin by extracting toolbar and section logic into focused components.
- **Files touched:** 2 new files in `src/components/projects/scan-viewer/`
- **Depends on:** Step 22

**Step 32. `useScanViewerDirty` hook**
- **What:** Create `src/hooks/useScanViewerDirty.ts`:
  - Compares `gateSettings` vs `savedGateSettings` (deep equality)
  - When dirty: registers `beforeunload` handler, saves draft to `localStorage` at key `scan-viewer-draft:${projectId}:${vesselId}:${section}` (debounced 2s)
  - On mount: checks for existing draft. If found, returns `{ hasDraft: true, draftTimestamp }` so the page can show a restore banner.
  - `restoreDraft()`: reads from localStorage, dispatches `UPDATE_GATE_SETTINGS`
  - `discardDraft()`: removes from localStorage
  - On save success (via `MARK_SAVED` action): clears draft from localStorage
- **Why:** Prevents accidental loss of gate settings from tab closure or navigation.
- **Files touched:** `src/hooks/useScanViewerDirty.ts` (new)
- **Depends on:** Step 22

**Step 33. Wire up `ScanViewerPage`**
- **What:** Fill in the `ScanViewerPage` layout with all the components built in steps 27-32:
  - Left sidebar: `GateControlsSidebar`
  - Main area top: `CscanHeatmap` with `HeatmapColorBar` and `HeatmapAxes`
  - Main area middle: two `BscanStrip` components (axial + index) side by side
  - Main area bottom: `AscanWaveform`
  - Header: `SectionSelector`
  - Footer: `ScanViewerToolbar`
  - Each panel wrapped in its own `ErrorBoundary`
  - Load composite data on mount: if companion connected, load from companion via section's folder mapping. If not, load from Supabase via `getScanComposite()`.
  - Section switch: cleanup previous canvases (set width=0), revoke blob URLs, load new section's composite
  - Draft restore banner at top when `useScanViewerDirty` detects a saved draft
  - Companion disconnect handling: show reconnection banner, freeze B-scan/A-scan, keep heatmap interactive
- **Why:** This is the final assembly. Each component is already tested individually.
- **Files touched:** `src/pages/projects/ScanViewerPage.tsx`
- **Depends on:** Steps 27-32

**Step 34. Phase 3 tests**
- **What:** Write tests for:
  - `useCompanionImage` — coalescing behavior, abort on unmount, blob URL lifecycle, degraded mode detection + recovery
  - `useHeatmapRenderer` — Web Worker message passing, stale result discard, colormap LUT generation
  - `useZoomPan` — coordinate mapping correctness, transform computation from absolute state
  - `useScanViewerDirty` — dirty detection, localStorage draft save/restore, beforeunload
  - `ScanViewerPage` — reducer state transitions, section switching, error boundary isolation
  - `GateControlsSidebar` — input validation, read-only for viewers
  - LOD downsampling — NaN handling at different zoom levels (unit test the worker's downsampling function directly)
- **Why:** The heatmap rendering and request coalescing are the hardest parts to get right. Test them thoroughly.
- **Files touched:** `src/test/` new test files
- **Depends on:** Steps 23-33

---

### Phase 4: Deprecation

**Step 35. Deprecation banner on `/cscan`**
- **What:** Add a dismissable banner at the top of the existing CScanPage: "The new Scan Viewer is available — open it from any inspection's Scope section. [Learn more]". Banner state saved to `localStorage` so it stays dismissed.
- **Why:** Guides techs to the new workflow without removing the old one.
- **Files touched:** `src/pages/CScanPage.tsx`
- **Depends on:** Phase 3 complete and validated

**Step 36. Remove `/cscan` page**
- **What:** After adoption is confirmed: remove `CScanPage` and associated components, remove the route from `App.tsx`, remove any compositor-specific services/hooks that aren't shared.
- **Why:** Dead code removal. Only after the new workflow is proven.
- **Files touched:** Multiple files — page, route, components
- **Depends on:** Step 35 + adoption monitoring

---

## Verification

After Phase 2 is complete:
1. Open an inspection detail page with companion running
2. Map folders to a vessel section in the ScopeSection
3. Click "Generate Composite" — verify loading indicator, cancellation works
4. Verify inline preview shows thumbnail + stats
5. Verify composite saved to cloud (check `scan_composites` table + `scan-data` bucket)
6. Open the 3D modeller, import the companion-generated composite — verify it renders correctly
7. Run `npm run test` — all tests pass
8. Run `npm run build` — no type errors

After Phase 3 is complete:
1. Click "Open in Viewer" from the inspection panel
2. Verify C-scan heatmap renders with correct color scale
3. Drag crosshairs — verify B-scan and A-scan update in real-time
4. Zoom/pan the heatmap — verify smooth CSS transitions + LOD re-render
5. Change gate settings — verify "unsaved changes" indicator appears
6. Click "Re-generate" — verify new composite loads
7. Click "Save to Cloud" — verify dirty state clears
8. Close tab — verify `beforeunload` warning when dirty
9. Reopen — verify draft restore banner appears
10. Disconnect companion — verify heatmap stays interactive, B-scan/A-scan show "disconnected" overlay
11. Reconnect companion — verify automatic reconnection toast
12. Test with a 10M+ point scan — verify heatmap renders without freezing, memory stays under 100MB
13. Test as viewer role — verify gate controls are read-only, generate/save buttons disabled
14. Run `npm run test` — all tests pass
15. Run `npm run build` — no type errors
