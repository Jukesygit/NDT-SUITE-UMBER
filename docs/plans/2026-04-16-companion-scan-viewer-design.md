# Companion-Powered Scan Viewer — Design Document

**Date:** 2026-04-16
**Status:** Approved design, pre-implementation

## Problem

The current C-scan workflow requires techs to manually export CSVs from NDE files, upload them to the webapp's compositor (`/cscan`), create composites, and save to cloud. The companion app already has direct access to raw NDE files and can extract C-scans in ~0.02s per file. Maintaining two parallel processing paths (CSV upload in webapp + companion for A/B-scan rendering) is redundant.

Additionally, techs need interactive gate/cursor manipulation (like OmniPC) to properly evaluate scan data — adjusting gates, viewing A-scans and B-scans at specific locations, and re-generating composites with different settings. This level of interaction doesn't exist in the current webapp.

## Solution

1. **Move compositing to the companion app** — it reads NDE files natively and composites with numpy, eliminating the CSV export step entirely
2. **Build a full-screen Scan Viewer page** in the webapp with interactive gate controls and cursor-driven B-scan/A-scan inspection, powered by the companion app's localhost API
3. **Integrate with the inspection panel** — assign folders to a vessel section, generate composite, preview inline, open viewer for detailed gate work
4. **Deprecate the current `/cscan` compositor page** once the new workflow is adopted, then remove it

> **Note:** This workflow trades CSV simplicity for interactive power — techs gain gate adjustment, B-scan/A-scan inspection, and re-generation capabilities that don't exist in the current upload-based flow. The setup cost (companion running + folder pairing) is a one-time-per-session overhead.

## Architecture

```
┌─ Webapp (browser) ──────────────────────────────────────┐
│                                                          │
│  Inspection Detail Page                                  │
│  ├── Section ↔ Folder(s) pairing UI (many-to-one)       │
│  ├── Generates composite on user action                 │
│  └── Inline preview (thumbnail + stats + "Open Viewer") │
│                                                          │
│  Scan Viewer Page                                       │
│  (/projects/:projectId/vessels/:vesselId/viewer)        │
│  ├── C-scan heatmap with draggable crosshair cursors    │
│  ├── B-scan strips (axial + index, update on drag)      │
│  ├── A-scan waveform (update on click/drag)             │
│  ├── Filter-based gate controls (v1 scope)              │
│  ├── Re-generate composite with adjusted gates          │
│  └── Save to cloud                                      │
│                                                          │
├──── localhost API calls (instant, no internet) ─────────┤
│                                                          │
│  Companion App (Python, localhost)                       │
│  ├── Subfolder scanning + file indexing                  │
│  ├── Per-section composite generation (numpy)           │
│  ├── Fast Pillow renders for interactive cursors        │
│  ├── Matplotlib renders for export-quality images       │
│  ├── Full gate engine (re-gating where data allows)     │
│  └── CSV batch export (standalone, kept as-is)          │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Companion does all processing** | Webapp is display + interaction + cloud persistence only. Companion has numpy, h5py, direct file access — no reason to duplicate in browser. |
| **Localhost API, no internet dependency** | All companion ↔ webapp communication is loopback (~1ms). Techs on rigs with bad internet get full interactive performance. Only cloud save needs connectivity. Companion sets `Access-Control-Allow-Origin: *` and handles `OPTIONS` preflight — required because the webapp origin (`localhost:5173` in dev, `matrixportal.io` in prod) differs from the companion origin (`localhost:18925`). |
| **Binary image endpoints use POST, not GET** | Companion serves B-scan/A-scan as binary PNG via `POST` endpoints (not base64 in JSON). Browser decodes images natively off main thread — eliminates JSON parse + base64 decode overhead (~15ms saved per request). `POST` avoids URL length limits from encoding `gateSettings` as query params (GET URLs truncate at ~2-8KB depending on server/proxy). |
| **Request coalescing, not fixed throttle** | Webapp maintains at most ONE in-flight companion request per image type. New cursor position aborts the current request and sends immediately. No fixed 30ms throttle — naturally adapts to companion speed (fast companion = more updates, slow = fewer but always latest). |
| **Pillow for interactive renders, matplotlib for export** | Matplotlib is 100-250ms per image (too slow for drag). Pillow + numpy colormap is 5-10ms server-side, but realistic end-to-end (render + network + browser decode) is **35-50ms**. "Save to Cloud" saves the composite data matrix, not rendered images. Existing `/render-region` endpoint (matplotlib) remains available for export quality. |
| **Folders-to-section mapping (many-to-one)** | Techs may organize NDE files by section, date, scan pass, or instrument. Webapp allows pairing **multiple folders to one section** — no assumption about folder structure. Explicit user assignment, no auto-guessing. |
| **Per-section gate settings** | Different sections can have different coating, geometry, and conditions. Each section gets independent gate configuration. |
| **Upsert composites via UPDATE RLS policy** | New UPDATE RLS policy on `scan_composites` enables atomic upsert (INSERT ... ON CONFLICT DO UPDATE). Eliminates the delete-then-insert race condition where data is lost if insert fails after delete. |
| **Validate all companion responses** | Webapp validates companion API responses with zod schemas before use — dimension consistency, stats plausibility, required fields. Prevents silent corruption from companion bugs or version mismatches. |
| **Binary transfer for composite data** | Composite matrices can reach 10M+ points. JSON would be ~100MB / ~1s parse time. Binary format (`Float32Array` with `NaN` for null, gzip-compressed) is ~15-25MB / ~80ms parse — 10x faster. Metadata (stats, source files, axes) travels in HTTP headers as JSON. Webapp requests binary via `Accept: application/octet-stream`; JSON fallback exists for debugging. |
| **Two-layer Canvas + DOM for heatmap** | Plotly.js adds ~800KB bundle + ~15MB runtime for features we'd fight against (dragmode conflicts with crosshairs, full-trace redraws on zoom). Two stacked canvases (static heatmap layer + cursor overlay) give sub-ms cursor redraws, GPU-composited CSS zoom/pan, and full control over future interactions (measurement annotations, gate overlays, region selection). DOM elements handle axis labels and color bar — crisp text, accessible, styled with design tokens. |
| **LOD rendering for large scans** | A 10M-point matrix doesn't mean 10M pixels rendered. The viewport is ~1920×1080 at most. The heatmap renders only viewport-resolution ImageData regardless of matrix size, downsampling at the current zoom level. Pan/zoom re-slices the visible region. The full matrix stays in memory for coordinate lookups but never goes through `putImageData` in full. |
| **Deprecate, don't remove immediately** | Current `/cscan` page stays until new workflow is proven. Handles edge case of reviewing previously exported CSVs without companion app running. |

## Companion App API Changes

### New Endpoints

**1. Subfolder listing**
```
GET /folders?query=&limit=100&offset=0
→ {
    "folders": [
      { "name": "Dome 1", "fileCount": 12 },
      { "name": "Dome 2", "fileCount": 8 },
      { "name": "Shell", "fileCount": 45 },
      { "name": "Nozzle A", "fileCount": 3 }
    ],
    "total": 4
  }
```

Returns subfolders in the currently set directory that contain `.nde` files. Includes file count per folder so the webapp can show expected scope before compositing. Supports optional `query` (substring match on folder name), `limit`, and `offset` parameters for large directory trees. The `total` field reports the full count before pagination, so the UI can show "Showing 20 of 350 folders" and provide a search field.

**2. Composite generation (dual-format response)**

```
POST /create-composite
Request headers:
  Content-Type: application/json
  Accept: application/octet-stream  (binary, default)
     — or —
  Accept: application/json          (for debugging/small scans)

