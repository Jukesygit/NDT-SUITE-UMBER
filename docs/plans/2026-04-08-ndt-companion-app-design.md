# NDT Companion App — Design Document

**Date:** 2026-04-08
**Status:** Approved design, pre-implementation
**Revision:** 5 (post-review fixes)

## Problem

NDE files from phased array UT instruments (e.g., Evident HydroFORM) are HDF5 containers holding full A-scan waveform data — typically 500-700MB per file. The Matrix Portal webapp currently only works with CSV-derived C-scan data, losing access to A-scans and B-scans that are critical for wall loss characterization, flaw sizing, data validation, and reporting.

Additionally, techs must manually open each NDE file in vendor software and export CSVs one at a time — a tedious process for multi-strip vessel inspections.

## Solution

A lightweight local companion app (Python, single `.exe`) that:

1. **Batch exports C-scan CSVs** from NDE files — standalone UI, works without the webapp
2. **Serves rendered scan images on demand** — localhost API that the webapp calls when an inspector annotates a region and wants A-scan/B-scan views. All processing and rendering happens locally; only lightweight PNG images are sent to the webapp.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  NDT Companion App (Python, single .exe)        │
│                                                  │
│  ┌──────────────┐  ┌─────────────────────────┐  │
│  │ System Tray   │  │ Batch Export Window     │  │
│  │ (pystray)     │  │ (separate process via   │  │
│  │               │  │  multiprocessing)        │  │
│  │ • Status LED  │  │                         │  │
│  │ • Open batch  │  │ • Select folder         │  │
│  │   export      │  │ • List NDE files        │  │
│  │ • Settings    │  │ • Pick gate per file    │  │
│  │ • Quit        │  │ • Export all → CSV      │  │
│  └──────┬───────┘  └─────────────────────────┘  │
│         │                                        │
│  ┌──────▼────────────────────────────────────┐  │
│  │ FastAPI Server (localhost, auto-port)      │  │
│  │                                            │  │
│  │ GET  /status         → health + loaded dir │  │
│  │ POST /set-directory  → point to NDE folder │  │
│  │ GET  /files          → list available NDEs │  │
│  │ GET  /file-info/{f}  → gates, beams, axes  │  │
│  │ POST /cscan-export   → C-scan → CSV        │  │
│  │ POST /render-region  → B-scan/A-scan PNGs  │  │
│  │ POST /render-ascan   → single A-scan PNG   │  │
│  └──────┬────────────────────────────────────┘  │
│         │                                        │
│  ┌──────▼────────────────────────────────────┐  │
│  │ NDE Engine (h5py + numpy + matplotlib)    │  │
│  │                                            │  │
│  │ • File indexing (metadata cache)           │  │
│  │ • Memory-mapped HDF5 reads                 │  │
│  │ • Gate extraction → C-scan thickness map   │  │
│  │ • Region slicing → A-scan / B-scan arrays  │  │
│  │ • Image rendering (matplotlib)             │  │
│  │ • CSV formatting (matches webapp format)   │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

Three layers: **UI** (tray + batch window), **API** (FastAPI), **Engine** (HDF5 processing + rendering).

### Threading Model

- **Main thread:** pystray (system tray) — requires main thread on Windows
- **Daemon thread:** FastAPI/uvicorn — stateless API server
- **Separate process:** Tkinter batch export window — launched via `multiprocessing` to avoid tkinter thread-safety issues. Can crash without taking down the API server.

## NDE File Format

NDE files are HDF5 (Hierarchical Data Format v5). Confirmed structure from sample file (`NEV H-0310-2 4000-4500_2025_10_03 14h24m50s.nde`, 652MB):

| Dataset | Shape | Meaning |
|---------|-------|---------|
| `Public/Groups/0/Datasets/0-AScanAmplitude` | (1001, 502, 680) | Full waveforms: scan x index x time (int16) |
| `Public/Groups/0/Datasets/1-AScanStatus` | (1001, 502) | Validity bitfield: hasData=1, saturated=2, noSynchro=4 |
| `Public/Groups/0/Datasets/2-FiringSource` | (1001, 502) | Beam ID (0-58) per position |
| `Public/Setup` | JSON string | Full config: axes, gates, beams, velocity, probe |
| `Private/MXU/RawCScan` | (1001, 502, 3) | Pre-computed gate results (24-byte struct, DECODED — see below) |

