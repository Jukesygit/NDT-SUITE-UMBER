# NDT Companion App — Build Plan

**Date:** 2026-04-08
**Design doc:** `docs/plans/2026-04-08-ndt-companion-app-design.md` (revision 5)

## Overview

We're building a standalone Python desktop app (`ndt-companion.exe`) that reads Evident HydroFORM NDE files (HDF5 format, ~650MB each) and does two things: (1) batch-exports C-scan thickness CSVs that the Matrix Portal webapp can import directly, replacing the manual one-at-a-time Evident export workflow; (2) serves rendered B-scan/A-scan images to the webapp on demand when an inspector annotates a region on the 3D vessel model. The app runs as a system tray icon with a localhost API. All heavy processing stays local; only small PNG images cross the wire.

## Prerequisites

- **Python 3.12+** installed on dev machine (confirmed: Python 3.13 at `C:\Users\jonas\AppData\Local\Programs\Python\Python313\python.exe`)
- **h5py** installed (`pip install h5py` — already installed)
- **Two test NDE files** available in `C:\Users\jonas\Downloads\`:
  - `NEV H-0310-2 3500-4000_2025_10_03 14h07m40s.nde`
  - `NEV H-0310-2 4000-4500_2025_10_03 14h24m50s.nde`
- **Matching Evident CSV exports** for at least one of these files (for final accuracy validation)
- **Matrix Portal webapp** running locally for Phase 3 integration testing
- A folder for the companion app project. Recommended: `C:\Users\jonas\OneDrive\Desktop\ndt-companion\`

## Build Steps

---

### Phase 1: Engine + Batch Export (standalone, no API needed)

This phase produces a working batch export tool that techs can use immediately. Everything else builds on top of it.

---

#### Step 1: Project scaffold and dependencies

**What:** Create the project folder structure and install dependencies.

```
ndt-companion/
├── main.py
├── engine/
│   ├── __init__.py
│   ├── models.py
│   ├── nde_reader.py
│   ├── cscan_export.py
│   ├── region_extract.py
│   └── image_renderer.py
├── api/
│   ├── __init__.py
│   ├── server.py
│   └── routes.py
├── ui/
│   ├── __init__.py
│   ├── tray.py
│   └── batch_window.py
├── config.py
├── requirements.txt
└── build.spec
```

`requirements.txt`:
```
h5py>=3.10
numpy>=1.26
matplotlib>=3.8
fastapi>=0.110
uvicorn>=0.29
pystray>=0.19
Pillow>=10.0
```

Run: `pip install -r requirements.txt`

**Why:** Get the skeleton in place so every subsequent step has a home. Install all deps upfront so we don't hit surprises mid-build.

**Files touched:** All of the above (empty `__init__.py` files, `requirements.txt`)
**Depends on:** Prerequisites

---

#### Step 2: Data models

**What:** Create Pydantic/dataclass models that every other module imports. These define the shared vocabulary.

`engine/models.py`:

```python
from dataclasses import dataclass, field
from typing import Optional
import numpy as np

@dataclass
class AxisInfo:
    offset: float      # meters
    quantity: int       # number of samples
    resolution: float   # meters per sample

    @property
    def range_mm(self) -> tuple[float, float]:
        start = self.offset * 1000
        end = start + (self.quantity - 1) * self.resolution * 1000
        return (start, end)

@dataclass
class GateInfo:
    id: int
    name: str
    sync_mode: str          # "Pulse" or "GateRelative"
    sync_gate_id: Optional[int]  # for GateRelative
    start: float            # seconds
    length: float           # seconds
    threshold: float        # percent (0-100)
    detection: str          # "Crossing" or "FirstPeak"

@dataclass
class FileIndex:
    path: str
    filename: str
    size_mb: float
    scan_axis: AxisInfo
    index_axis: AxisInfo
    time_axis: AxisInfo
    gates: list[GateInfo]
    beam_count: int
    velocity: float
    wave_mode: str
    valid_point_count: int
    n_gates_in_rawcscan: int  # usually 3
    rawcscan_available: bool
    rawcscan_chunk_valid: bool  # True if chunks == (1, n_index, n_gates)