Request body:
{
  "folders": ["Shell", "Shell_Pass2"],
  "gateSettings": {
    "gateMode": "A-I",
    "refRecovery": "peak_fallback",
    "measRecovery": "crossing_only",
    "minAmplitudeRef": 0,
    "minAmplitudeMeas": 0,
    "thicknessMin": null,
    "thicknessMax": null
  }
}
```

**Binary response** (`Accept: application/octet-stream`) — used by the webapp for all production requests:

```
Response headers:
  Content-Type: application/octet-stream
  Content-Encoding: gzip
  X-Matrix-Width: 1001
  X-Matrix-Height: 503
  X-Matrix-Dtype: float32
  X-Stats: {"min":10.2,"max":21.8,...}      (JSON object, ~200 bytes)
  X-Source-Files: [{"filename":"NEV H-0310-2 4000-4500.nde","minX":0,"maxX":1000,"minY":4000,"maxY":4502}]
  X-Warnings: [{"filename":"bad.nde","reason":"..."}]  (optional)

Response body (structured binary, gzip-compressed):
  ┌─────────────────────────────────────────────────────────┐
  │ Float32 matrix (width × height values, row-major)       │
  │ NaN = no data                                           │
  ├─────────────────────────────────────────────────────────┤
  │ Float32 xAxis (width values)                            │
  ├─────────────────────────────────────────────────────────┤
  │ Float32 yAxis (height values)                           │
  └─────────────────────────────────────────────────────────┘
```

The body contains three contiguous Float32 arrays: matrix data, then xAxis, then yAxis. Byte offsets are computed from the `X-Matrix-Width` and `X-Matrix-Height` headers:
- Matrix: bytes `0` to `width * height * 4`
- xAxis: bytes `width * height * 4` to `(width * height + width) * 4`
- yAxis: bytes `(width * height + width) * 4` to `(width * height + width + height) * 4`

This avoids putting axis arrays in HTTP headers, which would exceed header size limits for large scans (a 5000-column axis = ~35KB, beyond nginx's 8KB default). Stats, source files, and warnings remain in headers — they're small JSON objects (~200 bytes to ~2KB).

On the companion side: `gzip(np.concatenate([matrix, xAxis, yAxis]).astype(np.float32).tobytes())`. On the webapp side: parse the `ArrayBuffer` into three `Float32Array` views by offset. `NaN` (IEEE 754) represents null/no-data values — `Float32Array` supports this natively. The browser handles `Content-Encoding: gzip` decompression automatically.

**Size comparison at scale:**

| Matrix size | JSON response | Binary + gzip | Parse time (JSON) | Parse time (binary) |
|-------------|--------------|---------------|-------------------|-------------------|
| 500K points (1001×503) | ~5MB | ~1-2MB | ~50ms | ~15ms |
| 5M points (5000×1000) | ~50MB | ~8-15MB | ~500ms | ~50ms |
| 10M points (5000×2000) | ~100MB | ~15-25MB | ~1000ms | ~80ms |

The webapp always requests binary. The browser handles `Content-Encoding: gzip` decompression automatically via the fetch API — no manual decompression needed.

**JSON response** (`Accept: application/json`) — exists for `curl` debugging and companion development:

```json
{
  "data": [[15.2, 15.3, null, ...], ...],
  "xAxis": [0.0, 1.0, 2.0, ...],
  "yAxis": [4000.0, 4001.0, ...],
  "stats": {
    "min": 10.2, "max": 21.8, "mean": 18.4, "median": 19.1,
    "stdDev": 2.3, "validPoints": 350000, "totalPoints": 502000,
    "totalArea": 502000.0, "validArea": 350000.0,
    "ndPercent": 30.3, "ndCount": 152000, "ndArea": 152000.0
  },
  "width": 1001, "height": 503,
  "sourceFiles": [{ "filename": "NEV H-0310-2 4000-4500.nde", "minX": 0, "maxX": 1000, "minY": 4000, "maxY": 4502 }],
  "warnings": []
}
```

Both formats map to the same `SaveScanCompositeParams` fields (`thicknessData`, `xAxis`, `yAxis`, `stats`, `sourceFiles`, `width`, `height`). The webapp supplies the remaining params at save time: `name` (auto-generated from section + folder), `organizationId` and `userId` (from auth context), `projectVesselId` (from route), `sectionType` (from vessel section).

Note on stats: `totalArea`/`validArea` are in mm² (computed from point count × point spacing²) and may differ from `totalPoints`/`validPoints` when scan resolution is not 1mm. The companion computes both from the axis spacing metadata in the NDE files.

Note: `ScanCompositeConfig` (used by the 3D modeller) has additional display fields (`colorScale`, `rangeMin`, `rangeMax`, `opacity`, `scanDirection`, `indexDirection`, `datumAngleDeg`, `orientationConfirmed`, etc.) that are NOT part of the companion response. These are set by the modeller when importing — see "3D Modeller Compatibility" section below.

**3. Interactive cursor rendering (binary image endpoints)**

Three separate `POST` endpoints return raw PNG bytes (`Content-Type: image/png`), not base64-in-JSON. Using `POST` (not `GET`) avoids URL length limits when encoding `gateSettings` — the settings object can grow in v2 and would exceed typical 2-8KB URL limits. The browser decodes images natively off the main thread — eliminates ~15ms of JSON parse + base64 decode overhead per request.

```
POST /bscan-axial
Request: { "folders": ["Shell", "Shell_Pass2"], "scanMm": 300, "indexMm": 4200, "width": 800, "gateSettings": { ... } }
→ image/png (binary, ~100-300KB)

POST /bscan-index
Request: { "folders": ["Shell", "Shell_Pass2"], "scanMm": 300, "indexMm": 4200, "width": 800, "gateSettings": { ... } }
→ image/png (binary, ~80-200KB)