### Axis Calibration (from Setup JSON)

| Axis | Offset | Quantity | Resolution | Physical Range |
|------|--------|----------|------------|----------------|
| UCoordinate (scan) | 0.0 m | 1001 | 0.001 m | 0–1000 mm |
| VCoordinate (index) | 4.0 m | 502 | 0.001 m | 4000–4502 mm |
| Ultrasound (time) | -3.06 us | 680 | 30 ns | -3.06 to 17.34 us |

### Gate Definitions (from Setup JSON)

| Gate | Name | Sync | Start | Length | Threshold | Detection |
|------|------|------|-------|--------|-----------|-----------|
| 0 | Gate I | Pulse | 15.91 us | 10.19 us | 20% | Crossing |
| 1 | Gate A | Relative to Gate 0 | +3.40 us | 6.11 us | 20% | Crossing |
| 2 | Gate B | Relative to Gate 1 | +2.72 us | 6.79 us | 20% | Crossing |

**Thickness formula** (from Process 1): `thickness = (Gate A crossing - Gate I crossing) × velocity / 2`

### Probe Configuration

- 64-element phased array, 6-element aperture, 59 beams
- Linear electronic scan (all beams at 0° refracted angle)
- Longitudinal wave, 5890 m/s, 20mm true-depth focus
- "Paintbrush" storage mode: instrument resolves best beam per grid cell

### RawCScan Struct (Decoded)

The `Private/MXU/RawCScan` dataset uses HDF5 opaque type (`H5T_OPAQUE`, 24 bytes). Standard h5py reads fail, but raw bytes are accessible via `read_direct_chunk()`. Decoded struct:

| Offset | Type | Field | Meaning |
|--------|------|-------|---------|
| 0-3 | int32 | status | 0=valid crossing, 1=valid but saturated, 2=no crossing (signal present but detection failed), 4=dependent gate failed, 16=no data |
| 4-7 | int32 | amplitude | Peak amplitude (int16 scale, 0-32767 = 0-200%) |
| 8-11 | float32 | crossing_time | Gate crossing time in seconds |
| 12-15 | float32 | peak_time | Peak time within gate in seconds |
| 16-19 | float32 | gate_start | Computed gate start in seconds |
| 20-23 | float32 | gate_end | Computed gate end in seconds |

**Verified:** Thickness = `(Gate A crossing - Gate I crossing) × velocity / 2` produces 19.4-22.4mm across sampled points, within the expected 10-22mm range.

**Performance:** Reading all 1001 chunks (complete C-scan extraction): **0.02 seconds**.

### Critical Finding: Stored A-Scan Window is Truncated

The stored A-scan data covers -3.06 to 17.34 us, but gate crossing times in RawCScan are 21-29 us — **beyond the stored A-scan window**. The instrument computed gate results from the full acquisition, then stored only a portion of the waveform. This means:

1. **C-scan thickness MUST come from RawCScan**, not from gating stored A-scans
2. **Stored A-scans are still useful** for B-scan visualization and signal quality assessment, but they don't contain the backwall echoes needed for thickness computation
3. The gate timing offset that made raw A-scan gating fail is not a bug — it's by design. The instrument stores a focused window of the waveform for visualization while keeping gate results separately.

### Validation Results

Extraction validated against Evident CSV exports using two NDE files:
- `NEV H-0310-2 3500-4000` — 70.6% coverage with peak fallback, visual match confirmed
- `NEV H-0310-2 4000-4500` — 46.3% coverage with peak fallback, visual match confirmed

Struct layout is consistent across both files. Thickness values and spatial distribution match Evident output.

### Measurement Modes (from validation testing)

| Mode | Formula | Coverage | Noise | Use Case |
|------|---------|----------|-------|----------|
| **A-I crossing** | Gate A crossing − Gate I crossing | 2-4% | Low (±0.5mm) | Cleanest, but very sparse due to Gate I failures |
| **A-I with peak fallback** | Uses peak_time where crossing fails | 40-70% | Medium (±1.5mm) | Best coverage, includes coating thickness |
| **B-A echo-to-echo** | Gate B crossing − Gate A crossing | 30-37% | High (±3.8mm) | Steel only (excludes coating), but noisy — second backwall echo is weak |

**Recommended default: A-I with peak fallback** — best balance of coverage and accuracy. The coating contribution is consistent (~4.4mm) and doesn't add meaningful noise. Gate control lets techs adjust per-job.