@dataclass
class GateControlParams:
    gate_mode: str = "A-I"                  # "A-I" or "B-A"
    ref_recovery: str = "peak_fallback"     # "crossing_only" or "peak_fallback"
    meas_recovery: str = "crossing_only"
    min_amplitude_ref: int = 0              # raw int32 scale (0-32767)
    min_amplitude_meas: int = 0
    thickness_min: Optional[float] = None   # mm
    thickness_max: Optional[float] = None   # mm

    @staticmethod
    def pct_to_raw(pct: float) -> int:
        """Convert 0-100% amplitude to raw int32 scale (0-200% maps to 0-32767)."""
        return int(pct / 200.0 * 32767)

@dataclass
class CscanResult:
    data: np.ndarray            # (n_scans, n_index) float64, NaN = no data
    scan_axis_mm: np.ndarray    # (n_scans,)
    index_axis_mm: np.ndarray   # (n_index,)
    velocity: float
    valid_count: int
    total_count: int
    gate_mode: str
    stats: dict                 # min, max, mean, std

@dataclass
class RegionData:
    waveforms: np.ndarray       # (scan_count, index_count, time_samples) int16
    status: np.ndarray          # (scan_count, index_count) uint8
    scan_axis_mm: np.ndarray
    index_axis_mm: np.ndarray
    time_axis_us: np.ndarray
    clipped: bool
    actual_bounds: dict         # scanStartMm, scanEndMm, indexStartMm, indexEndMm
```

**Why:** Defining models first means every module speaks the same language. Avoids passing raw dicts/tuples around.

**Files touched:** `engine/models.py`
**Depends on:** Step 1

---

#### Step 3: NDE file reader and indexer

**What:** Build `engine/nde_reader.py` — the module that opens an NDE file, reads the Setup JSON, and returns a `FileIndex`. Also scans a folder and returns a list of indexed files.

Key functions:

- `index_file(path: str) -> FileIndex` — Opens one `.nde` file, reads `Public/Setup` JSON, parses axes/gates/beams/velocity, checks `Private/MXU/RawCScan` existence and chunk layout, counts valid points from `AScanStatus`. Returns `FileIndex`. Catches all exceptions and returns `None` for corrupt files (caller logs warning).

- `index_folder(folder_path: str) -> list[FileIndex]` — Globs `*.nde` in folder, calls `index_file` on each, skips failures.

Implementation details:
- Parse `Public/Setup` as JSON. Navigate: `setup["groups"][0]["datasets"][0]["dimensions"]` for axes, `setup["groups"][0]["processes"][0]["ultrasonicPhasedArray"]` for gates/beams/velocity.
- For `RawCScan` validation: check `ds.chunks == (1, n_index, n_gates)`. If not, set `rawcscan_chunk_valid = False`.
- For `valid_point_count`: read `AScanStatus` dataset, count where `(status & 1) > 0`. This is a full dataset read (~500KB) but only happens once at indexing.

**Why:** This is the foundation everything else calls. Batch export, API endpoints, and region extraction all start with `FileIndex`.

**Files touched:** `engine/nde_reader.py`
**Depends on:** Step 2

**Verification:** Run standalone:
```python
from engine.nde_reader import index_file
fi = index_file(r"C:\Users\jonas\Downloads\NEV H-0310-2 4000-4500_2025_10_03 14h24m50s.nde")
print(fi.filename, fi.scan_axis.range_mm, fi.index_axis.range_mm, fi.velocity, len(fi.gates), fi.valid_point_count)
```
Expected: filename, (0, 1000), (4000, 4501), 5890.0, 3, 235675.

---

#### Step 4: C-scan extraction engine

**What:** Build `engine/cscan_export.py` — reads `RawCScan` via `read_direct_chunk()`, applies gate control filters, returns `CscanResult`.

Key functions:

- `get_gate_time(gate_bytes: bytes, recovery_mode: str, min_amplitude: int) -> Optional[float]` — Extracts crossing or peak time from a 24-byte gate struct. Returns `None` if rejected by status, amplitude, or recovery mode.

- `extract_cscan(file_index: FileIndex, params: GateControlParams) -> CscanResult` — Main extraction. Reads all chunks and uses **vectorized numpy operations** (no Python inner loop). For each chunk:

```python
# Parse entire chunk at once — no per-cell Python loop
chunk_arr = np.frombuffer(chunk, dtype=np.uint8).reshape(n_index, n_gates, 24)