POST /ascan
Request: { "folders": ["Shell", "Shell_Pass2"], "scanMm": 300, "indexMm": 4200, "width": 600, "height": 300, "gateSettings": { ... } }
→ image/png (binary, ~30-80KB)
```

Each endpoint accepts `width` (and `height` for A-scan) so the webapp requests images at the actual display container size — no wasted pixels. Gate overlay lines are drawn at 2-3px width for visibility at all zoom levels.

Uses Pillow fast rendering path. Server-side render time target: **5-15ms**. Realistic end-to-end (render + loopback network + browser image decode): **35-50ms**. The webapp uses request coalescing (see Performance Model section) to adapt to actual companion speed rather than assuming a fixed latency.

Response headers include render metadata and caching directives:
```
Cache-Control: no-store
X-Scan-Line-Mm: 300
X-Index-Line-Mm: 4200
X-Time-Range-Us: -3.06,17.34
X-Gates-Shown: 0,1,2
X-Render-Ms: 8
```

All image endpoints return `Cache-Control: no-store` to prevent browsers from serving stale cached images after the underlying data changes (e.g., after `POST /refresh-index` or gate setting changes).

**4. Refresh file index**
```
POST /refresh-index
→ { "folders": [...], "total": 12, "indexedAt": "2026-04-16T10:30:00Z" }
```

Re-scans the current directory for new/removed NDE files. The companion caches its file index for performance — this endpoint forces a rescan. The webapp shows the last-indexed timestamp and a "Refresh" button so techs can pick up newly added files mid-session.

### Existing Endpoints (updated)

- `GET /status` — health + loaded directory + **`apiVersion: number`** (monotonic integer, bumped when response shapes change or required endpoints are added — webapp checks `MIN_COMPANION_VERSION <= apiVersion <= MAX_COMPANION_VERSION` on first connection) + **`activeRequests: number`** (so webapp can distinguish "busy" from "disconnected")
- `POST /set-directory` — point to NDE folder
- `GET /files` — list available NDEs
- `GET /file-info/{filename}` — full metadata
- `POST /cscan-export` — single file C-scan → CSV
- `POST /render-region` — B-scan/A-scan PNGs (matplotlib, export quality)
- `POST /render-ascan` — single A-scan PNG (matplotlib, export quality)

## Webapp Changes

### Inspection Detail Page

Minimal additions to the existing page:

1. **Section ↔ Folder(s) pairing UI** — when companion is connected, each vessel section shows a searchable multi-select of available companion subfolders (from `GET /folders`, fetched via `useCompanionFolders` query hook). **Multiple folders can be mapped to one section** (e.g., "Shell_Pass1" + "Shell_Pass2" → Shell section) to support varied folder organisation conventions. Pairings are persisted in the `project_vessels` table in a new `section_folder_map` JSONB column (`{ [sectionType: string]: string[] }` — note: array of folder names) so they survive page refreshes and sessions. Updated via `updateProjectVessel()` service (requires adding `sectionFolderMap` to `UpdateVesselParams` type). A "Refresh folders" button triggers `POST /refresh-index` and re-fetches the list, with a "Last indexed: [timestamp]" indicator.
2. **Generate composite on action** — selecting folders shows a "Generate Composite" button (not auto-triggered). Clicking it calls `POST /create-composite` with default gate settings. A loading indicator with file count shows progress (cancellable via AbortController). If the section already has a composite, a confirmation dialog warns: "This will replace the existing composite for [section]. Continue?"
3. **Inline preview** — rendered client-side from the composite's stats (already fetched as part of the vessel data) and a downsampled thumbnail (max 200×100 canvas from the thickness matrix, generated once on composite load — not a separate companion endpoint). Only the active section's composite data is held in memory; other sections show stats from the saved record without loading the full matrix. Source file count shown alongside stats. "Open in Viewer" button.
4. **Save to cloud** — happens after composite generation completes, using existing `saveScanComposite()` service. Composite is immediately available in the 3D modeller. Re-generating uses **atomic upsert**: `INSERT ... ON CONFLICT(project_vessel_id, section_type) DO UPDATE`. This requires a new UPDATE RLS policy on `scan_composites` (see migrations in Phase 2) and a unique constraint on `(project_vessel_id, section_type)`. Eliminates the data-loss window of delete-then-insert.

### Scan Viewer Page (new)

**Route:** `/projects/:projectId/vessels/:vesselId/viewer?section=Shell`

Uses `:projectId` and `:vesselId` to match existing route conventions in App.tsx. Wrapped in `RequireTabVisible("tools")` and `RequireAccess` — same guards as the existing `/projects/:projectId/vessels/:vesselId` route. If the `section` query param is missing or doesn't match a vessel section, the viewer defaults to the first section that has a composite and shows a section selector dropdown in the header.

**Permissions:**
- **View** (viewer+): Open the Scan Viewer, interact with cursors, view B-scan/A-scan renders
- **Generate composite** (editor+): Trigger `POST /create-composite`, requires companion connected
- **Save to Cloud** (editor+): Save/overwrite composites via `saveScanComposite()`
- **Gate controls** (editor+): Modify gate settings and re-generate — viewers see controls in read-only mode

**Layout:**
```
┌──────────────────────────────────────────────────────┐
│  Gate Controls (collapsible sidebar)                 │
│  ┌─────────┐ ┌──────────────────────────────────┐    │
│  │ Gate I   │ │                                  │    │
│  │ Gate A   │ │     C-scan Heatmap               │    │
│  │ Gate B   │ │     (draggable crosshair cursors)│    │
│  │          │ │                                  │    │
│  │ Measure  │ ├──────────────────────────────────┤    │
│  │ Recovery │ │  B-scan (axial)  │  B-scan (idx) │    │
│  │ Filters  │ ├──────────────────────────────────┤    │
│  │          │ │     A-scan waveform               │    │
│  └─────────┘ └──────────────────────────────────┘    │
│                          [Re-generate] [Save to Cloud]│
└──────────────────────────────────────────────────────┘
```

**Component decomposition** (page must stay under 150 lines per project rules):

| Component | Responsibility |
|-----------|---------------|
| `ScanViewerPage` | Route shell — `useReducer` for viewer state, renders layout, < 150 lines |
| `CscanHeatmap` | Two-layer canvas heatmap with LOD rendering, draggable crosshair cursors, DOM axis labels |
| `BscanStrip` | Displays B-scan image from companion via `<img>` with blob URL |
| `AscanWaveform` | Displays A-scan image from companion via `<img>` with blob URL |
| `GateControlsSidebar` | Container with sub-components (see below), collapsible |
| `GateInputGroup` | Per-gate controls (start, width, threshold) — reused for gates I, A, B |
| `MeasurementControls` | Measurement mode, recovery mode, detection mode, polarity selectors |
| `FilterControls` | Amplitude filters + thickness min/max filters |
| `SectionSelector` | Section dropdown in header, syncs with `?section=` query param |
| `ScanViewerToolbar` | Re-generate, Save to Cloud, unsaved changes indicator |

`GateControlsSidebar` is decomposed into `GateInputGroup` (×3), `MeasurementControls`, and `FilterControls` to stay under the 300-line limit. Each sub-component manages its own form inputs and dispatches to the parent reducer.

**State management** — `ScanViewerPage` owns all viewer state via `useReducer`:

```typescript
type ScanViewerState = {
  compositeData: CompositeData | null;       // Float32Array matrix + metadata (from companion binary response)
  gateSettings: GateSettings;                // current gate config
  savedGateSettings: GateSettings | null;    // last-saved snapshot (for dirty detection)
  cursor: { scanMm: number; indexMm: number } | null;
  selectedSection: string;
  companionConnected: boolean;
  sidebarCollapsed: boolean;
};

type ScanViewerAction =
  | { type: 'LOAD_COMPOSITE'; payload: CompositeData }
  | { type: 'UPDATE_CURSOR'; payload: { scanMm: number; indexMm: number } }
  | { type: 'UPDATE_GATE_SETTINGS'; payload: Partial<GateSettings> }
  | { type: 'MARK_SAVED'; payload: GateSettings }
  | { type: 'SELECT_SECTION'; payload: string }
  | /* ... */;