### Key Finding: Peak Fallback Noise

Status=2 on Gate I means the crossing detection failed, but the signal IS present — all rejected points have valid amplitudes above threshold and valid peak times (mean 21.67us, matching valid crossings at 21.61us). The crossing algorithm fails because the signal is already above threshold at the gate start (no rising edge), not because the echo is missing.

Using peak_time instead of crossing_time introduces ~0.5mm systematic offset (peak occurs slightly after crossing) with ±0.3mm scatter. This is acceptable for corrosion mapping.

## Implementation Strategy

### Phase 1: Engine + Batch Export

1. `nde_reader.py` — file indexing, metadata extraction
2. `cscan_export.py` — gate extraction, CSV formatting (depends on spike)
3. `batch_window.py` — standalone batch export UI

### Phase 2: Region Rendering + API

4. `region_extract.py` — A-scan/B-scan slicing from raw waveforms
5. `image_renderer.py` — matplotlib rendering to PNG
6. FastAPI server + all endpoints

### Phase 3: Webapp Integration

7. System tray integration
8. Webapp connection hook + inspection panel enhancement

### Phase 4: Packaging

9. PyInstaller build + testing on clean Windows machine

## NDE Engine

### File Indexing

On folder selection, read only the setup JSON from each `.nde` file (~1KB cached per file):

```python
@dataclass
class FileIndex:
    path: str
    filename: str
    size_mb: float
    scan_axis: AxisInfo      # UCoordinate
    index_axis: AxisInfo     # VCoordinate
    time_axis: AxisInfo      # Ultrasound
    gates: list[GateInfo]    # id, name, sync mode, detection
    beam_count: int
    velocity: float          # m/s
    wave_mode: str           # "Longitudinal"
    valid_point_count: int   # from AScanStatus quick scan
```

Indexing 20 files: under 1 second.

### C-Scan Extraction (from RawCScan)

**Primary path:** Read pre-computed gate results from `Private/MXU/RawCScan` via `read_direct_chunk()`.

**Chunk validation:** On file open, verify `ds.chunks == (1, n_index, n_gates)`. If the chunk layout differs, reject the file with a clear error: "Unsupported RawCScan chunk layout: expected (1, N, 3), got (X, Y, Z)." This check happens during file indexing so the user sees the issue immediately, not during export.

```python
def extract_cscan(file_path: str, gate_ids: tuple[int, int] = (0, 1)) -> CscanResult:
    """Extract thickness C-scan from RawCScan.
    
    gate_ids: (reference_gate, measurement_gate) — thickness = measurement - reference
    Default (0, 1) = Gate I to Gate A = standard wall thickness
    """
    with h5py.File(file_path, 'r') as f:
        ds = f['Private/MXU/RawCScan']
        n_scans = ds.shape[0]
        n_index = ds.shape[1]
        
        thickness_grid = np.full((n_scans, n_index), np.nan)
        
        for scan_i in range(n_scans):
            _, chunk = ds.id.read_direct_chunk((scan_i, 0, 0))
            raw = np.frombuffer(chunk, dtype=np.uint8).reshape(n_index, 3, 24)
            
            for idx_i in range(n_index):
                g_ref = raw[idx_i, gate_ids[0]]
                g_meas = raw[idx_i, gate_ids[1]]
                
                ref_status = np.frombuffer(g_ref[0:4], dtype=np.int32)[0]
                meas_status = np.frombuffer(g_meas[0:4], dtype=np.int32)[0]
                
                # Status 0 and 1 both have valid crossing times
                # (1 = saturated signal, but crossing was still found)
                # Status 2 = no crossing, use peak_time if recovery enabled
                # Status 4, 16 = no usable data
                ref_time = get_gate_time(g_ref, ref_recovery, min_amp_ref)
                meas_time = get_gate_time(g_meas, meas_recovery, min_amp_meas)
                
                if ref_time is not None and meas_time is not None:
                    t = (meas_time - ref_time) * velocity / 2 * 1000
                    if thickness_min is not None and t < thickness_min:
                        continue
                    if thickness_max is not None and t > thickness_max:
                        continue
                    thickness_grid[scan_i, idx_i] = t
    
    return CscanResult(data=thickness_grid, ...)

def get_gate_time(gate_bytes, recovery_mode, min_amplitude):
    """Extract time from a 24-byte gate struct.
    Returns crossing/peak time in seconds, or None if rejected."""
    status = np.frombuffer(gate_bytes[0:4], dtype=np.int32)[0]
    amp = np.frombuffer(gate_bytes[4:8], dtype=np.int32)[0]
    
    # Amplitude filter applies to ALL statuses — reject weak echoes
    if amp < min_amplitude:
        return None
    
    if status in (0, 1):  # valid crossing (1 = saturated but still usable)
        return np.frombuffer(gate_bytes[8:12], dtype=np.float32)[0]
    elif status == 2 and recovery_mode == 'peak_fallback':
        return np.frombuffer(gate_bytes[12:16], dtype=np.float32)[0]
    return None  # status 4, 16, or recovery not enabled
```

