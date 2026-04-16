# Companion-Powered Scan Viewer — Design Document

**Date:** 2026-04-16
**Status:** Approved design, pre-implementation

## Problem

The current C-scan workflow requires techs to manually export CSVs from NDE files, upload them to the webapp's compositor (`/cscan`), create composites, and save to cloud. The companion app already has direct access to raw NDE files and can extract C-scans in ~0.02s per file. Maintaining two parallel processing paths (CSV upload in webapp + companion for A/B-scan rendering) is redundant.

Additionally, techs need interactive gate/cursor manipulation (like OmniPC) to properly evaluate scan data — adjusting gates, viewing A-scans and B-scans at specific locations, and re-generating composites with different settings. This level of interaction doesn't exist in the current webapp.

## Solution

1. **Move compositing to the companion app** — it reads NDE files natively and composites with numpy, eliminating the CSV export step entirely
2. **Build a full-screen Scan Viewer page** in the webapp with OmniPC-style interactive controls, powered by the companion app's localhost API
3. **Streamline the inspection panel** — assign a folder to a vessel section, auto-generate composite, preview inline, open viewer for detailed work
4. **Deprecate the current `/cscan` compositor page** once the new workflow is adopted, then remove it

## Architecture

```
┌─ Webapp (browser) ──────────────────────────────────────┐
│                                                          │
│  Inspection Detail Page                                  │
│  ├── Section ↔ Folder pairing UI                        │
│  ├── Auto-generates composite on folder assignment      │
│  └── Inline preview (thumbnail + stats + "Open Viewer") │
│                                                          │
│  Scan Viewer Page (/projects/:id/vessels/:vid/viewer)   │
│  ├── C-scan heatmap with draggable crosshair cursors    │
│  ├── B-scan strips (axial + index, update on drag)      │
│  ├── A-scan waveform (update on click/drag)             │
│  ├── Full gate controls (OmniPC parity)                 │
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
| **Localhost API, no internet dependency** | All companion ↔ webapp communication is loopback (~1ms). Techs on rigs with bad internet get full interactive performance. Only cloud save needs connectivity. |
| **Pillow for interactive renders, matplotlib for export** | Matplotlib is 100-250ms per image (too slow for drag). Pillow + numpy colormap is 5-10ms — smooth enough for real-time cursor dragging. |
| **Folder-per-section convention** | Techs organize NDE files into subfolders by vessel section (Shell, Dome 1, Dome 2, etc.). Webapp explicitly pairs each section to a folder — no auto-guessing. |
| **Per-section gate settings** | Different sections can have different coating, geometry, and conditions. Each section gets independent gate configuration. |
| **Composites go through existing save pipeline** | `saveScanComposite()` stores metadata in `scan_composites` table + binary in Supabase Storage. The 3D modeller already imports from this — no modeller changes needed. |
| **Deprecate, don't remove immediately** | Current `/cscan` page stays until new workflow is proven. Handles edge case of reviewing previously exported CSVs without companion app running. |

## Companion App API Changes

### New Endpoints

**1. Subfolder listing**
```
GET /folders
→ {
    "folders": ["Dome 1", "Dome 2", "Shell", "Nozzle A"]
  }