```

Child components receive `dispatch` and read state — no prop drilling, no scattered `useState`. B-scan/A-scan image fetching is handled by `useCompanionImage` hooks that subscribe to cursor changes from the reducer.

New hooks:
- `useCompanionFolders()` — calls `GET /folders`, returns subfolder list with file counts and search
- `useCompanionComposite()` — mutation hook wrapping `POST /create-composite`
- `useCompanionImage(type, params)` — fetches binary PNG from companion image endpoint with request coalescing (see Performance Model). Returns blob URL for `<img>` src. Manages AbortController lifecycle.
- `useScanViewerDirty(state)` — compares `gateSettings` vs `savedGateSettings`, returns boolean. Triggers `beforeunload` warning when dirty. Drafts to `localStorage` under `scan-viewer-draft:${projectId}:${vesselId}:${section}`.

**Interaction model:**

- **C-scan heatmap** — rendered client-side from the composite data using a **two-layer Canvas + DOM** architecture (see "Heatmap Rendering Architecture" below). Draggable crosshair cursors (vertical = axial B-scan slice, horizontal = index B-scan slice). Keyboard arrow keys nudge cursor by 1mm per press for precise positioning. Color scale selector in toolbar (Viridis default — perceptually uniform and colorblind-safe; also Jet, Plasma, Okabe-Ito options).
- **B-scan strips** — update as cursors are dragged via request coalescing (see Performance Model). Each strip is an `<img>` element whose `src` is a blob URL from `useCompanionImage`. Old blob URLs are revoked on update to prevent memory leaks. If the companion is disconnected, strips freeze at the last-rendered image with an overlay: "Companion disconnected."
- **A-scan waveform** — updates on cursor drag (same coalescing pattern). Shows the waveform at the crosshair intersection point.
- **Gate controls sidebar** — **v1 scope: filter-based controls only.** Full re-gating (gate start/width repositioning) requires full A-scan windows, which most NDE files lack. Showing disabled controls with a tooltip creates false expectations — instead, v1 only renders controls that work universally:
  - Measurement mode (A-I, B-A)
  - Recovery mode (crossing only, peak fallback)
  - Amplitude filters (min amplitude per gate: I, A, B)
  - Thickness min/max filters
  - Gate threshold (per gate: I, A, B) — affects amplitude-based filtering
- **v2 scope (future, when data supports it):** Gate start/width repositioning, synchro mode, signal polarity, peak vs crossing detection. These appear only when the companion reports full A-scan window availability for the loaded files. If a folder has mixed files (some full, some truncated), the companion reports the intersection of capabilities and a warning: "4 of 12 files have truncated A-scan windows — re-gating disabled for consistency."
- **Out of scope:** frequency domain analysis, cursor measurement tools, multi-group support, focal law editing, strip chart views. These may be added later as separate features.
- **Re-generate** — calls `POST /create-composite` with current gate settings, updates the C-scan heatmap. Cancellable.
- **Save to Cloud** — saves through `saveScanComposite()` via atomic upsert, updates the inspection panel preview. Marks gate settings as saved (clears dirty state).
- **Unsaved changes** — the toolbar shows a visual indicator when gate settings differ from the last-saved state. Navigating away (route change or tab close) triggers a confirmation: "You have unsaved gate changes. Leave without saving?" Gate settings are also auto-drafted to `localStorage` under `scan-viewer-draft:${projectId}:${vesselId}:${section}` so they survive accidental tab closure. On next load, if a draft exists, a banner offers: "Restore unsaved gate settings from [timestamp]? [Restore] [Discard]"
- **Concurrent save detection (v1: informational only)** — the companion runs locally on one tech's machine, so simultaneous editing of the same section is unlikely. v1 uses last-write-wins: after saving, if the composite's `updated_at` was newer than expected, a toast informs: "Note: this composite was also modified at [time] by another user." No blocking dialog in v1. Full conflict resolution UI (view latest / save anyway / cancel) is a v2 candidate if multi-user editing becomes common.

**Gate control tiers:**

The companion app's gate capabilities depend on what the NDE file data supports:

| Tier | Capability | Requirement | v1 Scope |
|------|-----------|-------------|----------|
| **Filter-based** | Measurement mode, recovery mode, amplitude thresholds, thickness filters, gate thresholds | Pre-computed RawCScan data (all files) | **Yes — always available** |
| **Full re-gating** | Gate start/width repositioning, synchro mode changes, detection mode changes, signal polarity | Full A-scan window stored in NDE file (varies by instrument/setup) | **No — v2 only, when data supports it** |

v1 renders only filter-based controls. Full re-gating controls are not shown at all in v1 — they will appear in v2 only when the companion confirms the loaded files have sufficient A-scan data. This avoids the UX trap of showing disabled controls that most techs can never use.

### Heatmap Rendering Architecture

The C-scan heatmap uses a **two-layer Canvas + DOM** approach instead of Plotly.js. Scans can reach 10M+ points, but the user's viewport is at most ~1920×1080 pixels — there is no reason to render more pixels than the viewport can display. The architecture separates concerns by update frequency:

```
┌─ DOM: axis labels, color bar, tooltip, color scale selector ─────┐
│  (crisp text, accessible, styled with design tokens)             │
│                                                                   │
│  ┌─ Canvas 2 (overlay): crosshair cursors ─────────────────────┐ │
│  │  Clears + redraws 2 lines per frame (~0.1ms)                │ │
│  │  Same CSS transform as heatmap canvas (stays aligned)       │ │
│  │                                                              │ │
│  │  ┌─ Canvas 1 (heatmap): LOD-rendered ImageData ───────────┐ │ │
│  │  │  Renders only viewport-resolution pixels                │ │ │
│  │  │  Zoom/pan via CSS transform (GPU-composited, no JS)     │ │ │
│  │  │  Re-renders visible region at new LOD on zoom change    │ │ │
│  │  └────────────────────────────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────┘
```

**LOD rendering pipeline:**

1. **On composite load:** Build a pre-computed colormap lookup table (256 entries mapping normalized thickness → RGBA). Compute overview ImageData at viewport resolution by downsampling the full matrix. For 10M points → 1920×1080 viewport, this is a ~80-100ms one-time cost — offloaded to the Web Worker (see lifecycle below).

2. **On zoom/pan (continuous):** CSS `transform: scale() translate()` on both canvas layers — GPU-composited, zero JS cost, instant visual feedback at 60fps. No pixel recalculation during the gesture. The transform is computed from absolute state `{ zoom: number, centerX: number, centerY: number }` (single source of truth in `useZoomPan`), not accumulated incrementally — prevents floating-point drift that would misalign the overlay canvas after many zoom/pan cycles.

3. **On zoom settle (debounced ~150ms after gesture ends):** Re-render visible region at the appropriate LOD. Slice the visible data window from the full matrix, downsample to viewport pixel density, write to ImageData. This is ~2-5ms for any zoom level because the output is always viewport-sized.

4. **On cursor drag:** Only the overlay canvas clears and redraws (2 lines = ~0.1ms). The heatmap canvas is untouched.

**Downsampling algorithm (NaN-aware):**

- **Zoomed out (multiple data points per pixel):** NaN-aware average pooling — each output pixel is the mean of the valid (non-NaN) source pixels in its bin. If all source pixels in a bin are NaN, the output is NaN (rendered as transparent/background color). This preserves the visual density of valid vs. invalid regions at overview zoom levels.
- **1:1 zoom (one data point per pixel):** Direct value lookup, no interpolation.
- **Zoomed in past 1:1 (one data point spans multiple pixels):** Nearest-neighbor — each screen pixel shows the exact value of the data point it covers. No interpolation between data points. Techs need to see actual thickness values, not smoothed estimates. At deep zoom levels (>4x), pixel grid lines are drawn to show individual data point boundaries.

**Web Worker lifecycle:**

A singleton `heatmap-renderer` Web Worker is created on first `CscanHeatmap` mount and reused across section switches within the same Scan Viewer session. The worker accepts `{ matrix: Float32Array, width, height, viewportWidth, viewportHeight, colormap, visibleRegion }` messages (the `Float32Array` is transferred, not copied — zero-copy). The worker returns an `ImageData` (also transferred). If a new render request arrives while the previous is in flight, the worker completes the current render but the result is discarded by the main thread on arrival. The worker is terminated when the Scan Viewer page unmounts (`useEffect` cleanup in `ScanViewerPage`).

**Coordinate readout:**

The `CscanHeatmap` component renders a persistent DOM readout element in the top-right corner of the heatmap area (fixed position, not following the cursor — avoids occlusion during drag). Displays: `Scan: 342.0 mm | Index: 4215.0 mm | Thickness: 15.3 mm` (or `N/D` for NaN values). Updates on every cursor move via direct DOM mutation (not React state) to avoid re-renders. The readout is also available as structured data in the reducer state for the toolbar/status bar.

**Component decomposition for heatmap:**

| Component / Hook | Responsibility | Est. lines |
|-----------------|---------------|------------|
| `CscanHeatmap` | Two stacked canvases, mouse/keyboard/wheel handlers, persistent coordinate readout (scan mm, index mm, thickness) | ~120 |
| `useHeatmapRenderer` | ImageData generation, colormap LUT, LOD downsampling, Web Worker dispatch | ~80 |
| `useZoomPan` | Wheel zoom, drag pan, CSS transform state, data↔pixel coordinate mapping | ~60 |
| `HeatmapColorBar` | DOM element: gradient bar + tick labels, responds to color scale changes | ~40 |
| `HeatmapAxes` | DOM-positioned axis labels (mm), updates on zoom/pan, responsive | ~50 |

All components stay under the 300-line limit. Total: ~350 lines across 5 files.

**Why not Plotly.js:**
- Plotly adds ~800KB bundle + ~15MB runtime memory to use <5% of its features
- Plotly's `dragmode` conflicts with custom crosshair cursors (requires `dragmode: false` + fighting the event system)
- Plotly redraws the entire trace on zoom — unacceptable for 10M points
- Future features (measurement annotations, gate overlays on heatmap, region selection) would all be workarounds against Plotly's opinions
- The two-layer canvas approach gives sub-ms cursor redraws, GPU-composited zoom, and full control

**Why not WebGL:**
- Canvas 2D with LOD rendering never pushes more than ~2M pixels per frame regardless of matrix size
- WebGL's setup complexity (shaders, buffers, context management) isn't justified for a static-ish heatmap
- Would only be relevant for real-time animation of >10M simultaneously visible points — not this use case

### Companion API Error Handling

All companion endpoints return errors in a consistent shape:
```json
{
  "error": "Short error code",
  "detail": "Human-readable explanation"
}
```

| Scenario | HTTP Status | Webapp Behavior |
|----------|-------------|-----------------|
| Companion unreachable | N/A (fetch fails) | Show reconnection banner, disable companion-dependent controls |
| Folder not found / empty | 404 | Toast: "Folder not found or contains no .nde files" |
| Corrupted NDE file in folder | 200 (partial) | Companion skips bad files, includes `warnings: [{ filename, reason }]` in response. Webapp shows warning count: "3 files skipped — click to see details" |
| All files in folder corrupted | 422 | Toast: "No valid NDE files found in [folder]" |
| Composite generation cancelled | N/A (AbortController) | Silent — user initiated cancellation |
| Render timeout (>3s) | 504 | Auto-downgrade to mouse-up-only mode. Toast: "Rendering is slow — switching to update on mouse release." Show render latency in debug indicator. |
| Unexpected server error | 500 | Toast: "Companion error: [detail]". Log to console for debugging |

The `POST /create-composite` response includes optional warnings for partial success. In the binary response (production), warnings are in the `X-Warnings` header:
```
X-Warnings: [{"filename":"bad-file.nde","reason":"Failed to read RawCScan group"}]
```
In the JSON debug response, warnings appear in the body:
```json
{ "warnings": [{ "filename": "bad-file.nde", "reason": "Failed to read RawCScan group" }], ... }
```

## Performance Model

### Request Coalescing (not fixed-interval throttling)

Fixed-interval throttling (e.g., 30ms) assumes every request completes within the interval. When it doesn't (Python GIL contention, large B-scan slices), requests queue up and the user sees stale data. Instead, the webapp uses **request coalescing**:

```
User drags cursor → position changes rapidly
                  ↓