**Performance: ~0.02 seconds per file** (1001 chunks, sequential read). A 20-file batch completes in under 1 second.

**Shared entry point:** Both the batch export window and the `POST /cscan-export` API endpoint call the same `extract_cscan()` engine function with identical parameters. The batch window passes them from UI state; the API passes them from the request body. The engine function is the single source of truth for extraction logic.

**Fallback:** If `Private/MXU/RawCScan` is missing (unlikely but possible in non-MXU instruments), return an error explaining the file doesn't contain pre-computed gate data.

### Gate Control

The companion app provides per-export gate adjustment using data already in RawCScan (no raw A-scan re-gating needed):

```
┌─ Gate Control ───────────────────────────────────────┐
│                                                       │
│  Measurement:  ○ A-I (interface to backwall)          │
│                ○ B-A (echo-to-echo, steel only)       │
│                                                       │
│  Reference gate (I):                                  │
│  Recovery: [▼ Peak fallback]   Min amp: [████░░] 10%  │
│                                                       │
│  Measurement gate (A):                                │
│  Recovery: [▼ Crossing only]   Min amp: [██████] 20%  │
│                                                       │
│  Thickness filter:                                    │
│  Min: [10.0] mm    Max: [25.0] mm                    │
│                                                       │
│  Preview: ████████░░ 45.2% coverage  [Refresh]       │
│                                                       │
│  [Apply & Export]  [Reset to File Defaults]           │
└───────────────────────────────────────────────────────┘
```

**What each control does:**

| Control | Effect | Data Source |
|---------|--------|-------------|
| **Measurement mode** | Which gate pair to subtract (A-I vs B-A) | RawCScan gate indices |
| **Recovery mode (per gate)** | Whether to use `peak_time` when `crossing_time` fails (status=2). Independent per gate — peak fallback on the reference gate (I) adds ~0.5mm scatter; on the measurement gate (A) adds different noise. Tech controls the trade-off. | RawCScan `peak_time` field |
| **Amplitude filter (per gate)** | Reject points where gate amplitude < threshold — removes weak/spurious echoes | RawCScan `amplitude` field |
| **Thickness filter** | Reject values outside min-max range — clips obvious outliers | Computed thickness |

All filtering operates on pre-computed RawCScan fields. No raw A-scan re-gating required. Coverage preview updates on `[Refresh]` click (debounced, not live — avoids sluggishness when adjusting sliders).

**CSV output format** (must exactly match what `fileParser.ts` parses):

```
Min Thickness (mm)=10.2
Max Thickness (mm)=21.8
IndexStart (mm)=4000.0
ScanStart (mm)=0.0
Velocity (m/s)=5890.0
Gate=A (Crossing)
mm	0.0	1.0	2.0	3.0	...
4000.0	15.2	15.3	ND	15.1	...
4001.0	15.1	15.2	15.3	15.0	...
```

Key format rules:
- Tab-delimited
- First line with "mm" is the header with scan axis coordinates
- First column of each data row is the index axis coordinate
- "ND" for null values (no crossing found, no data, bad status)
- Decimal precision: 1 decimal place for thickness values

### Region Extraction (for Annotation Detail)

Memory-mapped HDF5 slice — only reads the requested region from disk:

```python
def extract_region(file_path, scan_start_mm, scan_end_mm, index_start_mm, index_end_mm):
    # Convert mm positions to array indices using axis metadata
    scan_i0 = round((scan_start_mm / 1000 - scan_axis.offset) / scan_axis.resolution)
    scan_i1 = round((scan_end_mm / 1000 - scan_axis.offset) / scan_axis.resolution)
    idx_i0 = round((index_start_mm / 1000 - index_axis.offset) / index_axis.resolution)
    idx_i1 = round((index_end_mm / 1000 - index_axis.offset) / index_axis.resolution)

    # Clamp to valid range
    scan_i0 = max(0, min(scan_i0, scan_axis.quantity - 1))
    # ... same for others

    with h5py.File(file_path, 'r') as f:
        block = f['Public/Groups/0/Datasets/0-AScanAmplitude'][scan_i0:scan_i1, idx_i0:idx_i1, :]
        status = f['Public/Groups/0/Datasets/1-AScanStatus'][scan_i0:scan_i1, idx_i0:idx_i1]

    return RegionData(
        waveforms=block,
        status=status,
        scan_axis_mm=np.linspace(scan_start_mm, scan_end_mm, scan_i1-scan_i0),
        index_axis_mm=np.linspace(index_start_mm, index_end_mm, idx_i1-idx_i0),
        time_axis_us=np.linspace(time_axis.offset*1e6, ...),
        clipped=any bounds were clamped,
        actual_bounds={scan_start_mm, scan_end_mm, index_start_mm, index_end_mm},
    )
```

### Image Rendering

All visualization is rendered server-side using matplotlib. The webapp receives only PNG images.

```python
def render_bscan(region: RegionData, axis: str, position_mm: float) -> bytes:
    """Render a B-scan cross-section as a PNG image."""
    if axis == 'axial':
        slice_data = region.waveforms[:, index_at_position, :]
        x_label = 'Scan position (mm)'
    else:
        slice_data = region.waveforms[scan_at_position, :, :]
        x_label = 'Index position (mm)'

    fig, ax = plt.subplots(figsize=(10, 4), dpi=150)
    ax.imshow(slice_data.T, aspect='auto', cmap='gray',
              extent=[x_start, x_end, time_max_us, time_min_us])
    ax.set_xlabel(x_label)
    ax.set_ylabel('Time (us)')
    # Note: Y-axis is time, not depth. The stored A-scan window is truncated
    # and may not include backwall echoes. Gate overlay lines show where
    # thickness measurements were taken (may be outside the displayed window).
    # Draw gate overlay lines if they fall within the displayed time range

    buf = io.BytesIO()
    fig.savefig(buf, format='png', bbox_inches='tight')
    plt.close(fig)
    return buf.getvalue()

def render_ascan(region: RegionData, scan_mm: float, index_mm: float) -> bytes:
    """Render a single A-scan waveform as a PNG image."""
    waveform = region.waveforms[scan_idx, index_idx, :]
    fig, ax = plt.subplots(figsize=(8, 3), dpi=150)
    ax.plot(time_axis_us, waveform, 'b-', linewidth=0.5)
    ax.set_xlabel('Time (us)')
    ax.set_ylabel('Amplitude')
    # Draw gate regions as shaded rectangles
    # Mark threshold line

    buf = io.BytesIO()
    fig.savefig(buf, format='png', bbox_inches='tight')
    plt.close(fig)
    return buf.getvalue()
```

**Why server-side rendering:**
- No large data transfer (a 200x680 B-scan as int16 = 272KB raw; as PNG ~30-50KB)
- No resolution concerns — matplotlib renders at full data resolution regardless of annotation size
- Webapp stays simple — just displays `<img>` tags
- Inspector sees exactly what's in the data — no lossy downsampling of safety-critical flaw detection data

**Render speed:** Matplotlib figure creation + savefig + close takes ~100-250ms per image. Acceptable for v1. If click-to-update A-scan interaction feels sluggish, a future optimization is switching to Pillow's `ImageDraw` for simple line plots (~10ms).

## API Endpoints

### Port Selection

Try port 18923 first. If unavailable, try 18924-18932. Write the actual port to `%APPDATA%/NDTCompanion/config.json`. The webapp tries the same range to discover the running instance:

```typescript
async function discoverCompanionPort(): Promise<number | null> {
  for (let port = 18923; port <= 18932; port++) {
    try {
      const res = await fetch(`http://localhost:${port}/status`, { signal: AbortSignal.timeout(500) });
      const data = await res.json();
      if (data.app === 'ndt-companion') return port;
    } catch { continue; }
  }
  return null;
}
```

### `GET /status`

```json
{
  "app": "ndt-companion",
  "version": "1.0.0",
  "running": true,
  "directory": "C:/Scans/Vessel-123",
  "fileCount": 12
}
```

The `app` field distinguishes from other services that might be on the same port.

### `POST /set-directory`

```json
// Request
{ "path": "C:/Scans/Vessel-123" }