# Extract fields for ref gate in one shot
ref = chunk_arr[:, ref_gate_id]
ref_status = np.frombuffer(ref[:, 0:4].tobytes(), dtype=np.int32)
ref_amp = np.frombuffer(ref[:, 4:8].tobytes(), dtype=np.int32)
ref_crossing = np.frombuffer(ref[:, 8:12].tobytes(), dtype=np.float32)
ref_peak = np.frombuffer(ref[:, 12:16].tobytes(), dtype=np.float32)

# Same for meas gate
meas = chunk_arr[:, meas_gate_id]
# ... same pattern ...

# Boolean masks for filtering (vectorized, no loop)
ref_valid = ((ref_status == 0) | (ref_status == 1)) & (ref_amp >= min_amp_ref)
ref_recovered = (ref_status == 2) & (ref_recovery == 'peak_fallback') & (ref_amp >= min_amp_ref)
ref_time = np.where(ref_valid, ref_crossing, np.where(ref_recovered, ref_peak, np.nan))

# Same for meas, then compute thickness
thickness = (meas_time - ref_time) * velocity / 2 * 1000
# Apply thickness range filter
if thickness_min is not None:
    thickness[thickness < thickness_min] = np.nan
if thickness_max is not None:
    thickness[thickness > thickness_max] = np.nan

thickness_grid[scan_i, :] = thickness
```

This eliminates the inner Python loop entirely. The 0.02s timing from our validation was for raw chunk reads only; the per-cell `np.frombuffer` approach would add significant overhead at 3M+ calls. Vectorized numpy keeps total extraction under 0.5s per file.

- `cscan_to_csv(result: CscanResult, output_path: str, file_index: FileIndex, params: GateControlParams)` — Writes CSV in the exact format `fileParser.ts` expects: metadata header, "mm" marker row, tab-delimited data with "ND" for NaN, 1 decimal place.

Gate mode mapping:
- `"A-I"` → `gate_ids = (0, 1)` — Gate I as reference, Gate A as measurement
- `"B-A"` → `gate_ids = (1, 2)` — Gate A as reference, Gate B as measurement

**Why:** This is the core value — turning 650MB NDE files into 2MB CSVs the webapp already understands.

**Files touched:** `engine/cscan_export.py`
**Depends on:** Steps 2, 3

**Verification:** Run standalone against both test files:
```python
from engine.nde_reader import index_file
from engine.cscan_export import extract_cscan, cscan_to_csv
from engine.models import GateControlParams

fi = index_file(r"C:\Users\jonas\Downloads\NEV H-0310-2 3500-4000_2025_10_03 14h07m40s.nde")
params = GateControlParams(gate_mode="A-I", ref_recovery="peak_fallback")
result = extract_cscan(fi, params)
print(f"Valid: {result.valid_count}/{result.total_count} ({result.valid_count/result.total_count*100:.1f}%)")
print(f"Range: {result.stats['min']:.1f} - {result.stats['max']:.1f} mm")
cscan_to_csv(result, r"C:\Users\jonas\Downloads\test_export.csv", fi, params)
```
Expected: ~70% valid, 9-28mm range, CSV loadable in the webapp C-scan visualizer.

---

#### Step 5: Config persistence

**What:** Build `config.py` — loads/saves settings from `%APPDATA%/NDTCompanion/config.json`.

```python
import json, os
from pathlib import Path
from engine.models import GateControlParams

CONFIG_DIR = Path(os.environ.get("APPDATA", "~")) / "NDTCompanion"
CONFIG_FILE = CONFIG_DIR / "config.json"