useCompanionImage maintains at most ONE in-flight request per image type
                  ↓
New position arrives while request in flight:
  1. Abort current request (AbortController)
  2. Send new request immediately with latest position
                  ↓
Response arrives:
  1. Create blob URL, set as <img> src
  2. Revoke previous blob URL
  3. If a newer position was queued during flight, send that now
```

This pattern **naturally adapts to companion speed**:
- Fast companion (8ms renders): updates at ~60fps during drag
- Slow companion (50ms renders): updates at ~20fps, but always shows the latest position
- Overloaded companion (200ms renders): updates at ~5fps, auto-downgrades to mouse-up-only after 3 consecutive >100ms responses

**Degraded mode recovery:** After auto-downgrading to mouse-up-only mode, the webapp attempts one live-drag request every 30 seconds. If it responds under 50ms, live-drag mode is re-enabled with a toast: "Live cursor updates restored." A manual "Try live mode" toggle is also available in the toolbar for immediate re-enable.

No fixed throttle interval to tune. No queue buildup. The companion processes exactly one request at a time per image type.

### Memory Budget

The Scan Viewer renders **one section at a time**. Switching sections via the `?section=` query param unmounts the current heatmap and releases composite data. Memory scales with matrix size:

| Item | 500K points (1001×503) | 10M points (5000×2000) |
|------|----------------------|----------------------|
| Thickness matrix (`Float32Array`) | ~2MB | ~40MB |
| Colormap LUT (256 × RGBA) | ~1KB | ~1KB |
| Viewport ImageData (1920×1080 RGBA) | ~8MB | ~8MB |
| Overlay canvas (matches heatmap logical size, not viewport — crosshair lines render identically when CSS-scaled) | ~2-8MB | ~2-8MB |
| B-scan/A-scan blob URLs (2-3 images) | ~0.5MB | ~0.5MB |
| Gate settings + UI state | negligible | negligible |
| **Total per section** | **~19MB** | **~57MB** |

57MB for a 10M-point scan is well within browser limits (Chrome allows ~1-4GB JS heap depending on device). The key insight is that the two canvas layers are always viewport-sized (~8MB each) regardless of matrix size — only the raw `Float32Array` scales with data.

On section switch, cleanup runs:
```typescript
useEffect(() => {
  return () => {
    // Release canvases (browser reclaims pixel buffers)
    heatmapCanvas.width = 0;
    overlayCanvas.width = 0;
    revokeAllBlobUrls();
    // Float32Array is GC'd when compositeData ref is released
  };
}, [selectedSection]);
```

### Latency Targets

| Operation | Server-side | End-to-end (incl. network + browser) |
|-----------|-------------|--------------------------------------|
| B-scan Pillow render | 5-15ms | 35-50ms |
| A-scan Pillow render | 3-10ms | 25-40ms |
| Composite generation (50 files) | 2-5s | 2-6s |
| Composite generation (100+ files) | 5-15s | 5-16s |

End-to-end includes: Pillow render + HTTP response + browser image decode. These are **targets to validate during Phase 1** — if measured latencies exceed these, the companion should add response compression (gzip) or the webapp should request lower-resolution images.

### Companion Threading

The companion's Python GIL serialises CPU-bound work. To avoid render requests blocking the `/status` health endpoint:
- `/status` runs on a separate thread (always responsive)
- Image render endpoints process one request at a time per endpoint — the webapp's coalescing ensures at most 3 concurrent requests (one per image type)
- `POST /create-composite` is **synchronous** — the request blocks until the composite is ready and returns the full response. The webapp uses `AbortController` for cancellation; the companion checks an abort flag between files and stops processing early (no partial state is persisted). For v1 with 2-15s generation times, this is simpler than async job polling and sufficient. If generation times grow beyond 30s in the future, this can be refactored to async with a job ID and polling endpoint.

## Data Validation

### Companion Response Validation

All companion responses are validated before use. Invalid responses surface as user-visible errors rather than silent corruption.

**Binary response parsing (`Accept: application/octet-stream`):**

```typescript
async function parseCompositeResponse(response: Response): Promise<CompositeData> {
  const width = parseInt(response.headers.get('X-Matrix-Width')!, 10);
  const height = parseInt(response.headers.get('X-Matrix-Height')!, 10);
  const dtype = response.headers.get('X-Matrix-Dtype'); // must be "float32"
  const stats = CompositeStatsSchema.parse(JSON.parse(response.headers.get('X-Stats')!));
  const sourceFiles = SourceFilesSchema.parse(JSON.parse(response.headers.get('X-Source-Files')!));
  const warningsRaw = response.headers.get('X-Warnings');
  const warnings = warningsRaw ? WarningsSchema.parse(JSON.parse(warningsRaw)) : [];

  // Browser handles Content-Encoding: gzip automatically
  const buffer = await response.arrayBuffer();
  const allFloats = new Float32Array(buffer);

  // Validate dtype and total size
  if (dtype !== 'float32') throw new Error(`Unsupported dtype: ${dtype}`);
  const expectedLength = width * height + width + height; // matrix + xAxis + yAxis
  if (allFloats.length !== expectedLength) {
    throw new Error(`Binary payload size mismatch: expected ${expectedLength} floats, got ${allFloats.length}`);
  }

  // Parse structured binary body: [matrix | xAxis | yAxis]
  const matrixOffset = 0;
  const xAxisOffset = width * height;
  const yAxisOffset = xAxisOffset + width;

  const matrix = allFloats.subarray(matrixOffset, xAxisOffset);      // zero-copy view
  const xAxis = allFloats.subarray(xAxisOffset, yAxisOffset);        // zero-copy view
  const yAxis = allFloats.subarray(yAxisOffset, yAxisOffset + height); // zero-copy view

  return { matrix, width, height, xAxis, yAxis, stats, sourceFiles, warnings };
}
```

Note: `Float32Array.subarray()` creates views into the same `ArrayBuffer` — no data is copied. The entire parse is zero-allocation beyond the initial `ArrayBuffer`.

**Zod schemas for metadata (parsed from headers):**

```typescript
const CompositeStatsSchema = z.object({
  min: z.number(), max: z.number(), mean: z.number(),
  median: z.number(), stdDev: z.number(),
  validPoints: z.number(), totalPoints: z.number(),
  totalArea: z.number(), validArea: z.number(),
  ndPercent: z.number(), ndCount: z.number(), ndArea: z.number(),
});