// Response
{
  "fileCount": 12,
  "files": [
    {
      "filename": "NEV H-0310-2 4000-4500_2025_10_03 14h24m50s.nde",
      "sizeMb": 651.7,
      "indexRangeMm": [4000, 4502],
      "scanRangeMm": [0, 1000],
      "gates": [
        { "id": 0, "name": "Gate I", "detection": "Crossing" },
        { "id": 1, "name": "Gate A", "detection": "Crossing" },
        { "id": 2, "name": "Gate B", "detection": "Crossing" }
      ],
      "beamCount": 59,
      "validPointCount": 235675
    }
  ]
}
```

### `GET /files`

Same file list as above. Cached from last indexing.

### `GET /file-info/{filename}`

Full metadata: axes, gates with timing, velocity, probe config, beam count.

### `POST /cscan-export`

```json
// Request
{
  "filename": "...",
  "gateMode": "A-I",               // "A-I" or "B-A"
  "refRecovery": "peak_fallback",   // "crossing_only" or "peak_fallback" for reference gate
  "measRecovery": "crossing_only",  // "crossing_only" or "peak_fallback" for measurement gate
  "minAmplitudeRef": 0,            // 0-100%, amplitude filter on reference gate
  "minAmplitudeMeas": 0,           // 0-100%, amplitude filter on measurement gate
  "thicknessMin": null,            // mm, optional lower bound
  "thicknessMax": null             // mm, optional upper bound
}

// Response: CSV file download
```

### `POST /render-region`

```json
// Request
{
  "filename": "NEV H-0310-2 4000-4500...nde",
  "scanStartMm": 200, "scanEndMm": 400,
  "indexStartMm": 4100, "indexEndMm": 4300,
  "views": ["bscan_axial", "bscan_index", "ascan_center"],
  "showGates": [0, 1, 2],             // optional: which gate overlays to draw on B-scan/A-scan
  "gateMode": "A-I",                   // optional: for thickness overlay on B-scan
  "refRecovery": "peak_fallback",      // optional: affects thickness point display
  "measRecovery": "crossing_only"      // optional: affects thickness point display
}

// Response
{
  "clipped": false,
  "actualBounds": { "scanStartMm": 200, "scanEndMm": 400, "indexStartMm": 4100, "indexEndMm": 4300 },
  "bscanAxial": "data:image/png;base64,iVBOR...",
  "bscanIndex": "data:image/png;base64,iVBOR...",
  "ascanCenter": "data:image/png;base64,iVBOR...",
  "metadata": {
    "scanLineMm": 300,
    "indexLineMm": 4200,
    "timeRangeUs": [-3.06, 17.34],
    "gatesShown": [0, 1, 2]
  }
}
```

Images are returned as base64 data URIs. Typical response size: ~100-200KB total (3 PNG images).

### `POST /render-ascan`

```json
// Request
{ "filename": "...", "scanMm": 300, "indexMm": 4200 }