DEFAULTS = {
    "port": 18923,
    "lastDirectory": None,
    "csvOutputSubfolder": "csv",
    "gateDefaults": {
        "mode": "A-I",
        "refRecovery": "peak_fallback",
        "measRecovery": "crossing_only",
        "refMinAmplitude": 0,
        "measMinAmplitude": 0,
        "thicknessMin": None,
        "thicknessMax": None,
    }
}

def load_config() -> dict: ...
def save_config(config: dict): ...
def get_gate_defaults() -> GateControlParams: ...
```

**Why:** Techs shouldn't re-enter the same folder path or gate settings every time they launch the app.

**Files touched:** `config.py`
**Depends on:** Step 2

---

#### Step 6: Batch export window (tkinter)

**What:** Build `ui/batch_window.py` — standalone tkinter window launched via `multiprocessing.Process`. This is the part that works without the webapp.

Layout (top to bottom):
1. **Folder selector** — text field + Browse button. On selection, calls `index_folder()`, populates file list.
2. **Gate settings frame** — radio buttons (A-I / B-A), per-gate recovery dropdowns, per-gate amplitude spinboxes, thickness min/max entries.
3. **File list** — `ttk.Treeview` with columns: checkbox, filename, coverage %. Files incompatible with selected gate mode greyed out.
4. **Output folder** — text field + Browse. Defaults to `{nde_folder}/csv/`.
5. **Action buttons** — Select All, Deselect All, Export Selected, Refresh Coverage.
6. **Progress bar** — `ttk.Progressbar` + status label.

Export runs in a `threading.Thread` within the batch process:
- For each selected file: `extract_cscan()` → `cscan_to_csv()` → update progress.
- On filename collision: before export starts, check all output paths. If any exist, prompt once with a global policy dialog: "Some output files already exist. For all conflicts: [Overwrite] [Skip] [Rename with _N suffix]". Apply the chosen policy to all collisions during the batch. No per-file prompts.
- On error: log, mark file as failed in list, continue.
- On cancel: stop after current file, keep completed exports.

"Refresh Coverage" button: for each file, run `extract_cscan()` with current gate settings, compute `valid_count/total_count`, update the coverage % column. Don't write any files.

**Process isolation:** The batch window runs as a `multiprocessing.Process` — a separate Python interpreter. It does NOT share state with the API server. It calls `index_folder()` independently when the user picks a folder. Changing the folder in the batch window doesn't update the API's file cache, and vice versa. This is intentional — the batch window is a standalone tool that works without the API. If state sync is needed later, use a `multiprocessing.Queue`, but that's not needed for v1.

Entry point:
```python
def launch_batch_window(initial_folder: str = None, gate_defaults: GateControlParams = None):
    """Called via multiprocessing.Process from main.py or standalone."""
    root = tk.Tk()
    root.title("NDT Companion — Batch Export")
    # ... build UI ...
    root.mainloop()