const SourceFilesSchema = z.array(z.object({
  filename: z.string().max(255),
  minX: z.number(), maxX: z.number(),
  minY: z.number(), maxY: z.number(),
}));

const WarningsSchema = z.array(z.object({
  filename: z.string(), reason: z.string(),
}));
```

**JSON response validation** (`Accept: application/json`, debugging only):

```typescript
const CompositeJsonResponseSchema = z.object({
  data: z.array(z.array(z.number().nullable())),
  xAxis: z.array(z.number()),
  yAxis: z.array(z.number()),
  stats: CompositeStatsSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  sourceFiles: SourceFilesSchema,
  warnings: WarningsSchema.optional(),
});
```

### Dimension Consistency Checks

After parsing, the webapp verifies internal consistency:
- Binary: `allFloats.length === width * height + width + height` (total payload = matrix + xAxis + yAxis)
- JSON: `data.length === height && data[0].length === width`
- `xAxis.length === width` (implicit in binary — enforced by offset math)
- `yAxis.length === height` (implicit in binary — enforced by offset math)
- `stats.min <= stats.mean <= stats.max`
- `stats.validPoints <= stats.totalPoints`
- `sourceFiles` filenames contain no path separators (`/`, `\`)

Failures produce a clear error: "Companion returned inconsistent data (matrix size mismatch: expected 1001×503=503503, got 503000). Check companion app version."

### API Version Check

On first companion connection, the webapp reads `apiVersion` from `GET /status` and checks `MIN_COMPANION_VERSION <= apiVersion <= MAX_COMPANION_VERSION` (constants defined in the webapp's companion service config). `apiVersion` is a monotonic integer — bumped when the companion changes response shapes or adds required endpoints. Version history:
- `apiVersion: 1` — initial release (folders, create-composite, image endpoints)

If the version is outside the supported range, a non-dismissable banner warns: "Companion app version [X] is not compatible with this webapp (requires [MIN]-[MAX]). Please update." All companion-dependent features are disabled until the version is compatible.

## Offline / Degraded Mode

When the companion is unavailable, the Scan Viewer still provides value for previously saved composites:

| Feature | With companion | Without companion |
|---------|---------------|-------------------|
| C-scan heatmap | Full interactivity | Full interactivity (data already client-side) |
| Crosshair cursors | Full drag | Full drag (heatmap is client-side) |
| B-scan strips | Companion renders | **Disabled** — show "Connect companion for B-scan views" |
| A-scan waveform | Companion renders | **Disabled** — show "Connect companion for A-scan views" |
| Gate controls | Full (filter-based) | **Read-only** — show current settings, disable changes |
| Re-generate | Available | Disabled |
| Save to Cloud | Available | Available (if composite data already loaded) |

The C-scan heatmap (rendered client-side via two-layer canvas from Supabase data) remains fully interactive regardless of companion state — zoom, pan, crosshair cursors all work with zero companion dependency. This is the most common review scenario — techs checking previously generated composites.

## Testing Strategy

### MSW Mocks for Companion API

All companion endpoints are mocked via [MSW](https://mswjs.io/) in test setup:

```typescript
// src/test/mocks/companion-handlers.ts
export const companionHandlers = [
  http.get('http://localhost:18925/status', () =>
    HttpResponse.json({ app: 'matrix-ndt-companion', running: true, apiVersion: 1, activeRequests: 0 })
  ),
  http.get('http://localhost:18925/folders', () =>
    HttpResponse.json({ folders: [{ name: 'Shell', fileCount: 10 }], total: 1 })
  ),
  http.post('http://localhost:18925/create-composite', () =>
    new HttpResponse(mockBinaryCompositeBuffer, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Matrix-Width': '1001',
        'X-Matrix-Height': '503',
        'X-Matrix-Dtype': 'float32',
        'X-Stats': JSON.stringify(mockStats),
        'X-Source-Files': JSON.stringify(mockSourceFiles),
      },
    })
  ),
  http.post('http://localhost:18925/bscan-axial', () =>
    new HttpResponse(mockPngBuffer, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' } })
  ),
];
```

### Test Coverage Targets

| Area | Tests |
|------|-------|
| `useCompanionFolders` | Fetches folders, handles search/pagination, handles disconnect |
| `useCompanionComposite` | Generates composite, validates response, handles errors/cancellation |
| `useCompanionImage` | Coalescing behavior, abort on unmount, blob URL lifecycle |
| `useScanViewerDirty` | Dirty detection, beforeunload warning, localStorage draft |
| `ScanViewerPage` | Reducer state transitions, section switching, error boundaries |
| `GateControlsSidebar` | Input validation, tiered enable/disable, read-only for viewers |
| `useHeatmapRenderer` | LOD downsampling correctness (NaN handling, zoom levels), Web Worker message passing, colormap LUT generation |
| Data validation | Binary payload parsing (offset math, subarray views), dimension checks, stats plausibility, malformed responses |
| Binary storage | Round-trip: save binary blob → fetch blob → parse → verify data matches original `Float32Array` |

### Error Boundary Coverage

Each panel in the Scan Viewer is wrapped in its own `ErrorBoundary`:
```tsx
<ErrorBoundary fallback={<div>Failed to render B-scan</div>}>
  <BscanStrip ... />