// Response
{
  "image": "data:image/png;base64,iVBOR...",
  "metadata": {
    "peakAmplitudePct": 53.5,
    "hasData": true,
    "saturated": false
  }
}
```

Single-point A-scan image. For click-on-C-scan interaction.

## Coordinate Handoff

The webapp converts annotation vessel coordinates `(pos, angle)` to NDE file coordinates `(scanMm, indexMm)` before calling the API. This reuses the existing math from `annotation-stats.ts` `sampleComposite()`:

1. Annotation `angle` + composite `datumAngleDeg` + `scanDirection` → scan offset in mm
2. Annotation `pos` + composite `indexStartMm` + `indexDirection` → index position in mm

### File Matching

The webapp needs to know which NDE file corresponds to which composite. Strategy:

1. **Store origin metadata on import:** When a CSV is loaded into the webapp and becomes a composite, store the original filename and axis range on the `ScanCompositeConfig`. Add an optional `sourceNdeFile` field.
2. **Auto-match by axis range:** The companion app's `/files` endpoint returns `indexRangeMm` and `scanRangeMm`. The webapp matches composites whose `yAxis` range overlaps with an NDE file's index range. Account for offset corrections from `CsvRepairModal` by matching on range width and approximate position, not exact values.
3. **Manual override:** Always available. Dropdown in the inspection panel showing all NDE files from the companion app. If auto-match is wrong, the tech picks the correct file.

Auto-match is a convenience, not a guarantee. The manual override must be prominent and easy to use.

## Batch Export UI

Standalone tkinter window, launched as a **separate process** via `multiprocessing` (not a thread — avoids tkinter/asyncio thread-safety issues):

```
┌─ NDT Companion — Batch Export ──────────────────────────┐
│                                                          │
│  Folder: [C:/Scans/Vessel-123            ] [Browse...]  │
│                                                          │
│  ┌─ Gate Settings ────────────────────────────────────┐ │
│  │ Measurement:  (●) A-I  ( ) B-A                    │ │
│  │ Ref gate (I):  [▼ Peak fallback]  Min amp: [ 10]% │ │
│  │ Meas gate (A): [▼ Crossing only]  Min amp: [ 20]% │ │
│  │ Thickness:     Min [    ] mm   Max [    ] mm       │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐│
│  │ ☑ NEV H-0310-2 4000-4500...nde   70.6% coverage   ││
│  │ ☑ NEV H-0310-2 4500-5000...nde   68.2% coverage   ││
│  │ ☑ NEV H-0310-2 5000-5500...nde   72.1% coverage   ││
│  │ ☐ NEV H-0310-2 5500-6000...nde   45.3% coverage   ││
│  └─────────────────────────────────────────────────────┘│
│                                                          │
│  Output: [C:/Scans/Vessel-123/csv        ] [Browse...]  │
│                                                          │
│  [Select All] [Deselect All]         [Export Selected]  │
│                                                          │
│  ████████████████████░░░░░  16/20 files  (80%)          │
│  Current: NEV H-0310-2 5000-5500...  ~1s/file           │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Behavior Details

- **Gate settings are global:** The gate control panel at the top applies to all files. Files that lack required gates for the selected mode (e.g., no Gate B for B-A mode) are greyed out with a reason shown.
- **Output folder:** Defaults to `csv/` subfolder alongside the NDE files. Auto-created if it doesn't exist.
- **Filename collision:** If CSV already exists: prompt with overwrite / skip / rename with timestamp suffix.
- **Cancel mid-batch:** Keeps already-exported files. Cleans up partial file being written.
- **Progress:** Per-file progress, elapsed time, estimated remaining time. Runs in background thread within the batch process so UI stays responsive.
- **Export speed:** ~0.02s read + ~0.5s CSV write per file. A 20-file batch completes in ~10 seconds.

## Webapp Integration

### Connection Detection

```typescript
function useCompanionApp() {
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
    port: data?.port,
    directory: data?.directory,
    fileCount: data?.fileCount,
  };
}
```

### Inspection Panel Enhancement

When companion app is connected and annotation is selected:

1. Status indicator: "Companion App Connected" + matched NDE filename
2. **"Load Detailed Scan Data" button** — explicit action, not auto-load
3. **B-scan images** (axial + circumferential) displayed as `<img>` elements
4. **A-scan image** at annotation center — updates when user clicks a point on the C-scan heatmap (triggers `/render-ascan`)
5. **Gate overlay toggle** — re-renders with/without gate region markers on the B-scan and A-scan images
6. **"Export Images" button** — saves the current B-scan and A-scan PNGs for reporting (already rendered, just download)

### No companion app = no broken state

If companion app is not running, the inspection panel works exactly as it does now. The "Detailed Scan Data" section simply doesn't appear.

## System Tray

- **Green icon** = running, files indexed
- **Yellow icon** = running, no folder set
- **Right-click menu:** Open Batch Export, Set NDE Folder..., Status, Quit
- Persists config in `%APPDATA%/NDTCompanion/config.json`:

```json
{
  "port": 18923,
  "lastDirectory": "C:/Scans/Vessel-123",
  "csvOutputSubfolder": "csv",
  "gateDefaults": {
    "mode": "A-I",
    "refRecovery": "peak_fallback",
    "measRecovery": "crossing_only",
    "refMinAmplitude": 0,
    "measMinAmplitude": 0,
    "thicknessMin": null,
    "thicknessMax": null
  }
}
```