```

**Why:** This is the highest-value deliverable — saves techs hours of manual Evident exports. Building it before the API means it's testable and useful immediately.

**Files touched:** `ui/batch_window.py`
**Depends on:** Steps 3, 4, 5

**Verification:** Run standalone:
```python
from ui.batch_window import launch_batch_window
launch_batch_window(initial_folder=r"C:\Users\jonas\Downloads")
```
Select folder with NDE files, configure gate settings, export. Load resulting CSVs in the webapp C-scan visualizer. Should look identical to the validation CSVs we generated earlier.

---

### Phase 2: Region Rendering + API

This phase adds the localhost API that the webapp will call for B-scan/A-scan images.

---

#### Step 7: Region extraction

**What:** Build `engine/region_extract.py` — slices A-scan waveforms from the HDF5 file for a given spatial region.

Key function:

- `extract_region(file_index: FileIndex, scan_start_mm, scan_end_mm, index_start_mm, index_end_mm) -> RegionData`

Implementation:
1. Convert mm to array indices: `idx = round((mm / 1000 - axis.offset) / axis.resolution)`
2. Clamp to `[0, axis.quantity - 1]`
3. Check if region exceeds 300×300mm → raise error
4. Open HDF5, slice `AScanAmplitude[scan_i0:scan_i1, idx_i0:idx_i1, :]` and `AScanStatus[scan_i0:scan_i1, idx_i0:idx_i1]`
5. Build axis arrays, set `clipped` flag if bounds were clamped

**Why:** B-scan and A-scan rendering need the raw waveform data for a specific region. This is the data layer; rendering is separate.

**Files touched:** `engine/region_extract.py`
**Depends on:** Steps 2, 3

---

#### Step 8: Image renderer

**What:** Build `engine/image_renderer.py` — takes `RegionData` and renders B-scan / A-scan images as PNG bytes using matplotlib.

Key functions:

- `render_bscan(region: RegionData, axis: str, position_mm: float, gate_overlays: list[GateInfo] = None) -> bytes`
  - `axis="axial"`: slice `waveforms[:, index_at_pos, :]`, X = scan position mm, Y = time us
  - `axis="index"`: slice `waveforms[scan_at_pos, :, :]`, X = index position mm, Y = time us
  - Render with `imshow`, grayscale colormap, extent from axis arrays
  - Y-axis label: "Time (us)" (NOT depth — stored A-scan is truncated)
  - If `gate_overlays` provided: draw horizontal lines where gate start/end fall within the displayed time range. **For gates that fall outside the displayed window** (common — stored A-scan ends at ~17us but gate times are 21-38us), draw an annotation at the bottom edge: e.g., "Gate I start: 15.9 us" with an arrow, or "Gate A: 25.2 us (off-screen)" as a text label. This gives the tech spatial context for where the gates are relative to what they're seeing.
  - Return PNG bytes via `BytesIO` + `fig.savefig(format='png', bbox_inches='tight', dpi=150)`
  - Always call `plt.close(fig)` to prevent memory leaks

- `render_ascan(region: RegionData, scan_mm: float, index_mm: float, gate_overlays: list[GateInfo] = None) -> bytes`
  - Plot waveform as line chart: X = time us, Y = amplitude
  - If `gate_overlays` provided, draw shaded rectangles for gate regions
  - Return PNG bytes

**Why:** Server-side rendering means no large data transfers and the webapp just displays `<img>` tags. Full resolution always, no downsampling concerns.

**Files touched:** `engine/image_renderer.py`
**Depends on:** Step 7

**Verification:** Run standalone:
```python
from engine.nde_reader import index_file
from engine.region_extract import extract_region
from engine.image_renderer import render_bscan, render_ascan

fi = index_file(r"C:\Users\jonas\Downloads\NEV H-0310-2 3500-4000_2025_10_03 14h07m40s.nde")
region = extract_region(fi, 400, 600, 3700, 3800)
bscan_png = render_bscan(region, "axial", 3750.0, fi.gates)
ascan_png = render_ascan(region, 500.0, 3750.0, fi.gates)