</ErrorBoundary>
```

A crash in `BscanStrip` (e.g., corrupted PNG from companion) doesn't take down the entire viewer — the heatmap and other panels remain functional.

## 3D Modeller Compatibility

The 3D modeller requires a minor update to consume the new binary storage format. The companion-generated composites are saved through `saveScanComposite()`, which stores metadata in the `scan_composites` DB row and the binary blob (matrix + axes) in Supabase Storage under `composites/{compositeId}.bin`.

The modeller's `handleImportComposite()` calls the updated `getScanComposite(id)`, which fetches the binary blob from Storage and returns a `CompositeData` object (same `Float32Array`-based shape used throughout the viewer). The modeller then transforms this to `ScanCompositeConfig`. Display-only fields (`colorScale`, `rangeMin`, `rangeMax`, `opacity`) get defaults at import time. Orientation fields (`scanDirection`, `indexDirection`, `datumAngleDeg`) are set by the user during the existing modeller placement flow — the modeller already prompts for these when importing any composite.

The modeller change is minimal: replace the current JSON-based data access (`record.thicknessData`) with `compositeData.matrix` (a `Float32Array`) and use `compositeData.xAxis`/`compositeData.yAxis` for coordinate mapping. The modeller's existing heatmap rendering (if any) already works with numeric arrays.

**Required data shape from companion (maps to `SaveScanCompositeParams`):**
- **Binary format (production):** Structured binary body containing `Float32` matrix (row-major, `NaN` = no data) + `Float32` xAxis + `Float32` yAxis. Metadata (stats, source files, width, height) in HTTP headers. See "Composite generation" endpoint above.
- **JSON format (debugging):** `data: (number | null)[][]`, `xAxis: number[]`, `yAxis: number[]` in response body.
- Both formats provide: `stats: { min, max, mean, median, stdDev, validPoints, totalPoints, totalArea, validArea, ndPercent, ndCount, ndArea }`, `sourceFiles: { filename, minX, maxX, minY, maxY }[]`, `width: number` (columns), `height: number` (rows)

**Storage format:** Composites are saved as binary blobs to Supabase Storage — the same `Float32Array` format used by the companion (matrix + xAxis + yAxis, NaN for null). This avoids the `Float32Array` → `(number | null)[][]` conversion at save time, which would create a ~200-400MB nested JS array for a 10M-point scan and risk OOM on constrained devices. The `scan_composites` DB row stores metadata (stats, source files, width, height, storage path) while the binary blob lives in Supabase Storage under `composites/{compositeId}.bin`.

The 3D modeller's `getScanComposite()` is updated to fetch the binary blob and parse it the same way as the companion response — one parsing path for both live companion data and saved composites. The existing `SaveScanCompositeParams` type is extended with a `binaryData: ArrayBuffer` field as an alternative to `thicknessData`. The `saveScanComposite()` service uploads the blob to storage and stores the path in the DB row.

This also means offline/degraded mode (loading saved composites from Supabase) uses the same binary format — no 100MB JSON parse for 10M-point scans. Load time for a 10M-point composite from Supabase Storage: ~2-4s (network transfer of ~15-25MB gzipped) + ~80ms (parse), which is acceptable.

## Implementation Phases

### Phase 1: Companion App Enhancements
- Add `GET /folders` endpoint with pagination/search (`?query=&limit=&offset=`)
- Add `POST /create-composite` endpoint — accepts `folders` array, supports dual-format response: binary (`Accept: application/octet-stream`, `Float32Array` + gzip + metadata in headers) and JSON (`Accept: application/json`, for debugging). Binary is the primary format — see "Composite generation" endpoint spec above
- Add `POST /bscan-axial`, `POST /bscan-index`, `POST /ascan` binary image endpoints — Pillow fast rendering, accept `width`/`height` params for responsive sizing, return `Cache-Control: no-store`
- Configure CORS: set `Access-Control-Allow-Origin: *` and handle `OPTIONS` preflight on all endpoints (required because webapp origin differs from companion `localhost:18925`)
- Add `POST /refresh-index` endpoint — force rescan of directory for new files
- Add `apiVersion` and `activeRequests` fields to `GET /status` response
- Run `/status` on a separate thread so it responds even during long composite generation
- **Measure actual render latencies** on target hardware (field laptop, i5-class CPU) — validate 35-50ms end-to-end target before webapp work begins
- Investigate full A-scan window availability across different NDE files for v2 re-gating support

### Phase 2: Webapp — Inspection Panel Integration
- Migration: add `section_folder_map` JSONB column (default `'{}'::jsonb`) to `project_vessels` table
- Migration: add unique constraint `UNIQUE(project_vessel_id, section_type)` on `scan_composites` (with `NULLS NOT DISTINCT`). **The migration must first de-duplicate existing rows** — keep only the most recent row (by `created_at`) per `(project_vessel_id, section_type)` pair before adding the constraint, to prevent migration failure on existing data.
- Migration: add UPDATE RLS policy on `scan_composites` (owner or org admin can update)
- Update `saveScanComposite()` to use atomic upsert (INSERT ... ON CONFLICT DO UPDATE) instead of delete-then-insert
- Add `sectionFolderMap` to `UpdateVesselParams` type in `src/types/inspection-project.ts` — type is `Record<string, string[]>` (array of folder names per section)
- Add binary response parser + zod schemas for companion composite response validation (see Data Validation section)
- Update `saveScanComposite()` to accept `ArrayBuffer` and upload as binary blob to Supabase Storage (`composites/{compositeId}.bin`), storing the storage path in the DB row alongside metadata (stats, source files, width, height). Avoids the `Float32Array` → `(number | null)[][]` conversion that would OOM on 10M-point scans.
- Update `getScanComposite()` to fetch binary blob from Supabase Storage and parse with the same `parseCompositeResponse()` logic — one parsing path for both companion and saved data
- Add `useCompanionFolders` query hook (`GET /folders` with search support)
- Add `useCompanionComposite` mutation hook (`POST /create-composite` with zod validation)
- Section ↔ folder(s) pairing UI in inspection detail page (searchable multi-select per section, persisted via `updateProjectVessel()`)
- "Refresh folders" button + last-indexed timestamp indicator
- "Generate Composite" button with confirmation when replacing existing composite (cancellable)
- Inline preview component (thumbnail + stats + "Open in Viewer" button)
- Save to cloud via atomic upsert through `saveScanComposite()` pipeline (binary blob to Supabase Storage + metadata to DB row)
- Update 3D modeller's `handleImportComposite()` to consume binary blob format from `getScanComposite()` instead of JSON `thicknessData`
- MSW companion mocks for testing (`src/test/mocks/companion-handlers.ts`) — mock returns binary `ArrayBuffer` with correct headers, not JSON

### Phase 3: Webapp — Scan Viewer Page
- New route `/projects/:projectId/vessels/:vesselId/viewer` with `RequireTabVisible("tools")` + `RequireAccess` guards
- `ScanViewerPage` route shell (< 150 lines) with `useReducer` state management (see State Management section)
- Feature components: `CscanHeatmap` (two-layer canvas + DOM), `BscanStrip`, `AscanWaveform`, `SectionSelector`, `ScanViewerToolbar`
- Heatmap sub-components: `HeatmapColorBar`, `HeatmapAxes`
- `useHeatmapRenderer` hook — colormap LUT, NaN-aware LOD downsampling, ImageData generation, singleton Web Worker lifecycle (created on mount, terminated on page unmount, handles concurrent requests by discarding stale results)
- `useZoomPan` hook — wheel zoom, drag pan, CSS transform state, data↔pixel coordinate mapping
- `GateControlsSidebar` decomposed into `GateInputGroup` (×3), `MeasurementControls`, `FilterControls`
- `useCompanionImage` hook — request coalescing with AbortController, blob URL lifecycle management
- `useScanViewerDirty` hook — dirty detection, `beforeunload` warning, localStorage draft save/restore
- Section selector with `?section=` query param (defaults to first section with a composite)
- C-scan heatmap: two-layer canvas (heatmap + cursor overlay) with LOD rendering, GPU-composited CSS zoom/pan, DOM axis labels + color bar
- Draggable crosshair cursors + keyboard arrow nudge (1mm precision)
- Color scale selector (Viridis default, Jet, Plasma, Okabe-Ito for accessibility) — pre-computed LUT, colormap change re-renders heatmap canvas only
- B-scan strips + A-scan waveform panels (binary images from companion, request coalescing)
- Gate controls sidebar — **v1: filter-based controls only** (measurement mode, recovery mode, amplitude filters, thickness filters, gate thresholds). Read-only for viewer role.
- Per-panel ErrorBoundary wrappers (BscanStrip crash doesn't take down viewer)
- Companion disconnect handling: freeze last renders, show reconnection banner, C-scan heatmap stays interactive
- Companion error handling per "Companion API Error Handling" section
- Unsaved changes protection: visual indicator, navigation warning, localStorage draft
- Concurrent save detection: last-write-wins with informational toast (v1), full conflict UI deferred to v2
- Re-generate composite with adjusted gate settings (editor+ only, cancellable)
- Save to cloud action (editor+ only, atomic upsert)
- Offline/degraded mode: C-scan heatmap works from saved data, B-scan/A-scan panels show "connect companion" message

### Phase 4: Deprecation
- Add deprecation banner to current `/cscan` page directing techs to the new Scan Viewer
- Monitor adoption
- Remove `/cscan` page and associated components once transition is complete

## Known Constraints

- **A-scan truncation:** Some NDE files store a windowed portion of the waveform that doesn't cover all gate regions. Full gate repositioning (v2) is only possible when the stored window covers the target gates. v1 ships with filter-based controls only — these work on all files. Need to examine more files from different instruments/jobs to understand prevalence before implementing v2.
- **Companion app required for generation:** Generating new composites and viewing B-scan/A-scan requires the companion app running locally. Without it, the inspection panel shows the folder pairing UI disabled with a "Connect companion app to enable scan controls" message. The Scan Viewer still works in degraded mode for previously saved composites — C-scan heatmap is fully interactive (client-side), B-scan/A-scan panels are disabled.
- **Companion disconnect mid-session:** If the companion drops while the Scan Viewer is open, the viewer freezes the last-rendered B-scan/A-scan images, shows a reconnection banner, but the C-scan heatmap remains fully interactive. The `useCompanionApp` hook polls every 5s. When the companion returns, the viewer re-enables interaction automatically and shows a "Companion reconnected" toast.
- **Render performance:** Pillow server-side render targets 5-15ms, but realistic end-to-end (including loopback network + browser image decode) is **35-50ms**. The webapp uses request coalescing (not fixed throttle) to adapt — fast companion means more updates, slow companion means fewer but always the latest position. If 3 consecutive renders exceed 100ms, the webapp auto-downgrades to mouse-up-only updates.
- **Large folders:** No hard file count limit on `POST /create-composite`, but the webapp shows file count from `GET /folders` before the tech triggers generation. Compositing 100+ files may take 5-15s — the webapp shows a cancellable progress indicator.
- **Large directory trees:** `GET /folders` supports pagination and search for projects with hundreds of subfolders. The webapp provides a searchable dropdown rather than loading all folders into a list.
- **Folder-to-section mapping:** Multiple folders can be mapped to one section (many-to-one). Explicit user assignment, no auto-matching. Pairings are persisted in the `project_vessels` table (`section_folder_map` JSONB column, `Record<string, string[]>`).
- **File index caching:** The companion caches its file index for performance. Techs must click "Refresh folders" to pick up newly added NDE files mid-session. Last-indexed timestamp is shown in the UI.
- **Concurrent generation:** A unique constraint on `scan_composites(project_vessel_id, section_type)` with atomic upsert prevents duplicate composites. Concurrent save uses last-write-wins with informational toast (see "Concurrent save detection" in Interaction model).
- **Folder mapping invalidation:** `section_folder_map` stores folder *names* relative to the companion's current base directory. If a tech changes the base directory via `POST /set-directory`, stored folder names may no longer exist. The webapp validates mapped folders against the current `GET /folders` response and shows a warning badge on sections with stale mappings: "Folder 'Shell_Pass2' not found in current directory — re-pair or change companion directory." Techs must re-pair manually.
- **No composite version history (v1):** Re-generating overwrites the previous composite. Unsaved gate changes are auto-drafted to localStorage and restored on next load, but cloud-saved composites have no rollback. Version history is a candidate for v2.
- **Memory budget:** The Scan Viewer renders one section at a time. Memory scales with matrix size: ~19MB for 500K points, ~57MB for 10M points (dominated by the `Float32Array` — canvas layers are always viewport-sized at ~8MB each). Switching sections releases the previous canvas buffers and composite data. Multi-section split views are not supported in v1.
- **Large scan rendering:** Scans with 10M+ points use LOD rendering — the heatmap always renders at viewport resolution (~1920×1080), downsampling from the full matrix. Initial colormap computation for 10M points takes ~80-100ms (offloaded to a Web Worker). Zoom/pan uses GPU-composited CSS transforms for instant visual feedback; re-rendering at the new LOD is debounced ~150ms after the gesture ends.
- **Binary transfer format:** The `POST /create-composite` endpoint returns binary `Float32Array` data with gzip compression by default. A 10M-point matrix transfers as ~15-25MB (vs. ~100MB as JSON) and parses in ~80ms (vs. ~1s). JSON response is available via `Accept: application/json` for debugging only.