Auto-start with Windows is out of scope for v1.

## Project Structure

```
ndt-companion/
├── main.py                  # Entry: starts tray (main thread) + FastAPI (daemon thread)
├── engine/
│   ├── nde_reader.py        # HDF5 reading, metadata extraction, file indexing
│   ├── cscan_export.py      # Gate extraction → thickness grid → CSV
│   ├── region_extract.py    # A-scan/B-scan slicing for annotations
│   ├── image_renderer.py    # matplotlib rendering → PNG bytes
│   └── models.py            # Pydantic models (FileIndex, RegionData, etc.)
├── api/
│   ├── server.py            # FastAPI app, CORS, port selection, lifecycle
│   └── routes.py            # Endpoint definitions
├── ui/
│   ├── tray.py              # System tray (pystray, main thread)
│   └── batch_window.py      # Tkinter batch export (separate process)
├── config.py                # Settings persistence (%APPDATA%)
├── requirements.txt
└── build.spec               # PyInstaller single-exe config
```

## Dependencies

| Package | Purpose | Size |
|---------|---------|------|
| h5py | Read NDE/HDF5 | ~5MB |
| numpy | Array operations | ~15MB |
| matplotlib | Render B-scan/A-scan images | ~10MB |
| fastapi + uvicorn | API server | ~2MB |
| pystray + Pillow | System tray | ~5MB |
| tkinter | Batch UI | Bundled with Python |

**Exe size estimate: ~40-50MB**

No scipy — not needed for v1. Raw A-scan waveforms are what inspectors want for data validation. If bandpass filtering is needed later, add it then.

## Error Handling

| Scenario | Handling |
|----------|----------|
| **Corrupt/incomplete NDE file** | Skip during indexing, log warning. Batch export marks as "failed" with reason, continues with others |
| **NDE file open in Evident** | h5py opens read-only, coexists fine |
| **Region outside scan bounds** | Return images for the overlapping portion. Response includes `clipped: true` and `actualBounds` showing what was returned |
| **Region too large (>300×300mm)** | Return error: "Region too large for detailed analysis. Draw a smaller annotation or zoom in." No silent downsampling. |
| **Companion not running** | Webapp `connected: false`, inspection panel shows current UI only |
| **Port conflict** | Try ports 18923-18932, write actual port to config. Webapp discovers via same range scan |
| **Network drive files** | Works but slower. No special handling needed |
| **Mixed gate configs across files** | Files incompatible with the selected gate mode are greyed out in the file list with reason shown |
| **Two browser tabs** | Stateless API, read-only file access, no conflicts |
| **File deleted while indexed** | Catch IOError on access, remove from index, return clear error |

## Known Limitations (v1)

- **Stored A-scans are truncated:** The instrument stores a windowed portion of the waveform (e.g., -3 to 17 us) but gate results span a wider range (e.g., 15-32 us). B-scan images show what's in the stored window, which includes the entry surface echo and near-surface features, but may not include the backwall echo. This is an instrument limitation, not a bug.
- **Beam position artifacts in B-scans:** The 59-beam linear scan uses different physical element positions per beam. A B-scan slice through the resolved "paintbrush" grid is valid as a cross-section, but doesn't account for per-beam spatial offsets (~53mm across the full aperture). Acceptable for v1 since the instrument resolves best beam per grid cell.
- **RawCScan struct may vary across instruments:** The 24-byte opaque struct was decoded from an Evident MXU file. Other instruments or firmware versions may use a different layout. The validation spike must test with multiple files.
- **Gate control is filter-based, not re-gating:** v1 adjusts measurement mode, recovery mode, amplitude threshold, and thickness range using pre-computed RawCScan data. It cannot reposition gate start/length or re-gate from raw A-scans (stored A-scans are truncated).
- **No S-scan:** Requires sectorial beam angles. This probe config uses 0° linear scan only.
- **No real-time streaming** from instrument.
- **Single-group NDE files only** (v1).
- **Auto-start with Windows** not implemented in v1.

## ScanCompositeConfig Change (Webapp)

Add an optional field to track the source NDE file:

```typescript
interface ScanCompositeConfig {
  // ... existing fields ...
  sourceNdeFile?: string;    // Original NDE filename for companion app matching
}
```

Populated at CSV import time from the filename. Used for auto-matching with companion app files.