with open("test_bscan.png", "wb") as f: f.write(bscan_png)
with open("test_ascan.png", "wb") as f: f.write(ascan_png)
```
Open the PNGs. B-scan should show a 2D grayscale image with time on Y-axis. A-scan should show a waveform line plot with gate region overlays.

---

#### Step 9: FastAPI server and routes

**What:** Build `api/server.py` (app factory, CORS, port selection) and `api/routes.py` (all endpoint handlers).

`api/server.py`:
- Create FastAPI app with CORS middleware (`allow_origins=["*"]`)
- Port selection: try 18923, increment up to 18932 if occupied. Write actual port to config.
- `start_server(file_index_cache: dict)` — runs uvicorn in current thread. The caller (main.py) runs this in a daemon thread.
- The `file_index_cache` is a shared dict holding the current folder path and list of `FileIndex` objects. Thread safety: use immutable swap pattern — build the new file list completely, then atomically replace the reference (`file_cache["files"] = new_list`). Python's GIL makes single-key assignment atomic. Never mutate the list in place (no `.append()` or `.pop()` on the shared list).

`api/routes.py` — all endpoints:

1. `GET /status` → return `{"app": "ndt-companion", "version": "1.0.0", "running": true, "directory": ..., "fileCount": ...}`

2. `POST /set-directory` → call `index_folder()`, update cache, return file list

3. `GET /files` → return cached file list (lightweight metadata only)

4. `GET /file-info/{filename}` → return full metadata for one file from cache

5. `POST /cscan-export` → parse `GateControlParams` from body, find file in cache, call `extract_cscan()` + `cscan_to_csv()` to a temp file, return as `FileResponse`

6. `POST /render-region` → parse bounds + gate params, find file in cache, call `extract_region()`, call `render_bscan()`/`render_ascan()` for requested views, return base64 data URIs in JSON

7. `POST /render-ascan` → parse point coords, find file, extract small region (1x1), render A-scan, return base64 + metadata

**Why:** This is what the webapp talks to. Building it after the engine means every endpoint is a thin wrapper around tested engine functions.

**Files touched:** `api/server.py`, `api/routes.py`
**Depends on:** Steps 3, 4, 7, 8

**Verification:** Start server manually, test with curl/browser:
```bash
curl http://localhost:18923/status
curl -X POST http://localhost:18923/set-directory -H "Content-Type: application/json" -d '{"path":"C:/Users/jonas/Downloads"}'
curl http://localhost:18923/files
```

---

### Phase 3: System Tray + Webapp Integration

---

#### Step 10: System tray

**What:** Build `ui/tray.py` and wire up `main.py` as the entry point.

`ui/tray.py`:
- Uses `pystray` to create a system tray icon
- Icon: simple colored circle (green = running + files indexed, yellow = running + no folder)
- Right-click menu items:
  - "Open Batch Export" → launch `batch_window.py` via `multiprocessing.Process`
  - "Set NDE Folder..." → `tkinter.filedialog.askdirectory()` (in a subprocess to avoid thread issues), then call `index_folder()` and update cache
  - "Status" → show notification with port, directory, file count
  - "Quit" → shutdown uvicorn, exit

`main.py`:
```python
import threading
from config import load_config
from api.server import start_server
from ui.tray import run_tray

def main():
    config = load_config()
    file_cache = {}
    
    # Auto-index last directory if set
    if config.get("lastDirectory"):
        from engine.nde_reader import index_folder
        file_cache["files"] = index_folder(config["lastDirectory"])
        file_cache["directory"] = config["lastDirectory"]
    
    # Start API in daemon thread
    api_thread = threading.Thread(
        target=start_server,
        args=(file_cache, config),
        daemon=True
    )
    api_thread.start()
    
    # Run tray on main thread (required by pystray on Windows)
    run_tray(file_cache, config)

if __name__ == "__main__":
    main()
```

**Why:** This is the user-facing shell that ties everything together. Pystray requires the main thread on Windows.

**Files touched:** `main.py`, `ui/tray.py`
**Depends on:** Steps 5, 6, 9

**Verification:** Run `python main.py`. Green tray icon appears. Right-click → Set NDE Folder → select Downloads folder. Right-click → Open Batch Export → window opens. Open browser to `http://localhost:18923/status` → returns JSON. All three paths work independently.

---

#### Step 11: Webapp connection hook

**What:** Add `useCompanionApp` React Query hook to the Matrix Portal webapp.

Create `src/hooks/queries/useCompanionApp.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';

async function discoverCompanionPort(): Promise<number | null> {
  for (let port = 18923; port <= 18932; port++) {
    try {
      const res = await fetch(`http://localhost:${port}/status`, {
        signal: AbortSignal.timeout(500),
      });
      const data = await res.json();
      if (data.app === 'ndt-companion') return port;
    } catch {
      continue;
    }
  }
  return null;
}