```

Returns subfolders in the currently set directory that contain `.nde` files.

**2. Composite generation**
```
POST /create-composite
Request:
{
  "folder": "Shell",
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

Response:
{
  "data": [[15.2, 15.3, null, ...], ...],
  "xAxis": [0.0, 1.0, 2.0, ...],
  "yAxis": [4000.0, 4001.0, ...],
  "stats": {
    "min": 10.2,
    "max": 21.8,
    "mean": 18.4,
    "median": 19.1,
    "stdDev": 2.3,
    "validPoints": 350000,
    "totalPoints": 502000,
    "totalArea": 502000,
    "validArea": 350000,
    "ndPercent": 30.3,
    "ndCount": 152000,
    "ndArea": 152000
  },
  "sourceFiles": [
    {
      "filename": "NEV H-0310-2 4000-4500.nde",
      "minX": 0, "maxX": 1000,
      "minY": 4000, "maxY": 4502
    }
  ]
}
```

Response shape matches `ScanCompositeConfig` fields so the webapp can save directly through `saveScanComposite()` without transformation.

**3. Interactive cursor rendering**
```
POST /render-cursor
Request:
{
  "folder": "Shell",
  "scanMm": 300,
  "indexMm": 4200,
  "gateSettings": { ... },
  "views": ["bscan_axial", "bscan_index", "ascan"]
}

Response:
{
  "bscanAxial": "data:image/png;base64,...",
  "bscanIndex": "data:image/png;base64,...",
  "ascan": "data:image/png;base64,...",
  "metadata": {
    "scanLineMm": 300,
    "indexLineMm": 4200,
    "timeRangeUs": [-3.06, 17.34],
    "gatesShown": [0, 1, 2]
  }
}
```

Uses Pillow fast rendering path (<20ms total) for smooth drag interaction. B-scan = numpy colormap → `Image.fromarray()`. A-scan = `ImageDraw.line()` on blank image. Gate overlays = `ImageDraw.line()` at known time positions.

### Existing Endpoints (unchanged)

- `GET /status` — health + loaded directory
- `POST /set-directory` — point to NDE folder
- `GET /files` — list available NDEs
- `GET /file-info/{filename}` — full metadata
- `POST /cscan-export` — single file C-scan → CSV
- `POST /render-region` — B-scan/A-scan PNGs (matplotlib, export quality)
- `POST /render-ascan` — single A-scan PNG (matplotlib, export quality)

## Webapp Changes

### Inspection Detail Page

Minimal additions to the existing page:

1. **Section ↔ Folder pairing UI** — when companion is connected, each vessel section shows a dropdown of available companion subfolders (from `GET /folders`)
2. **Auto-composite on assignment** — selecting a folder triggers `POST /create-composite` with default gate settings
3. **Inline preview** — thumbnail heatmap, thickness stats (min/max/mean), source file count, "Open in Viewer" button
4. **Save to cloud** — happens automatically after composite generation, using existing `saveScanComposite()` service. Composite is immediately available in the 3D modeller.

### Scan Viewer Page (new)

**Route:** `/projects/:id/vessels/:vid/viewer?section=Shell`

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

**Interaction model:**

- **C-scan heatmap** — rendered client-side from the composite data (Plotly.js or canvas). Draggable crosshair cursors (vertical = axial B-scan slice, horizontal = index B-scan slice).
- **B-scan strips** — update in real-time as cursors are dragged. Webapp calls `POST /render-cursor` on drag. Pillow fast path keeps latency <20ms on localhost.
- **A-scan waveform** — updates on cursor drag. Shows the waveform at the crosshair intersection point.
- **Gate controls sidebar** — full OmniPC parity:
  - Gate start, width, threshold (per gate)
  - Synchro mode (pulse, relative to another gate)
  - Signal polarity (positive/negative)
  - Peak vs crossing detection
  - Geometry (sound path)
  - Measurement mode (A-I, B-A)
  - Recovery mode (crossing only, peak fallback)
  - Amplitude filters (per gate)
  - Thickness min/max filters
- **Re-generate** — calls `POST /create-composite` with current gate settings, updates the C-scan heatmap
- **Save to Cloud** — saves through existing `saveScanComposite()` pipeline, updates the inspection panel preview

**Gate control tiers:**

The companion app's gate capabilities depend on what the NDE file data supports:

| Tier | Capability | Requirement |
|------|-----------|-------------|
| **Filter-based** | Measurement mode, recovery mode, amplitude thresholds, thickness filters | Pre-computed RawCScan data (all files) |
| **Full re-gating** | Gate start/width repositioning, synchro mode changes, detection mode changes | Full A-scan window stored in NDE file (varies by instrument/setup) |

The webapp gate controls UI shows all options, but disables re-gating controls when the companion reports that the loaded files have truncated A-scan windows. A tooltip explains: "Gate repositioning unavailable — stored A-scan window does not cover the full gate range."

## 3D Modeller Compatibility

No changes needed to the 3D modeller. The companion-generated composites are saved through the same `saveScanComposite()` service, producing identical `ScanCompositeRecord` entries in the `scan_composites` table with binary data in Supabase Storage.

The modeller's `handleImportComposite()` fetches via `getScanComposite(id)` and transforms to `ScanCompositeConfig` — this works regardless of whether the composite was created by the webapp's web worker or the companion app's numpy engine.

**Required data shape from companion (must match `ScanCompositeConfig`):**
- `data: (number | null)[][]` — 2D thickness matrix
- `xAxis: number[]` — scan axis coordinates (mm)
- `yAxis: number[]` — index axis coordinates (mm)
- `stats: { min, max, mean, median, stdDev, validPoints, totalPoints, totalArea, validArea, ndPercent, ndCount, ndArea }`
- `sourceFiles: { filename, minX, maxX, minY, maxY }[]`

## Implementation Phases

### Phase 1: Companion App Enhancements
- Add `GET /folders` endpoint — scan subfolders containing `.nde` files
- Add `POST /create-composite` endpoint — composite all files in a folder, return structured thickness data
- Add `POST /render-cursor` endpoint — Pillow fast rendering for interactive B-scan/A-scan
- Investigate full A-scan window availability across different NDE files for re-gating support
- Ensure composite response shape matches `ScanCompositeConfig` fields exactly

### Phase 2: Webapp — Inspection Panel Integration
- Section ↔ folder pairing UI in inspection detail page (dropdown per section)
- Auto-generate composite on folder assignment via `POST /create-composite`
- Inline preview component (thumbnail + stats + "Open in Viewer" button)
- Auto-save to cloud through existing `saveScanComposite()` pipeline

### Phase 3: Webapp — Scan Viewer Page
- New route `/projects/:id/vessels/:vid/viewer`
- C-scan heatmap with draggable crosshair cursors (client-side rendering)
- B-scan strips + A-scan waveform panels (images from companion)
- Real-time updates on cursor drag via `POST /render-cursor`
- Full gate controls sidebar (all OmniPC controls, tiered by data availability)
- Re-generate composite with adjusted gate settings
- Save to cloud action

### Phase 4: Deprecation
- Add deprecation banner to current `/cscan` page directing techs to the new Scan Viewer
- Monitor adoption
- Remove `/cscan` page and associated components once transition is complete

## Known Constraints

- **A-scan truncation:** Some NDE files store a windowed portion of the waveform that doesn't cover all gate regions. Full gate repositioning is only possible when the stored window covers the target gates. Need to examine more files from different instruments/jobs to understand prevalence.
- **Companion app required:** The new workflow requires the companion app running locally. Without it, the inspection panel shows no scan controls. Previously saved composites are still viewable and work in the 3D modeller regardless.
- **Render performance:** Pillow fast path targets <20ms for smooth cursor dragging. If specific files produce very large B-scan slices, rendering may exceed this. Fallback: update on mouse-up instead of continuous drag.
- **Section naming:** Folder names must be manually paired to vessel sections. No auto-matching — explicit user assignment avoids ambiguity.