export function useCompanionApp() {
  const { data } = useQuery({
    queryKey: ['companion-status'],
    queryFn: async () => {
      const port = await discoverCompanionPort();
      if (!port) return null;
      const res = await fetch(`http://localhost:${port}/status`);
      return { ...(await res.json()), port };
    },
    retry: false,
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  return {
    connected: !!data?.running,
    port: data?.port ?? null,
    directory: data?.directory ?? null,
    fileCount: data?.fileCount ?? 0,
  };
}
```

Also create `src/hooks/queries/useCompanionFiles.ts` for fetching available NDE files when connected.

**Why:** The webapp needs to detect the companion app without breaking when it's not running. React Query's retry/polling handles this cleanly.

**Files touched:** `src/hooks/queries/useCompanionApp.ts`, `src/hooks/queries/useCompanionFiles.ts`
**Depends on:** Step 9 (API must exist to test against)

---

#### Step 12: Add `sourceNdeFile` to ScanCompositeConfig

**What:** Add an optional `sourceNdeFile` field to `ScanCompositeConfig` in the webapp. Populate it when a CSV is loaded.

In `src/components/VesselModeler/types.ts`, add to `ScanCompositeConfig`:
```typescript
sourceNdeFile?: string;
```

In `src/components/CscanVisualizer/CscanVisualizer.tsx` (or wherever composites are created from CSVs), extract a likely NDE filename from the CSV filename and store it on the composite. Pattern: if CSV is named `NEV_H-0310-2_4000-4500_extracted.csv`, the source NDE file is `NEV H-0310-2 4000-4500*.nde`.

**Why:** This enables auto-matching between composites on the vessel and NDE files in the companion app.

**Files touched:** `src/components/VesselModeler/types.ts`, CSV import logic
**Depends on:** Step 11

---

#### Step 13: Inspection panel enhancement

**What:** Add a "Detailed Scan Data" section to `InspectionPanel.tsx` that appears when the companion app is connected and an annotation overlaps a composite with a matched NDE file.

UI additions (below existing thickness stats):
1. Status line: "Companion App Connected" or hidden if not
2. NDE file dropdown (auto-selected if `sourceNdeFile` matches, manual override available)
3. "Load Detailed Scan Data" button
4. B-scan images (axial + circumferential) as `<img>` elements
5. A-scan image that updates on C-scan click
6. Gate overlay toggle checkbox
7. "Export Images" button (downloads the current PNGs)

The coordinate conversion (annotation vessel coords → NDE file coords) reuses the existing math from `annotation-stats.ts`'s `sampleComposite()`. Extract it into a shared utility:
```typescript
function annotationToNdeCoords(annotation, composite, circumference) → { scanStartMm, scanEndMm, indexStartMm, indexEndMm }
```

**Why:** This is where the companion app's B-scan/A-scan rendering meets the webapp's annotation workflow. The inspection panel already shows thickness stats; this adds the waveform detail underneath.

**Files touched:** `src/components/VesselModeler/sidebar/InspectionPanel.tsx`, new utility function file
**Depends on:** Steps 11, 12

---

### Phase 4: Packaging

---

#### Step 14: PyInstaller build

**What:** Create `build.spec` for PyInstaller single-file exe.

```bash
pip install pyinstaller
pyinstaller --onefile --windowed --name ndt-companion --icon=icon.ico main.py
```

Key flags:
- `--onefile` — single exe, no folder of files
- `--windowed` — no console window (tray app)
- `--hidden-import=h5py` — PyInstaller sometimes misses h5py's C extensions

Test the exe on a clean Windows machine (or VM) without Python installed.

**Why:** Techs download one file and double-click it. No Python, no pip, no terminal.

**Files touched:** `build.spec`
**Depends on:** All previous steps

---

## Verification

End-to-end test after all steps:

1. **Launch `ndt-companion.exe`** — green tray icon appears
2. **Right-click → Set NDE Folder** → select folder with NDE files → files indexed
3. **Right-click → Open Batch Export** → window opens, files listed with coverage %
4. **Adjust gate settings** → refresh coverage → values update
5. **Export selected** → CSVs appear in output folder
6. **Load CSVs in webapp C-scan visualizer** → heatmaps display correctly
7. **Map composites to vessel in webapp** → annotations work
8. **Open browser DevTools** → companion status shows connected
9. **Select annotation overlapping a composite** → "Load Detailed Scan Data" button appears
10. **Click load** → B-scan and A-scan images render in the inspection panel
11. **Click a point on the C-scan** → A-scan updates to that point
12. **Export images** → PNGs download
13. **Close companion app** → webapp continues working, detailed scan section disappears gracefully

If all 13 checks pass, ship it.
